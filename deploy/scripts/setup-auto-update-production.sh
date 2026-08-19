#!/usr/bin/env bash
# Enables the auto-updater (personal-website-updater) on an already-bootstrapped,
# already-installed production/test server. Run this ONCE per server, any time
# after the first `install.sh` has run (the updater's systemd unit ships inside
# every release tarball and is installed by install.sh's _install_config — this
# script assumes that unit already exists on disk and just finishes wiring it up:
# gh auth, WATCHER_ALERT_SECRET, UPDATE_WATCH_RELEASES_REPO, enable --now).
#
# Usage:
#   sudo bash setup-auto-update-production.sh --domain example.com [--watcher-secret <secret>]
#   sudo bash setup-auto-update-production.sh --releases-repo yourname/personal-website-dist
#
# --watcher-secret: must match the value put in the Pi's
#   ~/.personal-website-build.env (see setup-auto-update-pi.sh). If omitted and
#   not already set in this server's .env, one is generated and printed so you
#   can copy it to the Pi.
set -euo pipefail

APP_ROOT="/opt/personal-website"
DATA_DIR="$APP_ROOT/data"
UNIT_FILE="/etc/systemd/system/personal-website-updater.service"

if [ "$(id -u)" -ne 0 ]; then
    echo "Run as root (sudo bash setup-auto-update-production.sh ...)"
    exit 1
fi

DOMAIN=""
RELEASES_REPO=""
WATCHER_SECRET=""
while [ $# -gt 0 ]; do
    case "$1" in
        --domain) DOMAIN="$2"; shift 2 ;;
        --releases-repo) RELEASES_REPO="$2"; shift 2 ;;
        --watcher-secret) WATCHER_SECRET="$2"; shift 2 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

if [ -z "$RELEASES_REPO" ]; then
    if [ -z "$DOMAIN" ]; then
        echo "Need either --domain or --releases-repo."
        exit 1
    fi
    RELEASES_REPO="colinpetree/personal-website-dist-${DOMAIN}"
fi

if [ ! -f "$UNIT_FILE" ]; then
    echo "$UNIT_FILE not found — run install.sh at least once before this script"
    echo "(the updater unit ships inside the release tarball)."
    exit 1
fi

echo "==> 1. gh CLI"
if ! command -v gh >/dev/null 2>&1; then
    echo "    Installing gh (Ubuntu 24.04 ships it in universe)."
    add-apt-repository universe -y
    apt update
    apt install -y gh
else
    echo "    Already installed ($(gh --version | head -n1))."
fi

# personal-website-updater.service runs as User=root, and gh stores its
# config under $HOME/.config/gh — so it MUST be authenticated as root, not
# as whichever user invoked `sudo`. This script already requires EUID 0 (see
# the check above), so run gh directly rather than via `sudo -u $SUDO_USER`,
# which would silently authenticate the wrong account (the one running this
# script, not the one the systemd unit actually runs as).
if ! HOME=/root gh auth status >/dev/null 2>&1; then
    echo "    Not authenticated as root."
    if [ -t 0 ]; then
        echo "    Launching 'gh auth login' — follow the device-code prompt"
        echo "    (visit github.com/login/device from your own machine)."
        HOME=/root gh auth login
    else
        echo "    Run 'sudo HOME=/root gh auth login' manually, then re-run this script."
        exit 1
    fi
else
    echo "    Already authenticated: $(HOME=/root gh api user -q .login 2>/dev/null || echo '(unknown)')"
fi

echo "==> 2. WATCHER_ALERT_SECRET"
ENV_FILE="$DATA_DIR/.env"
EXISTING_SECRET="$(grep -E '^WATCHER_ALERT_SECRET=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"
if [ -n "$WATCHER_SECRET" ]; then
    SECRET_TO_WRITE="$WATCHER_SECRET"
elif [ -n "$EXISTING_SECRET" ]; then
    echo "    Already set in $ENV_FILE — leaving it untouched."
    SECRET_TO_WRITE=""
else
    SECRET_TO_WRITE="$(openssl rand -hex 32)"
    echo "    Generated a new secret — copy this to the Pi's ~/.personal-website-build.env:"
    echo "    WATCHER_ALERT_SECRET=$SECRET_TO_WRITE"
fi
if [ -n "$SECRET_TO_WRITE" ]; then
    if grep -q '^WATCHER_ALERT_SECRET=' "$ENV_FILE" 2>/dev/null; then
        sed -i "s|^WATCHER_ALERT_SECRET=.*|WATCHER_ALERT_SECRET=${SECRET_TO_WRITE}|" "$ENV_FILE"
    else
        echo "WATCHER_ALERT_SECRET=${SECRET_TO_WRITE}" >> "$ENV_FILE"
    fi
    echo "    Restarting personal-website to pick up the secret."
    systemctl restart personal-website
fi

echo "==> 3. UPDATE_WATCH_RELEASES_REPO"
sed -i "s|^Environment=UPDATE_WATCH_RELEASES_REPO=.*|Environment=UPDATE_WATCH_RELEASES_REPO=${RELEASES_REPO}|" "$UNIT_FILE"
echo "    Set to $RELEASES_REPO in $UNIT_FILE."

echo "==> 4. Enabling personal-website-updater"
systemctl daemon-reload
systemctl enable --now personal-website-updater
systemctl restart personal-website-updater   # pick up the repo/env changes above if it was already running

echo "==> 5. Verifying"
echo "    gh release list --repo $RELEASES_REPO:"
HOME=/root gh release list --repo "$RELEASES_REPO" --limit 3 || \
    echo "    (empty or failed — check repo access if this server should already have releases)"
sleep 2
systemctl status personal-website-updater --no-pager | head -n 10 || true

echo ""
echo "=========================================================================="
echo " Done. Follow with: sudo journalctl -u personal-website-updater -f"
echo " to confirm a healthy idle poll cycle."
echo "=========================================================================="
