#!/usr/bin/env bash
# Packages a release tarball. Used by GitHub Actions (.github/workflows/
# build-test.yml and build-instance.yml) and by the Pi fallback
# (deploy/scripts/build-on-pi.sh), so every release has the same layout no
# matter what built it.
#
# Two steps, because the backend is the same for every site but the
# prerendered frontend is not:
#
#   1. --server-only
#      Packages everything except the frontend: the frozen backend
#      (backend/dist/server), migrations, systemd/nginx/Varnish config, the
#      deploy scripts, .env.example and VERSION. Built once per version.
#      Output: server-bundle-v<VERSION>-linux-<arch>.tar.gz (+ .sha256)
#
#      The name deliberately does NOT start with "personal-website-":
#      install.sh and update-watch.sh find the release tarball with the glob
#      personal-website-*.tar.gz and must never pick up a bundle instead.
#
#   2. --from-server-bundle <tgz> --frontend <dir>
#      Unpacks a server bundle, adds a built frontend (frontend/build/client)
#      as frontend/dist plus a PRERENDERED_AT timestamp, and writes the final
#      personal-website-v<VERSION>.tar.gz (+ .sha256) that install.sh
#      installs. VERSION comes from the bundle itself.
#
# Usage:
#   assemble-release.sh --server-only --out <dir> [--repo-dir <dir>]
#   assemble-release.sh --from-server-bundle <tgz> --frontend <dir> --out <dir> [--no-ai]
#
# --no-ai: ship a .env.example defaulting ENABLE_AI_DEMOS=false (for builds
#          whose frontend was built with VITE_ENABLE_AI_DEMOS=false). Only
#          affects a fresh install that creates .env from .env.example.
#
# Prints the path of the tarball it wrote as its last line.
set -euo pipefail

MODE=""
OUT_DIR=""
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUNDLE=""
FRONTEND_DIR=""
NO_AI=false
while [ $# -gt 0 ]; do
    case "$1" in
        --server-only) MODE="server"; shift ;;
        --from-server-bundle) MODE="site"; BUNDLE="$2"; shift 2 ;;
        --frontend) FRONTEND_DIR="$2"; shift 2 ;;
        --out) OUT_DIR="$2"; shift 2 ;;
        --repo-dir) REPO_DIR="$2"; shift 2 ;;
        --no-ai) NO_AI=true; shift ;;
        *) echo "assemble-release.sh: unknown argument: $1" >&2; exit 1 ;;
    esac
done

if [ -z "$MODE" ] || [ -z "$OUT_DIR" ]; then
    echo "Usage: assemble-release.sh --server-only --out <dir> [--repo-dir <dir>]" >&2
    echo "   or: assemble-release.sh --from-server-bundle <tgz> --frontend <dir> --out <dir> [--no-ai]" >&2
    exit 1
fi
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

# Writes <file>.sha256 holding a bare relative filename - install.sh runs
# `sha256sum -c` from the tarball's own directory on the server, so an
# absolute build-machine path would never match there.
_write_sha() {
    (cd "$(dirname "$1")" && { sha256sum "$(basename "$1")" || shasum -a 256 "$(basename "$1")"; } > "$(basename "$1").sha256")
}

_arch() {
    case "$(uname -m)" in
        aarch64|arm64) echo arm64 ;;
        x86_64|amd64) echo x64 ;;
        *) uname -m ;;
    esac
}

