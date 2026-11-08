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
# tree entirely, in ~/personal-website-build - no reason for build artifacts
# to live inside a git checkout.
set -euo pipefail

# Re-exec into a fresh PROCESS GROUP (not a new session) so this build's
# whole process tree (npm, pyinstaller, the backgrounded smoke-test server,
# ...) shares one process group distinct from whatever invoked us - the
# personal-website-publisher systemd service's own process, a manual
# interactive shell, etc. That's what lets a later invocation cleanly
# kill -TERM the entire tree of a build it's interrupting below, without
# also killing its own caller.
#
# Deliberately `set -m` (job control), not `setsid` - setsid was tried first
# and confirmed BROKEN by hand on real hardware: it puts the child in a
# whole new SESSION, which detaches it from the terminal's controlling-
# terminal/job-control machinery entirely. Ctrl-C's SIGINT is delivered by
# the tty driver to whichever process group the terminal considers
# foreground, and a detached session is never that - the result was Ctrl-C
# only killing the thin `setsid --wait` wrapper left behind in the ORIGINAL
# session, while the actual build kept running to completion as an orphaned
# background session, completely ignoring the interrupt. `set -m` gives the
# same "one killable process group" property without that detachment: bash
# puts the foreground job it launches into its own new process group but
# keeps it inside the SAME session, so a controlling terminal (if there is
# one) still hands that new group foreground status and Ctrl-C reaches it
# normally. `-m` is a shell OPTION local to this process - it does not
# propagate into the child bash process's own environment, so nothing
# further down this tree (this script's own later `bash build-on-pi.sh`
# calls from publish-release.sh, npm, pyinstaller, ...) gets ANOTHER nested
# process group of its own; everything stays flat inside this one, which is
# exactly what a single `kill -TERM -- -pgid` needs to reach it all at once.
if [ -z "${BUILD_ON_PI_SESSION:-}" ]; then
    export BUILD_ON_PI_SESSION=1
    set -m
    bash "${BASH_SOURCE[0]}" "$@"
    exit $?
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_ROOT="$HOME/personal-website-build"
mkdir -p "$BUILD_ROOT"

# ---- Single-build lock ----------------------------------------------------
# publish-release.sh acquires this SAME lock itself, up front, for its whole
# run (see deploy/scripts/lib/build-lock.sh) and sets LOCK_ALREADY_HELD=1
# before calling this script as a subprocess - skip re-acquiring it here in
# that case, since a second `exec 200>` on the same lock file from a child
# process would open its own fresh, unlocked file description and either
# deadlock against, or wrongly contend with, the parent's already-held lock.
if [ -z "${LOCK_ALREADY_HELD:-}" ]; then
    # shellcheck source=lib/build-lock.sh
    source "$REPO_DIR/deploy/scripts/lib/build-lock.sh"
fi

cd "$REPO_DIR"

if [ -n "${ASSEMBLE_ONLY:-}" ]; then
    echo "==> ASSEMBLE_ONLY set - skipping git sync/build/smoke test, packaging whatever's already built"
else
    # publish-release.sh no longer needs to protect an uncommitted VERSION
    # bump here - it now decides/writes the bump AFTER this build succeeds
    # (see its own comments), so a plain git sync is always safe at this point.
    if [ -d .git ]; then
        # BUILD_REF picks the branch to build (publish-release.sh --ref sets
        # it); it defaults to main, never "whatever branch the checkout was
        # left on", so a --ref test build can't leave later builds on that
        # branch. `checkout -f -B` switches to (or creates) a local branch at
        # origin's copy and throws away local edits to tracked files, as the
        # old `reset --hard` did, so building another branch never needs an
        # SSH session and a manual `git checkout` first.
        BUILD_REF="${BUILD_REF:-main}"
        echo "==> Pulling $BUILD_REF from origin"
        git fetch origin "$BUILD_REF"
        git checkout -f -B "$BUILD_REF" "origin/$BUILD_REF"
    else
        echo "WARNING: $REPO_DIR is not a git checkout - building whatever is on disk as-is."
    fi

    VERSION="$(cat VERSION | tr -d '[:space:]')"
    echo "==> Building v$VERSION from $REPO_DIR"
fi

