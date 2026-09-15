#!/usr/bin/env bash
# Runs ON THE TARGET SERVER, as root. Disaster-recovery restore: brings a
# server from "bootstrap.sh has run, nothing else has" (or "app/DB wiped via
# the reset recipe in deploy/BACKUP.md, .env intact") back to "running the
# latest published release with the latest backup's data."
#
# Two ways this gets invoked:
#   - Directly, by hand, when the restic repo + password are already on this
#     box (the common case: same box, DB/app wiped, .env survived).
#   - Remotely, by deploy/scripts/restore-remote.sh running ON THE PI, for a
#     genuinely from-scratch box (new EC2 instance) — that script pushes the
#     Pi's backup mirror here first (production can never reach the Pi, only
#     the reverse is possible — see deploy/BACKUP.md), then invokes this
#     script over SSH with --restic-repo/--restic-password-file pointed at
#     what it just pushed.
#
# Usage:
#   sudo bash restore.sh --releases-repo <owner>/<dist-repo> \
#       [--tag vX.Y.Z] \
#       [--restic-repo /path/to/restic-repo] \
#       [--restic-password <password> | --restic-password-file <path>] \
#       [--yes] [--force]
#   sudo bash restore.sh --help
#
# Safety note: if the target is currently up and answering health checks,
# this script requires typing "DESTROY" interactively no matter what --
# --yes does NOT skip this specific gate, since restore-remote.sh always
# passes --yes and the whole point of this gate is to catch "wrong
# --target-host" mistakes on the Pi side. Pass --force to skip it
# deliberately (e.g. testing a restore against a live box on purpose).
set -euo pipefail

_log() { echo "[restore] $*"; }

DATA_DIR="/opt/personal-website/data"
APP_ROOT="/opt/personal-website"

_usage() {
    cat <<'EOF'
================================================================================
 restore.sh — disaster-recovery restore for personal-website
================================================================================
 What this does:
   Restores the latest local restic backup (DB dump + uploads + secrets)
   and installs the latest published release, in that order, so the
   installer's own "is the DB fresh?" check correctly skips first-time
   seeding and just migrates + cuts over.

 Assumes:
   - bootstrap.sh has already been run on this box
   - gh is authenticated here (gh auth login)
   - The restic repo this script is pointed at is reachable and its
     password is correct

 Usage:
   sudo bash restore.sh --releases-repo <owner>/<dist-repo> \
       [--tag vX.Y.Z] \
       [--restic-repo /path/to/restic-repo] \
       [--restic-password <password> | --restic-password-file <path>] \
       [--yes] [--force]

 Flags:
   --releases-repo   <owner>/<repo> on GitHub to install from. Optional if
                     this box already has personal-website-updater.service
                     installed with UPDATE_WATCH_RELEASES_REPO set.
   --tag             Release tag to install. Defaults to the latest release
                     in --releases-repo.
   --restic-repo     Path to the restic repository. Defaults to
                     /opt/personal-website/data/restic-repo. A non-default
                     path is relocated there automatically once the restore
                     succeeds, so future nightly backups keep working.
   --restic-password / --restic-password-file
                     Restic repository password, or a file containing it
                     (preferred — avoids the secret appearing in `ps aux`
                     or shell history). If neither is given, falls back to
                     RESTIC_PASSWORD already in this box's .env.
   --yes             Skip the interactive confirmation prompt. This banner
                     still prints either way. Does NOT skip the extra
                     "site is currently healthy" gate below — that one
                     needs --force.
   --force           Skip the extra confirmation that appears if this box's
                     app is currently up and answering health checks. Use
                     this only when you deliberately intend to restore over
                     a live, working site (e.g. testing the restore path
                     itself) — it's a separate flag from --yes on purpose.
   -h, --help        Print this and exit.

 This is a DESTRUCTIVE operation: it overwrites the current database
 (pg_restore --clean) and the uploads/ directory with the restored
 snapshot's contents. If this box's site is currently up and healthy,
 running this WILL destroy live data with no undo.
================================================================================
EOF
}

