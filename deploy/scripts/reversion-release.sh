#!/usr/bin/env bash
# Relabels a tested build with its release version, without rebuilding it.
# Used by .github/workflows/release.yml (Publish release) to turn CI's
# candidate files (e.g. v0.9.6-ci.abc1234) into the release (e.g. v0.9.7).
#
# The version is not compiled into anything: it lives only in the tarball
# names, the top-level folder name inside each tarball, and the VERSION file
# in that folder (see assemble-release.sh). This script changes exactly those
# and then checks that every other file kept its path, size and permissions,
# so the release is byte-for-byte the code CI tested.
#
# Usage: reversion-release.sh <dir> <new-version>
#
# <dir> must hold exactly one server-bundle-v*-linux-<arch>.tar.gz and one
# personal-website-v*.tar.gz. Each is replaced by its relabelled copy plus a
# fresh .sha256 (bare filename, as install.sh expects). Other files, such as
# last-build-requirements.txt, are left alone.
#
# Needs GNU tar (the GitHub runners have it).
set -euo pipefail

die() { echo "reversion-release.sh: $*" >&2; exit 1; }

[ $# -eq 2 ] || die "usage: reversion-release.sh <dir> <new-version>"
DIR="$(cd "$1" && pwd)" || die "no such directory: $1"
NEW="$2"
[[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || die "'$NEW' is not a version like 1.2.3"

STAGES=()
cleanup() { for s in "${STAGES[@]}"; do rm -rf "$s"; done; }
trap cleanup EXIT

# Same format as assemble-release.sh's _write_sha: a bare filename, because
# install.sh runs `sha256sum -c` from the tarball's own directory.
_write_sha() {
    (cd "$(dirname "$1")" && sha256sum "$(basename "$1")" > "$(basename "$1").sha256")
}

# One line per entry: permissions, size, path with the top-level folder
# removed. The folder entry itself and VERSION are left out, because they are
# the only things meant to change.
_listing() {
    tar -tvzf "$1" \
        | awk '{ mode = $1; size = $3; $1 = $2 = $3 = $4 = $5 = ""; sub(/^ +/, ""); print mode, size, $0 }' \
        | sed -E 's#^([^ ]+ [^ ]+ )[^/]+/?#\1#' \
        | grep -vE '^[^ ]+ [^ ]+ (VERSION)?$' \
        | LC_ALL=C sort
}

# relabel <prefix>: prefix is server-bundle or personal-website.
relabel() {
    local prefix="$1"
    local files=()
    shopt -s nullglob
    files=("$DIR/$prefix"-v*.tar.gz)
    shopt -u nullglob
    [ "${#files[@]}" -eq 1 ] || die "expected exactly one $prefix-v*.tar.gz in $DIR, found ${#files[@]}"

    local old="${files[0]}"
    local name suffix
    name="$(basename "$old")"
    suffix=".tar.gz"
    if [ "$prefix" = "server-bundle" ]; then
        [[ "$name" =~ (-linux-[A-Za-z0-9_]+\.tar\.gz)$ ]] || die "$name does not end in -linux-<arch>.tar.gz"
        suffix="${BASH_REMATCH[1]}"
    fi
    local newdir="$prefix-v$NEW"
    local newname="$newdir$suffix"
    [ "$name" != "$newname" ] || die "$name is already labelled $NEW"

    local stage
    stage="$(mktemp -d)"
    STAGES+=("$stage")
    # -p keeps permissions exactly as packed, whatever the umask.
    tar -xpzf "$old" -C "$stage"

    local top
    top="$(find "$stage" -mindepth 1 -maxdepth 1)"
    [ "$(echo "$top" | wc -l)" -eq 1 ] && [ -d "$top" ] && [[ "$(basename "$top")" == "$prefix"-v* ]] \
        || die "$name should hold exactly one top-level folder named $prefix-v*"
    [ -f "$top/VERSION" ] || die "$name has no VERSION file in $(basename "$top")/"

    echo "==> $name -> $newname (VERSION $(tr -d '[:space:]' < "$top/VERSION") -> $NEW)"
    mv "$top" "$stage/$newdir"
    printf '%s\n' "$NEW" > "$stage/$newdir/VERSION"
    tar -czf "$DIR/$newname" -C "$stage" "$newdir"

    # Nothing but the folder name and VERSION may differ.
    if ! diff -u <(_listing "$old") <(_listing "$DIR/$newname") >&2; then
        rm -f "$DIR/$newname"
        die "$newname differs from $name in more than the version (see the diff above)"
    fi
    [ "$(tar -xzOf "$DIR/$newname" "$newdir/VERSION" | tr -d '[:space:]')" = "$NEW" ] \
        || die "$newname does not contain VERSION $NEW"

    _write_sha "$DIR/$newname"
    rm -f "$old" "$old.sha256"
}

relabel server-bundle
relabel personal-website
echo "==> Relabelled as $NEW"
