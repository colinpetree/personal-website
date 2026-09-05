#!/usr/bin/env bash
# Runs ON THE PRODUCTION SERVER. Installs or upgrades to a given release.
#
# Normal first-time flow: run deploy/scripts/bootstrap.sh once first — it
# provisions the OS/Postgres and writes a complete $DATA_DIR/.env, so this
# script needs no manual .env editing. If bootstrap.sh was given a domain,
# this script's domain prompt below is skipped entirely (already resolved
# from $DATA_DIR/certbot_domain.txt).
#
# Usage:
#   install.sh /path/to/personal-website-vX.Y.Z.tar.gz [--tag <tag>] [--domain example.com]
#   install.sh vX.Y.Z --releases-repo <owner>/<repo> [--domain example.com]
#
# --tag names the release directory under $APP_ROOT/releases (defaults to
# "v$VERSION", derived from the tarball filename). Pass the actual GitHub
# release tag here for a content-only release (e.g.
# v0.1.12-content-20260818153000, see publish-content-refresh.sh) — it keeps
# VERSION unchanged from the code release it's based on, so without --tag its
# release directory would collide with that earlier release's. Not needed
# with the vX.Y.Z / --releases-repo form above, which already uses the tag
# as ARG1.
#
# --domain is only needed until a domain is known — before an admin has ever
# logged in to save one via the settings page, and only if this session has
# no terminal to answer the interactive prompt install.sh falls back to
# otherwise. It seeds $DATA_DIR/certbot_domain.txt directly, which also
# triggers obtaining a Let's Encrypt certificate on the spot if one doesn't
# already exist. Once a domain is set (by this flag, the prompt, bootstrap.sh,
# or the admin UI), it's never required again.
set -euo pipefail

APP_ROOT="/opt/personal-website"
RELEASES_DIR="$APP_ROOT/releases"
DATA_DIR="$APP_ROOT/data"
CURRENT_LINK="$APP_ROOT/current"
KEEP_RELEASES=3

if [ "$#" -lt 1 ]; then
    echo "Usage: install.sh /path/to/personal-website-vX.Y.Z.tar.gz [--domain example.com]"
    echo "   or: install.sh vX.Y.Z --releases-repo <owner>/<repo> [--domain example.com]"
    exit 1
fi

ARG1="$1"; shift || true
RELEASES_REPO=""
DOMAIN_ARG=""
TAG_ARG=""
while [ $# -gt 0 ]; do
    case "$1" in
        --releases-repo) RELEASES_REPO="$2"; shift 2 ;;
        --domain) DOMAIN_ARG="$2"; shift 2 ;;
        --tag) TAG_ARG="$2"; shift 2 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

if [[ "$ARG1" == v* && -n "$RELEASES_REPO" ]]; then
    echo "==> Downloading $ARG1 from $RELEASES_REPO"
    gh release download "$ARG1" --repo "$RELEASES_REPO" --dir "$WORKDIR"
    # Discover the downloaded filename rather than guessing it from the tag —
    # build-on-pi.sh always names the tarball after the bare VERSION file
    # (e.g. personal-website-v0.1.12.tar.gz), which only happens to match the
    # tag for an ordinary code release. A content-only release tag (e.g.
    # v0.1.12-content-20260818153000, see publish-content-refresh.sh) never
    # matches that filename, so a guessed path would silently miss it.
    TARBALL="$(ls "$WORKDIR"/personal-website-*.tar.gz | head -1)"
    TAG_ARG="${TAG_ARG:-$ARG1}"
else
    TARBALL="$ARG1"
fi

if [ ! -f "$TARBALL" ]; then
    echo "Tarball not found: $TARBALL"
    exit 1
fi

BASENAME="$(basename "$TARBALL")"
VERSION="${BASENAME#personal-website-v}"
VERSION="${VERSION%.tar.gz}"

# ---- 1. Integrity check ----------------------------------------------------
if [ -f "$TARBALL.sha256" ]; then
    echo "==> Verifying checksum"
    (cd "$(dirname "$TARBALL")" && sha256sum -c "$(basename "$TARBALL").sha256")
