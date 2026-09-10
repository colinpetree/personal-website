#!/usr/bin/env bash
# Enables the nightly backup-pull job on the Pi build machine. Safe to
# re-run (e.g. after a later fix to the timer/service unit files or this
# script itself) — re-copies the unit files and restarts the timer so
# changes actually take effect even if it's already running. Assumes the
# repo is already checked out at ~/src/personal-website (build-on-pi.sh's
# normal home) and ~/.personal-website-build.env already has
# WATCHER_ALERT_SECRET/PRERENDER_BASE_URL set (i.e. setup-auto-update-pi.sh
# has already been run from here).
#
# Usage (run as the Pi's normal build user, NOT root):
#   bash setup-backup-pull-pi.sh --production-host test633.org \
#       --production-remote-path /opt/personal-website/data/restic-repo \
#       --restic-password <password from setup-restic-repo.sh's output>
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
    echo "Run as the normal build user, not root (sudo is only used internally for loginctl/apt)."
    exit 1
fi

PROD_HOST=""
PROD_REMOTE_PATH="/opt/personal-website/data/restic-repo"
RESTIC_PW=""
while [ $# -gt 0 ]; do
    case "$1" in
        --production-host) PROD_HOST="$2"; shift 2 ;;
        --production-remote-path) PROD_REMOTE_PATH="$2"; shift 2 ;;
        --restic-password) RESTIC_PW="$2"; shift 2 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

if [ -z "$PROD_HOST" ] || [ -z "$RESTIC_PW" ]; then
    echo "Usage: bash setup-backup-pull-pi.sh --production-host <domain> --restic-password <password>"
    echo "       [--production-remote-path /opt/personal-website/data/restic-repo]"
    exit 1
fi

REPO_DIR="$HOME/src/personal-website"
BUILD_ENV="$HOME/.personal-website-build.env"
USER_UNIT_DIR="$HOME/.config/systemd/user"
KEY_FILE="$HOME/.ssh/personal-website-backup-pull"
LOCAL_BACKUP_DIR="$HOME/personal-website-backups"

if [ ! -f "$REPO_DIR/deploy/systemd/personal-website-backup-pull.service" ]; then
    echo "$REPO_DIR/deploy/systemd/personal-website-backup-pull.service not found — expected the repo checked out at $REPO_DIR."
    exit 1
fi

echo "==> 1. restic"
if ! command -v restic >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y restic
else
    echo "    Already installed ($(restic version))."
fi

echo "==> 2. Dedicated backup-pull SSH key"
# A fresh, single-purpose key — never the AWS admin key used to SSH into
# production interactively. This one will be restricted on production's end
# to a single read-only rsync command, so even a full compromise of this Pi
# only leaks the ability to re-pull backups, not run arbitrary commands.
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
if [ -f "$KEY_FILE" ]; then
    echo "    Key already exists at $KEY_FILE — not regenerating."
else
    ssh-keygen -t ed25519 -f "$KEY_FILE" -N "" -C "personal-website-backup-pull"
fi

echo "==> 3. Config in $BUILD_ENV"
touch "$BUILD_ENV"
_set_var() {
    local name="$1" value="$2"
    if grep -q "^${name}=" "$BUILD_ENV" 2>/dev/null; then
        sed -i "s|^${name}=.*|${name}=${value}|" "$BUILD_ENV"
    else
        echo "${name}=${value}" >> "$BUILD_ENV"
    fi
}
_set_var "BACKUP_PULL_HOST" "$PROD_HOST"
_set_var "BACKUP_PULL_REMOTE_PATH" "$PROD_REMOTE_PATH"
_set_var "BACKUP_PULL_LOCAL_DIR" "$LOCAL_BACKUP_DIR"
_set_var "BACKUP_PULL_SSH_KEY" "$KEY_FILE"
_set_var "RESTIC_PASSWORD" "$RESTIC_PW"
mkdir -p "$LOCAL_BACKUP_DIR"
echo "    Set in $BUILD_ENV."
if ! grep -q '^WATCHER_ALERT_SECRET=' "$BUILD_ENV" 2>/dev/null; then
    echo "    WARNING: WATCHER_ALERT_SECRET is not set in $BUILD_ENV — backup-pull.sh"
    echo "    won't be able to alert on failure. Run setup-auto-update-pi.sh first."
fi

echo "==> 4. Installing the systemd --user unit"
mkdir -p "$USER_UNIT_DIR"
cp "$REPO_DIR/deploy/systemd/personal-website-backup-pull.service" "$USER_UNIT_DIR/"
cp "$REPO_DIR/deploy/systemd/personal-website-backup-pull.timer" "$USER_UNIT_DIR/"
echo "    Wrote $USER_UNIT_DIR/personal-website-backup-pull.{service,timer}."

echo "==> 5. Enabling personal-website-backup-pull.timer"
systemctl --user daemon-reload
systemctl --user enable --now personal-website-backup-pull.timer
systemctl --user restart personal-website-backup-pull.timer   # pick up unit/schedule changes above if already running

echo "==> 6. Enabling linger (survives logout/reboot)"
sudo loginctl enable-linger "$(whoami)"

echo ""
echo "=========================================================================="
echo " Done. Paste this EXACT line into production's personalweb user's"
echo " ~/.ssh/authorized_keys (create the file with chmod 600 if it doesn't"
echo " already exist) — replace the path below if you used a non-default"
echo " --production-remote-path:"
echo ""
echo "restrict,command=\"rsync --server --sender -logDtprze.iLsfxC . ${PROD_REMOTE_PATH}\" $(cat "$KEY_FILE.pub")"
echo ""
echo " The --sender flag makes this forced command READ-ONLY — it can only"
echo " serve files from that path, never write to production, even if this"
echo " key were to leak."
echo ""
echo " Verify manually once the key is in place:"
echo "   cd $REPO_DIR && bash deploy/scripts/backup-pull.sh"
echo "   restic -r $LOCAL_BACKUP_DIR snapshots"
echo "=========================================================================="
