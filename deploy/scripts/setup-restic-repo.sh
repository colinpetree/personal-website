#!/usr/bin/env bash
# Run ONCE on the production server (as root, e.g.
# `sudo bash setup-restic-repo.sh`) to initialize the local restic repository
# deploy/scripts/backup.sh backs up into nightly. Generates and stores the
# repository password in $DATA_DIR/.env (same plain-value trust model
# already used there for DATABASE_URL/BACKUP_* — .env is itself included in
# every backup, so anyone who could read a leaked .env already has
# DATABASE_URL too).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "Run as root (sudo bash setup-restic-repo.sh) — it writes under \$DATA_DIR, owned by personalweb."
    exit 1
fi

DATA_DIR="/opt/personal-website/data"
ENV_FILE="$DATA_DIR/.env"
REPO_DIR="$DATA_DIR/restic-repo"

if ! command -v restic >/dev/null 2>&1; then
    echo "restic is not installed — it should have been installed by bootstrap.sh. Run 'apt install restic' first."
    exit 1
fi

REPO_ALREADY_INIT=false
[ -d "$REPO_DIR" ] && [ -f "$REPO_DIR/config" ] && REPO_ALREADY_INIT=true

if grep -q '^RESTIC_PASSWORD=' "$ENV_FILE" 2>/dev/null; then
    RESTIC_PASSWORD="$(grep '^RESTIC_PASSWORD=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
    if [ "$REPO_ALREADY_INIT" = true ]; then
        # Never trust blindly — verify this password actually opens the
        # existing repo before doing anything else. Skipping this check is
        # exactly how a stale/wrong password ends up permanently unable to
        # open a repo that's otherwise perfectly intact.
        echo "==> RESTIC_PASSWORD already set in $ENV_FILE — verifying it opens the existing repository."
        if ! RESTIC_PASSWORD="$RESTIC_PASSWORD" restic -r "$REPO_DIR" snapshots >/dev/null 2>&1; then
            echo "ERROR: the repository at $REPO_DIR already exists, but RESTIC_PASSWORD in $ENV_FILE"
            echo "does not open it. Refusing to continue — generating a new password here would"
            echo "permanently orphan the existing repository instead of fixing anything."
            echo "Recover the correct password (e.g. from the Pi's ~/.personal-website-build.env,"
            echo "which was given a copy of it during setup-backup-pull-pi.sh) and set it in"
            echo "$ENV_FILE by hand, then re-run this script."
            exit 1
        fi
        echo "    Verified."
    else
        echo "==> RESTIC_PASSWORD already set in $ENV_FILE — not regenerating."
    fi
elif [ "$REPO_ALREADY_INIT" = true ]; then
    # Repo exists but .env has no record of its password at all — e.g. .env
    # was restored from an older backup, or the line was deleted by hand.
    # Minting a fresh password here would silently create a repo/password
    # mismatch that only surfaces later as a cryptic restic auth failure.
    echo "ERROR: the repository at $REPO_DIR already exists, but $ENV_FILE has no RESTIC_PASSWORD line."
    echo "Refusing to generate a new one — that would permanently orphan the existing repository."
    echo "Recover the correct password (e.g. from the Pi's ~/.personal-website-build.env, which was"
    echo "given a copy of it during setup-backup-pull-pi.sh) and set it in $ENV_FILE by hand as:"
    echo "    RESTIC_PASSWORD=<the recovered password>"
    echo "then re-run this script. If the repository is genuinely gone/unwanted, remove"
    echo "$REPO_DIR by hand first instead."
    exit 1
else
    echo "==> Generating RESTIC_PASSWORD"
    RESTIC_PASSWORD="$(openssl rand -base64 32)"
    echo "RESTIC_PASSWORD=${RESTIC_PASSWORD}" >> "$ENV_FILE"
    echo "    Appended to $ENV_FILE."
fi

if [ "$REPO_ALREADY_INIT" = true ]; then
    echo "==> Repository already initialized at $REPO_DIR — skipping restic init."
else
    echo "==> Initializing restic repository at $REPO_DIR"
    mkdir -p "$REPO_DIR"
    RESTIC_PASSWORD="$RESTIC_PASSWORD" restic -r "$REPO_DIR" init
fi

chown -R personalweb:personalweb "$REPO_DIR"

echo ""
echo "=========================================================================="
echo " Done. Repository: $REPO_DIR"
echo ""
echo " IMPORTANT: paste this same password into the Pi's"
echo " ~/.personal-website-build.env as RESTIC_PASSWORD=... (needed there for"
echo " backup-pull.sh's post-pull snapshot check, and for any future restore):"
echo ""
echo "     RESTIC_PASSWORD=${RESTIC_PASSWORD}"
echo ""
echo " Next: run deploy/scripts/setup-backup-pull-pi.sh on the Pi, then paste"
echo " its printed authorized_keys line onto this server, then enable the"
echo " backup timer here: systemctl enable --now personal-website-backup.timer"
echo "=========================================================================="