if [ "$MODE" = "server" ]; then
    # The repo has no committed VERSION file (versions come from git tags):
    # whatever builds the release writes one first (CI's build-test.yml,
    # build-on-pi.sh).
    if [ ! -f "$REPO_DIR/VERSION" ]; then
        echo "assemble-release.sh: no $REPO_DIR/VERSION. Write the version being built into it first (e.g. echo 1.2.3 > VERSION)." >&2
        exit 1
    fi
    VERSION="$(tr -d '[:space:]' < "$REPO_DIR/VERSION")"
    BACKEND_DIST="$REPO_DIR/backend/dist/server"
    if [ ! -x "$BACKEND_DIST/server" ]; then
        echo "assemble-release.sh: frozen backend not found at $BACKEND_DIST/server - build it first." >&2
        exit 1
    fi

    NAME="server-bundle-v$VERSION"
    STAGE="$(mktemp -d)"
    trap 'rm -rf "$STAGE"' EXIT
    DEST="$STAGE/$NAME"
    mkdir -p "$DEST"

    cp -r "$BACKEND_DIST" "$DEST/backend"

    # Every migration file, not just those since the previous tag -
    # install.sh's schema_migrations table tracks per-file applied state, so
    # re-shipping an already-applied file is a no-op. Diffing against the
    # previous tag instead used to silently drop a migration whose release got
    # skipped on some server.
    mkdir -p "$DEST/migrations"
    cp "$REPO_DIR"/backend/migrations/*.sql "$DEST/migrations/" 2>/dev/null || true

    mkdir -p "$DEST/deploy/systemd" "$DEST/deploy/nginx" "$DEST/deploy/varnish"
    for unit in \
        personal-website.service \
        personal-website-updater.service \
        personal-website-backup.service personal-website-backup.timer \
        personal-website-healthwatch.service personal-website-healthwatch.timer \
        personal-website-media-cleanup.service personal-website-media-cleanup.timer \
        personal-website-content-dispatch.service personal-website-content-dispatch.timer
    do
        cp "$REPO_DIR/deploy/systemd/$unit" "$DEST/deploy/systemd/"
    done
    cp "$REPO_DIR/deploy/nginx/personal-website.conf" "$DEST/deploy/nginx/"
    cp "$REPO_DIR/deploy/varnish/default.vcl" "$DEST/deploy/varnish/"
    for script in \
        install.sh rollback.sh update-watch.sh backup.sh setup-restic-repo.sh \
        health-watch.sh media-cleanup.sh content-dispatch.sh
    do
        cp "$REPO_DIR/deploy/scripts/$script" "$DEST/deploy/"
    done

    cp "$REPO_DIR/backend/.env.example" "$DEST/.env.example"
    cp "$REPO_DIR/VERSION" "$DEST/VERSION"

    TARBALL="$OUT_DIR/$NAME-linux-$(_arch).tar.gz"
    tar -czf "$TARBALL" -C "$STAGE" "$NAME"
    _write_sha "$TARBALL"
    echo "$TARBALL"
    exit 0
fi

# ---- site mode -------------------------------------------------------------
if [ -z "$BUNDLE" ] || [ ! -f "$BUNDLE" ]; then
    echo "assemble-release.sh: server bundle not found: ${BUNDLE:-<none given>}" >&2
    exit 1
fi
if [ -z "$FRONTEND_DIR" ] || { [ ! -f "$FRONTEND_DIR/index.html" ] && [ ! -f "$FRONTEND_DIR/__spa-fallback.html" ]; }; then
    echo "assemble-release.sh: no built frontend at ${FRONTEND_DIR:-<none given>} (expected frontend/build/client)." >&2
    exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
tar -xzf "$BUNDLE" -C "$STAGE"
BUNDLE_DIR="$(find "$STAGE" -mindepth 1 -maxdepth 1 -type d -name 'server-bundle-v*' | head -1)"
if [ -z "$BUNDLE_DIR" ] || [ ! -f "$BUNDLE_DIR/VERSION" ]; then
    echo "assemble-release.sh: $BUNDLE is not a server bundle (no server-bundle-v*/VERSION inside)." >&2
    exit 1
fi
VERSION="$(tr -d '[:space:]' < "$BUNDLE_DIR/VERSION")"

# install.sh derives VERSION from the tarball filename and then expects a
# top-level directory with exactly this name inside it.
NAME="personal-website-v$VERSION"
DEST="$STAGE/$NAME"
mv "$BUNDLE_DIR" "$DEST"

# React Router framework mode builds to build/client/; the release layout
# calls it frontend/dist so nginx's `root .../frontend/dist` never changes.
mkdir -p "$DEST/frontend"
cp -r "$FRONTEND_DIR" "$DEST/frontend/dist"

if [ "$NO_AI" = true ]; then
    sed -i.bak 's/^ENABLE_AI_DEMOS=true$/ENABLE_AI_DEMOS=false/' "$DEST/.env.example"
    rm -f "$DEST/.env.example.bak"
fi

# Distinct from VERSION: a content-only release ships fresh prerendered pages
# under an unchanged VERSION, so this is what tells the admin UI how current
# the static pages are (backend/version.py's get_prerendered_at()).
date -u +%Y-%m-%dT%H:%M:%SZ > "$DEST/PRERENDERED_AT"

TARBALL="$OUT_DIR/$NAME.tar.gz"
tar -czf "$TARBALL" -C "$STAGE" "$NAME"
_write_sha "$TARBALL"
echo "$TARBALL"