else
    echo "WARNING: no .sha256 file found next to the tarball — skipping integrity check."
fi

# The release directory is named after the release TAG, not the bare
# VERSION — a content-only release (see publish-content-refresh.sh) ships a
# tarball whose VERSION is unchanged from the code release it's based on, so
# naming this directory after VERSION alone would collide with that earlier
# release's already-extracted directory. That collision made every content
# release silently skip extraction (the "already extracted" guard below) and
# also broke update-watch.sh's installed-vs-latest tag comparison, which
# reads this directory's basename — together that produced an infinite
# reinstall loop, since the comparison could never observe a successful
# content install. Defaulting TAG to "v$VERSION" keeps ordinary code
# releases (and any manual invocation with just a tarball path) unchanged.
TAG="${TAG_ARG:-v$VERSION}"
RELEASE_NAME="$TAG"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_NAME"
if [ -d "$RELEASE_DIR" ]; then
    echo "Release $RELEASE_NAME is already extracted at $RELEASE_DIR — remove it first if you want to re-extract."
else
    echo "==> Extracting to $RELEASE_DIR"
    mkdir -p "$RELEASES_DIR"
    tar -xzf "$TARBALL" -C "$WORKDIR"
    mv "$WORKDIR/personal-website-v$VERSION" "$RELEASE_DIR"
fi

# ---- 2. .env — never auto-generate secrets, never overwrite --------------
mkdir -p "$DATA_DIR"
if [ ! -f "$DATA_DIR/.env" ]; then
    cp "$RELEASE_DIR/.env.example" "$DATA_DIR/.env"
    echo ""
    echo "=========================================================================="
    echo " First install detected: $DATA_DIR/.env was created from .env.example."
    echo " Fill in DATABASE_URL, SECRET_KEY, ENCRYPTION_KEY, etc. and re-run this"
    echo " script. SECRET_KEY/ENCRYPTION_KEY must be generated once and kept stable"
    echo " across every future deploy — do not regenerate them later."
    echo "=========================================================================="
    exit 1
fi

# ---- 3. Persistent data dirs — created once, never touched again ---------
mkdir -p "$DATA_DIR/uploads"
touch -a "$DATA_DIR/certbot_domain.txt"
# Interval update-watch.sh (deploy/scripts/update-watch.sh) polls GitHub at,
# in seconds. 1800 (30 min) balances the Pi's own ~20min build time against
# not polling pointlessly during the long idle stretches between edits —
# edit by hand any time, no restart needed, it's re-read every cycle.
[ -f "$DATA_DIR/update-check-interval-seconds" ] || echo 1800 > "$DATA_DIR/update-check-interval-seconds"

# This script runs as root (sudo), so everything just created under $DATA_DIR
# is root-owned by default — but the systemd unit runs the app as the
# unprivileged `personalweb` user (ReadWritePaths= only lifts systemd's own
# sandboxing, it does not grant actual Unix write permission). Without this,
# every runtime write here (uploads, certbot_domain.txt, the RAG cache)
# throws PermissionError. Safe to re-run on every install, not just first —
# a plain `chown -R` on already-correctly-owned files is a no-op.
if id personalweb >/dev/null 2>&1; then
    chown -R personalweb:personalweb "$DATA_DIR"
else
    echo "WARNING: system user 'personalweb' does not exist — skipping chown of $DATA_DIR."
    echo "         The app will fail to write uploads/certbot_domain.txt/etc. until this"
    echo "         user exists and owns $DATA_DIR (see deploy plan §2)."
fi

# ---- 4. systemd / nginx / varnish config -----------------------------------
HASH_FILE="$DATA_DIR/deployed-config-hashes.txt"
touch "$HASH_FILE"

