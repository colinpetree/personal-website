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

# Re-exec into a fresh session so this build's whole process tree (npm,
# pyinstaller, the backgrounded smoke-test server, ...) shares one process
# group distinct from whatever invoked us — the personal-website-publisher
# systemd service's own process, a manual interactive shell, etc. That's what
# lets a later invocation cleanly kill -TERM the entire tree of a build it's
# interrupting below, without also killing its own caller.
if [ -z "${BUILD_ON_PI_SESSION:-}" ]; then
    export BUILD_ON_PI_SESSION=1
    exec setsid --wait bash "${BASH_SOURCE[0]}" "$@"
fi

# ---- Single-build lock ----------------------------------------------------
# Only one build may run at a time (they'd otherwise race on the same
# backend/dist and frontend/build directories — see the rm -rf below).
# BUILD_LOCK_MODE=interactive (the default: a manual run, or publish-release.sh)
# always wins, interrupting whatever's running. BUILD_LOCK_MODE=periodic (set
# only by content-watch.sh's automatic cycle) never interrupts — it backs off
# and lets the next scheduled poll retry instead.
BUILD_ROOT="$HOME/personal-website-build"
mkdir -p "$BUILD_ROOT"
LOCK_FILE="$BUILD_ROOT/build.lock"
PID_FILE="$BUILD_ROOT/build.pid"
LOCK_MODE="${BUILD_LOCK_MODE:-interactive}"

# Sanity-check that a PID read from build.pid still actually looks like a
# build-on-pi.sh run before signaling it — guards the (small but real) window
# where a stale PID could have been recycled by the OS into an unrelated
# process between that process reading the file and us acting on it.
_looks_like_our_build() {
    ps -o args= -p "$1" 2>/dev/null | grep -q 'build-on-pi\.sh'
}

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    if [ "$LOCK_MODE" = "periodic" ]; then
        echo "==> Another build is already running — periodic build backing off until its next scheduled check."
        exit 3   # distinct code: lock contention, not a real build failure
    fi
    echo "==> Another build is running — interrupting it to start this one."
    # Loop rather than kill-once-then-block: if two interactive builds start
    # within the same instant, a single blocking flock at the end could let
    # the other one's *new* build win the race and make us wait behind it,
    # which would break "interactive always wins." Keep re-asserting the
    # interrupt for a bounded window instead.
    for i in $(seq 1 15); do
        OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
        if [ -n "$OLD_PID" ] && _looks_like_our_build "$OLD_PID"; then
            kill -TERM -- "-$OLD_PID" 2>/dev/null || true
        fi
        if flock -n 200; then
            break
        fi
        sleep 1
    done
    if ! flock -n 200 2>/dev/null; then
        # Still contested after 15s of TERM — escalate to KILL once, then wait.
        OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
        [ -n "$OLD_PID" ] && _looks_like_our_build "$OLD_PID" && kill -KILL -- "-$OLD_PID" 2>/dev/null || true
        flock 200
    fi
fi
echo $$ > "$PID_FILE"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

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

# PRERENDER_BASE_URL: the live production domain, used only at build time to
# fetch already-published content (site-config, blog posts) for static
# prerendering (react-router.config.ts's prerender()). Lives in a small
# untracked env file on the Pi build box (never in the repo, never in
# backend/.env.example — production's domain is DB-only per architecture
# decision, this is a build-time-only, Pi-local convenience var, analogous
# to how PI_HOST is documented as a one-time local setup value rather than
# repo config).
#
# Unset (e.g. the very first build, before any prod site is live, or the
# generic/template build profile — see PLAN.md) is a supported, expected
# state — prerender() degrades gracefully to zero prerendered routes,
# matching pre-SSG pure-CSR build output exactly.
PI_BUILD_ENV="$HOME/.personal-website-build.env"
# Only source the Pi-local env file if the caller hasn't already forced
# PRERENDER_BASE_URL itself — ${VAR+x} tests "is this set at all" (even to
# an empty string), unlike ${VAR:-} which tests "set and non-empty". This is
# what lets publish-release.sh's --no-target explicitly export
# PRERENDER_BASE_URL="" to force a no-prerender build regardless of what's
# in the file — without this check, sourcing the file here would silently
# clobber that override with whatever it normally contains. Normal callers
# (a bare manual run, or content-watch.sh's chain) never pre-set it, so this
# is a no-op for them — the file gets sourced exactly as before.
if [ -z "${PRERENDER_BASE_URL+x}" ] && [ -f "$PI_BUILD_ENV" ]; then
    # shellcheck source=/dev/null
    set -a; source "$PI_BUILD_ENV"; set +a
