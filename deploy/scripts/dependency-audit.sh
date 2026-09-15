#!/usr/bin/env bash
# Runs ON THE PI, monthly (see deploy/systemd/personal-website-dependency-audit.timer,
# a systemctl --user unit, same convention as personal-website-backup-pull.service).
# Audits backend (pip-audit against backend/requirements.txt) and frontend
# (npm audit against frontend/package-lock.json) for known vulnerabilities,
# then emails the combined report through production's pre-shared-secret-gated
# /api/watcher-alert route, the same mechanism backup-pull.sh/content-watch.sh
# already use to send mail via production's Mailgun config, since the Pi has
# none of its own. Unlike those scripts, this one always emails a report
# (clean or not), it exists to produce a monthly report, not just to raise
# alarms on failure.
set -uo pipefail   # not -e: one failing audit step must not skip the others or the report send

_log() { echo "[dependency-audit] $*"; }   # journalctl already timestamps every line

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_ROOT="$HOME/personal-website-build"
# Deliberately a SEPARATE venv from build-on-pi.sh's own $BUILD_ROOT/venv -
# this script re-installs requirements.txt into it every run, and doing that
# against the real build venv risks corrupting/blocking an in-progress
# publish-release.sh build if the two ever overlap on this Pi's limited
# hardware. A dedicated venv costs a little extra disk/time but can never
# collide with a real build.
VENV_DIR="$BUILD_ROOT/audit-venv"

PI_BUILD_ENV="$HOME/.personal-website-build.env"   # same file content-watch.sh/backup-pull.sh
                                                     # already use for WATCHER_ALERT_SECRET/PRERENDER_BASE_URL
[ -f "$PI_BUILD_ENV" ] && { set -a; source "$PI_BUILD_ENV"; set +a; }

SITE_URL="${PRERENDER_BASE_URL:-https://example.com}"

REPORT="$(mktemp)"
JSON_PAYLOAD="$(mktemp)"
trap 'rm -f "$REPORT" "$JSON_PAYLOAD"' EXIT

{
    echo "Monthly dependency audit - $(date -u +%Y-%m-%d) UTC"
    echo
} >> "$REPORT"

# ---- Backend: pip-audit ---------------------------------------------------
echo "== Backend (pip-audit) ==" >> "$REPORT"
BACKEND_OK=0
if [ -f "$REPO_DIR/backend/requirements.txt" ]; then
    cd "$REPO_DIR/backend"
    if [ ! -d "$VENV_DIR" ]; then
        python3 -m venv "$VENV_DIR"
    fi
    # shellcheck source=/dev/null
    source "$VENV_DIR/bin/activate"
    if pip install --quiet --upgrade pip \
        && pip install --quiet -r requirements.txt \
        && pip install --quiet pip-audit; then
        BACKEND_OK=1
        # pip-audit exits non-zero both when it finds vulnerabilities AND on
        # a genuine tool failure, BACKEND_OK above already reflects whether
        # the tooling itself installed correctly, so we don't try to
        # re-derive that distinction from this exit code too. Either way the
        # output (findings or an error message) lands in the report.
        pip-audit >> "$REPORT" 2>&1
    else
        echo "pip-audit could not run, installing requirements.txt/pip-audit into $VENV_DIR failed." >> "$REPORT"
    fi
    deactivate 2>/dev/null || true
else
    echo "backend/requirements.txt not found at $REPO_DIR, skipping." >> "$REPORT"
fi
echo >> "$REPORT"

# ---- Frontend: npm audit ---------------------------------------------------
echo "== Frontend (npm audit) ==" >> "$REPORT"
FRONTEND_OK=0
if [ -f "$REPO_DIR/frontend/package-lock.json" ]; then
    cd "$REPO_DIR/frontend"
    if command -v npm >/dev/null 2>&1; then
        FRONTEND_OK=1
        npm audit >> "$REPORT" 2>&1
    else
        echo "npm not found on PATH, cannot run npm audit." >> "$REPORT"
    fi
else
    echo "frontend/package-lock.json not found at $REPO_DIR, skipping." >> "$REPORT"
fi
echo >> "$REPORT"

if [ "$BACKEND_OK" = "1" ] && [ "$FRONTEND_OK" = "1" ]; then
    echo "Audit run completed." >> "$REPORT"
else
    echo "Audit run completed WITH ERRORS, see above (this means the audit tooling itself failed to run for one side, not necessarily that vulnerabilities were found)." >> "$REPORT"
fi

_log "Report:"
cat "$REPORT"

# ---- Email the report -------------------------------------------------------
if [ -z "${WATCHER_ALERT_SECRET:-}" ]; then
    _log "WATCHER_ALERT_SECRET is not set in $PI_BUILD_ENV, cannot email the report. Run setup-dependency-audit-pi.sh (or setup-auto-update-pi.sh, which is what first sets this value)."
    exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
    # Same reasoning as backup-pull.sh's _alert(): a hand-rolled printf
    # quoting doesn't safely escape embedded quotes/backslashes/newlines,
    # which can produce invalid JSON that the backend silently treats as an
    # empty body. Better to not send than to send something mislabeled.
    _log "python3 is not available, cannot safely JSON-encode the report. Not sending."
    exit 1
fi

# Build the whole JSON body with python (a dict, not string interpolation
# into a hand-written template) and pass it to curl via --data-binary @file
# rather than embedding it in the -K config's `data = "..."` line. A
# json.dumps()'d string always starts and ends with an unescaped `"` of its
# own; substituting that directly into `data = "...${msg}..."` makes curl's
# own config-string parser treat that leading `"` as the value's closing
# quote, silently truncating everything after it, and everything after was
# the entire report. Verified empirically against a local echo server before
# landing this fix: the old pattern sent only `{"source":"...","message":`
# with the report body missing entirely, every time, regardless of content.
python3 -c "import json,sys; json.dump({'source': 'dependency-audit', 'message': sys.stdin.read()}, sys.stdout)" < "$REPORT" > "$JSON_PAYLOAD"
if [ ! -s "$JSON_PAYLOAD" ]; then
    _log "Failed to JSON-encode the report. Not sending."
    exit 1
fi

# The secret still goes through -K (config from stdin), never -H on the
# command line, so it never appears in argv/`ps aux`/`/proc/<pid>/cmdline`.
# The report body isn't secret, so it can safely go via a normal --data-binary
# argv flag instead of fighting -K's config-string quoting rules.
if curl -sf --connect-timeout 10 --max-time 30 -X POST "$SITE_URL/api/watcher-alert" \
    --data-binary "@$JSON_PAYLOAD" -K - <<CURLCFG
header = "X-Watcher-Secret: $WATCHER_ALERT_SECRET"
header = "Content-Type: application/json"
CURLCFG
then
    _log "Report emailed."
else
    _log "Report email POST failed."
    exit 1
fi