_hash_of() { sha256sum "$1" | awk '{print $1}'; }
_recorded_hash() { grep "^$1 " "$HASH_FILE" 2>/dev/null | awk '{print $2}' || true; }
_record_hash() {
    grep -v "^$1 " "$HASH_FILE" > "$HASH_FILE.tmp" 2>/dev/null || true
    mv "$HASH_FILE.tmp" "$HASH_FILE"
    echo "$1 $2" >> "$HASH_FILE"
}

FIRST_INSTALL=false
if [ ! -f "/etc/systemd/system/personal-website.service" ]; then
    FIRST_INSTALL=true
fi

_install_config() {
    local key="$1" src="$2" dest="$3"
    local new_hash
    new_hash="$(_hash_of "$src")"
    local recorded
    recorded="$(_recorded_hash "$key")"

    if [ "$FIRST_INSTALL" = true ] || [ -z "$recorded" ]; then
        echo "==> Installing $dest (first install)"
        cp "$src" "$dest"
        _record_hash "$key" "$new_hash"
    elif [ "$new_hash" = "$recorded" ]; then
        echo "==> $dest unchanged, skipping"
    else
        echo "==> $dest CHANGED in this release — not overwriting automatically."
        echo "    New version written to: $dest.new"
        echo "    Diff and apply manually: diff $dest $dest.new"
        cp "$src" "$dest.new"
    fi
}

# Single source of truth for the gunicorn/Varnish backend port — templated
# into both the systemd unit and the VCL below so they can never drift
# independently (previously each hardcoded its own copy of "8000").
BACKEND_PORT="8000"
# Must match the -a 127.0.0.1:__ varnishd is bound to in bootstrap.sh's
# systemd override — templated into nginx's upstream so it proxies to
# Varnish itself, not straight past it to gunicorn.
VARNISH_PORT="6081"

# ---- Determine domain — prompt interactively on first install if needed --
DOMAIN="$(cat "$DATA_DIR/certbot_domain.txt" 2>/dev/null || true)"
if [ -z "$DOMAIN" ] && [ -n "$DOMAIN_ARG" ]; then
    DOMAIN="$DOMAIN_ARG"
fi
if [ -z "$DOMAIN" ]; then
    # Not gated on FIRST_INSTALL specifically — if an earlier run happened
    # non-interactively with no --domain and the prompt never fired, the
    # systemd unit now exists so FIRST_INSTALL would be false forever after;
    # prompting whenever the domain is still genuinely unknown (regardless
    # of install vs. upgrade) is what actually gets HTTPS unstuck.
    if [ -t 0 ]; then
        echo ""
        echo "Before continuing: this domain's DNS (an A/AAAA record at your registrar"
        echo "or DNS provider) must already point at this server's public IP, or the"
        echo "certificate request below will fail — DNS isn't something this script can"
        echo "do for you. If it's not pointed yet, it's fine to enter the domain anyway"
        echo "and re-run install.sh once DNS has propagated."
        read -rp "==> Enter the domain this site will be served from (e.g. example.com): " DOMAIN
    else
        echo "WARNING: no domain configured yet, and this session has no terminal to prompt"
        echo "         (e.g. a non-interactive ssh command). Re-run with --domain example.com,"
        echo "         or save one via the admin settings page and re-run install.sh later."
    fi
fi
if [ -n "$DOMAIN" ]; then
    echo -n "$DOMAIN" > "$DATA_DIR/certbot_domain.txt"
fi