fi

# Staging directory is scoped by the domain being built for, not hardcoded
# to one — lets this Pi build for a second domain later without one domain's
# staging artifacts colliding with another's. BUILD_DOMAIN itself can also
# be forced by the caller (same --no-target case, which sets it to
# "template" rather than letting it fall through to the generic "unknown"),
# otherwise derived from PRERENDER_BASE_URL as before, falling back to
# "unknown" only if neither is available.
BUILD_DOMAIN="${BUILD_DOMAIN:-$(echo "${PRERENDER_BASE_URL:-}" | sed -E 's#^https?://##; s#/.*##')}"
BUILD_DOMAIN="${BUILD_DOMAIN:-unknown}"
STAGING="$BUILD_ROOT/release-staging-$BUILD_DOMAIN"

if [ -z "${PRERENDER_BASE_URL:-}" ]; then
    echo "==> PRERENDER_BASE_URL not set (see $PI_BUILD_ENV) — building with zero prerendered routes."
else
    echo "==> Prerendering against $PRERENDER_BASE_URL"
fi

# The Pi has ~900MB RAM; V8 auto-scales its default old-space heap ceiling
# down from detected physical memory, capping around ~460MB here regardless
# of the ~1.8GB swap already configured and mostly unused — the build was
# dying at that self-imposed ceiling, not an actual physical memory limit.
# Raising it explicitly lets V8 spill into swap instead of aborting early.
NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=2048" npm run build

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
    # Read the actual HTTP status code rather than relying on curl's own
    # success/failure exit code — the smoke DB is never seeded (seed.py
    # doesn't run), so /api/site-config correctly 404s with "Site not
    # configured", and that 404 is still proof the whole stack booted and is
    # routing requests. curl reports "000" when it got no response at all
    # (connection refused/reset), which is the only real failure case here.
    HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8099/api/site-config" 2>/dev/null || true)"
    if [ -n "$HTTP_CODE" ] && [ "$HTTP_CODE" != "000" ]; then
        echo "Smoke test OK — server responded (HTTP $HTTP_CODE)."
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
# React Router framework mode builds to build/client/, not dist/ (that was
# the plain-Vite convention pre-SSG-migration) -- copied to frontend/dist/
# in the release layout regardless, so nginx's `root .../frontend/dist`
# doesn't need to change.
cp -r "$REPO_DIR/frontend/build/client" "$RELEASE_DIR/frontend/dist"

