#!/usr/bin/env bash
# Runs ON THE PI (gh auth lives there — avoids an artifact round-trip back to
# Windows). Bumps VERSION, tags the source repo, and publishes the tarball
# already built by build-on-pi.sh as a GitHub Release on the SEPARATE
# releases repo.
#
# Usage: publish-release.sh [--minor|--major] [--releases-repo <owner>/<repo>]
# Defaults to a patch bump, publishing to colinpetree/personal-website-dist.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAGING="$HOME/personal-website-build/release-staging"
DEFAULT_RELEASES_REPO="colinpetree/personal-website-dist"

BUMP="patch"
RELEASES_REPO="$DEFAULT_RELEASES_REPO"
while [ $# -gt 0 ]; do
    case "$1" in
        --minor) BUMP="minor"; shift ;;
        --major) BUMP="major"; shift ;;
        --bump) BUMP="$2"; shift 2 ;;
        --releases-repo) RELEASES_REPO="$2"; shift 2 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

case "$BUMP" in
    major|minor|patch) ;;
    *) echo "Invalid --bump: $BUMP (expected patch|minor|major)"; exit 1 ;;
esac

cd "$REPO_DIR"
CURRENT="$(cat VERSION | tr -d '[:space:]')"
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
case "$BUMP" in
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    patch) PATCH=$((PATCH + 1)) ;;
esac
NEW_VERSION="$MAJOR.$MINOR.$PATCH"
TAG="v$NEW_VERSION"

echo "=================================================="
echo " Current version : $CURRENT"
echo " New version      : $NEW_VERSION ($BUMP bump)"
echo " Releases repo    : $RELEASES_REPO"
echo "--------------------------------------------------"
echo " Use --minor or --major to bump a bigger number."
echo " Use --releases-repo <owner>/<repo> to change the target repo."
echo "=================================================="
read -r -p "Press Enter to continue, or Ctrl+C to cancel... "

# Write the bump but deliberately do NOT commit/tag yet — if the rebuild
# below fails (the exact case its smoke test exists to catch), a commit or
# tag created here would be left orphaned, colliding with the next attempt.
# Committing only after a successful build keeps a failed run fully
# recoverable with nothing more than `git checkout -- VERSION`.
echo "==> Bumping VERSION (uncommitted): $CURRENT -> $NEW_VERSION"
echo "$NEW_VERSION" > VERSION

echo "==> Rebuilding with the bumped version"
if ! SKIP_GIT_SYNC=1 bash deploy/scripts/build-on-pi.sh; then
    echo "Build failed — reverting the uncommitted VERSION bump."
    git checkout -- VERSION
    exit 1
fi

TARBALL="$STAGING/personal-website-$TAG.tar.gz"
SHA_FILE="$TARBALL.sha256"
if [ ! -f "$TARBALL" ]; then
    echo "Expected tarball not found: $TARBALL"
    git checkout -- VERSION
    exit 1
fi

echo "==> Build succeeded — committing and tagging $TAG"
git add VERSION
git commit -m "Release $TAG"
git tag "$TAG"

echo "==> Publishing $TAG to $RELEASES_REPO"
gh release create "$TAG" "$TARBALL" "$SHA_FILE" \
    --repo "$RELEASES_REPO" \
    --title "$TAG" \
    --notes "Release $TAG. See the main repo's git history for changes."

echo "==> Pushing source repo commit + tag"
git push origin "HEAD:$(git rev-parse --abbrev-ref HEAD)"
git push origin "$TAG"

echo "==> Published $TAG"