# ---- Obtain a certificate before installing the real nginx config --------
# nginx refuses to load any "listen ... ssl" block with no ssl_certificate
# configured — the full site config (with its 443 block) can only ever be
# installed AFTER a real certificate already exists on disk. On first
# install with no cert yet, bootstrap a temporary HTTP-only nginx config
# just to serve the ACME HTTP-01 challenge, then obtain the cert via
# `certbot certonly --webroot` — deliberately not `certbot --nginx`, which
# would edit our hand-written config instead of just fetching a cert.
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
if [ -n "$DOMAIN" ] && [ ! -f "$CERT_DIR/fullchain.pem" ]; then
    echo "==> No certificate yet for $DOMAIN — bootstrapping HTTP-only nginx to obtain one"
    mkdir -p /var/www/certbot
    BOOTSTRAP_CONF="$WORKDIR/nginx-bootstrap.conf"
    cat > "$BOOTSTRAP_CONF" <<-EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'Bootstrapping HTTPS for $DOMAIN — try again shortly.';
        add_header Content-Type text/plain;
    }
}
EOF
    mkdir -p /etc/nginx/sites-available
    cp "$BOOTSTRAP_CONF" /etc/nginx/sites-available/personal-website.conf
    if [ ! -L /etc/nginx/sites-enabled/personal-website.conf ]; then
        ln -s /etc/nginx/sites-available/personal-website.conf /etc/nginx/sites-enabled/personal-website.conf
    fi
    if ! nginx -t; then
        echo "WARNING: bootstrap nginx config failed nginx -t — cannot obtain a certificate this run. Check manually."
    else
        systemctl reload nginx 2>/dev/null || systemctl start nginx

        CERTBOT_EMAIL=""
        if [ -t 0 ]; then
            read -rp "==> Email for Let's Encrypt renewal notices (leave blank to skip): " CERTBOT_EMAIL
        fi
        EMAIL_FLAG="--register-unsafely-without-email"
        [ -n "$CERTBOT_EMAIL" ] && EMAIL_FLAG="-m $CERTBOT_EMAIL"

        if certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --non-interactive --agree-tos $EMAIL_FLAG; then
            echo "==> Certificate obtained for $DOMAIN"
            # certonly doesn't manage reloading nginx after renewal the way
            # `certbot --nginx` would — add that ourselves, once.
            mkdir -p /etc/letsencrypt/renewal-hooks/deploy
            printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
            chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
        else
            echo "WARNING: certbot failed to obtain a certificate for $DOMAIN — the site will"
            echo "         stay on the HTTP-only bootstrap config until this is resolved (check"
            echo "         DNS points at this server and port 80 is reachable from the internet)"
            echo "         and install.sh is re-run."
        fi
    fi
fi

# ---- Install the real nginx config, only once a certificate exists -------
NGINX_SRC="$WORKDIR/nginx-personal-website.conf"
INSTALL_FULL_NGINX_CONFIG=false
if [ -n "$DOMAIN" ] && [ -f "$CERT_DIR/fullchain.pem" ]; then
    sed -e "s#__DOMAIN__#$DOMAIN#g" \
        -e "s#__SSL_CERT__#$CERT_DIR/fullchain.pem#g" \
        -e "s#__SSL_KEY__#$CERT_DIR/privkey.pem#g" \
        -e "s#__VARNISH_PORT__#$VARNISH_PORT#g" \
        "$RELEASE_DIR/deploy/nginx/personal-website.conf" > "$NGINX_SRC"
    INSTALL_FULL_NGINX_CONFIG=true
else
    echo "NOTE: no certificate available — leaving the HTTP-only bootstrap nginx config in"
    echo "      place for now. Re-run install.sh once DNS/certbot succeed to switch to HTTPS."
fi

sed "s/__BACKEND_PORT__/$BACKEND_PORT/g" "$RELEASE_DIR/deploy/systemd/personal-website.service" > "$WORKDIR/personal-website.service"
_install_config systemd "$WORKDIR/personal-website.service" "/etc/systemd/system/personal-website.service"
if [ "$INSTALL_FULL_NGINX_CONFIG" = true ]; then
    mkdir -p /etc/nginx/sites-available
    _install_config nginx "$NGINX_SRC" "/etc/nginx/sites-available/personal-website.conf"
    if [ ! -L "/etc/nginx/sites-enabled/personal-website.conf" ]; then
        ln -s /etc/nginx/sites-available/personal-website.conf /etc/nginx/sites-enabled/personal-website.conf
    fi
fi
sed "s/__BACKEND_PORT__/$BACKEND_PORT/g" "$RELEASE_DIR/deploy/varnish/default.vcl" > "$WORKDIR/default.vcl"
_install_config varnish "$WORKDIR/default.vcl" "/etc/varnish/default.vcl"

