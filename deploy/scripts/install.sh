#!/usr/bin/env bash
# Runs ON THE PRODUCTION SERVER. Installs or upgrades to a given release.
#
# Usage:
#   install.sh /path/to/personal-website-vX.Y.Z.tar.gz [--domain example.com]
#   install.sh vX.Y.Z --releases-repo <owner>/<repo> [--domain example.com]
#
# --domain is only needed until a domain is known — before an admin has ever
# logged in to save one via the settings page, and only if this session has
# no terminal to answer the interactive prompt install.sh falls back to
# otherwise. It seeds $DATA_DIR/certbot_domain.txt directly, which also
# triggers obtaining a Let's Encrypt certificate on the spot if one doesn't
# already exist. Once a domain is set (by this flag, the prompt, or the
# admin UI), it's never required again.
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
while [ $# -gt 0 ]; do
    case "$1" in
        --releases-repo) RELEASES_REPO="$2"; shift 2 ;;
        --domain) DOMAIN_ARG="$2"; shift 2 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

if [[ "$ARG1" == v* && -n "$RELEASES_REPO" ]]; then
    echo "==> Downloading $ARG1 from $RELEASES_REPO"
    gh release download "$ARG1" --repo "$RELEASES_REPO" --dir "$WORKDIR"
    TARBALL="$WORKDIR/personal-website-$ARG1.tar.gz"
    VERSION="${ARG1#v}"
else
    TARBALL="$ARG1"
    BASENAME="$(basename "$TARBALL")"
    VERSION="${BASENAME#personal-website-v}"
    VERSION="${VERSION%.tar.gz}"
fi

if [ ! -f "$TARBALL" ]; then
    echo "Tarball not found: $TARBALL"
    exit 1
fi

# ---- 1. Integrity check ----------------------------------------------------
if [ -f "$TARBALL.sha256" ]; then
    echo "==> Verifying checksum"
    (cd "$(dirname "$TARBALL")" && sha256sum -c "$(basename "$TARBALL").sha256")
else
    echo "WARNING: no .sha256 file found next to the tarball — skipping integrity check."
fi

RELEASE_NAME="v$VERSION"
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
        -e "s#__BACKEND_PORT__#$BACKEND_PORT#g" \
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
    echo "=========================================================================="
fi

# server is invoked directly in steps 4b/5 below, NOT via systemd, so none of
# the unit file's EnvironmentFile=/Environment= lines apply — without
# explicitly sourcing .env and exporting these ourselves, DATABASE_URL etc.
# are unset and both calls fail immediately.
_run_server() {
    (
        set -a
        # shellcheck source=/dev/null
        source "$DATA_DIR/.env"
        set +a
        export APP_DATA_DIR="$DATA_DIR"
        export MIGRATIONS_DIR="$RELEASE_DIR/migrations"
        exec "$RELEASE_DIR/backend/server" "$@"
    )
}

# ---- 4b. First install only: seed the 4 pre-existing legacy migrations as
# already-applied. They describe how an ALREADY-EXISTING (pre-rename)
# database reaches today's schema — db.create_all() on a fresh database
# already creates that schema directly, so actually running them here would
# fail outright (e.g. "relation donation does not exist"). Automatic and
# unconditional on first install, not a manual step to remember.
if [ "$FIRST_INSTALL" = true ]; then
    echo "==> Seeding legacy migrations as already-applied (fresh database)"
    if ! _run_server --seed-known-migrations; then
        echo "SEEDING FAILED — aborting before touching the current release."
        exit 1
    fi
fi

# ---- 5. Run pending SQL migrations before touching traffic ----------------
echo "==> Running database migrations"
if ! _run_server --migrate-only; then
    echo "MIGRATION FAILED — aborting before touching the current release."
    exit 1
fi

# ---- 6. Atomic cutover ------------------------------------------------------
PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
echo "==> Cutting over to $RELEASE_NAME"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
systemctl restart personal-website

# ---- 7. Health check, with automatic rollback ------------------------------
echo "==> Health check"
HEALTHY=false
for i in $(seq 1 15); do
    if curl -sf "http://127.0.0.1:$BACKEND_PORT/api/site-config" >/dev/null 2>&1; then
        HEALTHY=true
        break
    fi
    sleep 1
done

if [ "$HEALTHY" != true ]; then
    echo "HEALTH CHECK FAILED — rolling back."
    if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
        ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK"
        systemctl restart personal-website
        echo "Rolled back to $(basename "$PREVIOUS_RELEASE")."
    else
        echo "No previous release to roll back to — service left as-is, investigate manually."
    fi
    exit 1
fi

echo "==> $RELEASE_NAME is live and healthy."

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