RELEASES_REPO_ARG=""
TAG_ARG=""
RESTIC_REPO_ARG=""
RESTIC_PASSWORD_ARG=""
RESTIC_PASSWORD_FILE_ARG=""
ASSUME_YES=false
FORCE=false

while [ $# -gt 0 ]; do
    case "$1" in
        --releases-repo) RELEASES_REPO_ARG="$2"; shift 2 ;;
        --tag) TAG_ARG="$2"; shift 2 ;;
        --restic-repo) RESTIC_REPO_ARG="$2"; shift 2 ;;
        --restic-password) RESTIC_PASSWORD_ARG="$2"; shift 2 ;;
        --restic-password-file) RESTIC_PASSWORD_FILE_ARG="$2"; shift 2 ;;
        --yes) ASSUME_YES=true; shift ;;
        --force) FORCE=true; shift ;;
        -h|--help) _usage; exit 0 ;;
        *) echo "Unknown argument: $1"; _usage; exit 1 ;;
    esac
done

# ---- Preflight ---------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
    echo "Must run as root (sudo bash restore.sh ...)."
    exit 1
fi

if [ ! -f "$DATA_DIR/.env" ]; then
    echo "$DATA_DIR/.env not found — run bootstrap.sh on this box first."
    exit 1
fi

for bin in restic gh curl pg_restore gunzip python3; do
    command -v "$bin" >/dev/null 2>&1 || { echo "Required command not found: $bin"; exit 1; }
done

RESTIC_REPO="${RESTIC_REPO_ARG:-$DATA_DIR/restic-repo}"

if [ -n "$RESTIC_PASSWORD_FILE_ARG" ]; then
    [ -f "$RESTIC_PASSWORD_FILE_ARG" ] || { echo "--restic-password-file not found: $RESTIC_PASSWORD_FILE_ARG"; exit 1; }
    export RESTIC_PASSWORD_FILE="$RESTIC_PASSWORD_FILE_ARG"
elif [ -n "$RESTIC_PASSWORD_ARG" ]; then
    export RESTIC_PASSWORD="$RESTIC_PASSWORD_ARG"
else
    # Fall back to whatever's already in .env (the "same box, .env survived" case).
    EXISTING_RESTIC_PASSWORD="$(grep -oP '^RESTIC_PASSWORD=\K.*' "$DATA_DIR/.env" 2>/dev/null || true)"
    if [ -z "$EXISTING_RESTIC_PASSWORD" ]; then
        echo "No --restic-password/--restic-password-file given, and RESTIC_PASSWORD is not already in $DATA_DIR/.env."
        exit 1
    fi
    export RESTIC_PASSWORD="$EXISTING_RESTIC_PASSWORD"
fi

if [ ! -e "$RESTIC_REPO" ]; then
    echo "No restic repository at $RESTIC_REPO."
    exit 1
fi

if [ -n "$RELEASES_REPO_ARG" ]; then
    RELEASES_REPO="$RELEASES_REPO_ARG"
else
    RELEASES_REPO="$(grep -oP 'Environment=UPDATE_WATCH_RELEASES_REPO=\K\S+' /etc/systemd/system/personal-website-updater.service 2>/dev/null || true)"
    if [ -z "$RELEASES_REPO" ]; then
        echo "--releases-repo not given, and UPDATE_WATCH_RELEASES_REPO is not set in the installed updater unit."
        exit 1
    fi
fi

_log "Verifying restic repository is reachable..."
if ! restic -r "$RESTIC_REPO" snapshots --last >/dev/null 2>&1; then
    echo "Could not read snapshots from $RESTIC_REPO — wrong password, or repo is corrupt."
    exit 1
fi

SNAPSHOT_INFO="$(restic -r "$RESTIC_REPO" snapshots --last --json 2>/dev/null \
    | python3 -c 'import json,sys