# No templating needed (no __BACKEND_PORT__/__DOMAIN__ placeholders), so this
# one installs straight from the release dir. Same hash-diff-safe behavior as
# the other three: unmodified on a later release is a no-op, a genuine change
# writes .new instead of overwriting a hand-edit — see deploy/scripts/
# update-watch.sh for how the *script* itself (as opposed to this unit file)
# actually keeps itself current across releases.
_install_config updater "$RELEASE_DIR/deploy/systemd/personal-website-updater.service" \
    "/etc/systemd/system/personal-website-updater.service"

# Backup + health-monitoring timers — no templating needed (no
# __BACKEND_PORT__/__DOMAIN__ placeholders), same hash-diff-safe install as
# the updater unit above. Config (BACKUP_REMOTE_HOST etc.) lives in
# $DATA_DIR/.env, not these unit files, so a later env-only tweak never shows
# up as a "CHANGED" diff here.
_install_config backup-service "$RELEASE_DIR/deploy/systemd/personal-website-backup.service" \
    "/etc/systemd/system/personal-website-backup.service"
_install_config backup-timer "$RELEASE_DIR/deploy/systemd/personal-website-backup.timer" \
    "/etc/systemd/system/personal-website-backup.timer"
_install_config healthwatch-service "$RELEASE_DIR/deploy/systemd/personal-website-healthwatch.service" \
    "/etc/systemd/system/personal-website-healthwatch.service"
_install_config healthwatch-timer "$RELEASE_DIR/deploy/systemd/personal-website-healthwatch.timer" \
    "/etc/systemd/system/personal-website-healthwatch.timer"
_install_config media-cleanup-service "$RELEASE_DIR/deploy/systemd/personal-website-media-cleanup.service" \
    "/etc/systemd/system/personal-website-media-cleanup.service"
_install_config media-cleanup-timer "$RELEASE_DIR/deploy/systemd/personal-website-media-cleanup.timer" \
    "/etc/systemd/system/personal-website-media-cleanup.timer"

systemctl daemon-reload

# Reload nginx/Varnish unconditionally on every run, not just first install —
# _install_config can install an updated file on a LATER run too (e.g. the
# nginx config only actually gets written once a certificate exists, which
# may not happen until a retry after the very first install, by which point
# FIRST_INSTALL is already permanently false). A reload of an unchanged
# config is a safe no-op, so there's no downside to doing this every time.
echo "==> Reloading nginx"
if nginx -t; then
    systemctl reload nginx 2>/dev/null || systemctl start nginx
else
    echo "WARNING: nginx config test failed — check manually (nginx -t, systemctl status nginx)."
fi

echo "==> Reloading Varnish VCL"
if command -v varnishadm >/dev/null 2>&1; then
    # Varnish requires a unique label per vcl.load — reusing one (e.g. a
    # fixed "config1") errors on every run after the first. Old labels are
    # harmless to leave around; they're just inactive metadata.
    VCL_LABEL="config_$(date +%s)"
    if varnishadm vcl.load "$VCL_LABEL" /etc/varnish/default.vcl 2>/dev/null && varnishadm vcl.use "$VCL_LABEL" 2>/dev/null; then
        echo "    Loaded and activated as $VCL_LABEL"
    else
        echo "WARNING: varnishadm vcl.load/vcl.use failed — varnish may not be running yet."
        echo "         Once it is, run: varnishadm vcl.load $VCL_LABEL /etc/varnish/default.vcl && varnishadm vcl.use $VCL_LABEL"
    fi
else
    echo "NOTE: varnishadm not found — is varnish installed? Skipping VCL reload."
fi

