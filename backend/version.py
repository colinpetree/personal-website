import os
import sys
import functools


@functools.lru_cache(maxsize=1)
def get_app_version():
    """Reads the VERSION file bundled inside this release (one directory up
    from backend/ — see deploy/scripts/build-on-pi.sh's tarball assembly).
    Resolved relative to the frozen executable's own directory
    (sys.executable when frozen, i.e. .../current/backend/), NOT the process
    cwd — cwd happens to match WorkingDirectory under systemd today, but this
    shouldn't silently depend on staying that way. Cached: the file never
    changes for the lifetime of a running process. Returns None if missing
    (e.g. running from a plain source checkout with no VERSION alongside)."""
    backend_dir = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__))
    version_path = os.path.join(backend_dir, '..', 'VERSION')
    try:
        with open(version_path) as f:
            return f.read().strip() or None
    except OSError:
        return None


@functools.lru_cache(maxsize=1)
def get_prerendered_at():
    """Reads the PRERENDERED_AT file bundled inside this release (written by
    build-on-pi.sh alongside VERSION), an ISO-8601 UTC timestamp of when this
    release's frontend was built/prerendered. Distinct from VERSION: a
    content-only release (see publish-content-refresh.sh) ships fresh
    prerendered pages under an unchanged VERSION, so this is what actually
    tells an admin how current the static content is. Returns None if
    missing (older releases built before this file existed, or a plain
    source checkout)."""
    backend_dir = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__))
    prerendered_at_path = os.path.join(backend_dir, '..', 'PRERENDERED_AT')
    try:
        with open(prerendered_at_path) as f:
            return f.read().strip() or None
    except OSError:
        return None