d=json.load(sys.stdin)
s=d[0]
print(f"{s[\"time\"][:19]} from host {s.get(\"hostname\",\"?\")}")' 2>/dev/null || echo "unknown")"

_log "Confirming all files this restore needs are present in this snapshot..."
SNAPSHOT_LS="$(restic -r "$RESTIC_REPO" ls latest 2>/dev/null || true)"
# backup.sh's own restic backup call includes exactly these four paths (see
# deploy/scripts/backup.sh) — check for all of them here, up front, rather
# than letting a missing one surface as a confusing failure mid-restore
# (e.g. the .env merge loop or the uploads cp erroring on a path that
# simply isn't there).
for required in "$DATA_DIR/backups/pg/personal_website.sql.gz" "$DATA_DIR/.env" "$DATA_DIR/uploads"; do
    if ! grep -qxF "$required" <<<"$SNAPSHOT_LS"; then
        echo "Expected path not found in latest snapshot: $required"
        echo "Wrong repo, or an unexpected/old snapshot layout — investigate before proceeding."
        exit 1
    fi
done
# certbot_domain.txt is handled gracefully if missing (restore.sh only
# copies it when present and the current one is empty), so its absence is
# a warning, not a hard failure.
if ! grep -qxF "$DATA_DIR/certbot_domain.txt" <<<"$SNAPSHOT_LS"; then
    _log "WARNING: $DATA_DIR/certbot_domain.txt not found in latest snapshot — this box's own certbot_domain.txt (if any) will be left as-is."
fi

_log "Checking available disk space against the snapshot's restore size..."
NEEDED_BYTES="$(restic -r "$RESTIC_REPO" stats --mode restore-size --json latest 2>/dev/null \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["total_size"])' 2>/dev/null || echo "")"
AVAIL_BYTES="$(df --output=avail -B1 "$DATA_DIR" 2>/dev/null | tail -1 | tr -d ' ')"
if [ -n "$NEEDED_BYTES" ] && [ -n "$AVAIL_BYTES" ]; then
    # Require some headroom (1.2x) since the restore lands in a scratch dir
    # before being copied into place, not swapped in-place.
    REQUIRED=$(( NEEDED_BYTES * 12 / 10 ))
    if [ "$AVAIL_BYTES" -lt "$REQUIRED" ]; then
        echo "Not enough disk space: need ~$REQUIRED bytes, have $AVAIL_BYTES available on $DATA_DIR's filesystem."
        exit 1
    fi
else
    _log "Could not determine snapshot size / available disk space — skipping this check."
fi

if [ -n "$TAG_ARG" ]; then
    TAG="$TAG_ARG"
else
    TAG="$(gh release list --repo "$RELEASES_REPO" --limit 1 --json tagName -q '.[0].tagName' 2>/dev/null || true)"
    if [ -z "$TAG" ]; then
        echo "No releases found in $RELEASES_REPO (or 'gh' is not authenticated here — run 'gh auth login')."
        exit 1
    fi
fi

_log "Checking whether this box's site is currently up..."
SITE_HEALTHY=false
BACKEND_PORT="$(grep -oP 'GUNICORN_BIND=127\.0\.0\.1:\K[0-9]+' /etc/systemd/system/personal-website.service 2>/dev/null || true)"
if [ -n "$BACKEND_PORT" ] && curl -sf --connect-timeout 3 --max-time 5 "http://127.0.0.1:$BACKEND_PORT/api/site-config" >/dev/null 2>&1; then
    SITE_HEALTHY=true
fi

# ---- Info banner --------------------------------------------------------------
_usage
cat <<EOF
 Resolved for this run:
   Restic repo:      $RESTIC_REPO
   Latest snapshot:  $SNAPSHOT_INFO
   Releases repo:    $RELEASES_REPO
   Release to install: $TAG
   Site currently up: $SITE_HEALTHY

 This run will, in order:
   1. Stop personal-website.service (if running)
   2. Restore the snapshot above — OVERWRITES the current database
      (pg_restore --clean) and the uploads/ directory
   3. Merge secrets (ENCRYPTION_KEY, RESTIC_PASSWORD, etc.) from that
      snapshot's .env into this box's .env, keeping THIS box's DATABASE_URL
   4. Install release $TAG from $RELEASES_REPO

 Nothing has been changed yet.