if [ "$FIRST_INSTALL" = true ]; then
    systemctl enable personal-website

    # Needs no configuration to be useful (reads .env, defaults everything
    # else) — safe to enable unconditionally, unlike the backup timer below.
    systemctl enable --now personal-website-healthwatch.timer

    # Same reasoning — zero-config, safe-by-default (grace period + circuit
    # breaker, see deploy/BACKUP.md), unlike the backup timer's offsite
    # destination requirement.
    systemctl enable --now personal-website-media-cleanup.timer

    echo ""
    echo "=========================================================================="
    echo " First install — remaining manual steps (deploy plan §12):"
    echo "   1. Confirm varnishd is bound to 127.0.0.1:6081, NOT 0.0.0.0:6081 —"
    echo "      check its systemd unit / /etc/default/varnish DAEMON_OPTS for"
    echo "      \"-a 127.0.0.1:6081\" and restart varnish if you had to change it."
    echo "      Left unconfigured this exposes the cache directly, bypassing nginx's TLS."
    echo "   2. ufw: allow only 22 (or your SSH port), 80, 443; deny everything else."
    echo "   3. Confirm PostgreSQL is installed and DATABASE_URL in .env points at it."
    echo "   4. Confirm libnginx-mod-http-brotli is installed (apt install"
    echo "      libnginx-mod-http-brotli) — nginx auto-loads it via"
    echo "      /etc/nginx/modules-enabled/, no nginx.conf edit needed. Without"
    echo "      it, nginx -t fails on the brotli/brotli_static directives below."
    echo "   5. Auto-updates are NOT enabled yet — this install.sh run was manual,"
    echo "      as every first install always is. Once you're ready to hand future"
    echo "      releases (code or content) off to the auto-updater: edit"
    echo "      UPDATE_WATCH_RELEASES_REPO in"
    echo "      /etc/systemd/system/personal-website-updater.service, then run"
    echo "      systemctl enable --now personal-website-updater"
    echo "   6. Nightly backups are NOT enabled yet (need an offsite destination"
    echo "      configured first): run deploy/scripts/setup-backup-ssh.sh, set"
    echo "      BACKUP_REMOTE_HOST/BACKUP_REMOTE_USER/BACKUP_REMOTE_PATH in"
    echo "      $DATA_DIR/.env, then run"
    echo "      systemctl enable --now personal-website-backup.timer"
    echo "      See deploy/BACKUP.md for full setup and restore instructions."
    echo "   7. Crash-loop/disk/certificate-expiry monitoring IS already enabled"
    echo "      (personal-website-healthwatch.timer) — no action needed unless"
    echo "      you want to tune BACKUP_DISK_ALERT_PERCENT/CERT_ALERT_DAYS in"
    echo "      $DATA_DIR/.env."
    echo "   8. Orphan media cleanup IS already enabled"
    echo "      (personal-website-media-cleanup.timer) — deletes uploaded files no"
    echo "      longer referenced anywhere, after a grace period. No action needed"
    echo "      unless you want to tune ORPHAN_MEDIA_GRACE_DAYS/ORPHAN_MEDIA_MAX_PER_RUN"
    echo "      in $DATA_DIR/.env. See deploy/BACKUP.md."
    echo "=========================================================================="
fi

# server is invoked directly in steps 4b/5 below, NOT via systemd, so none of
# the unit file's EnvironmentFile=/Environment= lines apply — without
# explicitly sourcing .env and exporting these ourselves, DATABASE_URL etc.
# are unset and both calls fail immediately.
_run_server_in() {
    local dir="$1"; shift
    (
        set -a
        # shellcheck source=/dev/null
        source "$DATA_DIR/.env"
        set +a
        export APP_DATA_DIR="$DATA_DIR"
        export MIGRATIONS_DIR="$dir/migrations"
        exec "$dir/backend/server" "$@"
    )
}
_run_server() { _run_server_in "$RELEASE_DIR" "$@"; }

