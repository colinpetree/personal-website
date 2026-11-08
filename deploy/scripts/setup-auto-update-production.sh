#!/usr/bin/env bash
# Enables the auto-updater (personal-website-updater) on an already-bootstrapped,
# already-installed production/test server. Run this ONCE per server, any time
# after the first `install.sh` has run (the updater's systemd unit ships inside
# every release tarball and is installed by install.sh's _install_config - this
# script assumes that unit already exists on disk and just finishes wiring it up:
# gh auth, WATCHER_ALERT_SECRET, UPDATE_WATCH_RELEASES_REPO, enable --now).
#
# Usage:
#   sudo bash setup-auto-update-production.sh --domain example.com [--watcher-secret <secret>] [--dispatch-token]
#   sudo bash setup-auto-update-production.sh --releases-repo yourname/personal-website-dist [--dispatch-token]
#
# --dispatch-token: also set up personal-website-content-dispatch (content
#   edits start a site rebuild on GitHub within minutes; see
#   deploy/scripts/content-dispatch.sh). Asks for a fine-grained GitHub token
#   with access to ONLY the dist repo and "Actions: read and write", stores it
#   root-only, and enables the timer. Safe to re-run to replace the token.
#
# --watcher-secret: must match WATCHER_ALERT_SECRET in the Pi's
#   ~/.personal-website-build.env (the Pi's backup-pull.sh uses it to email
#   you through this server; see setup-backup-pull-pi.sh). If omitted and not
#   already set in this server's .env, one is generated and printed so you can
#   copy it to the Pi.
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
SETUP_DISPATCH=false
while [ $# -gt 0 ]; do
    case "$1" in
        --domain) DOMAIN="$2"; shift 2 ;;
        --releases-repo) RELEASES_REPO="$2"; shift 2 ;;
        --watcher-secret) WATCHER_SECRET="$2"; shift 2 ;;
        --dispatch-token) SETUP_DISPATCH=true; shift ;;
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
    echo "$UNIT_FILE not found - run install.sh at least once before this script"
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
# config under $HOME/.config/gh - so it MUST be authenticated as root, not
# as whichever user invoked `sudo`. This script already requires EUID 0 (see
# the check above), so run gh directly rather than via `sudo -u $SUDO_USER`,
# which would silently authenticate the wrong account (the one running this
# script, not the one the systemd unit actually runs as).
if ! HOME=/root gh auth status >/dev/null 2>&1; then
    echo "    Not authenticated as root."
    if [ -t 0 ]; then
        echo "    Launching 'gh auth login' - follow the device-code prompt"
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
    echo "    Already set in $ENV_FILE - leaving it untouched."
    SECRET_TO_WRITE=""
else
    SECRET_TO_WRITE="$(openssl rand -hex 32)"
    echo "    Generated a new secret - copy this to the Pi's ~/.personal-website-build.env:"
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

if [ "$SETUP_DISPATCH" = true ]; then
    echo "==> 4b. Content dispatch (content edits start a rebuild on GitHub)"
    # Outside $DATA_DIR on purpose: install.sh hands everything in $DATA_DIR to
    # the app's own account (chown -R personalweb), and this must stay root-only.
    TOKEN_DIR="/etc/personal-website"
    TOKEN_FILE="$TOKEN_DIR/github-dispatch-token"
    if [ ! -f /etc/systemd/system/personal-website-content-dispatch.timer ]; then
        echo "    personal-website-content-dispatch.timer is not installed yet: it ships in"
        echo "    releases built by GitHub Actions. Install one of those, then re-run this."
    elif [ ! -t 0 ]; then
        echo "    Needs a terminal to paste the token into. Re-run interactively."
    else
        echo "    Create a fine-grained token at https://github.com/settings/personal-access-tokens/new"
        echo "      Repository access: Only select repositories -> $RELEASES_REPO"
        echo "      Permissions: Actions -> Read and write (nothing else)"
        echo "      Expiration: up to a year (you get an alert email if it stops working)"
        read -r -s -p "    Paste the token (input hidden): " DISPATCH_TOKEN
        echo ""
        if [ -z "$DISPATCH_TOKEN" ]; then
            echo "    No token entered; skipping."
        else
            # Written via stdin with a restrictive umask so the token never
            # appears in the process list or in a world-readable file.
            install -d -m 700 -o root -g root "$TOKEN_DIR"
            ( umask 077; printf '%s\n' "$DISPATCH_TOKEN" > "$TOKEN_FILE" )
            chown root:root "$TOKEN_FILE"
            chmod 600 "$TOKEN_FILE"
            unset DISPATCH_TOKEN
            # Not backed up: after a restore onto a new server, run this again
            # with --dispatch-token.
            # A new token clears a previous "token rejected" alert state.
            rm -f "$DATA_DIR/content-dispatch/auth-alert-sent"
            systemctl daemon-reload
            systemctl enable --now personal-website-content-dispatch.timer
            echo "    Token saved to $TOKEN_FILE (root only) and the timer is enabled."
            echo "    Check it with: sudo journalctl -u personal-website-content-dispatch -n 20"
        fi
    fi
fi

echo "==> 5. Verifying"
echo "    gh release list --repo $RELEASES_REPO:"
HOME=/root gh release list --repo "$RELEASES_REPO" --limit 3 || \
    echo "    (empty or failed - check repo access if this server should already have releases)"
sleep 2
systemctl status personal-website-updater --no-pager | head -n 10 || true

echo ""
echo "=========================================================================="
echo " Done. Follow with: sudo journalctl -u personal-website-updater -f"
echo " to confirm a healthy idle poll cycle."
echo "=========================================================================="
