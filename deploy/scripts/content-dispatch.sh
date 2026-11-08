#!/usr/bin/env bash
# Runs ON THE PRODUCTION SERVER every 5 minutes as a systemd oneshot (see
# deploy/systemd/personal-website-content-dispatch.timer/.service).
#
# Tells GitHub to rebuild the site's prerendered pages after content changes,
# so nothing has to poll the site from outside. It asks the local app for
# /api/content-version (the newest updated_at across everything that feeds a
# prerendered page) and, when that changed and editing has settled, starts the
# dist repo's publish.yml workflow (see deploy/instance/publish.yml), which
# builds and publishes a content release. update-watch.sh then installs it.
#
# It also fires once after a new version is installed (VERSION changed), so
# the pages are prerendered again against the NEW backend promptly: a code
# release is prerendered while production still runs the previous version.
#
# It sends no instructions, only "check now". The build itself compares the
# site's live state (content fingerprint, X-Backend-Build) with what its
# latest release was built from, so a dispatch GitHub drops loses nothing.
#
# Everything it decides is cheap and local; it contacts GitHub only when
# there is something to build. The dist repo's own 3-hourly schedule is the
# backup if a dispatch is ever missed, so a failure here never loses an edit,
# only delays it.
#
# One-time setup (see RELEASING.md):
#   1. A fine-grained GitHub token for ONLY the dist repo, with
#      "Actions: read and write" (it can start a build and nothing else).
#   2. Run setup-auto-update-production.sh --dispatch-token, which stores it
#      in /etc/personal-website/github-dispatch-token (root only, mode 600).
#   3. sudo systemctl enable --now personal-website-content-dispatch.timer
set -uo pipefail

_log() { echo "[content-dispatch] $*"; }   # journalctl adds the timestamp

# Overridable only so the decision logic can be tested off a real server.
APP_ROOT="${CONTENT_DISPATCH_APP_ROOT:-/opt/personal-website}"
SYSTEMD_DIR="${CONTENT_DISPATCH_SYSTEMD_DIR:-/etc/systemd/system}"
DATA_DIR="$APP_ROOT/data"
CURRENT_LINK="$APP_ROOT/current"
# Outside $DATA_DIR on purpose: install.sh gives everything in $DATA_DIR to the
# app's own account (chown -R personalweb), and this token must stay root-only.
TOKEN_FILE="${CONTENT_DISPATCH_TOKEN_FILE:-/etc/personal-website/github-dispatch-token}"
STATE_DIR="$DATA_DIR/content-dispatch"
LAST_FILE="$STATE_DIR/last-dispatched"          # "<fingerprint>|<VERSION>"
NO_TOKEN_MARKER="$STATE_DIR/no-token-logged"
ALERT_MARKER="$STATE_DIR/auth-alert-sent"
mkdir -p "$STATE_DIR"

set -a
# shellcheck source=/dev/null
[ -f "$DATA_DIR/.env" ] && source "$DATA_DIR/.env"
set +a

# Wait this long after the last edit before building. Covers a burst of saves
# (one build instead of many) and is longer than Varnish's 60s TTL + 300s
# grace on /api/blog|projects|site-config (deploy/varnish/default.vcl), so the
# build can never be served a stale cached API response.
QUIET_SECONDS="${CONTENT_DISPATCH_QUIET_SECONDS:-420}"
WORKFLOW="${CONTENT_DISPATCH_WORKFLOW:-publish.yml}"
REF="${CONTENT_DISPATCH_REF:-main}"

_run_server() {   # mirrors install.sh/update-watch.sh/health-watch.sh
    ( set -a; source "$DATA_DIR/.env"; set +a
      export APP_DATA_DIR="$DATA_DIR"
      exec "$CURRENT_LINK/backend/server" "$@" )
}

# Same dist repo the updater installs from.
REPO="$(grep -oP 'Environment=UPDATE_WATCH_RELEASES_REPO=\K\S+' "$SYSTEMD_DIR/personal-website-updater.service" 2>/dev/null || true)"
if [ -z "$REPO" ]; then
    _log "UPDATE_WATCH_RELEASES_REPO is not set in personal-website-updater.service; nothing to dispatch to. Run setup-auto-update-production.sh first."
    exit 0
fi

if [ ! -s "$TOKEN_FILE" ]; then
    # Log once, not every 5 minutes. The dist repo's schedule still catches edits.
    if [ ! -f "$NO_TOKEN_MARKER" ]; then
        _log "No token at $TOKEN_FILE, so content changes are picked up only by $REPO's scheduled run (every 3h). See RELEASING.md to set one."
        touch "$NO_TOKEN_MARKER"
    fi
    exit 0
