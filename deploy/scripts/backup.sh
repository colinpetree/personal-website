#!/usr/bin/env bash
# Runs ON THE PRODUCTION SERVER, daily, as the personalweb user (see
# deploy/systemd/personal-website-backup.timer/.service). Dumps Postgres,
# then backs up the dump + uploads/.env/certbot_domain.txt into a local
# restic repository (deduplicated — retention no longer multiplies disk
# usage the way a fresh full tar every night would). The Pi pulls this
# repository directory itself (see deploy/scripts/backup-pull.sh) — this
# script never pushes anywhere. Silent on success — mirrors
# update-watch.sh/content-watch.sh's "only ever email about a PROBLEM"
# philosophy, not routine success.
set -uo pipefail   # not -e: one failed step must still let the alert fire below

_log() { echo "[backup] $*"; }   # journalctl already timestamps every line

DATA_DIR="/opt/personal-website/data"
CURRENT_LINK="/opt/personal-website/current"
PG_DIR="$DATA_DIR/backups/pg"
RESTIC_REPO="$DATA_DIR/restic-repo"
STATE_DIR="$DATA_DIR/monitoring"   # same dir/convention as health-watch.sh
ALERT_DEBOUNCE_SECONDS=86400   # at most one email/day per error type, same shape as health-watch.sh's checks
mkdir -p "$STATE_DIR"

# BACKUP_*/RESTIC_PASSWORD vars live in $DATA_DIR/.env alongside
# DATABASE_URL — same file, same sourcing pattern install.sh/update-watch.sh
# use everywhere.
set -a
# shellcheck source=/dev/null
[ -f "$DATA_DIR/.env" ] && source "$DATA_DIR/.env"
set +a

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

_run_server() {   # mirrors install.sh/update-watch.sh's own _run_server helper
    ( set -a; source "$DATA_DIR/.env"; set +a
      export APP_DATA_DIR="$DATA_DIR"
      exec "$CURRENT_LINK/backend/server" "$@" )
}

# _alert <error-type> <message>
# At most one email per $ALERT_DEBOUNCE_SECONDS *per error type*, same
# debounce pattern (and reasoning) as health-watch.sh's _alert_if_due — each
# distinct failure this script can hit (RESTIC_PASSWORD missing, pg_dump
# failing, restic backup failing, etc.) gets its own marker, so repeatedly
# hitting the SAME problem (retried manually while diagnosing something, or
# the timer firing again the next night on an unresolved issue) sends
# exactly one email instead of one per attempt — but a DIFFERENT problem
# showing up the very next night, even within 24h of the last alert, still
# gets its own fresh email rather than being masked by an unrelated marker.
# Every marker clears on the next fully successful run.
_alert() {
    local error_type="$1" message="$2"
    local marker="$STATE_DIR/backup-${error_type}-alert-sent"
    if [ -f "$marker" ]; then
        # Anything unparseable (partial write from a crash/disk-full mid
        # `date +%s >`) is treated as epoch 0 — the arithmetic below always
        # stays valid, and the resulting large `since` just allows exactly
        # one alert through, which then overwrites the marker with a clean
        # value and self-heals, rather than silently going quiet forever.
        local raw since
        raw="$(cat "$marker" 2>/dev/null)"
        [[ "$raw" =~ ^[0-9]+$ ]] || raw=0
        since=$(( $(date +%s) - raw ))
        if [ "$since" -lt "$ALERT_DEBOUNCE_SECONDS" ]; then
            _log "ALERT (suppressed, already alerted ${since}s ago): $message"
            return
        fi
    fi
    _log "ALERT: $message"
    # No output redirect — server.py's logging needs to reach journalctl.
    if WATCHER_ALERT_SOURCE="backup" WATCHER_ALERT_MESSAGE="$message" _run_server --send-watcher-alert; then
        date +%s > "$marker"
        _log "Alert sent."
    else
        _log "Alert call failed (Mailgun/forward_email not configured, or send failed) — see journal above."
    fi
}

mkdir -p "$PG_DIR"

if [ -z "${RESTIC_PASSWORD:-}" ]; then
    _alert "restic-password-missing" "RESTIC_PASSWORD is not set in $DATA_DIR/.env — run deploy/scripts/setup-restic-repo.sh once."
    exit 1
fi
if [ ! -d "$RESTIC_REPO" ]; then
    _alert "restic-repo-missing" "No restic repository at $RESTIC_REPO — run deploy/scripts/setup-restic-repo.sh once."
    exit 1
fi

# ---- 1. pg_dump -------------------------------------------------------------
if [ -z "${DATABASE_URL:-}" ]; then
    _alert "database-url-missing" "DATABASE_URL is not set in $DATA_DIR/.env — cannot back up the database."
    exit 1
fi

# Single rotating filename, not date-stamped — restic's own snapshot history
# is what provides point-in-time retention now, so there's no need to keep
# multiple dated dump files around ourselves.
PG_FILE="$PG_DIR/personal_website.sql.gz"
_log "Dumping database to $PG_FILE"
# timeout bounds this independently of systemd's own TimeoutStartSec on the
# unit (see personal-website-backup.service) — a stuck pg_dump (e.g. blocked
# on a lock) gets killed here, in time for _alert below to actually run,
# rather than the whole process tree being SIGKILLed from outside first.
if ! timeout 1800 pg_dump --format=custom "$DATABASE_URL" | gzip > "$PG_FILE"; then
    rm -f "$PG_FILE"
    _alert "pg-dump" "pg_dump failed or timed out after 30m — see journalctl -u personal-website-backup for details."
    exit 1
fi

# ---- 2. restic backup --------------------------------------------------------
# Explicit path list (not the whole $DATA_DIR) — deliberately excludes this
# script's own backups/ output beyond the one dump file above, the restic
# repo itself, and the small watcher-alert marker/state files, none of which
# carry restorable value. .env and certbot_domain.txt are included
# deliberately: a restore without them means a working database but a site
# that still can't send mail or serve HTTPS.
_log "Running restic backup"
if ! timeout 1800 restic -r "$RESTIC_REPO" backup \
        "$DATA_DIR/uploads" "$PG_FILE" "$DATA_DIR/.env" "$DATA_DIR/certbot_domain.txt"; then
    _alert "restic-backup" "restic backup failed or timed out after 30m — see journalctl -u personal-website-backup for details."
    exit 1
fi

# ---- 3. prune old snapshots ---------------------------------------------------
# timeout here (like the two steps above) matters beyond just this script's
# own robustness: personal-website-media-cleanup.timer's 04:00 UTC schedule
# assumes this whole script reliably finishes well before it starts (see its
# comment and deploy/BACKUP.md) — an unbounded prune was the one step that
# could blow past that margin with no ceiling except systemd's much coarser
# 7200s service-level TimeoutStartSec.
_log "Pruning snapshots older than $RETENTION_DAYS days"
if ! timeout 1800 restic -r "$RESTIC_REPO" forget --keep-daily "$RETENTION_DAYS" --prune; then
    _alert "restic-prune" "restic forget/prune failed or timed out after 30m — local backup succeeded but old snapshots were NOT pruned. See journalctl -u personal-website-backup for details."
    exit 1
fi

rm -f "$STATE_DIR"/backup-*-alert-sent   # clear every error type's debounce so a future failure alerts fresh
_log "Backup complete: $PG_FILE backed up to $RESTIC_REPO."