# Always bundle every migration file, not just those since the previous tag —
# install.sh's schema_migrations table already tracks per-file applied state,
# so re-shipping an already-applied file is a safe no-op. Diffing against the
# previous tag instead used to silently drop any migration whose release got
# skipped on a given server (e.g. installing straight from v0.1.8 to v0.1.10
# would omit migrations that first shipped in the skipped v0.1.9), breaking
# the fast-forward guarantee schema_migrations is supposed to provide.
mkdir -p "$RELEASE_DIR/migrations"
cp "$REPO_DIR"/backend/migrations/*.sql "$RELEASE_DIR/migrations/" 2>/dev/null || true

mkdir -p "$RELEASE_DIR/deploy/systemd" "$RELEASE_DIR/deploy/nginx" "$RELEASE_DIR/deploy/varnish"
cp "$REPO_DIR/deploy/systemd/personal-website.service" "$RELEASE_DIR/deploy/systemd/"
cp "$REPO_DIR/deploy/systemd/personal-website-updater.service" "$RELEASE_DIR/deploy/systemd/"
cp "$REPO_DIR/deploy/systemd/personal-website-backup.service" "$RELEASE_DIR/deploy/systemd/"
cp "$REPO_DIR/deploy/systemd/personal-website-backup.timer" "$RELEASE_DIR/deploy/systemd/"
cp "$REPO_DIR/deploy/systemd/personal-website-healthwatch.service" "$RELEASE_DIR/deploy/systemd/"
cp "$REPO_DIR/deploy/systemd/personal-website-healthwatch.timer" "$RELEASE_DIR/deploy/systemd/"
cp "$REPO_DIR/deploy/systemd/personal-website-media-cleanup.service" "$RELEASE_DIR/deploy/systemd/"
cp "$REPO_DIR/deploy/systemd/personal-website-media-cleanup.timer" "$RELEASE_DIR/deploy/systemd/"
cp "$REPO_DIR/deploy/nginx/personal-website.conf" "$RELEASE_DIR/deploy/nginx/"
cp "$REPO_DIR/deploy/varnish/default.vcl" "$RELEASE_DIR/deploy/varnish/"
cp "$REPO_DIR/deploy/scripts/install.sh" "$RELEASE_DIR/deploy/"
cp "$REPO_DIR/deploy/scripts/rollback.sh" "$RELEASE_DIR/deploy/"
cp "$REPO_DIR/deploy/scripts/update-watch.sh" "$RELEASE_DIR/deploy/"
cp "$REPO_DIR/deploy/scripts/backup.sh" "$RELEASE_DIR/deploy/"
cp "$REPO_DIR/deploy/scripts/setup-restic-repo.sh" "$RELEASE_DIR/deploy/"
cp "$REPO_DIR/deploy/scripts/health-watch.sh" "$RELEASE_DIR/deploy/"
cp "$REPO_DIR/deploy/scripts/media-cleanup.sh" "$RELEASE_DIR/deploy/"
if [ "${VITE_ENABLE_AI_DEMOS:-}" = "false" ]; then
    # Template builds (publish-release.sh --no-target) already exclude the AI
    # demo pages from the frontend bundle via this same flag — this defaults
    # a fresh install of this specific tarball away from opting into the
    # backend routes too, since ENABLE_AI_DEMOS is otherwise a runtime
    # setting on whichever server installs it, not something build time can
    # enforce directly.
    sed 's/^ENABLE_AI_DEMOS=true$/ENABLE_AI_DEMOS=false/' "$REPO_DIR/backend/.env.example" > "$RELEASE_DIR/.env.example"
else
    cp "$REPO_DIR/backend/.env.example" "$RELEASE_DIR/"
fi
cp "$REPO_DIR/VERSION" "$RELEASE_DIR/"
# Distinct from VERSION: a content-only release (publish-content-refresh.sh)
# ships fresh prerendered pages under an unchanged VERSION, so this is what
# actually tells the admin UI how current the static content is (see
# backend/version.py's get_prerendered_at()).
date -u +%Y-%m-%dT%H:%M:%SZ > "$RELEASE_DIR/PRERENDERED_AT"

TARBALL="$STAGING/$RELEASE_NAME.tar.gz"
tar -czf "$TARBALL" -C "$STAGING" "$RELEASE_NAME"
# Run from inside $STAGING so the checksum file records a bare relative
# filename — install.sh's `sha256sum -c` on the production server needs that
# (an absolute Pi-local path would never match there). No path-rewriting
# needed this way, unlike computing the hash from an absolute path first.
(cd "$STAGING" && { sha256sum "$RELEASE_NAME.tar.gz" || shasum -a 256 "$RELEASE_NAME.tar.gz"; } > "$RELEASE_NAME.tar.gz.sha256")

echo "==> Done: $TARBALL"
echo "    Next: bash deploy/scripts/publish-release.sh"
