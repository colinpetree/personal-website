#!/usr/bin/env bash
# Run ONCE on the production server (as root, e.g. `sudo bash setup-backup-ssh.sh`)
# to provision the SSH keypair deploy/scripts/backup.sh uses to rsync nightly
# backups to the Pi build box. Prints the public key for you to add to the
# Pi's ~/.ssh/authorized_keys, restricted to rsync only — this key can push
# backup files and nothing else.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "Run as root (sudo bash setup-backup-ssh.sh) — it writes under $DATA_DIR, owned by personalweb."
    exit 1
fi

DATA_DIR="/opt/personal-website/data"
SSH_DIR="$DATA_DIR/.ssh"
KEY_FILE="$SSH_DIR/id_ed25519"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [ -f "$KEY_FILE" ]; then
    echo "==> Key already exists at $KEY_FILE — not regenerating."
else
    echo "==> Generating a new ed25519 keypair (no passphrase — this runs unattended nightly)"
    ssh-keygen -t ed25519 -f "$KEY_FILE" -N "" -C "personal-website-backup"
fi

chown -R personalweb:personalweb "$SSH_DIR"
chmod 600 "$KEY_FILE"
chmod 644 "$KEY_FILE.pub"

echo ""
echo "=========================================================================="
echo " 1. Add this public key to the Pi's authorized_keys, restricted to rsync"
echo "    only (paste as ONE line into ~/.ssh/authorized_keys on the Pi, under"
echo "    the user backups should land under):"
echo ""
echo "restrict,command=\"rsync --server -logDtprze.iLsfxC . $DATA_DIR/backups placeholder\" $(cat "$KEY_FILE.pub")"
echo ""
echo "    NOTE: the command= value above must match the actual destination path"
echo "    you set for BACKUP_REMOTE_PATH — replace 'placeholder' with that same"
echo "    path (rsync's forced command re-validates the path it's invoked with)."
echo "    If restricting by forced command feels too fragile to keep in sync,"
echo "    a plain (unrestricted) authorized_keys entry — just the key with no"
echo "    command= prefix — is an acceptable, simpler alternative."
echo ""
echo " 2. Set these in $DATA_DIR/.env:"
echo "      BACKUP_REMOTE_HOST=<the Pi's hostname or IP>"
echo "      BACKUP_REMOTE_USER=<the Pi user backups land under>"
echo "      BACKUP_REMOTE_PATH=<absolute path on the Pi, matching step 1>"
echo ""
echo " 3. Test connectivity as the personalweb user:"
echo "      sudo -u personalweb ssh -i $KEY_FILE -o StrictHostKeyChecking=accept-new <user>@<host> true"
echo "=========================================================================="
