#!/usr/bin/env bash
# Runs ON THE PI. Orchestrates disaster recovery for a brand-new target
# server (a fresh EC2 instance that's already been bootstrap.sh'd) by
# pushing the Pi's backup mirror to it and remotely invoking restore.sh
# there. Production can never reach the Pi (no port-forwarding, a rotating
# public IP - see deploy/BACKUP.md), so the connection direction here is
# deliberately Pi -> target, the same as backup-pull.sh already uses,
# rather than having the target try to pull from the Pi.
#
# Usage:
#   bash restore-remote.sh --target-user ubuntu --target-host <host-or-ip> \
#       --ssh-key /path/to/key.pem [--releases-repo <owner>/<repo>] \
#       [--tag vX.Y.Z] [--yes]
#   bash restore-remote.sh --help
set -euo pipefail

_log() { echo "[restore-remote] $*"; }

PI_BUILD_ENV="$HOME/.personal-website-build.env"

_usage() {
    cat <<'EOF'
================================================================================
 restore-remote.sh - disaster-recovery restore, driven from the Pi
================================================================================
 What this does:
   Pushes this Pi's local backup mirror to a brand-new, freshly-
   bootstrap.sh'd target server (production can never reach the Pi, so the
   Pi has to push, not the target pull), then remotely runs restore.sh
   there to restore the database/uploads/secrets and install the latest
   published release.

 Assumes:
   - The target has already had bootstrap.sh run on it
   - The target already has `gh auth login` done
   - This Pi's own backup-pull.sh has a healthy, recent local mirror

 Safety note: this script always passes --yes to the remote restore.sh
 (there's no one at that terminal to answer a prompt), but restore.sh has
 its own separate, non-bypassable gate if the target turns out to be
 currently up and healthy - it'll require typing the target's own domain
 over this SSH session specifically to guard against a mistyped --target-host pointing
 this at a live site by accident.

 Usage:
   bash restore-remote.sh --target-user ubuntu --target-host <host-or-ip> \
       --ssh-key /path/to/key.pem \
       [--releases-repo <owner>/<repo>] [--tag vX.Y.Z] [--yes]

 Flags:
   --target-user      SSH user on the target (e.g. ubuntu).
   --target-host      Target's address. Must be directly SSH-reachable,
                       not a Cloudflare-proxied domain (SSH needs the raw
                       EC2 public DNS/IP; see deploy/BACKUP.md).
   --ssh-key          Path to the SSH private key for the target.
   --releases-repo    <owner>/<repo> on GitHub to install from. Defaults to
                       the same personal-website-dist-<domain> convention
                       publish-release.sh derives from PRERENDER_BASE_URL.
   --tag              Release tag to install. Defaults to latest.
   --yes              Skip the interactive confirmation prompt. This
                       banner still prints either way.
   -h, --help         Print this and exit.

 This is a DESTRUCTIVE operation on the TARGET server: it overwrites its
 database and uploads/ directory with the Pi's latest backup snapshot.
================================================================================
EOF
}

TARGET_USER=""
TARGET_HOST=""
SSH_KEY=""
RELEASES_REPO_ARG=""
TAG_ARG=""
ASSUME_YES=false

while [ $# -gt 0 ]; do
    case "$1" in
        --target-user) TARGET_USER="$2"; shift 2 ;;
        --target-host) TARGET_HOST="$2"; shift 2 ;;
        --ssh-key) SSH_KEY="$2"; shift 2 ;;
        --releases-repo) RELEASES_REPO_ARG="$2"; shift 2 ;;
        --tag) TAG_ARG="$2"; shift 2 ;;
        --yes) ASSUME_YES=true; shift ;;
        -h|--help) _usage; exit 0 ;;
        *) echo "Unknown argument: $1"; _usage; exit 1 ;;
    esac
done

if [ -z "$TARGET_USER" ] || [ -z "$TARGET_HOST" ] || [ -z "$SSH_KEY" ]; then
    echo "--target-user, --target-host, and --ssh-key are all required."
    _usage
    exit 1
fi
[ -f "$SSH_KEY" ] || { echo "--ssh-key not found: $SSH_KEY"; exit 1; }

SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15)

# ---- Preflight ---------------------------------------------------------------
[ -f "$PI_BUILD_ENV" ] || { echo "$PI_BUILD_ENV not found - run setup-backup-pull-pi.sh first."; exit 1; }
set -a
# shellcheck source=/dev/null
source "$PI_BUILD_ENV"
set +a

if [ -z "${RESTIC_PASSWORD:-}" ] || [ -z "${BACKUP_PULL_LOCAL_DIR:-}" ]; then
    echo "RESTIC_PASSWORD / BACKUP_PULL_LOCAL_DIR not set in $PI_BUILD_ENV - run setup-backup-pull-pi.sh first."
    exit 1
fi

_log "Checking this Pi's local backup mirror is healthy..."
# No backslash inside the f-string's {...}: that's a syntax error on Python
# older than 3.12 (PEP 701 lifted the restriction) - confirmed failing on
# the Pi's own python3. Assign plain variables first instead.
SNAPSHOT_INFO="$(RESTIC_PASSWORD="$RESTIC_PASSWORD" restic -r "$BACKUP_PULL_LOCAL_DIR" snapshots --latest 1 --json 2>/dev/null \
    | python3 -c 'import json,sys
