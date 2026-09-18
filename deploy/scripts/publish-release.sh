#!/usr/bin/env bash
# Runs ON THE PI (gh auth lives there — avoids an artifact round-trip back to
# Windows). Optionally bumps VERSION, then always builds+publishes the
# tarball as a GitHub Release on the SEPARATE releases repo given by
# --releases-repo.
#
# Usage: publish-release.sh [--patch|--minor|--major] [--releases-repo <owner>/<repo>] [--no-target] [--no-ai] [-y|--yes]
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

# Re-exec into a fresh process group — see build-on-pi.sh's own comment for
# the full reasoning, including why this is `set -m` (job control) and NOT
# `setsid`. The earlier setsid-based version of this re-exec was confirmed
# broken by hand on real hardware: Ctrl-C only killed the thin wrapper left
# behind in the original session, while the actual release kept building,
# committing, and pushing to completion in the background, completely
# ignoring the interrupt — because setsid detaches into a new SESSION, which
# is what the tty's Ctrl-C delivery actually keys off, not just a process
# group. `set -m` gives this script's whole process tree — including the
# build-on-pi.sh + npm/pyinstaller/smoke-test-server descendants it spawns
# below — one shared process group for a later interactive run's TERM/KILL
# escalation (lib/build-lock.sh) to target as a unit, once this script (not
# build-on-pi.sh) is the one holding the lock for the whole run, WITHOUT
# detaching from the terminal — so a human's own Ctrl-C still reaches this
# same tree normally, including while paused at the confirmation prompt
# below.
if [ -z "${PUBLISH_RELEASE_SESSION:-}" ]; then
    export PUBLISH_RELEASE_SESSION=1
    set -m
    bash "${BASH_SOURCE[0]}" "$@"
    exit $?
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

BUMP=""   # empty = no bump, the default — must be explicitly requested now
NO_TARGET=false
NO_AI=false
ASSUME_YES=false
RELEASES_REPO_ARG=""
while [ $# -gt 0 ]; do
    case "$1" in
        --patch) BUMP="patch"; shift ;;
        --minor) BUMP="minor"; shift ;;
        --major) BUMP="major"; shift ;;
        --bump) BUMP="$2"; shift 2 ;;
        --no-target) NO_TARGET=true; shift ;;
        --no-ai) NO_AI=true; shift ;;
        -y|--yes) ASSUME_YES=true; shift ;;
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
CURRENT_AT_START="$CURRENT"   # preserved for a post-build drift comparison further down

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
echo " Use -y/--yes to skip the confirmation prompt (e.g. when queuing multiple calls)."
echo "=================================================="
if [ "$ASSUME_YES" = true ]; then
    echo " -y/--yes passed — skipping confirmation."
else
    read -r -p "Press Enter to continue, or Ctrl+C to cancel... "
fi

# ---- Acquire the shared build/publish lock for this ENTIRE run ------------
# From here through the final git push, this script holds exclusive control
# of the repo checkout and build root (see lib/build-lock.sh) — not just
# during the build. That's what stops a concurrent automatic run (content-
# watch.sh's upstream-VERSION check, or another periodic content refresh)
# from resetting this checkout's git state out from under an in-progress
# bump's not-yet-pushed commit. Acquired only after the confirmation prompt
# above, so a human sitting at that prompt isn't needlessly holding the lock.
BUILD_ROOT="$HOME/personal-website-build"
mkdir -p "$BUILD_ROOT"
# shellcheck source=lib/build-lock.sh
source "$REPO_DIR/deploy/scripts/lib/build-lock.sh"

# Told to every build-on-pi.sh subprocess below: LOCK_ALREADY_HELD stops it
# from trying to acquire its own (separate, conflicting) copy of the lock
# this script just acquired; BUILD_ON_PI_SESSION stops it from re-execing
# into its OWN new session, which would otherwise escape the process group
# this script's own re-exec (above) set up for TERM/KILL delivery.
export LOCK_ALREADY_HELD=1
export BUILD_ON_PI_SESSION=1