fi
rm -f "$NO_TOKEN_MARKER"

# The local app directly, not through nginx/Varnish, so this always sees the
# database's current state.
BACKEND_PORT="$(grep -oP 'GUNICORN_BIND=127\.0\.0\.1:\K[0-9]+' "$SYSTEMD_DIR/personal-website.service" 2>/dev/null || echo 8000)"
FINGERPRINT="$(curl -sSI --max-time 10 "http://127.0.0.1:$BACKEND_PORT/api/content-version" 2>/dev/null \
               | tr -d '\r' | grep -i '^last-modified:' | cut -d' ' -f2- || true)"
if [ -z "$FINGERPRINT" ]; then
    # App down or no content yet. health-watch.sh reports a down app.
    _log "Could not read /api/content-version on port $BACKEND_PORT; trying again next run."
    exit 0
fi
VERSION="$(tr -d '[:space:]' < "$CURRENT_LINK/VERSION" 2>/dev/null || echo unknown)"

CURRENT_STATE="$FINGERPRINT|$VERSION"
LAST_STATE="$(cat "$LAST_FILE" 2>/dev/null || true)"
if [ "$CURRENT_STATE" = "$LAST_STATE" ]; then
    exit 0   # nothing changed since the last dispatch; stay quiet
fi

# Wait for editing to settle. Only content edits move the fingerprint, so a
# version change alone does not wait.
LAST_FP="${LAST_STATE%|*}"
if [ "$FINGERPRINT" != "$LAST_FP" ]; then
    EDITED_AT="$(date -d "$FINGERPRINT" +%s 2>/dev/null || echo 0)"
    AGE=$(( $(date +%s) - EDITED_AT ))
    if [ "$AGE" -lt "$QUIET_SECONDS" ]; then
        _log "Content changed ${AGE}s ago; waiting until editing has been quiet for ${QUIET_SECONDS}s."
        exit 0
    fi
fi

_log "Change detected (fingerprint: $FINGERPRINT, version: $VERSION). Starting $WORKFLOW in $REPO."
RESPONSE="$(mktemp)"
trap 'rm -f "$RESPONSE"' EXIT
# The token goes in through -K (config on stdin), never on the command line,
# where any local user could read it from the process list.
HTTP_CODE="$(curl -sS --max-time 30 -o "$RESPONSE" -w '%{http_code}' -X POST \
    "https://api.github.com/repos/$REPO/actions/workflows/$WORKFLOW/dispatches" \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -d "{\"ref\":\"$REF\"}" \
    -K - <<CURLCFG 2>/dev/null || true
header = "Authorization: Bearer $(tr -d '[:space:]' < "$TOKEN_FILE")"
CURLCFG
)"

case "$HTTP_CODE" in
    204)
        echo "$CURRENT_STATE" > "$LAST_FILE"
        rm -f "$ALERT_MARKER"
        _log "Dispatched. $REPO will build and publish; update-watch.sh installs the result."
        ;;
    401|403|404)
        case "$HTTP_CODE" in
            401) WHY="the token in $TOKEN_FILE was rejected (expired or revoked)" ;;
            403) WHY="the token in $TOKEN_FILE lacks 'Actions: read and write' on $REPO" ;;
            404) WHY="$REPO has no .github/workflows/$WORKFLOW on $REF, or the token cannot see $REPO" ;;
        esac
        _log "Dispatch failed (HTTP $HTTP_CODE): $WHY. $(head -c 300 "$RESPONSE")"
        # One email per problem, not one every 5 minutes. Cleared on success.
        if [ ! -f "$ALERT_MARKER" ]; then
            if WATCHER_ALERT_SOURCE="content-dispatch" \
               WATCHER_ALERT_MESSAGE="Content changes can't trigger a site rebuild: $WHY. Edits will still publish through $REPO's scheduled run every 3 hours. See RELEASING.md for replacing the token." \
               _run_server --send-watcher-alert; then
                touch "$ALERT_MARKER"
                _log "Alert sent."
            else
                _log "Alert could not be sent (Mailgun not configured?); will try again next run."
            fi
        fi
        ;;
    *)
        _log "Dispatch failed (HTTP $HTTP_CODE); will try again next run. $(head -c 300 "$RESPONSE" 2>/dev/null)"
        ;;
esac
exit 0
