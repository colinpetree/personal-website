# Backups and health monitoring

## Backups

`deploy/scripts/backup.sh` runs nightly (03:00 UTC, `personal-website-backup.timer`) as the `personalweb` user:

1. `pg_dump --format=custom` the database (from `DATABASE_URL` in `$DATA_DIR/.env`), gzipped, to `$DATA_DIR/backups/pg/`.
2. `tar czf` the entire `$DATA_DIR` (uploads, `.env`, `certbot_domain.txt`, etc. — everything needed to actually restore a working site, not just the DB) to `$DATA_DIR/backups/data/`.
3. Prunes local copies older than `BACKUP_RETENTION_DAYS` (default 14).
4. `rsync`s the whole `backups/` directory to the Pi build box over SSH (key-based, set up once via `setup-backup-ssh.sh`).

Silent on success. On any failure (bad `DATABASE_URL`, `pg_dump`/`tar` error, SSH/rsync failure, or missing config), it emails the site's configured `forward_email` via the existing watcher-alert path (`source=backup`) — same mechanism already used for gh-outage and deploy-report emails, see `backend/watcher_alerts.py`.

### One-time setup

1. `sudo bash deploy/scripts/setup-backup-ssh.sh` on the production server — generates an SSH keypair under `$DATA_DIR/.ssh/` and prints the public key.
2. Add that public key to the Pi's `~/.ssh/authorized_keys` (ideally restricted to `rsync --server` only, per the script's printed instructions).
3. Set `BACKUP_REMOTE_HOST` / `BACKUP_REMOTE_USER` / `BACKUP_REMOTE_PATH` in `$DATA_DIR/.env`.
4. Test manually as `personalweb`: `sudo -u personalweb bash /opt/personal-website/current/deploy/backup.sh` and confirm files land on the Pi.
5. `sudo systemctl enable --now personal-website-backup.timer`.

### Restoring from a backup

Deliberately manual, not scripted — a restore is rare and destructive enough that it should always be a deliberate, supervised action.

```bash
# Database (drop-and-recreate the schema first if restoring onto an existing DB):
gunzip -c personal_website-<date>.sql.gz | pg_restore --clean --if-exists -d "$DATABASE_URL"

# App data directory (uploads, .env, certbot_domain.txt, etc.):
tar xzf data-<date>.tar.gz -C /opt/personal-website/data
```

After restoring `.env`, restart the service: `sudo systemctl restart personal-website`.

## Health monitoring (crash-loop / disk / Certbot)

`deploy/scripts/health-watch.sh` runs every 15 minutes (`personal-website-healthwatch.timer`) and checks three things, each debounced to at most one alert per day (a marker file under `$DATA_DIR/monitoring/`, cleared automatically once the condition clears):

- **Crash-loop** — `systemctl is-failed personal-website.service`. Fires once systemd's own restart limit (default: 5 restarts/10s) has already been hit and the service has stopped retrying on its own.
- **Disk usage** — `df` on `/` and on `$DATA_DIR`, alerting above `BACKUP_DISK_ALERT_PERCENT` (default 85%).
- **Certbot expiry** — reads the live certificate's expiry date directly (`openssl x509 -enddate`) and alerts if fewer than `CERT_ALERT_DAYS` (default 14) remain, which would mean `certbot.timer` has silently stopped renewing.

Alerts use the same watcher-alert email path as backups, with `source` set to `crash-loop` / `disk` / `certbot` so the subject line identifies which subsystem is complaining.

### One-time setup

`sudo systemctl enable --now personal-website-healthwatch.timer` — no other configuration required (it reads the same `.env` as everything else). Optionally tune `BACKUP_DISK_ALERT_PERCENT` / `CERT_ALERT_DAYS` in `$DATA_DIR/.env`.

### Alert delivery and the database dependency