# ---- Build first; decide the version only after it (and its smoke test)
# ---- actually succeeds -----------------------------------------------------
# Nothing below this point has touched VERSION or git history yet, so a
# build failure here leaves the working tree exactly as it started — no
# revert logic needed for this step, unlike the version write further down.
echo "==> Building (git sync + frontend + backend + smoke test)"
if ! SKIP_ASSEMBLE=1 bash deploy/scripts/build-on-pi.sh; then
    echo "Build failed."
    exit 1
fi

if [ -n "$BUMP" ]; then
    # Re-read CURRENT: the git sync inside the build above could have moved
    # it (e.g. a fork tracking colinpetree/personal-website as `origin` that
    # also happens to pass a bump flag — unusual, but this keeps the bump
    # math correct even then instead of bumping from a now-stale value).
    CURRENT="$(cat VERSION | tr -d '[:space:]')"
    if [ "$CURRENT" != "$CURRENT_AT_START" ]; then
        echo "==> VERSION advanced during git sync before this bump: $CURRENT_AT_START -> $CURRENT"
    fi
    IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
    case "$BUMP" in
        major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
        minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
        patch) PATCH=$((PATCH + 1)) ;;
    esac
    NEW_VERSION="$MAJOR.$MINOR.$PATCH"
    TAG="v$NEW_VERSION"

    # Revert this uncommitted bump on ANY exit from here on (build/assembly
    # failure, Ctrl-C, an unexpected error under `set -e`) unless we make it
    # far enough below to actually commit it — covers every early-exit path,
    # not just the one explicit failure branch a plain `git checkout --
    # VERSION` in an `if` block would.
    BUMP_COMMITTED=false
    trap '[ "$BUMP_COMMITTED" = true ] || git checkout -- VERSION 2>/dev/null || true' EXIT
    echo "==> Bumping VERSION (uncommitted): $CURRENT -> $NEW_VERSION"
    echo "$NEW_VERSION" > VERSION
else
    # No bump requested — TAG reflects whatever VERSION already is now that
    # the build's git sync has run (unchanged for colinpetree's own Pi;
    # possibly advanced for a fork tracking colinpetree/personal-website
    # directly as `origin` and picking up an upstream release it never
    # bumped itself).
    NEW_VERSION="$(cat VERSION | tr -d '[:space:]')"
    if [ "$NEW_VERSION" != "$CURRENT" ]; then
        echo "==> VERSION advanced during git sync: $CURRENT -> $NEW_VERSION"
    fi
    TAG="v$NEW_VERSION"
fi

echo "==> Assembling release $TAG"
if ! ASSEMBLE_ONLY=1 bash deploy/scripts/build-on-pi.sh; then
    echo "Assembly failed."
    exit 1
fi

TARBALL="$STAGING/personal-website-$TAG.tar.gz"
SHA_FILE="$TARBALL.sha256"
if [ ! -f "$TARBALL" ]; then
    echo "Expected tarball not found: $TARBALL"
    exit 1
fi

if [ -n "$BUMP" ]; then
    echo "==> Committing, tagging, and pushing $TAG"
    git add VERSION
    git commit -m "Release $TAG"
    git tag "$TAG"
    BUMP_COMMITTED=true   # the EXIT trap above no longer reverts VERSION
    # Push immediately — before the gh upload below, which can take a while
    # for a multi-MB tarball — so the commit+tag spend as little time as
    # possible sitting local-only. The lock held since before the build is
    # what actually closes the race (nothing else can touch this checkout
    # while this script holds it); pushing promptly on top of that also
    # protects against anything outside this locking scheme, e.g. a human
    # inspecting/running git commands against this checkout by hand.
    git push origin "HEAD:$(git rev-parse --abbrev-ref HEAD)"
    git push origin "$TAG"
fi

echo "==> Publishing $TAG to $RELEASES_REPO"
gh release create "$TAG" "$TARBALL" "$SHA_FILE" \
    --repo "$RELEASES_REPO" \
    --title "$TAG" \
    --notes "Release $TAG. See the main repo's git history for changes."

echo "==> Published $TAG"
