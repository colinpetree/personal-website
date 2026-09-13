#!/usr/bin/env bash
# Runs ON THE PI. One-time file transfer for bootstrapping a brand-new
# production server: none of bootstrap.sh, the very first install.sh run,
# or setup-auto-update-production.sh are things a fresh server already has
# on disk, and none of them ship inside a release tarball (unlike
# setup-restic-repo.sh, which does — see build-on-pi.sh's packaging list),
# so they all need to be copied over by hand before anything else can run.
#
# Requires the Pi to already be able to SSH into the production box (the
# same admin key used to SSH in interactively, e.g. ~/aws-key.pem per this
# project's convention — not the dedicated, read-only backup-pull key
# setup-backup-pull-pi.sh generates later, which can't do this).
#
# Usage:
#   bash first-install-transfer.sh --host <domain-or-ip> [--user ubuntu] [--key ~/aws-key.pem]
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_ROOT="$HOME/personal-website-build"

PROD_HOST=""
PROD_USER="ubuntu"
SSH_KEY="$HOME/aws-key.pem"
while [ $# -gt 0 ]; do
    case "$1" in
        --host) PROD_HOST="$2"; shift 2 ;;
        --user) PROD_USER="$2"; shift 2 ;;
        --key) SSH_KEY="$2"; shift 2 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

if [ -z "$PROD_HOST" ]; then
    echo "Usage: bash first-install-transfer.sh --host <domain-or-ip> [--user ubuntu] [--key ~/aws-key.pem]"
    exit 1
fi
if [ ! -f "$SSH_KEY" ]; then
    echo "SSH key not found at $SSH_KEY — pass --key <path>, or copy your admin key to the Pi first."
    exit 1
fi

SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)

# Locate the built tarball by actual VERSION rather than assuming a fixed
# path — build-on-pi.sh writes it under a release-staging-<BUILD_DOMAIN>/
# subdirectory whose name depends on whether PRERENDER_BASE_URL happens to
# be set yet (it isn't, on a brand-new site's first build), so "search for
# the file that matches this checkout's VERSION" is the only reliable way
# to find it rather than hardcoding a guessed path.
echo "==> Locating the built release tarball"
VERSION="$(cat "$REPO_DIR/VERSION" | tr -d '[:space:]')"
# More than one release-staging-<BUILD_DOMAIN>/ can legitimately contain a
# same-versioned tarball (e.g. an early build before PRERENDER_BASE_URL was
# set, landing under release-staging-unknown/, followed later by a real
# rebuild of the same un-bumped VERSION per publish-release.sh's normal
# "rebuild+republish the current version" flow) — picking whichever `find`
# happens to list first would silently risk shipping a stale/placeholder
# build. Sort by mtime and take the newest instead, and warn loudly if more
# than one candidate exists so a stale match is never silent.
MATCHES="$(find "$BUILD_ROOT" -maxdepth 2 -name "personal-website-v${VERSION}.tar.gz" -printf '%T@ %p\n' 2>/dev/null | sort -rn)"
if [ -z "$MATCHES" ]; then
    echo "No tarball found for v$VERSION under $BUILD_ROOT — run build-on-pi.sh first."
    exit 1
fi
MATCH_COUNT="$(printf '%s\n' "$MATCHES" | wc -l)"
TARBALL="$(printf '%s\n' "$MATCHES" | head -n1 | cut -d' ' -f2-)"
if [ "$MATCH_COUNT" -gt 1 ]; then
    echo "WARNING: found $MATCH_COUNT tarballs for v$VERSION under $BUILD_ROOT — using the most"
    echo "recently built one. Delete the others if they're stale, or double-check this is the"
    echo "build you actually want to ship:"
    printf '%s\n' "$MATCHES" | cut -d' ' -f2- | sed 's/^/    /'
fi
if [ ! -f "$TARBALL.sha256" ]; then
    echo "$TARBALL exists but $TARBALL.sha256 is missing — re-run build-on-pi.sh."
    exit 1
fi
echo "    Using $TARBALL"

echo "==> Copying bootstrap.sh, install.sh, setup-auto-update-production.sh, and the tarball to $PROD_USER@$PROD_HOST"
scp "${SSH_OPTS[@]}" \
    "$REPO_DIR/deploy/scripts/bootstrap.sh" \
    "$REPO_DIR/deploy/scripts/install.sh" \
    "$REPO_DIR/deploy/scripts/setup-auto-update-production.sh" \
    "$TARBALL" "$TARBALL.sha256" \
    "$PROD_USER@$PROD_HOST:~/"

echo ""
echo "=========================================================================="
echo " Done. On the production server (ssh $PROD_USER@$PROD_HOST), run in order:"
echo "   sudo bash bootstrap.sh --domain <domain>"
echo "   sudo bash install.sh $(basename "$TARBALL")"
echo "=========================================================================="
