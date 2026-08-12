#!/usr/bin/env bash
# Runs ON THE PI, from within the cloned repo (~/src/personal-website).
# Pulls the latest committed+pushed code, then builds both frontend and
# backend and assembles a release tarball.
#
# First-time setup on the Pi (once, by hand):
#   mkdir -p ~/src
#   git clone git@github.com:<owner>/<repo>.git ~/src/personal-website
#
# Build scratch space (venv, release tarballs) is kept out of the source
# tree entirely, in ~/personal-website-build — no reason for build artifacts
# to live inside a git checkout.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_ROOT="$HOME/personal-website-build"
STAGING="$BUILD_ROOT/release-staging"

cd "$REPO_DIR"

# publish-release.sh sets SKIP_GIT_SYNC=1 when it calls this script — it has
# already written a (deliberately uncommitted, until the build succeeds)
# version bump to VERSION and needs the working tree left exactly as-is; a
# git reset --hard here would silently discard that bump.
if [ -n "${SKIP_GIT_SYNC:-}" ]; then
    echo "==> SKIP_GIT_SYNC set — building working tree as-is"
elif [ -d .git ]; then
    echo "==> Pulling latest from origin"
    git fetch origin
    git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)"
else
    echo "WARNING: $REPO_DIR is not a git checkout — building whatever is on disk as-is."
fi

VERSION="$(cat VERSION | tr -d '[:space:]')"
echo "==> Building v$VERSION from $REPO_DIR"

# ---- Frontend ---------------------------------------------------------
echo "==> Building frontend"
cd "$REPO_DIR/frontend"
npm ci
npm run build

# ---- Backend ------------------------------------------------------------
echo "==> Building backend (PyInstaller onedir)"
cd "$REPO_DIR/backend"

VENV_DIR="$BUILD_ROOT/venv"
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
fi
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"
pip install --upgrade pip
pip install -r requirements.txt pyinstaller

rm -rf build dist
pyinstaller pyinstaller.spec --distpath dist --workpath build --noconfirm

FROZEN_BIN="$REPO_DIR/backend/dist/server/server"
if [ ! -x "$FROZEN_BIN" ]; then
    echo "BUILD FAILED: frozen binary not found at $FROZEN_BIN"
    exit 1
fi

# ---- Smoke test -----------------------------------------------------------
# 1. Credential-free import check — catches missing PyInstaller hidden
#    imports for the dependencies flagged in pyinstaller.spec, without
#    needing live Anthropic/Stripe/etc credentials during the build.
echo "==> Smoke test: dependency imports"
"$FROZEN_BIN" --check-imports

# 2. Actually boot the app end to end against a throwaway SQLite DB (no
#    Postgres required on the Pi) and hit a real route through gunicorn.
echo "==> Smoke test: boot + HTTP request"
SMOKE_DB="$(mktemp -u).db"
SMOKE_DATA_DIR="$(mktemp -d)"
export DATABASE_URL="sqlite:///$SMOKE_DB"
export SECRET_KEY="smoke-test"
export ENCRYPTION_KEY="$(python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
export APP_DATA_DIR="$SMOKE_DATA_DIR"
export GUNICORN_BIND="127.0.0.1:8099"
export GUNICORN_WORKERS="1"
export ENABLE_AI_DEMOS="false"

"$FROZEN_BIN" &
SMOKE_PID=$!
trap 'kill $SMOKE_PID 2>/dev/null || true; rm -f "$SMOKE_DB"; rm -rf "$SMOKE_DATA_DIR"' EXIT

for i in $(seq 1 15); do
    if curl -sf "http://127.0.0.1:8099/api/site-config" >/dev/null 2>&1; then
        echo "Smoke test OK — server responded."
        break
    fi
    if [ "$i" -eq 15 ]; then
        echo "BUILD FAILED: server did not respond to /api/site-config within 15s"
        exit 1
    fi
    sleep 1
done

kill $SMOKE_PID 2>/dev/null || true
wait $SMOKE_PID 2>/dev/null || true
trap - EXIT
rm -f "$SMOKE_DB"
rm -rf "$SMOKE_DATA_DIR"

# ---- Assemble the release tarball ------------------------------------------
echo "==> Assembling release v$VERSION"
RELEASE_NAME="personal-website-v$VERSION"
RELEASE_DIR="$STAGING/$RELEASE_NAME"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

cp -r "$REPO_DIR/backend/dist/server" "$RELEASE_DIR/backend"
mkdir -p "$RELEASE_DIR/frontend"
cp -r "$REPO_DIR/frontend/dist" "$RELEASE_DIR/frontend/dist"

mkdir -p "$RELEASE_DIR/migrations"
PREV_TAG="$(git -C "$REPO_DIR" describe --tags --abbrev=0 --match 'v*' 2>/dev/null || echo '')"
if [ -n "$PREV_TAG" ]; then
    git -C "$REPO_DIR" diff --name-only "$PREV_TAG" HEAD -- backend/migrations | while read -r f; do
        [ -f "$REPO_DIR/$f" ] && cp "$REPO_DIR/$f" "$RELEASE_DIR/migrations/"
    done
else
    cp "$REPO_DIR"/backend/migrations/*.sql "$RELEASE_DIR/migrations/" 2>/dev/null || true
fi

mkdir -p "$RELEASE_DIR/deploy/systemd" "$RELEASE_DIR/deploy/nginx" "$RELEASE_DIR/deploy/varnish"
cp "$REPO_DIR/deploy/systemd/personal-website.service" "$RELEASE_DIR/deploy/systemd/"
cp "$REPO_DIR/deploy/nginx/personal-website.conf" "$RELEASE_DIR/deploy/nginx/"
cp "$REPO_DIR/deploy/varnish/default.vcl" "$RELEASE_DIR/deploy/varnish/"
cp "$REPO_DIR/deploy/scripts/install.sh" "$RELEASE_DIR/deploy/"
cp "$REPO_DIR/deploy/scripts/rollback.sh" "$RELEASE_DIR/deploy/"
cp "$REPO_DIR/backend/.env.example" "$RELEASE_DIR/"
cp "$REPO_DIR/VERSION" "$RELEASE_DIR/"

TARBALL="$STAGING/$RELEASE_NAME.tar.gz"
tar -czf "$TARBALL" -C "$STAGING" "$RELEASE_NAME"
# Run from inside $STAGING so the checksum file records a bare relative
# filename — install.sh's `sha256sum -c` on the production server needs that
# (an absolute Pi-local path would never match there). No path-rewriting
# needed this way, unlike computing the hash from an absolute path first.
(cd "$STAGING" && { sha256sum "$RELEASE_NAME.tar.gz" || shasum -a 256 "$RELEASE_NAME.tar.gz"; } > "$RELEASE_NAME.tar.gz.sha256")

echo "==> Done: $TARBALL"
echo "    Next: bash deploy/scripts/publish-release.sh"