# PRERENDER_BASE_URL: the live production domain, used only at build time to
# fetch already-published content (site-config, blog posts) for static
# prerendering (react-router.config.ts's prerender()). Lives in a small
# untracked env file on the Pi build box (never in the repo, never in
# backend/.env.example - production's domain is DB-only per architecture
# decision, this is a build-time-only, Pi-local convenience var, analogous
# to how PI_HOST is documented as a one-time local setup value rather than
# repo config).
#
# Unset (e.g. the very first build, before any prod site is live, or the
# generic/template build profile - see PLAN.md) is a supported, expected
# state - prerender() degrades gracefully to zero prerendered routes,
# matching pre-SSG pure-CSR build output exactly.
#
# Needed even in ASSEMBLE_ONLY mode, just for BUILD_DOMAIN/STAGING below -
# computed unconditionally rather than only inside the build steps.
PI_BUILD_ENV="$HOME/.personal-website-build.env"
# Only source the Pi-local env file if the caller hasn't already forced
# PRERENDER_BASE_URL itself - ${VAR+x} tests "is this set at all" (even to
# an empty string), unlike ${VAR:-} which tests "set and non-empty". This is
# what lets publish-release.sh's --no-target explicitly export
# PRERENDER_BASE_URL="" to force a no-prerender build regardless of what's
# in the file - without this check, sourcing the file here would silently
# clobber that override with whatever it normally contains. Normal callers
# (a bare manual run, or content-watch.sh's chain) never pre-set it, so this
# is a no-op for them - the file gets sourced exactly as before.
if [ -z "${PRERENDER_BASE_URL+x}" ] && [ -f "$PI_BUILD_ENV" ]; then
    # shellcheck source=/dev/null
    set -a; source "$PI_BUILD_ENV"; set +a
fi

# Staging directory is scoped by the domain being built for, not hardcoded
# to one - lets this Pi build for a second domain later without one domain's
# staging artifacts colliding with another's. BUILD_DOMAIN itself can also
# be forced by the caller (same --no-target case, which sets it to
# "template" rather than letting it fall through to the generic "unknown"),
# otherwise derived from PRERENDER_BASE_URL as before, falling back to
# "unknown" only if neither is available.
BUILD_DOMAIN="${BUILD_DOMAIN:-$(echo "${PRERENDER_BASE_URL:-}" | sed -E 's#^https?://##; s#/.*##')}"
BUILD_DOMAIN="${BUILD_DOMAIN:-unknown}"
STAGING="$BUILD_ROOT/release-staging-$BUILD_DOMAIN"

if [ -n "${ASSEMBLE_ONLY:-}" ]; then
    : # nothing further to build - skip straight to assembly below
elif [ -z "${PRERENDER_BASE_URL:-}" ]; then
    echo "==> PRERENDER_BASE_URL not set (see $PI_BUILD_ENV) - building with zero prerendered routes."
else
    echo "==> Prerendering against $PRERENDER_BASE_URL"
fi

