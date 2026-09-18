# Sourced by build-on-pi.sh and publish-release.sh — not meant to be executed
# directly. Requires $BUILD_ROOT to already be set (and to exist) by the
# caller before sourcing this.
#
# Acquires an exclusive lock on fd 200, backed by $BUILD_ROOT/build.lock,
# shared by every script that mutates the source checkout or the build/
# staging directories — only one such operation may ever run at a time (they'd
# otherwise race on the same backend/dist and frontend/build directories, or
# on the git working tree itself).
#
# BUILD_LOCK_MODE=interactive (the default: a manual run) always wins,
# interrupting whatever's running. BUILD_LOCK_MODE=periodic (set only by
# content-watch.sh's automatic cycles) never interrupts — it backs off with
# exit 3 and lets the next scheduled poll retry instead.
#
# publish-release.sh acquires this lock itself, up front, for its ENTIRE run
# (git sync + build + smoke test, deciding/writing the version, assembling
# the tarball, committing, tagging, and pushing) rather than only around the
# build step — that's what closes the race where a manual release's
# not-yet-pushed commit could otherwise be reset away by a concurrent
# automatic build/publish landing in the gap between the local commit and the
# push. It then sets LOCK_ALREADY_HELD=1 before invoking build-on-pi.sh as a
# subprocess, so build-on-pi.sh knows to skip acquiring its own separate copy
# of this same lock — a second `exec 200>` in the child would open a fresh,
# unlocked file description on the same path and either deadlock against, or
# wrongly contend with, the parent's already-held lock.
LOCK_FILE="$BUILD_ROOT/build.lock"
PID_FILE="$BUILD_ROOT/build.pid"
LOCK_MODE="${BUILD_LOCK_MODE:-interactive}"

# Sanity-check that a PID read from build.pid still actually looks like one of
# our own scripts before signaling it — guards the (small but real) window
# where a stale PID could have been recycled by the OS into an unrelated
# process between that process reading the file and us acting on it.
_looks_like_our_build() {
    ps -o args= -p "$1" 2>/dev/null | grep -qE 'build-on-pi\.sh|publish-release\.sh'
}

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    if [ "$LOCK_MODE" = "periodic" ]; then
        echo "==> Another build/publish is already running — periodic run backing off until its next scheduled check."
        exit 3   # distinct code: lock contention, not a real failure
    fi
    echo "==> Another build/publish is running — interrupting it to start this one."
    # Loop rather than kill-once-then-block: if two interactive runs start
    # within the same instant, a single blocking flock at the end could let
    # the other one's *new* run win the race and make us wait behind it,
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
