#!/usr/bin/env bash
# Runs ON THE PRODUCTION SERVER, daily, as the personalweb user (see
# deploy/systemd/personal-website-media-cleanup.timer/.service), one hour
# after the backup timer — so each day's backup always captures the uploads
# directory before that day's cleanup runs. Thin wrapper: all the actual
# reference-scanning/grace-period/circuit-breaker logic lives in
# backend/orphan_cleanup.py; this script just invokes it and reports a hard
# failure. Silent on an ordinary run — even one that deletes files, that's
# routine, not a problem worth an email.
#
# Deliberately no bash-level `timeout` wrapper around the server call here
# (unlike backup.sh's pg_dump/tar/rsync, which are real external processes
# prone to network hangs). Wrapping `_run_server` (which ends in an `exec`
# inside a subshell) in `timeout bash -c '...'` would put the actual work an
# extra process deep from what `timeout` directly watches — on a hang,
# `timeout` might only kill that empty wrapper and orphan the real stuck
# process, invisible and still running, while this script wrongly reports a
# clean timeout. systemd's own TimeoutStartSec on the .service unit is the
# real, reliable bound instead: it kills everything in this unit's cgroup,
# not just a shell-level direct-child guess.
set -uo pipefail   # not -e: a nonzero exit from the server call must still let this script report cleanly

_log() { echo "[media-cleanup] $*"; }

DATA_DIR="/opt/personal-website/data"
CURRENT_LINK="/opt/personal-website/current"

_run_server() {   # mirrors backup.sh/health-watch.sh's own _run_server helper
    ( set -a; source "$DATA_DIR/.env"; set +a
      export APP_DATA_DIR="$DATA_DIR"
      exec "$CURRENT_LINK/backend/server" "$@" )
}

_log "Running orphan media cleanup."
# server.py already sends its own watcher-alert email on an unexpected
# failure or a circuit-breaker abort, so nothing further is needed here on
# a nonzero exit beyond logging it for journalctl.
if _run_server --cleanup-orphan-media; then
    _log "Completed successfully."
else
    _log "Cleanup exited non-zero — see the output above and journalctl -u personal-website-media-cleanup."
    _log "A watcher alert should already have been sent by server.py itself for an unexpected failure or"
    _log "circuit-breaker abort; if none arrives, check Mailgun/WATCHER_ALERT_FALLBACK_* configuration."
    exit 1
fi
