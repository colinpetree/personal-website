# Sourced by build-on-pi.sh and publish-release.sh (the Pi fallback).
#
# Versions come from git tags, not a VERSION file. This prints the newest
# stable release version reachable from origin/main (e.g. 0.9.6, without the
# "v"), or 0.0.0 if there is none: the same rule GitHub Actions uses
# (.github/workflows/ci.yml and release.yml).
#
# Expects to run inside the repo checkout, after `git fetch origin main --tags`.
latest_stable_version() {
    local tag
    tag="$(git tag --merged origin/main --list 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1 || true)"
    tag="${tag#v}"
    echo "${tag:-0.0.0}"
}
