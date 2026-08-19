#!/usr/bin/env bash
# Runs ON THE PI. Rebuilds (fresh prerendered pages, current VERSION
# unchanged) and publishes a content-only release. Called unattended by
# content-watch.sh; safe to also run by hand.
set -euo pipefail
_log() { echo "[publish-content-refresh] $*"; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_ROOT="$HOME/personal-website-build"

cd "$REPO_DIR"
VERSION="$(cat VERSION | tr -d '[:space:]')"
_log "Building content refresh for v$VERSION (build-on-pi.sh output follows)."
bash deploy/scripts/build-on-pi.sh   # normal git pull — builds whatever's on origin, already logs its own steps
_log "build-on-pi.sh finished."

BUILD_DOMAIN="$(echo "${PRERENDER_BASE_URL:-}" | sed -E 's#^https?://##; s#/.*##')"; BUILD_DOMAIN="${BUILD_DOMAIN:-unknown}"
STAGING="$BUILD_ROOT/release-staging-$BUILD_DOMAIN"
RELEASES_REPO="${1:-colinpetree/personal-website-dist-$BUILD_DOMAIN}"

TAG="v${VERSION}-content-$(date -u +%Y%m%d%H%M%S)"
TARBALL="$STAGING/personal-website-v$VERSION.tar.gz"
SHA_FILE="$TARBALL.sha256"

if [ ! -f "$TARBALL" ]; then
    _log "ERROR: expected tarball not found at $TARBALL after a successful build — aborting before publishing."
    exit 1
fi

_log "Publishing $TAG to $RELEASES_REPO."
gh release create "$TAG" "$TARBALL" "$SHA_FILE" \
    --repo "$RELEASES_REPO" --title "$TAG" \
    --notes "Content refresh (prerendered pages only) for v$VERSION — no code change."
_log "Published $TAG."
echo "$TAG"
