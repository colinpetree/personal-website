#!/usr/bin/env bash
# Runs ON THE PRODUCTION SERVER, daily, as the personalweb user (see
# deploy/systemd/personal-website-backup.timer/.service). Dumps Postgres +
# tars $DATA_DIR, rotates local copies, and rsyncs the result to the Pi build
# box over SSH. Silent on success — mirrors update-watch.sh/content-watch.sh's
# "only ever email about a PROBLEM" philosophy, not routine success.
set -uo pipefail   # not -e: one failed step must still let the alert fire below

_log() { echo "[backup] $*"; }   # journalctl already timestamps every line

DATA_DIR="/opt/personal-website/data"
CURRENT_LINK="/opt/personal-website/current"
BACKUP_DIR="$DATA_DIR/backups"
PG_DIR="$BACKUP_DIR/pg"
DATA_TAR_DIR="$BACKUP_DIR/data"
DATE_STAMP="$(date -u +%Y-%m-%d)"

# BACKUP_* vars live in $DATA_DIR/.env alongside DATABASE_URL — same file,
# same sourcing pattern install.sh/update-watch.sh already use everywhere.
set -a
# shellcheck source=/dev/null
[ -f "$DATA_DIR/.env" ] && source "$DATA_DIR/.env"
set +a

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
REMOTE_HOST="${BACKUP_REMOTE_HOST:-}"
REMOTE_USER="${BACKUP_REMOTE_USER:-}"
REMOTE_PATH="${BACKUP_REMOTE_PATH:-}"
SSH_KEY="$DATA_DIR/.ssh/id_ed25519"   # generated once by setup-backup-ssh.sh

_run_server() {   # mirrors install.sh/update-watch.sh's own _run_server helper
    ( set -a; source "$DATA_DIR/.env"; set +a
      export APP_DATA_DIR="$DATA_DIR"
      exec "$CURRENT_LINK/backend/server" "$@" )
}

_alert() {
    local message="$1"
    _log "ALERT: $message"
    # No output redirect — server.py's logging needs to reach journalctl.
    if WATCHER_ALERT_SOURCE="backup" WATCHER_ALERT_MESSAGE="$message" _run_server --send-watcher-alert; then
        _log "Alert sent."
    else
        _log "Alert call failed (Mailgun/forward_email not configured, or send failed) — see journal above."
    fi
}

mkdir -p "$PG_DIR" "$DATA_TAR_DIR"

# ---- 1. pg_dump -------------------------------------------------------------
if [ -z "${DATABASE_URL:-}" ]; then
    _alert "DATABASE_URL is not set in $DATA_DIR/.env — cannot back up the database."
    exit 1
fi

PG_FILE="$PG_DIR/personal_website-$DATE_STAMP.sql.gz"
_log "Dumping database to $PG_FILE"
# timeout bounds this independently of systemd's own TimeoutStartSec on the
# unit (see personal-website-backup.service) — a stuck pg_dump (e.g. blocked
# on a lock) gets killed here, in time for _alert below to actually run,
# rather than the whole process tree being SIGKILLed from outside first.
if ! timeout 1800 pg_dump --format=custom "$DATABASE_URL" | gzip > "$PG_FILE"; then
    rm -f "$PG_FILE"
    _alert "pg_dump failed or timed out after 30m — see journalctl -u personal-website-backup for details."
    exit 1
fi

# ---- 2. tar the persistent data dir -----------------------------------------
# Includes .env (secrets) and certbot_domain.txt deliberately — a restore
# without them means a working database but a site that still can't send
# mail or serve HTTPS. Excludes this script's own backups/ output (no reason
# to nest yesterday's backup inside today's) and the small watcher-alert
# marker/state files, which carry no restorable value.
DATA_FILE="$DATA_TAR_DIR/data-$DATE_STAMP.tar.gz"
_log "Archiving $DATA_DIR to $DATA_FILE"
if ! timeout 600 tar czf "$DATA_FILE" \
        --exclude='backups' \
        --exclude='gh-alert-sent' \
        --exclude='last-gh-success' \
        --exclude='monitoring' \
        -C "$DATA_DIR" .; then
    rm -f "$DATA_FILE"
    _alert "tar of $DATA_DIR failed or timed out after 10m — see journalctl -u personal-website-backup for details."
    exit 1
fi

# ---- 3. local rotation -------------------------------------------------------
_log "Pruning local backups older than $RETENTION_DAYS days"
find "$PG_DIR" -name '*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
find "$DATA_TAR_DIR" -name '*.tar.gz' -mtime "+$RETENTION_DAYS" -delete

# ---- 4. rsync to the Pi ------------------------------------------------------
if [ -z "$REMOTE_HOST" ] || [ -z "$REMOTE_USER" ] || [ -z "$REMOTE_PATH" ]; then
    _alert "BACKUP_REMOTE_HOST/BACKUP_REMOTE_USER/BACKUP_REMOTE_PATH not fully configured in .env — local backup succeeded but was NOT copied offsite."
    exit 1
fi
if [ ! -f "$SSH_KEY" ]; then
    _alert "No backup SSH key at $SSH_KEY — run deploy/scripts/setup-backup-ssh.sh once. Local backup succeeded but was NOT copied offsite."
    exit 1
fi

_log "Syncing $BACKUP_DIR to $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH"
# BatchMode=yes: never wait on a password/passphrase prompt that can't
# arrive under systemd anyway (stdin is /dev/null) — fail immediately
# instead of stalling on auth. ConnectTimeout bounds the TCP handshake
# itself (a dropped-packet/firewalled host can otherwise hang for minutes on
# the OS's own connect timeout before ssh ever gets to the auth stage). The
# outer `timeout` bounds the whole transfer once connected, in case the Pi
# accepts the connection but the link is too slow to ever finish.
if ! timeout 1800 rsync -avz --delete \
        -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15" \
        "$BACKUP_DIR/" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"; then
    _alert "rsync to $REMOTE_HOST failed or timed out after 30m — local backup succeeded but was NOT copied offsite. Check SSH connectivity and $REMOTE_PATH."
    exit 1
fi

_log "Backup complete: $PG_FILE, $DATA_FILE, synced to $REMOTE_HOST."
