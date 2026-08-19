#!/usr/bin/env bash
# Enables the content-watcher (personal-website-publisher) on the Pi build
# machine. Run this ONCE per Pi. Assumes the repo is already checked out at
# ~/src/personal-website (build-on-pi.sh's normal home) and
# ~/.personal-website-build.env already has PRERENDER_BASE_URL set (i.e. a
# manual publish-release.sh has succeeded from here before).
#
# Usage (run as the Pi's normal build user, NOT root):
#   bash setup-auto-update-pi.sh --site-url https://example.com --watcher-secret <secret>
#
# --watcher-secret must match the value set on the production server (see
# setup-auto-update-production.sh's output if you generated it there).
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
    echo "Run as the normal build user, not root (sudo is only used internally for loginctl)."
    exit 1
fi

SITE_URL=""
WATCHER_SECRET=""
while [ $# -gt 0 ]; do
    case "$1" in
        --site-url) SITE_URL="$2"; shift 2 ;;
        --watcher-secret) WATCHER_SECRET="$2"; shift 2 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

if [ -z "$SITE_URL" ] || [ -z "$WATCHER_SECRET" ]; then
    echo "Usage: bash setup-auto-update-pi.sh --site-url https://<domain> --watcher-secret <secret>"
    exit 1
fi

REPO_DIR="$HOME/src/personal-website"
BUILD_ENV="$HOME/.personal-website-build.env"
USER_UNIT_DIR="$HOME/.config/systemd/user"
UNIT_SRC="$REPO_DIR/deploy/systemd/personal-website-publisher.service"
UNIT_DEST="$USER_UNIT_DIR/personal-website-publisher.service"

if [ ! -f "$UNIT_SRC" ]; then
    echo "$UNIT_SRC not found — expected the repo checked out at $REPO_DIR."
    exit 1
fi

echo "==> 1. gh CLI"
if ! command -v gh >/dev/null 2>&1; then
    echo "    Installing gh."
    if ! sudo apt-get install -y gh 2>/dev/null; then
        # Raspberry Pi OS doesn't always carry gh in its default repos the
        # way Ubuntu 24.04's universe does — fall back to GitHub's own repo.
        sudo mkdir -p -m 755 /etc/apt/keyrings
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null
        sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
            | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
        sudo apt-get update
        sudo apt-get install -y gh
    fi
else
    echo "    Already installed ($(gh --version | head -n1))."
fi

if ! gh auth status >/dev/null 2>&1; then
    echo "    Not authenticated."
    if [ -t 0 ]; then
        echo "    Launching 'gh auth login' — follow the device-code prompt"
        echo "    (visit github.com/login/device from your own machine)."
        gh auth login
    else
        echo "    Run 'gh auth login' manually, then re-run this script."
        exit 1
    fi
else
    echo "    Already authenticated: $(gh api user -q .login 2>/dev/null || echo '(unknown)')"
fi

echo "==> 2. WATCHER_ALERT_SECRET + PRERENDER_BASE_URL"
touch "$BUILD_ENV"
if grep -q '^WATCHER_ALERT_SECRET=' "$BUILD_ENV" 2>/dev/null; then
    sed -i "s|^WATCHER_ALERT_SECRET=.*|WATCHER_ALERT_SECRET=${WATCHER_SECRET}|" "$BUILD_ENV"
else
    echo "WATCHER_ALERT_SECRET=${WATCHER_SECRET}" >> "$BUILD_ENV"
fi
echo "    Set in $BUILD_ENV."
if ! grep -q '^PRERENDER_BASE_URL=' "$BUILD_ENV" 2>/dev/null; then
    echo "    WARNING: PRERENDER_BASE_URL is not set in $BUILD_ENV."
    echo "    content-watch.sh will still run, but build-on-pi.sh needs this for a"
    echo "    real publish — set it before relying on automated refreshes."
fi

echo "==> 3. Installing the systemd --user unit"
mkdir -p "$USER_UNIT_DIR"
sed "s|Environment=CONTENT_WATCH_SITE_URL=.*|Environment=CONTENT_WATCH_SITE_URL=${SITE_URL}|" \
    "$UNIT_SRC" > "$UNIT_DEST"
echo "    Wrote $UNIT_DEST (CONTENT_WATCH_SITE_URL=$SITE_URL)."

echo "==> 4. Enabling personal-website-publisher"
systemctl --user daemon-reload
systemctl --user enable --now personal-website-publisher
systemctl --user restart personal-website-publisher   # pick up the unit/env changes above if already running

echo "==> 5. Enabling linger (survives logout/reboot)"
sudo loginctl enable-linger "$(whoami)"

echo "==> 6. Verifying"
sleep 2
systemctl --user status personal-website-publisher --no-pager | head -n 10 || true

echo ""
echo "=========================================================================="
echo " Done. Follow with: journalctl --user -u personal-website-publisher -f"
echo " to confirm a healthy idle poll cycle."
echo "=========================================================================="