================================================================================
EOF

# ---- Extra gate: refuse to silently destroy a currently-healthy site ----------
# Deliberately NOT skipped by --yes: restore-remote.sh always passes --yes to
# this script, so if --yes alone could bypass this, the one scenario this
# gate exists for (a fat-fingered --target-host on the Pi, pointed at a live
# site by mistake) would sail straight through. --force is the explicit,
# separate opt-in for genuinely wanting to restore over a live box.
if [ "$SITE_HEALTHY" = true ] && [ "$FORCE" != true ]; then
    cat <<EOF
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!! This box's site is CURRENTLY UP AND HEALTHY (127.0.0.1:$BACKEND_PORT answered
!! /api/site-config). Proceeding will DESTROY its live database and uploads,
!! replacing them with the snapshot from: $SNAPSHOT_INFO
!! This gate is NOT skipped by --yes. Pass --force if this is intentional.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
EOF
    read -r -p 'Type "DESTROY" (all caps) to proceed anyway: ' DESTROY_CONFIRM
    if [ "$DESTROY_CONFIRM" != "DESTROY" ]; then
        echo "Aborted — nothing was changed."
        exit 1
    fi
fi

# ---- Confirm ----------------------------------------------------------------
if [ "$ASSUME_YES" != true ]; then
    read -r -p 'Type "yes" to proceed: ' CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        echo "Aborted — nothing was changed."
        exit 1
    fi
fi

# ---- 1. Stop the app, if running ----------------------------------------------
_log "Stopping personal-website.service (if running)..."
systemctl stop personal-website 2>/dev/null || true

# ---- 2. Restic restore to scratch space ---------------------------------------
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

_log "Restoring latest snapshot to scratch space..."
restic -r "$RESTIC_REPO" restore latest --target "$WORKDIR"
RESTORED="$WORKDIR$DATA_DIR"

# ---- 3. Merge secrets from the restored .env, keeping the fresh DATABASE_URL --
_log "Merging secrets from the restored .env (keeping this box's DATABASE_URL)..."
_upsert_env() {   # _upsert_env <key> <value>
    local key="$1" value="$2" tmp
    tmp="$(mktemp)"
    grep -v -E "^${key}=" "$DATA_DIR/.env" > "$tmp" || true
    echo "${key}=${value}" >> "$tmp"
    mv "$tmp" "$DATA_DIR/.env"
}
while IFS='=' read -r key value; do
    [ "$key" = "DATABASE_URL" ] && continue
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue   # skips blank/comment lines
    _upsert_env "$key" "$value"
done < "$RESTORED/.env"
chown personalweb:personalweb "$DATA_DIR/.env"
chmod 600 "$DATA_DIR/.env"

if [ ! -s "$DATA_DIR/certbot_domain.txt" ] && [ -f "$RESTORED/certbot_domain.txt" ]; then
    cp "$RESTORED/certbot_domain.txt" "$DATA_DIR/certbot_domain.txt"
fi

# ---- 4. Restore the database ---------------------------------------------------
_log "Restoring database..."
set -a
# shellcheck source=/dev/null
source "$DATA_DIR/.env"
set +a
gunzip -c "$RESTORED/backups/pg/personal_website.sql.gz" | pg_restore --clean --if-exists -d "$DATABASE_URL"

# ---- 5. Restore uploads, fix ownership -----------------------------------------
_log "Restoring uploads..."
mkdir -p "$DATA_DIR/uploads"
cp -r "$RESTORED/uploads/." "$DATA_DIR/uploads/"
chown -R personalweb:personalweb "$DATA_DIR/uploads"