if [ -z "${ASSEMBLE_ONLY:-}" ]; then
    # ---- Frontend -----------------------------------------------------
    echo "==> Building frontend"
    cd "$REPO_DIR/frontend"
    # GitHub Actions builds with the Node major in frontend/.nvmrc. A Pi
    # fallback build on a different major still works, but can produce
    # different output, so say so instead of staying quiet.
    WANT_NODE="$(tr -d '[:space:]v' < .nvmrc 2>/dev/null || true)"
    HAVE_NODE="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo none)"
    if [ -n "$WANT_NODE" ] && [ "$HAVE_NODE" != "$WANT_NODE" ]; then
        echo "WARNING: frontend/.nvmrc asks for Node $WANT_NODE, this machine has Node $HAVE_NODE."
    fi
    npm ci

    # The Pi has ~900MB RAM; V8 auto-scales its default old-space heap ceiling
    # down from detected physical memory, capping around ~460MB here regardless
    # of the ~1.8GB swap already configured and mostly unused - the build was
    # dying at that self-imposed ceiling, not an actual physical memory limit.
    # Raising it explicitly lets V8 spill into swap instead of aborting early.
    NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=2048" npm run build

    # ---- Backend ------------------------------------------------------------
    echo "==> Building backend (PyInstaller onedir)"
    cd "$REPO_DIR/backend"

    VENV_DIR="$BUILD_ROOT/venv"
    # Recreated from scratch on every build. `pip install -r` never upgrades a
    # package that's already installed and still satisfies its range, so a
    # reused venv kept vulnerable transitive dependencies (Pillow, certifi,
    # urllib3, ...) frozen into every release long after requirements.txt
    # allowed, or even required, the fixed versions. pip's own wheel cache
    # keeps the full reinstall cheap. Nothing else uses this venv, and the
    # build lock above guarantees no other build is mid-install in it.
    # requirements.txt needs 3.11+ (SQLAlchemy 2.1, python-dateutil 4). Checked
    # up front because an older python3 otherwise fails deep inside pip with a
    # misleading "no matching distribution" error.
    if ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 11))'; then
        echo "BUILD FAILED: python3 is $(python3 --version 2>&1), backend/requirements.txt needs Python 3.11 or newer."
        exit 1
    fi
    rm -rf "$VENV_DIR"
    python3 -m venv "$VENV_DIR"
    # shellcheck source=/dev/null
    source "$VENV_DIR/bin/activate"
    pip install --upgrade pip
    # requirements-build.txt = requirements.txt + the pinned PyInstaller,
    # the same file GitHub Actions installs from.
    pip install -r requirements-build.txt
    # The exact package set this release's frozen binary is built from.
    # dependency-audit.sh audits this file, so its monthly report reflects
    # what production actually runs rather than a fresh resolve of
    # requirements.txt.
    pip freeze > "$BUILD_ROOT/last-build-requirements.txt"

    rm -rf build dist
    pyinstaller pyinstaller.spec --distpath dist --workpath build --noconfirm

    FROZEN_BIN="$REPO_DIR/backend/dist/server/server"
    if [ ! -x "$FROZEN_BIN" ]; then
        echo "BUILD FAILED: frozen binary not found at $FROZEN_BIN"
        exit 1
    fi

    # ---- Smoke test -----------------------------------------------------------
    # 1. Credential-free import check - catches missing PyInstaller hidden
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
        # Read the actual HTTP status code rather than relying on curl's own
        # success/failure exit code - the smoke DB is never seeded (seed.py
        # doesn't run), so /api/site-config correctly 404s with "Site not
        # configured", and that 404 is still proof the whole stack booted and is
        # routing requests. curl reports "000" when it got no response at all
        # (connection refused/reset), which is the only real failure case here.
        HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8099/api/site-config" 2>/dev/null || true)"
        if [ -n "$HTTP_CODE" ] && [ "$HTTP_CODE" != "000" ]; then
            echo "Smoke test OK - server responded (HTTP $HTTP_CODE)."
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
fi

# ---- Assemble the release tarball ------------------------------------------
if [ -n "${SKIP_ASSEMBLE:-}" ]; then
    echo "==> SKIP_ASSEMBLE set - build + smoke test succeeded, skipping tarball assembly"
    exit 0
fi

# Re-read VERSION fresh from disk rather than trusting a variable captured
# earlier in this script - in ASSEMBLE_ONLY mode nothing above set it at all,
# and even in a normal run publish-release.sh's bump path (which calls this
# script twice: once with SKIP_ASSEMBLE=1 for the build, then again with
# ASSEMBLE_ONLY=1 after deciding/writing the real version) needs this exact
# assembly step to reflect whatever's on disk *right now*, not whatever was
# true earlier in a since-finished process.
VERSION="$(cat "$REPO_DIR/VERSION" | tr -d '[:space:]')"
echo "==> Assembling release v$VERSION"

# Same two-step packaging GitHub Actions uses (deploy/scripts/
# assemble-release.sh): server bundle first, then the site tarball built from
# it plus this checkout's frontend. Output name and layout are unchanged:
# $STAGING/personal-website-v$VERSION.tar.gz (+ .sha256).
mkdir -p "$STAGING"
BUNDLE_OUT="$STAGING/server-bundle"
rm -rf "$BUNDLE_OUT"
BUNDLE="$(bash "$REPO_DIR/deploy/scripts/assemble-release.sh" --server-only --out "$BUNDLE_OUT" --repo-dir "$REPO_DIR" | tail -1)"

ASSEMBLE_ARGS=(--from-server-bundle "$BUNDLE" --frontend "$REPO_DIR/frontend/build/client" --out "$STAGING")
# Template builds (publish-release.sh --no-target) already exclude the AI demo
# pages from the frontend bundle via this same flag; this also defaults a
# fresh install of this tarball away from enabling the backend routes.
if [ "${VITE_ENABLE_AI_DEMOS:-}" = "false" ]; then
    ASSEMBLE_ARGS+=(--no-ai)
fi
rm -f "$STAGING/personal-website-v$VERSION.tar.gz" "$STAGING/personal-website-v$VERSION.tar.gz.sha256"
TARBALL="$(bash "$REPO_DIR/deploy/scripts/assemble-release.sh" "${ASSEMBLE_ARGS[@]}" | tail -1)"
rm -rf "$BUNDLE_OUT"

echo "==> Done: $TARBALL"
