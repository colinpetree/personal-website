#!/usr/bin/env bash
# Runs ON THE PRODUCTION SERVER. Reverts to an already-extracted older
# release — no re-download, no re-run of migrations.
#
# CAVEAT: safe for app-only regressions. If the release being rolled back
# past applied a SQL migration, rolling back does NOT undo it — the older
# code may not be compatible with the new schema. Review manually before
# rolling back across a migration boundary.
#
# Usage: rollback.sh vX.Y.Z
set -euo pipefail

APP_ROOT="/opt/personal-website"
RELEASES_DIR="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"

if [ "$#" -ne 1 ]; then
    echo "Usage: rollback.sh vX.Y.Z"
    exit 1
fi

TARGET="$RELEASES_DIR/$1"
if [ ! -d "$TARGET" ]; then
    echo "Release not found: $TARGET"
    echo "Available releases:"
    ls -1 "$RELEASES_DIR"
    exit 1
fi

echo "==> Rolling back to $1"
ln -sfn "$TARGET" "$CURRENT_LINK"
systemctl restart personal-website

# Read the live port from the installed unit rather than hardcoding it —
# install.sh templates this from BACKEND_PORT, so this stays in sync
# automatically instead of drifting from a second hardcoded copy.
BACKEND_PORT="$(grep -oP 'GUNICORN_BIND=127\.0\.0\.1:\K[0-9]+' /etc/systemd/system/personal-website.service 2>/dev/null || echo 8000)"

echo "==> Health check"
for i in $(seq 1 15); do
    if curl -sf "http://127.0.0.1:$BACKEND_PORT/api/site-config" >/dev/null 2>&1; then
        echo "==> $1 is live and healthy."
        exit 0
    fi
    sleep 1
done

echo "HEALTH CHECK FAILED after rollback to $1 — investigate manually, service may be down."
exit 1
