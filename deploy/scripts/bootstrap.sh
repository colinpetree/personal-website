#!/usr/bin/env bash
# Runs ONCE on a fresh production server, before the first install.sh run.
# Installs OS-level dependencies, creates the personalweb service user,
# configures ufw/Varnish, provisions Postgres, and writes a fully-populated
# .env (DATABASE_URL/SECRET_KEY/ENCRYPTION_KEY generated automatically) plus
# the domain file install.sh reads for both TLS and admin-panel seeding.
#
# Every step here is idempotent — safe to re-run (e.g. after a mid-way
# failure). Once $DATA_DIR/.env exists it is never touched again, so a
# re-run never regenerates secrets or resets the Postgres password.
#
# Usage: sudo bash bootstrap.sh [--domain example.com]
set -euo pipefail

APP_ROOT="/opt/personal-website"
DATA_DIR="$APP_ROOT/data"

if [ "$(id -u)" -ne 0 ]; then
    echo "Run as root (sudo bash bootstrap.sh)"
    exit 1
fi

DOMAIN_ARG=""
while [ $# -gt 0 ]; do
    case "$1" in
        --domain) DOMAIN_ARG="$2"; shift 2 ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

echo "==> 1. System user"
if ! id personalweb >/dev/null 2>&1; then
    adduser --system --group personalweb
else
    echo "    personalweb already exists, skipping"
fi

echo "==> 2. Installing packages"
# universe is where libnginx-mod-http-brotli-* live on 24.04 — not enabled
# by default on a stock Ubuntu Server image.
add-apt-repository universe -y
apt update
apt install -y postgresql nginx varnish certbot python3-certbot-nginx \
    libnginx-mod-http-brotli-filter libnginx-mod-http-brotli-static ufw

echo "==> 3. Configuring firewall (ufw)"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> 4. Binding Varnish to 127.0.0.1:6081"
# Varnish's packaged default is 0.0.0.0:6081, which would expose the cache
# directly to the internet, bypassing nginx's TLS termination entirely.
mkdir -p /etc/systemd/system/varnish.service.d
cat > /etc/systemd/system/varnish.service.d/override.conf <<'EOF'
[Service]
ExecStart=
ExecStart=/usr/sbin/varnishd -a 127.0.0.1:6081 -T localhost:6082 -f /etc/varnish/default.vcl -S /etc/varnish/secret -s malloc,256m
EOF
systemctl daemon-reload
# enable --now (not just start) so it also survives a reboot; the restart
# after covers the case where it was already running under the old,
# unbound-to-loopback config before this override existed.
systemctl enable --now varnish
systemctl restart varnish

echo "==> 5. Creating data directories"
mkdir -p "$DATA_DIR/uploads" "$APP_ROOT/releases"

echo "==> 6. Generating .env"
if [ -f "$DATA_DIR/.env" ]; then
    echo "    $DATA_DIR/.env already exists — leaving it untouched (secrets/DB password stay stable)."
else
    # hex, not base64 — base64's +/= alphabet can complicate parsing the
    # resulting postgresql:// URI; hex is always alphanumeric.
    DB_PASSWORD="$(openssl rand -hex 24)"

    # ALTER (not just CREATE-if-missing): if a previous run of this script
    # got interrupted after creating the role but before .env was written
    # (SSH drop, disk full, Ctrl+C), a retry here would otherwise regenerate
    # a fresh DB_PASSWORD while leaving the already-existing role on its old
    # one — silently writing a DATABASE_URL into .env that can never
    # authenticate. Always (re)setting the password to match what's about to
    # be written below makes this convergent regardless of role history.
    sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'personalweb') THEN
      CREATE USER personalweb WITH PASSWORD '$DB_PASSWORD';
   ELSE
      ALTER USER personalweb WITH PASSWORD '$DB_PASSWORD';
   END IF;
END
\$\$;
SQL
    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'personal_website'" | grep -q 1 || \
        sudo -u postgres psql -c "CREATE DATABASE personal_website OWNER personalweb;"

    SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
    # Replicates Fernet.generate_key()'s exact output format (urlsafe_b64encode
    # of 32 random bytes) without needing the `cryptography` package installed
    # system-wide just for this one call.
    ENCRYPTION_KEY="$(python3 -c 'import os, base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())')"

    cat > "$DATA_DIR/.env" <<EOF
DATABASE_URL=postgresql://personalweb:${DB_PASSWORD}@localhost:5432/personal_website
FLASK_ENV=production
SECRET_KEY=${SECRET_KEY}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ENABLE_AI_DEMOS=true

# Fill in manually if you want these features enabled:
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=
GITHUB_MCP_TOKEN=
GITHUB_MCP_REPO=colinpetree/personal-website

VARNISH_PURGE_URL=http://127.0.0.1:6081
EOF
    echo "    Generated $DATA_DIR/.env (DATABASE_URL/SECRET_KEY/ENCRYPTION_KEY set automatically)."
fi

echo "==> 7. Domain (used for both the TLS cert and the admin panel)"
DOMAIN="$DOMAIN_ARG"
if [ -z "$DOMAIN" ] && [ -t 0 ]; then
    read -rp "==> Domain this site will be served from (e.g. example.com, blank to skip for now): " DOMAIN
fi
if [ -n "$DOMAIN" ]; then
    echo -n "$DOMAIN" > "$DATA_DIR/certbot_domain.txt"
    echo "    Wrote $DATA_DIR/certbot_domain.txt — install.sh will pick this up automatically."
else
    touch -a "$DATA_DIR/certbot_domain.txt"
    echo "    No domain provided — set one later via install.sh --domain or the admin panel."
fi

echo "==> 8. Fixing ownership"
chown -R personalweb:personalweb "$DATA_DIR"

echo ""
echo "=========================================================================="
echo " Bootstrap complete."
echo ""
echo " Next steps:"
echo "   1. Get a release tarball onto this box (scp from your build box, or"
echo "      gh release download)."
echo "   2. sudo bash install.sh personal-website-vX.Y.Z.tar.gz"
echo "      No .env editing, no domain prompt, no admin setup needed — all"
echo "      handled automatically from here."
echo "   3. Log in at https://<domain>/admin with admin@example.com / admin"
echo "      and change the password immediately via your profile menu."
echo "=========================================================================="
