"""Lists which Python and npm packages changed since the previous release, as
Markdown for the release notes and the workflow's job summary.

Why: backend/requirements.txt allows version ranges (stripe>=16.1.0,<17,
anthropic, Pillow, ...) and every build installs fresh, so a release can pick
up a new version of a package with nobody noticing. The stripe-python 16
change that broke checkout (commit f314ee8) is the example. Nothing tests
payments, so the next best thing is to show exactly what moved.

Usage:
  python dependency-diff.py --pip-old OLD_FREEZE --pip-new NEW_FREEZE \
                            --npm-old OLD_LOCK --npm-new NEW_LOCK

Any OLD_* argument may point to a missing file (first release); that side is
then reported as "no previous release to compare with".
"""
import argparse
import json
import os
import re


def read_freeze(path):
    pkgs = {}
    if not path or not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        for line in f:
            m = re.match(r'^([A-Za-z0-9_.\-]+)==([^\s;]+)', line.strip())
            if m:
                pkgs[m.group(1).lower().replace('_', '-')] = m.group(2)
    return pkgs


def read_lock(path):
    """Top-level installed packages from an npm v2/v3 lockfile."""
    if not path or not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        lock = json.load(f)
    pkgs = {}
    for key, info in (lock.get('packages') or {}).items():
        # "node_modules/react" but not nested "node_modules/a/node_modules/b"
        if key.startswith('node_modules/') and key.count('node_modules/') == 1:
            pkgs[key[len('node_modules/'):]] = info.get('version', '?')
    return pkgs


def diff(old, new):
    rows = []
    for name in sorted(set(old) | set(new)):
        a, b = old.get(name), new.get(name)
        if a == b:
            continue
        if a is None:
            rows.append(f'| {name} | (new) | {b} |')
        elif b is None:
            rows.append(f'| {name} | {a} | (removed) |')
        else:
            major = a.split('.')[0] != b.split('.')[0]
            rows.append(f'| {name}{" **(major)**" if major else ""} | {a} | {b} |')
    return rows


def section(title, old, new):
    out = [f'### {title}', '']
    if old is None:
        out += ['No previous release to compare with.', '']
        return out
    rows = diff(old, new or {})
    if not rows:
        out += ['No changes.', '']
        return out
    out += ['| Package | Before | Now |', '|---|---|---|', *rows, '']
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--pip-old')
    p.add_argument('--pip-new', required=True)
    p.add_argument('--npm-old')
    p.add_argument('--npm-new', required=True)
    a = p.parse_args()

    lines = ['## Dependency changes since the previous release', '']
    lines += section('Python (exact versions frozen into the backend)', read_freeze(a.pip_old), read_freeze(a.pip_new))
    lines += section('npm (frontend/package-lock.json, top-level installs)', read_lock(a.npm_old), read_lock(a.npm_new))
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
