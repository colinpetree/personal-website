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