# ---- 6. Relocate the restic repo to its canonical location, if needed ---------
if [ "$(readlink -f "$RESTIC_REPO")" != "$(readlink -f "$DATA_DIR/restic-repo" 2>/dev/null || echo "$DATA_DIR/restic-repo")" ]; then
    if [ -e "$DATA_DIR/restic-repo" ]; then
        echo "ERROR: $DATA_DIR/restic-repo already exists and differs from the repo just used — resolve manually (not auto-overwriting)."
        exit 1
    fi
    _log "Relocating restic repo to $DATA_DIR/restic-repo so future nightly backups keep working..."
    mv "$RESTIC_REPO" "$DATA_DIR/restic-repo"
    chown -R personalweb:personalweb "$DATA_DIR/restic-repo"
fi

# ---- 7. Fetch and install the latest release -----------------------------------
_log "Downloading $TAG from $RELEASES_REPO..."
gh release download "$TAG" --repo "$RELEASES_REPO" --dir "$WORKDIR"
tar -xzf "$WORKDIR"/personal-website-*.tar.gz -C "$WORKDIR"
NEW_INSTALL="$(find "$WORKDIR" -mindepth 2 -maxdepth 3 -path '*/deploy/install.sh')"
if [ -z "$NEW_INSTALL" ]; then
    echo "Could not find deploy/install.sh inside the downloaded release — aborting before touching anything further."
    exit 1
fi

_log "Running install.sh for $TAG (this restores the database's freshness state as NOT fresh, so no seeding will run)..."
INSTALL_OK=true
bash "$NEW_INSTALL" "$WORKDIR"/personal-website-*.tar.gz --tag "$TAG" || INSTALL_OK=false

# ---- 8. Summary -----------------------------------------------------------------
echo "================================================================================"
if [ "$INSTALL_OK" = true ]; then
    _log "Restore complete."
else
    _log "install.sh reported a failure — see its output above."
    # readlink -e (not -f): -f canonicalizes even a nonexistent final
    # component and would print a path anyway on a from-scratch box where
    # install.sh failed before ever creating this symlink, making the
    # emptiness check below never fire. -e requires the target to actually
    # exist, so it's genuinely empty when there's truly no current release.
    CURRENT_AFTER="$(readlink -e "$APP_ROOT/current" 2>/dev/null || true)"
    if [ -z "$CURRENT_AFTER" ] || [ "$(basename "$CURRENT_AFTER")" = "$TAG" ]; then
        _log "NOTE: no previous release for install.sh to roll back to (or it left $TAG in place) — the site may be left down; debug manually (systemctl status personal-website, journalctl -u personal-website)."
    else
        # install.sh rolled back to an OLDER release's code, but the database
        # still has whatever migrations it just ran for $TAG applied on top of
        # the data we restored above — old code was never written against
        # that schema. Re-restore the pre-migration dump (still sitting in
        # $WORKDIR, not cleaned up until this script exits) so the code
        # install.sh actually left running is paired with data at the schema
        # state it expects, rather than leaving a silent code/schema mismatch.
        _log "install.sh rolled back to $(basename "$CURRENT_AFTER") — re-restoring pre-migration data so it isn't left running against $TAG's schema changes..."
        if gunzip -c "$RESTORED/backups/pg/personal_website.sql.gz" | pg_restore --clean --if-exists -d "$DATABASE_URL"; then
            systemctl restart personal-website
            _log "Pre-migration data re-restored and $(basename "$CURRENT_AFTER") restarted."
        else
            _log "WARNING: re-restoring pre-migration data also failed — database may now be in an inconsistent state. Investigate manually before trusting this site."
        fi
    fi
fi
_log "Restored snapshot: $SNAPSHOT_INFO"
_log "Installed release: $TAG"
_log "Next: log into /admin and spot-check content. Specifically check an encrypted field (e.g. Mailgun settings under Integrations) to confirm ENCRYPTION_KEY carried over correctly rather than showing garbage."
echo "================================================================================"

[ "$INSTALL_OK" = true ]
