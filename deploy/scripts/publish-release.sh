#!/usr/bin/env bash
# Runs ON THE PI (gh auth lives there — avoids an artifact round-trip back to
# Windows). Optionally bumps VERSION, then always builds+publishes the
# tarball as a GitHub Release on the SEPARATE releases repo given by
# --releases-repo.
#
# Usage: publish-release.sh [--patch|--minor|--major] [--releases-repo <owner>/<repo>] [--no-target] [--no-ai]
# With no bump flag, VERSION is left untouched — this rebuilds and publishes
# the CURRENT version to --releases-repo. That's the normal way to publish
# the same code state to more than one repo (e.g. a real site's dist repo and
# the no-prerender template dist repo): call this once per target repo, only
# passing a bump flag on whichever call should actually advance the version.
# Defaults to no bump, publishing to colinpetree/personal-website-dist-<domain>.
#
# --no-target forces a no-prerender build regardless of what PRERENDER_BASE_URL
# is set to in ~/.personal-website-build.env, and defaults the target repo to
# colinpetree/personal-website-template-dist instead of the domain-scoped one
# — this is the generic/template profile other forks build from, which has no
# specific site to prerender against. --no-target implies --no-ai (a generic
# template build shouldn't require a forker's own Anthropic API keys by
# default), but --no-ai also works standalone for a normal, domain-targeted
# build that just doesn't want the AI demo section on that particular site.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

BUMP=""   # empty = no bump, the default — must be explicitly requested now
NO_TARGET=false
NO_AI=false
RELEASES_REPO_ARG=""
while [ $# -gt 0 ]; do
    case "$1" in
        --patch) BUMP="patch"; shift ;;
        --minor) BUMP="minor"; shift ;;
        --major) BUMP="major"; shift ;;
        --bump) BUMP="$2"; shift 2 ;;
        --no-target) NO_TARGET=true; shift ;;
        --no-ai) NO_AI=true; shift ;;
        --releases-repo) RELEASES_REPO_ARG="$2"; shift 2 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

case "$BUMP" in
    major|minor|patch|"") ;;
    *) echo "Invalid --bump: $BUMP (expected patch|minor|major)"; exit 1 ;;
esac

# --no-target implies --no-ai — see the usage comment above.
[ "$NO_TARGET" = true ] && NO_AI=true

# Domain/staging/default-repo derivation — depends on --no-target, so this
# has to happen after arg parsing above, not before it. Same
# PI_BUILD_ENV/BUILD_DOMAIN derivation build-on-pi.sh uses internally, kept
# in sync here so this script's own STAGING/DEFAULT_RELEASES_REPO agree with
# wherever the build-on-pi.sh subprocess below actually puts the tarball.
PI_BUILD_ENV="$HOME/.personal-website-build.env"
if [ "$NO_TARGET" = true ]; then
    # Force no prerendering regardless of what the Pi-local env file says —
    # build-on-pi.sh respects an already-exported PRERENDER_BASE_URL (even
    # empty) instead of overwriting it from the file, specifically so this
    # override works. "template" (not the generic "unknown" fallback) both
    # for a meaningful staging path and to match the pre-existing
    # colinpetree/personal-website-template-dist repo's naming — note that
    # repo is "template-dist", not the domain-scoped "dist-<domain>" pattern.
    export PRERENDER_BASE_URL=""
    export BUILD_DOMAIN="template"
    STAGING="$HOME/personal-website-build/release-staging-template"
    DEFAULT_RELEASES_REPO="colinpetree/personal-website-template-dist"
else
    if [ -f "$PI_BUILD_ENV" ]; then
        # shellcheck source=/dev/null
        set -a; source "$PI_BUILD_ENV"; set +a
    fi
    BUILD_DOMAIN="$(echo "${PRERENDER_BASE_URL:-}" | sed -E 's#^https?://##; s#/.*##')"
    BUILD_DOMAIN="${BUILD_DOMAIN:-unknown}"
    STAGING="$HOME/personal-website-build/release-staging-$BUILD_DOMAIN"
    DEFAULT_RELEASES_REPO="colinpetree/personal-website-dist-$BUILD_DOMAIN"
