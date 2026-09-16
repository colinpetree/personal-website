#!/usr/bin/env bash
# Enables the monthly dependency-audit job on the Pi build machine. Safe to
# re-run (e.g. after a later fix to the timer/service unit files or this
# script itself), re-copies the unit files and restarts the timer so
# changes actually take effect even if it's already running. Assumes the
# repo is already checked out at ~/src/personal-website (build-on-pi.sh's
# normal home) and ~/.personal-website-build.env already has
# WATCHER_ALERT_SECRET/PRERENDER_BASE_URL set, i.e. setup-auto-update-pi.sh
# has already been run. No new secrets are needed: this reuses the same
# WATCHER_ALERT_SECRET-gated /api/watcher-alert route content-watch.sh and
# backup-pull.sh already send mail through.
#
# Usage (run as the Pi's normal build user, NOT root):
#   bash setup-dependency-audit-pi.sh
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
    echo "Run as the normal build user, not root (sudo is only used internally for loginctl)."
    exit 1
fi

REPO_DIR="$HOME/src/personal-website"
BUILD_ENV="$HOME/.personal-website-build.env"
USER_UNIT_DIR="$HOME/.config/systemd/user"

if [ ! -f "$REPO_DIR/deploy/systemd/personal-website-dependency-audit.service" ]; then
    echo "$REPO_DIR/deploy/systemd/personal-website-dependency-audit.service not found, expected the repo checked out at $REPO_DIR."
    exit 1
fi

echo "==> 1. Checking WATCHER_ALERT_SECRET"
if ! grep -q '^WATCHER_ALERT_SECRET=' "$BUILD_ENV" 2>/dev/null; then
    echo "    WARNING: WATCHER_ALERT_SECRET is not set in $BUILD_ENV, dependency-audit.sh"
    echo "    won't be able to email its report. Run setup-auto-update-pi.sh first, or"
    echo "    add WATCHER_ALERT_SECRET=<value> to $BUILD_ENV by hand (same value as"
    echo "    production's backend/.env)."
else
    echo "    Already set."
fi

echo "==> 2. Installing the systemd --user unit"
mkdir -p "$USER_UNIT_DIR"
cp "$REPO_DIR/deploy/systemd/personal-website-dependency-audit.service" "$USER_UNIT_DIR/"
cp "$REPO_DIR/deploy/systemd/personal-website-dependency-audit.timer" "$USER_UNIT_DIR/"
echo "    Wrote $USER_UNIT_DIR/personal-website-dependency-audit.{service,timer}."

echo "==> 3. Enabling personal-website-dependency-audit.timer"
systemctl --user daemon-reload
systemctl --user enable --now personal-website-dependency-audit.timer
systemctl --user restart personal-website-dependency-audit.timer   # pick up unit/schedule changes above if already running

echo "==> 4. Enabling linger (survives logout/reboot)"
sudo loginctl enable-linger "$(whoami)"

echo ""
echo "=========================================================================="
echo " Done. Next scheduled run: 1st of next month, ~06:15-06:45 UTC."
echo ""
echo " Verify manually right now instead of waiting for the schedule:"
echo "   cd $REPO_DIR && bash deploy/scripts/dependency-audit.sh"
echo "=========================================================================="
