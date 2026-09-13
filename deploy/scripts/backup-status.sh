#!/usr/bin/env bash
# Runs ON THE PI. Read-only helper for eyeballing the pulled restic mirror:
# lists snapshots and reports sizes. Not on any timer — run manually
# (see deploy/BACKUP.md) when you want to sanity-check the backup-pull
# system between its silent nightly runs.
set -uo pipefail

_log() { echo "[backup-status] $*"; }

PI_BUILD_ENV="$HOME/.personal-website-build.env"
[ -f "$PI_BUILD_ENV" ] && { set -a; source "$PI_BUILD_ENV"; set +a; }

if [ -z "${BACKUP_PULL_LOCAL_DIR:-}" ]; then
    _log "BACKUP_PULL_LOCAL_DIR not set in $PI_BUILD_ENV — run setup-backup-pull-pi.sh first."
    exit 1
fi

if [ ! -d "$BACKUP_PULL_LOCAL_DIR" ]; then
    _log "$BACKUP_PULL_LOCAL_DIR does not exist yet — has backup-pull.sh ever run successfully?"
    exit 1
fi

echo "== Local mirror =="
echo "Path: $BACKUP_PULL_LOCAL_DIR"
du -sh "$BACKUP_PULL_LOCAL_DIR" 2>/dev/null | awk '{print "Size on disk: " $1}'
echo

if [ -z "${RESTIC_PASSWORD:-}" ]; then
    _log "RESTIC_PASSWORD not set in $PI_BUILD_ENV — cannot list snapshots or repo stats."
    exit 1
fi

if ! command -v restic >/dev/null 2>&1; then
    _log "restic is not installed on the Pi."
    exit 1
fi

echo "== Snapshots =="
RESTIC_PASSWORD="$RESTIC_PASSWORD" restic -r "$BACKUP_PULL_LOCAL_DIR" snapshots || {
    _log "Failed to read snapshots — repo may be corrupt or RESTIC_PASSWORD may be wrong."
    exit 1
}
echo

echo "== Repo size (restored, deduplicated) =="
RESTIC_PASSWORD="$RESTIC_PASSWORD" restic -r "$BACKUP_PULL_LOCAL_DIR" stats --mode restore-size latest

echo
echo "== Repo size (raw, as stored on disk) =="
RESTIC_PASSWORD="$RESTIC_PASSWORD" restic -r "$BACKUP_PULL_LOCAL_DIR" stats --mode raw-data