All watcher alerts (backup failure, crash-loop, disk, certbot, and the pre-existing gh-outage checks) normally send mail through the site's own Mailgun settings, read from `SiteConfig` in Postgres. That's a real gap for the crash-loop check specifically — if the database itself is down, the alert meant to report "the app is down" can fail to send for the same reason. `backend/watcher_alerts.py` falls back to a second, database-independent send path if `WATCHER_ALERT_FALLBACK_MAILGUN_API_KEY` / `_MAILGUN_DOMAIN` / `_FROM_EMAIL` / `_TO_EMAIL` are set in `$DATA_DIR/.env` (see `.env.example`) — plain, unencrypted values, deliberately not read from the database. Setting these is optional but recommended precisely because it's the one alert most likely to matter during a real database outage.

Note: if `journalctl -u personal-website` returns nothing in a crash-loop alert email (rather than the intended 20-line log tail), add `personalweb` to the `systemd-journal` group (`usermod -aG systemd-journal personalweb`) so it can read another service's journal.

## Orphan media cleanup

Deleting a blog post/project, or editing one to remove an image, never deletes the underlying uploaded file — nothing in this codebase does that on its own, so `backend/uploads` grows unbounded forever otherwise. `deploy/scripts/media-cleanup.sh` runs daily at 04:00 UTC (`personal-website-media-cleanup.timer`, one hour after the backup timer — so each day's backup always captures the uploads directory before that day's cleanup runs) and reclaims that space safely.

**How it decides what's safe to delete**: every run rescans, from scratch, every place an uploaded filename can be referenced — `SiteConfig.favicon_filename`, `AdminAccount`/`User`/`SiteEventLog` avatar fields, `Project.image_filename`, `BlogPost.thumbnail_filename`, and the actual HTML of `BlogPost.content_html` **and** all seven `SiteConfig.*_text` page-content fields (every image/video/audio/file/gallery/header-background reference the Lexical editor can produce). Every `BlogPost` is scanned regardless of `status` — a draft's media is exactly as real a reference as a published post's. Any referenced `{base}.webp` also protects its `_400w`/`_800w`/`_1200w` responsive variants, since several upload paths (avatars, thumbnails, project images, favicons) never literally reference those variants anywhere even though they exist on disk. `favicon.ico` is always exempt by name.

**Grace period, not instant deletion**: a file that looks unreferenced isn't deleted on the spot — it's recorded as a candidate (with a timestamp, in `$DATA_DIR/orphan-media-state.json`) and only actually removed once continuously unreferenced for `ORPHAN_MEDIA_GRACE_DAYS` (default 7). If it becomes referenced again before then — a recreated post, a restored image — its candidacy is cancelled immediately, no questions asked. This is deliberately shorter than `BACKUP_RETENTION_DAYS` (14 by default), so every file this job ever actually deletes is still recoverable from a backup snapshot for a while after deletion too — there is no automated "undo" for a deleted post/project in this codebase otherwise (confirmed: no soft-delete/trash, only Lexical's in-editor undo, which only matters for a few seconds before an autosave/save commits).

**Circuit breaker**: if a single run would newly flag *or* actually delete more than `ORPHAN_MEDIA_MAX_PER_RUN` (default 20) files, it aborts and changes nothing — no flags, no deletions — and sends a watcher alert (`source=media-cleanup`) instead. This exists because the grace period and backup overlap only help you *recover* from a bad run caused by a scanning bug; they don't stop one from happening. A real bug that made the reference scan return an incomplete set would otherwise look, from this job's point of view, like the entire media library became orphaned at once. Ordinary nightly cleanup should be in the 0-3 file range — anything near the cap is itself the signal to investigate with a manual dry run before raising it.

### One-time setup

`sudo systemctl enable --now personal-website-media-cleanup.timer` — no other configuration required. Optionally tune `ORPHAN_MEDIA_GRACE_DAYS` / `ORPHAN_MEDIA_MAX_PER_RUN` in `$DATA_DIR/.env`.

### Manual dry run

Preview what a run would do without touching disk or state:
```bash
sudo -u personalweb bash -c 'cd /opt/personal-website/current/backend && set -a && source /opt/personal-website/data/.env && set +a && APP_DATA_DIR=/opt/personal-website/data ./server --cleanup-orphan-media --dry-run'
```
