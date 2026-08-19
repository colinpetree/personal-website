#!/usr/bin/env bash
# Long-running loop. Polls the dist repo for the newest GitHub release and
# installs it if it isn't already current. Always downloads + extracts the
# new release BEFORE invoking anything, then runs the install.sh found
# inside that extraction — never a locally cached copy — so an install.sh
# fix shipped in release N takes effect starting with release N itself, not
# N+1. Mirrors the "scp a fresh install.sh before every manual install"
# habit the human flow already relies on; this just automates it.
set -uo pipefail

_log() { echo "[update-watch] $*"; }   # see content-watch.sh's _log — same reasoning

DATA_DIR="/opt/personal-website/data"
INTERVAL_FILE="$DATA_DIR/update-check-interval-seconds"   # default 1800 (30 min), seeded by
                                                            # install.sh on first run — matches
                                                            # the Pi's own publish cadence
RELEASES_REPO="${UPDATE_WATCH_RELEASES_REPO:?set in the systemd unit}"
CURRENT_LINK="/opt/personal-website/current"

[ -f "$INTERVAL_FILE" ] || echo 1800 > "$INTERVAL_FILE"

# ---- gh health tracking (alerts the admin if gh stays broken 48h+) --------
LAST_GH_OK_FILE="$DATA_DIR/last-gh-success"
ALERT_SENT_FILE="$DATA_DIR/gh-alert-sent"
GH_ALERT_THRESHOLD_SECONDS=172800

_run_server() {   # mirrors install.sh's own _run_server helper
    ( set -a; source "$DATA_DIR/.env"; set +a
      export APP_DATA_DIR="$DATA_DIR"
      exec "$CURRENT_LINK/backend/server" "$@" )
}

[ -f "$LAST_GH_OK_FILE" ] || date +%s > "$LAST_GH_OK_FILE"

_log "Starting. Watching $RELEASES_REPO, checking every $(cat "$INTERVAL_FILE")s."

while true; do
    _log "Checking $RELEASES_REPO for the latest release."
    # No `|| true` here, deliberately — GH_EXIT is captured on the very next
    # line, immediately, with nothing in between. $? reflects whichever
    # command last ran, so inserting anything before that capture (even a
    # log line) would silently record the wrong thing's exit code. Once
    # captured into $GH_EXIT it's just a normal variable, safe to log/branch
    # on freely afterward — which is why the capture happens on its own line
    # rather than testing $? inline wherever it's needed.
    LATEST_TAG="$(gh release list --repo "$RELEASES_REPO" --limit 1 --json tagName -q '.[0].tagName' 2>/dev/null)"
    GH_EXIT=$?
    if [ "$GH_EXIT" -eq 0 ]; then
        date +%s > "$LAST_GH_OK_FILE"
        if [ -f "$ALERT_SENT_FILE" ]; then
            _log "gh OK — outage cleared, resetting alert state."
            rm -f "$ALERT_SENT_FILE"
        fi
    else
        SINCE=$(( $(date +%s) - $(cat "$LAST_GH_OK_FILE" 2>/dev/null || date +%s) ))
        _log "gh release list FAILED (exit $GH_EXIT, ${SINCE}s since last success, alert threshold ${GH_ALERT_THRESHOLD_SECONDS}s)."
        if [ "$SINCE" -ge "$GH_ALERT_THRESHOLD_SECONDS" ] && [ ! -f "$ALERT_SENT_FILE" ]; then
            _log "Threshold exceeded — sending watcher alert via --send-watcher-alert."
            # No output redirect here, deliberately — server.py's logging
            # (watcher_alerts.py) needs to reach journalctl, and its exit
            # code now genuinely reflects whether the email was sent, so
            # this if/else is meaningful, not always-true.
            if WATCHER_ALERT_SOURCE="production" \
               WATCHER_ALERT_MESSAGE="gh has been failing on production for over 48h — new releases have stopped installing." \
               _run_server --send-watcher-alert; then
                _log "Alert sent."
                touch "$ALERT_SENT_FILE"
            else
                _log "Alert call failed — will retry next cycle (not marking as sent)."
            fi
        fi
    fi

    INSTALLED_TAG=""
    [ -L "$CURRENT_LINK" ] && INSTALLED_TAG="$(basename "$(readlink -f "$CURRENT_LINK")")"
    _log "Latest: ${LATEST_TAG:-none}. Installed: ${INSTALLED_TAG:-none}."
    if [ -n "$LATEST_TAG" ] && [ "$LATEST_TAG" != "$INSTALLED_TAG" ]; then
        _log "New release $LATEST_TAG (currently ${INSTALLED_TAG:-none}) — downloading."
        WORKDIR="$(mktemp -d)"
        # find, not a guessed path: build-on-pi.sh names the extracted directory
        # after the bare VERSION file (e.g. personal-website-v0.1.12), not the
        # release tag — for a content-only release the tag itself
        # (v0.1.12-content-...) never matches that directory name, so a direct
        # path guess would silently miss it.
        if gh release download "$LATEST_TAG" --repo "$RELEASES_REPO" --dir "$WORKDIR" \
           && tar -xzf "$WORKDIR"/personal-website-*.tar.gz -C "$WORKDIR" \
           && NEW_INSTALL="$(find "$WORKDIR" -mindepth 2 -maxdepth 3 -path '*/deploy/install.sh')" \
           && [ -n "$NEW_INSTALL" ]; then
            _log "Downloaded and extracted. Installing via this release's own install.sh ($NEW_INSTALL)."
            INSTALL_OK=true
            bash "$NEW_INSTALL" "$WORKDIR"/personal-website-*.tar.gz || INSTALL_OK=false
            if [ "$INSTALL_OK" = true ]; then
                _log "install.sh for $LATEST_TAG succeeded."
            else
                _log "install.sh for $LATEST_TAG FAILED — will retry next cycle."
            fi
        else
            INSTALL_OK=false
            _log "Download/extract failed for $LATEST_TAG (gh release download, tar, or install.sh not found in the tarball) — will retry next cycle."
        fi
        rm -rf "$WORKDIR"
        if [ "$INSTALL_OK" = true ]; then
            # This release just replaced the file at
            # current/deploy/update-watch.sh — if THIS script changed, the
            # already-running process here is still executing the old
            # in-memory copy and has no reason to notice otherwise. Restart
            # to pick up whatever this release actually shipped.
            _log "Restarting self to pick up any code this release shipped."
            systemctl restart --no-block personal-website-updater
            exit 0
        fi
    else
        _log "Nothing to install."
    fi
    _log "Sleeping $(cat "$INTERVAL_FILE" 2>/dev/null || echo 1800)s."
    sleep "$(cat "$INTERVAL_FILE" 2>/dev/null || echo 1800)"
done
