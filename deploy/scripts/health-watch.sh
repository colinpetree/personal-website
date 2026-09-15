#!/usr/bin/env bash
# Runs ON THE PRODUCTION SERVER every 15 minutes as a systemd oneshot (see
# deploy/systemd/personal-website-healthwatch.timer/.service). Three
# independent checks - crash-loop, disk usage, Certbot cert expiry - each
# alerting at most once per day via a marker file, same debounce pattern as
# content-watch.sh's gh-outage alert. A condition that clears removes its own
# marker, so a later recurrence alerts again rather than staying silenced
# forever.
set -uo pipefail   # not -e: one failed check must not stop the others

_log() { echo "[health-watch] $*"; }

DATA_DIR="/opt/personal-website/data"
CURRENT_LINK="/opt/personal-website/current"
STATE_DIR="$DATA_DIR/monitoring"
mkdir -p "$STATE_DIR"

set -a
# shellcheck source=/dev/null
[ -f "$DATA_DIR/.env" ] && source "$DATA_DIR/.env"
set +a

DISK_ALERT_PERCENT="${BACKUP_DISK_ALERT_PERCENT:-85}"
CERT_ALERT_DAYS="${CERT_ALERT_DAYS:-14}"
ALERT_DEBOUNCE_SECONDS=86400   # one alert/day per condition, matches content-watch.sh's threshold shape

_run_server() {   # mirrors install.sh/update-watch.sh's own _run_server helper
    ( set -a; source "$DATA_DIR/.env"; set +a
      export APP_DATA_DIR="$DATA_DIR"
      exec "$CURRENT_LINK/backend/server" "$@" )
}

# _alert_if_due <marker-name> <source> <message>
# Sends at most one alert per $ALERT_DEBOUNCE_SECONDS for a given marker.
_alert_if_due() {
    local marker="$STATE_DIR/$1-alert-sent"
    local source="$2" message="$3"
    if [ -f "$marker" ]; then
        # A marker holding anything but a plain epoch integer (a partial
        # write from a crash/disk-full mid-`date +%s >`, say) would otherwise
        # make the arithmetic below error out non-fatally (no `set -e`) and
        # fall through as "not recently alerted" on every single 15-minute
        # cycle - turning a one-time corruption into an alert every cycle
        # forever instead of the intended once/day. Treating anything
        # unparseable as epoch 0 keeps the arithmetic always valid; the
        # resulting large `since` still allows exactly one alert, which then
        # overwrites the marker with a clean value and self-heals.
        local raw
        raw="$(cat "$marker" 2>/dev/null)"
        [[ "$raw" =~ ^[0-9]+$ ]] || raw=0
        local since=$(( $(date +%s) - raw ))
        if [ "$since" -lt "$ALERT_DEBOUNCE_SECONDS" ]; then
            _log "[$1] already alerted ${since}s ago (< ${ALERT_DEBOUNCE_SECONDS}s) - skipping."
            return
        fi
    fi
    _log "[$1] ALERT: $message"
    if WATCHER_ALERT_SOURCE="$source" WATCHER_ALERT_MESSAGE="$message" _run_server --send-watcher-alert; then
        date +%s > "$marker"
        _log "[$1] Alert sent."
    else
        _log "[$1] Alert call failed (Mailgun/forward_email not configured, or send failed) - will retry next cycle."
    fi
}

_clear_marker() {
    rm -f "$STATE_DIR/$1-alert-sent"
}

# ---- 1. Crash-loop / DB reachability ------------------------------------------
# personal-website.service has no restart burst limit (StartLimitIntervalSec=0)
# - it retries forever so the app self-heals the instant a local DB outage
# clears, with no manual restart needed for a brief blip. That means it never
# reaches systemd's "failed" state, so `systemctl is-failed` is not a usable
# signal here. Instead, probe the app the same way install.sh's own
# post-deploy health check does: a live HTTP request that round-trips
# through the DB. A short retry loop absorbs the handful of seconds the app
# takes to restart on its own - only a *sustained* outage (still down after
# 3 tries, up to ~70s total: each attempt can itself take up to 10s before
# the 20s gap between attempts) is worth waking someone up for.
BACKEND_PORT="$(grep -oP 'GUNICORN_BIND=127\.0\.0\.1:\K[0-9]+' /etc/systemd/system/personal-website.service 2>/dev/null || echo 8000)"
_probe_healthy() {
    local attempt
    for attempt in 1 2 3; do
        if curl -sf --connect-timeout 5 --max-time 10 "http://127.0.0.1:$BACKEND_PORT/api/site-config" >/dev/null 2>&1; then
            return 0
        fi
        [ "$attempt" -lt 3 ] && sleep 20
    done
    return 1
}
if _probe_healthy; then
    _clear_marker "crash-loop"
else
    LOG_TAIL="$(journalctl -u personal-website -n 20 --no-pager 2>/dev/null | tail -c 2000)"
    _alert_if_due "crash-loop" "crash-loop" "personal-website is not responding on 127.0.0.1:$BACKEND_PORT (checked /api/site-config, 3 attempts over up to ~70s) - app may be crash-looping or the database may be unreachable. Recent log:
$LOG_TAIL"
fi

# ---- 2. Disk usage ------------------------------------------------------------
_check_disk() {
    local path="$1" label="$2" marker="$3"
    local pct
    pct="$(df -P "$path" 2>/dev/null | tail -1 | awk '{gsub("%","",$5); print $5}')"
    if [[ ! "$pct" =~ ^[0-9]+$ ]]; then
        _log "[$marker] could not read disk usage for $path (got '$pct') - skipping."
        return
    fi
    if [ "$pct" -ge "$DISK_ALERT_PERCENT" ]; then
        _alert_if_due "$marker" "disk" "$label ($path) is at ${pct}% disk usage (threshold ${DISK_ALERT_PERCENT}%)."
    else
        _clear_marker "$marker"
    fi
}
_check_disk "/" "Root filesystem" "disk-root"
_check_disk "$DATA_DIR" "App data directory" "disk-data"

# ---- 3. Certbot cert expiry ---------------------------------------------------
DOMAIN="$(cat "$DATA_DIR/certbot_domain.txt" 2>/dev/null || true)"
CERT_FILE="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
if [ -z "$DOMAIN" ]; then
    _log "[certbot] no domain configured yet in certbot_domain.txt - skipping."
elif [ ! -f "$CERT_FILE" ]; then
    _log "[certbot] no certificate found at $CERT_FILE - skipping (site may still be HTTP-only)."
else
    END_DATE_EPOCH="$(openssl x509 -enddate -noout -in "$CERT_FILE" 2>/dev/null | cut -d= -f2 | xargs -I{} date -d {} +%s 2>/dev/null || true)"
    if [[ ! "$END_DATE_EPOCH" =~ ^[0-9]+$ ]]; then
        _log "[certbot] could not parse expiry from $CERT_FILE - skipping."
    else
        DAYS_LEFT=$(( (END_DATE_EPOCH - $(date +%s)) / 86400 ))
        if [ "$DAYS_LEFT" -lt "$CERT_ALERT_DAYS" ]; then
            _alert_if_due "certbot" "certbot" "Certificate for $DOMAIN expires in $DAYS_LEFT day(s) (threshold $CERT_ALERT_DAYS) - certbot.timer may be failing to renew. Check: certbot certificates / journalctl -u certbot.timer."
        else
            _clear_marker "certbot"
        fi
    fi
fi

_log "Check complete."