fi
RELEASES_REPO="${RELEASES_REPO_ARG:-$DEFAULT_RELEASES_REPO}"

# Independent of --no-target — a normal, domain-targeted build can also pass
# plain --no-ai to exclude AI demos from just this one site. Excludes the AI
# demo routes/pages from the frontend bundle entirely (Vite dead-code-
# eliminates them — see frontend/src/routes.ts). Also read by build-on-pi.sh's
# tarball assembly to ship a .env.example defaulting ENABLE_AI_DEMOS=false,
# since that flag is otherwise a runtime setting on whichever server installs
# this tarball — build time can't disable the backend routes directly, only
# default a fresh install away from opting into them.
if [ "$NO_AI" = true ]; then
    export VITE_ENABLE_AI_DEMOS="false"
fi

cd "$REPO_DIR"
CURRENT="$(cat VERSION | tr -d '[:space:]')"

if [ -n "$BUMP" ]; then
    IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
    case "$BUMP" in
        major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
        minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
        patch) PATCH=$((PATCH + 1)) ;;
    esac
    NEW_VERSION="$MAJOR.$MINOR.$PATCH"
else
    NEW_VERSION="$CURRENT"
fi
TAG="v$NEW_VERSION"

echo "=================================================="
if [ -n "$BUMP" ]; then
    echo " Current version : $CURRENT"
    echo " New version      : $NEW_VERSION ($BUMP bump)"
else
    echo " Version          : $CURRENT (unchanged — no bump requested)"
fi
echo " Releases repo    : $RELEASES_REPO"
if [ "$NO_TARGET" = true ]; then
    echo " Prerender domain : none (--no-target)"
else
    echo " Prerender domain : ${PRERENDER_BASE_URL:-<none set>}"
    echo "   (change in $PI_BUILD_ENV on the Pi, then re-run)"
fi
[ "$NO_TARGET" = true ] && echo " Profile          : template (no prerendering)"
[ "$NO_AI" = true ] && echo " AI demos         : excluded"
echo "--------------------------------------------------"
echo " Use --patch, --minor, or --major to bump a version."
echo " Use --releases-repo <owner>/<repo> to change the target repo — publish"
echo " the same version to more than one repo with one call per repo, only"
echo " passing a bump flag on whichever call should advance the version."
echo " Use --no-target for a no-prerender template build (implies --no-ai)."
echo " Use --no-ai on its own to exclude AI demos from a normal, targeted build."
echo "=================================================="
read -r -p "Press Enter to continue, or Ctrl+C to cancel... "

if [ -n "$BUMP" ]; then
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
else
    # No uncommitted VERSION change to protect, so this can use build-on-pi.sh's
    # normal git-sync path (pull latest from origin) instead of SKIP_GIT_SYNC.
    echo "==> Rebuilding v$CURRENT (no version bump)"
    if ! bash deploy/scripts/build-on-pi.sh; then
        echo "Build failed."
        exit 1
    fi
fi

TARBALL="$STAGING/personal-website-$TAG.tar.gz"
SHA_FILE="$TARBALL.sha256"
if [ ! -f "$TARBALL" ]; then
    echo "Expected tarball not found: $TARBALL"
    [ -n "$BUMP" ] && git checkout -- VERSION
    exit 1
fi

if [ -n "$BUMP" ]; then
    echo "==> Build succeeded — committing and tagging $TAG"
    git add VERSION
    git commit -m "Release $TAG"
    git tag "$TAG"
fi

echo "==> Publishing $TAG to $RELEASES_REPO"
gh release create "$TAG" "$TARBALL" "$SHA_FILE" \
    --repo "$RELEASES_REPO" \
    --title "$TAG" \
    --notes "Release $TAG. See the main repo's git history for changes."

if [ -n "$BUMP" ]; then
    echo "==> Pushing source repo commit + tag"
    git push origin "HEAD:$(git rev-parse --abbrev-ref HEAD)"
    git push origin "$TAG"
fi

echo "==> Published $TAG"
