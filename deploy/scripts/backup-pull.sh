#!/usr/bin/env bash
# Runs ON THE PI, daily (see deploy/systemd/personal-website-backup-pull.timer,
# a systemd --user unit — same convention as personal-website-publisher.service).
# Pulls production's restic repository via rsync (initiated from here, since
# production has no route back into the Pi's network — no port-forwarding,
# rotating public IP) and confirms a fresh snapshot actually landed. The Pi
# has no local Mailgun credentials, so on failure it alerts the same way
# content-watch.sh's gh-outage check does: an HTTP POST to production's
# pre-shared-secret-gated /api/watcher-alert route. Silent on success —
# mirrors every other watcher script in this codebase.
set -uo pipefail   # not -e: a failed step must still let the alert POST fire below

_log() { echo "[backup-pull] $*"; }   # journalctl already timestamps every line

PI_BUILD_ENV="$HOME/.personal-website-build.env"   # same file content-watch.sh
                                                     # already uses for
                                                     # WATCHER_ALERT_SECRET/
                                                     # PRERENDER_BASE_URL
[ -f "$PI_BUILD_ENV" ] && { set -a; source "$PI_BUILD_ENV"; set +a; }

# PRERENDER_BASE_URL, not CONTENT_WATCH_SITE_URL — the latter only ever
# exists as an Environment= line baked into personal-website-publisher's
# systemd unit file (see setup-auto-update-pi.sh), never in this .env file,
# so reading it here would always silently fall through to the placeholder.
SITE_URL="${PRERENDER_BASE_URL:-https://example.com}"

if [ -z "${BACKUP_PULL_HOST:-}" ] || [ -z "${BACKUP_PULL_REMOTE_PATH:-}" ] || [ -z "${BACKUP_PULL_LOCAL_DIR:-}" ] || [ -z "${BACKUP_PULL_SSH_KEY:-}" ]; then
    _log "BACKUP_PULL_HOST/BACKUP_PULL_REMOTE_PATH/BACKUP_PULL_LOCAL_DIR/BACKUP_PULL_SSH_KEY not fully set in $PI_BUILD_ENV — run setup-backup-pull-pi.sh."
    exit 1
fi

_alert() {
    local message="$1"
    _log "ALERT: $message"
    if [ -z "${WATCHER_ALERT_SECRET:-}" ]; then
        _log "WATCHER_ALERT_SECRET is not set — cannot alert. Check $PI_BUILD_ENV."
        return
    fi
    if ! command -v python3 >/dev/null 2>&1; then
        # No safe-but-unescaped fallback here on purpose: a hand-rolled
        # printf '"%s"' quoting doesn't escape embedded quotes/backslashes,
        # which can produce invalid JSON that the backend's
        # request.get_json(silent=True) silently treats as an empty body —
        # mis-labeling the alert as source='pi' with a generic message
        # instead of failing loudly. Better to just not send it.
        _log "python3 is not available — cannot safely JSON-encode the alert message. Not sending."
        return
    fi
    # -K - (config from stdin) instead of -H on the command line — a header
    # passed via -H is visible to any local user via `ps aux`/`/proc/<pid>/cmdline`
    # for as long as curl runs; -K never puts the secret in argv at all.
    local json_message
    json_message="$(printf '%s' "$message" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
    if [ -z "$json_message" ]; then
        _log "Failed to JSON-encode the alert message. Not sending."
        return
    fi
    if curl -sf --connect-timeout 10 --max-time 30 -X POST "$SITE_URL/api/watcher-alert" -K - <<CURLCFG
header = "X-Watcher-Secret: $WATCHER_ALERT_SECRET"
header = "Content-Type: application/json"
data = "{\"source\":\"backup\",\"message\":${json_message}}"
CURLCFG
    then
        _log "Alert sent."
    else
        _log "Alert POST failed — see above."
    fi
}

mkdir -p "$BACKUP_PULL_LOCAL_DIR"

# ---- 1. pull the restic repo -------------------------------------------------
_log "Pulling $BACKUP_PULL_HOST:$BACKUP_PULL_REMOTE_PATH to $BACKUP_PULL_LOCAL_DIR"
# BatchMode=yes: never wait on a password/passphrase prompt. ConnectTimeout
# bounds the TCP handshake itself. The outer `timeout` bounds the whole
# transfer once connected, in case the link is too slow to ever finish.
if ! timeout 1800 rsync -avz --delete \
        -e "ssh -i $BACKUP_PULL_SSH_KEY -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15" \
        "personalweb@$BACKUP_PULL_HOST:$BACKUP_PULL_REMOTE_PATH/" "$BACKUP_PULL_LOCAL_DIR/"; then
    _alert "backup-pull: rsync from $BACKUP_PULL_HOST failed or timed out after 30m — the Pi's offsite copy is stale. Check SSH connectivity and the backup-pull key (see deploy/scripts/setup-backup-pull-pi.sh)."
    exit 1
fi

# ---- 2. confirm a fresh snapshot actually landed -----------------------------
if [ -z "${RESTIC_PASSWORD:-}" ]; then
    _alert "backup-pull: rsync succeeded but RESTIC_PASSWORD is not set in $PI_BUILD_ENV — cannot verify today's snapshot landed. Paste the password from setup-restic-repo.sh's output."
    exit 1
fi

TODAY="$(date -u +%Y-%m-%d)"
LATEST_SNAPSHOT_DATE="$(RESTIC_PASSWORD="$RESTIC_PASSWORD" restic -r "$BACKUP_PULL_LOCAL_DIR" snapshots --last --json 2>/dev/null \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["time"][:10] if d else "")' 2>/dev/null)"

if [ -z "$LATEST_SNAPSHOT_DATE" ]; then
    _alert "backup-pull: rsync succeeded but 'restic snapshots' could not be read afterward — repo may be corrupt or RESTIC_PASSWORD may be wrong."
    exit 1
fi
if [ "$LATEST_SNAPSHOT_DATE" != "$TODAY" ]; then
    _alert "backup-pull: rsync succeeded but the latest restic snapshot is dated $LATEST_SNAPSHOT_DATE, not today ($TODAY) — production's own backup.sh may have failed silently before the pull ran, or the pull ran before production's backup completed."
    exit 1
fi

_log "Pull complete: latest snapshot confirmed dated $TODAY."