# Whether the *database* has ever been seeded — deliberately NOT the same
# thing as $FIRST_INSTALL above, which only reflects whether this SERVER has
# installed a release before (systemd-unit-file presence). Those two can
# diverge: resetting/replacing the database while the systemd unit is still
# installed would make FIRST_INSTALL false while the DB is genuinely empty,
# silently skipping both seeding steps below and leaving the site permanently
# stuck on "Site not configured" with no admin account. Querying the DB
# itself (via server --db-is-fresh, checking for schema_migrations) is the
# only signal that can't be fooled by that mismatch.
if ! DB_IS_FRESH="$(_run_server --db-is-fresh)"; then
    echo "DB FRESHNESS CHECK FAILED — aborting before touching the current release."
    echo "(Check DATABASE_URL in $DATA_DIR/.env and that PostgreSQL is reachable.)"
    exit 1
fi

# ---- 4b. Only on a genuinely fresh database: seed the 4 pre-existing legacy
# migrations as already-applied. They describe how an ALREADY-EXISTING
# (pre-rename) database reaches today's schema — db.create_all() on a fresh
# database already creates that schema directly, so actually running them
# here would fail outright (e.g. "relation donation does not exist").
# Automatic and unconditional, not a manual step to remember.
if [ "$DB_IS_FRESH" = "true" ]; then
    echo "==> Seeding legacy migrations as already-applied (fresh database)"
    if ! _run_server --seed-known-migrations; then
        echo "SEEDING FAILED — aborting before touching the current release."
        exit 1
    fi
fi

# ---- 4c. Only on a genuinely fresh database: seed Profile/SiteConfig/
# AdminAccount — server.py --seed-initial-data (§0.2) is itself always a safe
# no-op past the first row in each table, but there's no reason to run it on
# every upgrade. SiteConfig in particular must exist before the post-cutover
# health check below (§7/§8), which polls /api/site-config. AdminAccount
# always seeds as admin@example.com with a freshly random password, printed
# once to the output below — save it from there.
if [ "$DB_IS_FRESH" = "true" ]; then
    echo "==> Seeding initial Profile/SiteConfig/AdminAccount data"
    if [ -n "$DOMAIN" ]; then
        # Pre-fills SiteConfig.domain with whatever domain was already
        # resolved above (from certbot_domain.txt/--domain/prompt), so it
        # shows up in the admin panel immediately instead of needing re-entry.
        export SITE_DOMAIN="$DOMAIN"
    fi
    if ! _run_server --seed-initial-data; then
        echo "SEEDING FAILED — aborting before touching the current release."
        exit 1
    fi
fi

# Only resolve a previous release if $CURRENT_LINK actually exists yet — GNU
# `readlink -f` on a not-yet-existing path doesn't return empty, it just
# echoes the literal (nonexistent) path back. On a genuine first install that
# made PREVIOUS_RELEASE equal to $CURRENT_LINK itself, and a failed health
# check below would then `ln -sfn "$CURRENT_LINK" "$CURRENT_LINK"` — a
# self-referential symlink ("too many levels of symbolic links" on every
# subsequent access) instead of the intended "nothing to roll back to".
# Resolved here (before migrations run, not just before cutover) so it's
# already available if the migration step below fails and needs to report it.
PREVIOUS_RELEASE=""
if [ -L "$CURRENT_LINK" ]; then
    PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
fi

# Facts common to both the success and failure deploy-report emails —
# gathered once and exported right before each `--send-deploy-report` call.
# Silently a no-op downstream if Mailgun/forward_email isn't configured.
_export_deploy_report_common() {
    export DEPLOY_REPORT_RELEASE="$RELEASE_NAME"
    export DEPLOY_REPORT_PREVIOUS="$([ -n "$PREVIOUS_RELEASE" ] && basename "$PREVIOUS_RELEASE" || echo "none")"
    export DEPLOY_REPORT_DOMAIN="$DOMAIN"
    export DEPLOY_REPORT_HOSTNAME="$(hostname -f 2>/dev/null || hostname)"
    export DEPLOY_REPORT_TIMESTAMP="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    export DEPLOY_REPORT_DISK="$(df -h "$APP_ROOT" 2>/dev/null | tail -1)"
}