d=json.load(sys.stdin)
s=d[0]
t=s["time"][:19]
h=s.get("hostname","?")
print(f"{t} from host {h}")' 2>/dev/null || true)"
if [ -z "$SNAPSHOT_INFO" ]; then
    echo "Could not read a snapshot from $BACKUP_PULL_LOCAL_DIR - the local mirror may be stale or broken. Check backup-status.sh before proceeding."
    exit 1
fi

_log "Checking the target is reachable and bootstrapped..."
if ! ssh "${SSH_OPTS[@]}" "$TARGET_USER@$TARGET_HOST" 'test -f /opt/personal-website/data/.env'; then
    echo "Target unreachable, or bootstrap.sh hasn't been run there yet."
    exit 1
fi

_log "Checking gh is authenticated on the target..."
if ! ssh "${SSH_OPTS[@]}" "$TARGET_USER@$TARGET_HOST" 'gh auth status' >/dev/null 2>&1; then
    echo "gh is not authenticated on the target - run 'gh auth login' there first, then re-run this script."
    exit 1
fi

if [ -n "$RELEASES_REPO_ARG" ]; then
    RELEASES_REPO="$RELEASES_REPO_ARG"
else
    # Same domain-derivation publish-release.sh/publish-content-refresh.sh
    # already use: personal-website-dist-<domain>, from PRERENDER_BASE_URL.
    BUILD_DOMAIN="$(printf '%s' "${PRERENDER_BASE_URL:-}" | sed -E 's#^https?://##; s#/.*$##')"
    if [ -z "$BUILD_DOMAIN" ]; then
        echo "--releases-repo not given, and PRERENDER_BASE_URL is not set in $PI_BUILD_ENV to derive it from."
        exit 1
    fi
    RELEASES_REPO="colinpetree/personal-website-dist-${BUILD_DOMAIN}"
fi

TAG_DISPLAY="${TAG_ARG:-latest}"

# ---- Info banner --------------------------------------------------------------
_usage
cat <<EOF
 Resolved for this run:
   Local snapshot to push: $SNAPSHOT_INFO
   Target:                 $TARGET_USER@$TARGET_HOST
   Releases repo:          $RELEASES_REPO
   Release to install:     $TAG_DISPLAY

 This run will, in order:
   1. Push this Pi's local backup mirror to the target's home directory
   2. Ship restore.sh + a short-lived restic password file to the target
   3. Remotely run restore.sh there with --yes (it will overwrite the
      target's database and uploads/ directory, then install the release
      above)

 Nothing has been changed on the target yet.
================================================================================
EOF

if [ "$ASSUME_YES" != true ]; then
    read -r -p 'Type "yes" to proceed: ' CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        echo "Aborted - nothing was pushed."
        exit 1
    fi
fi

# ---- Push the mirror -----------------------------------------------------------
_log "Pushing local backup mirror to $TARGET_HOST:~/restic-repo/ ..."
rsync -avz --delete -e "ssh ${SSH_OPTS[*]}" \
    "$BACKUP_PULL_LOCAL_DIR/" "$TARGET_USER@$TARGET_HOST:~/restic-repo/"

# ---- Ship restore.sh + a short-lived password file ------------------------------
PW_FILE="$(mktemp)"
trap 'rm -f "$PW_FILE"' EXIT
printf '%s' "$RESTIC_PASSWORD" > "$PW_FILE"
chmod 600 "$PW_FILE"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
_log "Copying restore.sh and a one-time password file to the target..."
scp "${SSH_OPTS[@]}" "$SCRIPT_DIR/restore.sh" "$PW_FILE" "$TARGET_USER@$TARGET_HOST:~/"
REMOTE_PW_FILE="$(basename "$PW_FILE")"

# ---- Invoke it remotely ---------------------------------------------------------
_log "Running restore.sh on the target (streaming its output below)..."
REMOTE_CMD="sudo bash ~/restore.sh --restic-repo ~/restic-repo --restic-password-file ~/$REMOTE_PW_FILE --releases-repo '$RELEASES_REPO' --yes"
if [ -n "$TAG_ARG" ]; then
    REMOTE_CMD="$REMOTE_CMD --tag '$TAG_ARG'"
fi
REMOTE_CMD="$REMOTE_CMD; rc=\$?; rm -f ~/restore.sh ~/$REMOTE_PW_FILE; exit \$rc"

RESTORE_OK=true
ssh "${SSH_OPTS[@]}" -t "$TARGET_USER@$TARGET_HOST" "$REMOTE_CMD" || RESTORE_OK=false

# ---- Summary ----------------------------------------------------------------------
echo "================================================================================"
if [ "$RESTORE_OK" = true ]; then
    _log "Restore completed successfully on $TARGET_HOST."
else
    _log "restore.sh reported a failure on $TARGET_HOST - see its output above."
    _log "~/restic-repo was intentionally left on the target for debugging (only cleaned up automatically after a successful move into /opt/personal-website/data/restic-repo)."
    _log "NOTE: if this was a genuinely from-scratch box, install.sh has no previous release to auto-rollback to - the site may be left down; SSH in and debug manually."
fi
echo "================================================================================"

[ "$RESTORE_OK" = true ]
