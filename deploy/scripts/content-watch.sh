#!/usr/bin/env bash
# Long-running loop. Polls the tracked site's Last-Modified header on
# /api/content-version and publishes a content-only refresh when it changes.
# Interval is re-read from a plain-text file every cycle.
set -uo pipefail   # not -e: one failed poll/publish must not kill the loop

_log() { echo "[content-watch] $*"; }   # journalctl already timestamps every
                                          # captured line — no need to add
                                          # another one here, just a tag so
                                          # cross-service logs stay legible

STATE_DIR="$HOME/.personal-website-build"
INTERVAL_FILE="$STATE_DIR/content-check-interval-seconds"   # plain integer, seconds. Default
                                                              # 1800 (30 min) — a Pi build takes
                                                              # ~20 min and edits happen in bursts,
                                                              # so tight polling buys nothing most
                                                              # of the year. Lower it by hand
                                                              # during an active editing session.
LAST_SEEN_FILE="$STATE_DIR/last-content-fingerprint"
SITE_URL="${CONTENT_WATCH_SITE_URL:-https://example.com}"

mkdir -p "$STATE_DIR"
[ -f "$INTERVAL_FILE" ] || echo 1800 > "$INTERVAL_FILE"

# ---- gh health tracking (alerts the admin if gh stays broken 48h+) --------
LAST_GH_OK_FILE="$STATE_DIR/last-gh-success"
ALERT_SENT_FILE="$STATE_DIR/gh-alert-sent"
GH_ALERT_THRESHOLD_SECONDS=172800   # 48h of continuous gh failure before emailing

PI_BUILD_ENV="$HOME/.personal-website-build.env"   # WATCHER_ALERT_SECRET lives here, same file as PRERENDER_BASE_URL
[ -f "$PI_BUILD_ENV" ] && { set -a; source "$PI_BUILD_ENV"; set +a; }

[ -f "$LAST_GH_OK_FILE" ] || date +%s > "$LAST_GH_OK_FILE"

_check_gh_health() {
    if gh auth status >/dev/null 2>&1; then
        date +%s > "$LAST_GH_OK_FILE"
        if [ -f "$ALERT_SENT_FILE" ]; then
            _log "gh auth OK — outage cleared, resetting alert state."
            rm -f "$ALERT_SENT_FILE"
        fi
    else
        local since=$(( $(date +%s) - $(cat "$LAST_GH_OK_FILE" 2>/dev/null || date +%s) ))
        _log "gh auth FAILING (${since}s since last success, alert threshold ${GH_ALERT_THRESHOLD_SECONDS}s)."
        if [ "$since" -ge "$GH_ALERT_THRESHOLD_SECONDS" ] && [ ! -f "$ALERT_SENT_FILE" ] && [ -n "${WATCHER_ALERT_SECRET:-}" ]; then
            _log "Threshold exceeded — sending watcher alert to $SITE_URL/api/watcher-alert."
            # -K - (config from stdin) instead of -H on the command line —
            # a header passed via -H is visible to any local user via `ps
            # aux`/`/proc/<pid>/cmdline` for as long as curl runs; -K never
            # puts the secret in argv at all.
            if curl -sf --connect-timeout 10 --max-time 30 -X POST "$SITE_URL/api/watcher-alert" -K - <<CURLCFG
header = "X-Watcher-Secret: $WATCHER_ALERT_SECRET"
header = "Content-Type: application/json"
data = "{\"source\":\"pi\",\"message\":\"gh auth has been failing on the Pi for over 48h — content refreshes have stopped publishing.\"}"
CURLCFG
            then
                _log "Alert sent."
                touch "$ALERT_SENT_FILE"
            else
                _log "Alert POST failed — will retry next cycle (not marking as sent)."
            fi
        elif [ "$since" -ge "$GH_ALERT_THRESHOLD_SECONDS" ] && [ -z "${WATCHER_ALERT_SECRET:-}" ]; then
            _log "Threshold exceeded but WATCHER_ALERT_SECRET is not set — cannot alert. Check ~/.personal-website-build.env."
        fi
    fi
}

_log "Starting. Tracking $SITE_URL, checking every $(cat "$INTERVAL_FILE")s."

while true; do
    _check_gh_health

    _log "Polling $SITE_URL/api/content-version"
    HTTP_CODE="$(curl -sI --connect-timeout 10 --max-time 30 -o /tmp/content-watch-headers.$$ -w '%{http_code}' "$SITE_URL/api/content-version" 2>/dev/null || echo 000)"
    if [ "$HTTP_CODE" = "000" ]; then
        _log "Poll failed — could not reach $SITE_URL (network/DNS/TLS error)."
        FP=""
    elif [ "$HTTP_CODE" != "204" ] && [ "$HTTP_CODE" != "200" ]; then
        _log "Poll returned unexpected HTTP $HTTP_CODE — treating as no change this cycle."
        FP=""
    else
        FP="$(grep -i '^last-modified:' /tmp/content-watch-headers.$$ | tr -d '\r' || true)"
    fi
    rm -f /tmp/content-watch-headers.$$
    LAST="$(cat "$LAST_SEEN_FILE" 2>/dev/null || true)"
    if [ -z "$FP" ]; then
        _log "No fingerprint in response — skipping this cycle."
    elif [ "$FP" = "$LAST" ]; then
        _log "No change (fingerprint unchanged: $FP)."
    else
        _log "Content changed: '$LAST' -> '$FP'. Publishing refresh."
        if BUILD_LOCK_MODE=periodic bash "$(dirname "$0")/publish-content-refresh.sh"; then
            _log "Publish succeeded."
            echo "$FP" > "$LAST_SEEN_FILE"
            # A successful publish means build-on-pi.sh just git-reset-hard'd
            # this checkout — if this very script changed upstream, the file
            # on disk is already updated, but this running process is still
            # executing the old in-memory copy. Restart to pick it up, same
            # reasoning as update-watch.sh on the production side.
            _log "Restarting self to pick up any code this release shipped."
            systemctl --user restart --no-block personal-website-publisher
            exit 0
        else
            _log "publish-content-refresh.sh FAILED (exit $?) — will retry next cycle."
        fi
    fi
    _log "Sleeping $(cat "$INTERVAL_FILE" 2>/dev/null || echo 1800)s."
    sleep "$(cat "$INTERVAL_FILE" 2>/dev/null || echo 1800)"
done