# ---- 5. Run pending SQL migrations before touching traffic ----------------
echo "==> Running database migrations"
if ! _run_server --migrate-only; then
    echo "MIGRATION FAILED — aborting before touching the current release."
    _export_deploy_report_common
    export DEPLOY_REPORT_STATUS=failure
    export DEPLOY_REPORT_STAGE=migrate
    export DEPLOY_REPORT_ROLLED_BACK=false
    export DEPLOY_REPORT_ATTEMPTS=0
    _run_server --send-deploy-report >/dev/null 2>&1 || true
    exit 1
fi

# ---- 6. Atomic cutover ------------------------------------------------------
echo "==> Cutting over to $RELEASE_NAME"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
systemctl restart personal-website

# ---- 7. Health check, with automatic rollback ------------------------------
echo "==> Health check"
HEALTHY=false
LAST_HEALTH_ERROR=""
for i in $(seq 1 15); do
    if CURL_OUT="$(curl -sf "http://127.0.0.1:$BACKEND_PORT/api/site-config" 2>&1)"; then
        HEALTHY=true
        break
    else
        LAST_HEALTH_ERROR="$CURL_OUT"
    fi
    sleep 1
done

if [ "$HEALTHY" != true ]; then
    echo "HEALTH CHECK FAILED — rolling back."
    ROLLED_BACK=false
    REPORT_DIR="$RELEASE_DIR"
    if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
        ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK"
        systemctl restart personal-website
        echo "Rolled back to $(basename "$PREVIOUS_RELEASE")."
        ROLLED_BACK=true
        REPORT_DIR="$PREVIOUS_RELEASE"
    else
        echo "No previous release to roll back to — service left as-is, investigate manually."
    fi
    _export_deploy_report_common
    export DEPLOY_REPORT_STATUS=failure
    export DEPLOY_REPORT_STAGE=healthcheck
    export DEPLOY_REPORT_ROLLED_BACK="$ROLLED_BACK"
    export DEPLOY_REPORT_ATTEMPTS="$i"
    export DEPLOY_REPORT_HEALTH_ERROR="$LAST_HEALTH_ERROR"
    export DEPLOY_REPORT_LOG_TAIL="$(journalctl -u personal-website -n 30 --no-pager 2>/dev/null | tail -c 4000)"
    _run_server_in "$REPORT_DIR" --send-deploy-report >/dev/null 2>&1 || true
    exit 1
fi

echo "==> $RELEASE_NAME is live and healthy."

echo "==> Purging Varnish cache"
# purge_all_public()/ban_pattern() itself never propagates a failure — but
# `|| true` here isn't about that function, it's about install.sh's own
# `set -e`: _run_server spawns a whole separate process, whose create_app()
# bootstrap runs unconditionally before the --purge-cache flag is even
# checked. If that bootstrap failed for any unrelated reason (a transient DB
# hiccup, disk full), an unguarded call here would abort this script right
# after cutover+health-check already succeeded — skipping the deploy-report
# email and release pruning for an otherwise-successful deploy, and making
# update-watch.sh needlessly retry an install that already landed. Same
# reasoning as the `|| true` on --send-deploy-report right below. Deliberately
# NOT redirected to /dev/null, though — a real purge failure is only visible
# via varnish_purge.py's own logging.getLogger(__name__).warning(...,
# exc_info=True), and swallowing stderr here would throw that away for nothing.
_run_server --purge-cache || true

_export_deploy_report_common
export DEPLOY_REPORT_STATUS=success
export DEPLOY_REPORT_ATTEMPTS="$i"
_run_server --send-deploy-report >/dev/null 2>&1 || true

# ---- 8. Prune old releases --------------------------------------------------
cd "$RELEASES_DIR"
ls -1dt v*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
    old="${old%/}"
    if [ "$RELEASES_DIR/$old" != "$(readlink -f "$CURRENT_LINK")" ]; then
        echo "==> Pruning old release $old"
        rm -rf "${old:?}"
    fi
done

echo "==> install.sh finished successfully."
