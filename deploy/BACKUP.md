# Backups and health monitoring

## Backups

Backups are **pulled by the Pi**, not pushed by production — production has
no stable route to reach the Pi (no port-forwarding, a rotating public IP on
university WiFi), whereas production itself has a stable domain and SSH
already open. So production only ever produces backups locally; the Pi
initiates the connection to go get them, on its own schedule.

The mechanism is [restic](https://restic.net) (a deduplicating,
content-addressed backup tool — conceptually like git's object store:
unchanged content across snapshots is never stored twice, but every
snapshot is still a full, independent point-in-time restore target). This
matters a lot in practice: the previous design did a fresh full `tar` of the
entire uploads directory every night and kept `BACKUP_RETENTION_DAYS` of
them side by side — at ~10GB of uploads and 14 days retention that's
~140GB, which doesn't fit on either box (`test633.org` has a 16GB disk; the
Pi has a 50GB SD card). restic's dedup means 14 days of retention on a
mostly-static media library costs close to 1x its size, not 14x.

**Production** (`deploy/scripts/backup.sh`, runs nightly at 03:00 UTC via
`personal-website-backup.timer`, as the `personalweb` user):

1. `pg_dump --format=custom` the database (from `DATABASE_URL` in
   `$DATA_DIR/.env`), gzipped, to a single rotating file at
   `$DATA_DIR/backups/pg/personal_website.sql.gz` (not date-stamped — restic's
   own snapshot history is what provides point-in-time retention now).
2. `restic backup` that dump file plus `$DATA_DIR/uploads`, `.env`, and
   `certbot_domain.txt` into the local repository at
   `$DATA_DIR/restic-repo`.
3. `restic forget --keep-daily $BACKUP_RETENTION_DAYS --prune` (default 14)
   to expire old snapshots and reclaim their now-unreferenced chunks.

Silent on success. On failure (bad `DATABASE_URL`, missing
`RESTIC_PASSWORD`, `pg_dump`/`restic` error), it emails the site's
configured `forward_email` via the existing watcher-alert path
(`source=backup`) — same mechanism already used for gh-outage and
deploy-report emails, see `backend/watcher_alerts.py`. Debounced to at most
one email per 24h **per error type** (same marker-file-per-condition
pattern as `health-watch.sh`'s independent crash-loop/disk/certbot checks,
under `$DATA_DIR/monitoring/`) — repeatedly hitting the *same* problem
(retried manually while diagnosing something, or the timer failing the
same way again the next night) sends exactly one email, not one per
attempt, while a *different* problem showing up shortly after still gets
its own fresh email rather than being masked by an unrelated marker. Every
marker clears on the next fully successful run.

**Pi** (`deploy/scripts/backup-pull.sh`, runs nightly at 05:30 UTC — after
production's true worst-case completion time (its systemd unit's own
`TimeoutStartSec=7200` ceiling, not just the sum of the script's individual
step timeouts) — via the systemd `--user` timer
`personal-website-backup-pull.timer`):

1. `rsync`s `$DATA_DIR/restic-repo/` from production down to a local mirror
   directory, using a dedicated, read-only-restricted SSH key (see setup
   below). Since restic repo files are immutable and content-addressed, this
   rsync is itself incremental — only genuinely new/changed chunks transfer
   each night.
2. Runs `restic snapshots --last` against the freshly-pulled local copy to
   confirm today's snapshot is actually present — a real content check, not
   just "the file transfer's exit code was 0."

Also silent on success. On either the rsync or the snapshot check failing,
it POSTs an alert directly to production's `/api/watcher-alert` route
(the Pi has no local Mailgun credentials of its own) — the same
pre-shared-secret HTTP mechanism `content-watch.sh` already uses for its own
gh-outage alerts, source `backup`.

Both failure paths funnel into the same alert `source=backup`, since
they're one subsystem from the recipient's point of view — the alert
message text says which stage (production's dump, or the Pi's pull) failed.

### One-time setup

1. On **production**: `sudo bash /opt/personal-website/current/deploy/setup-restic-repo.sh`
   (note: no `scripts/` in the path — production releases ship scripts
   flattened directly under `deploy/`, unlike the git repo layout) —
   generates `RESTIC_PASSWORD`, appends it to `$DATA_DIR/.env`, and runs
   `restic init` on `$DATA_DIR/restic-repo`. Prints the password back out —
   you'll need it again in step 2.
2. On the **Pi**: `bash deploy/scripts/setup-backup-pull-pi.sh
   --production-host <address> --restic-password <password from step 1>`
   — generates a fresh, dedicated SSH keypair (never reuse an admin/deploy
   key for this — an unattended job on a less-trusted network device
   should hold nothing more powerful than "read this one directory"),
   writes the pull config into `~/.personal-website-build.env`, and
   installs + enables `personal-website-backup-pull.timer`. Prints an
   `authorized_keys` line to paste onto production.
   `--production-host` must be an address SSH can reach directly — if the
   domain is proxied through something like Cloudflare, its public DNS
   resolves to the proxy's IPs, which only forward HTTP/HTTPS, not SSH's
   port 22. Use the server's AWS-assigned public DNS name instead (or an
   Elastic IP, or an unproxied "DNS only" subdomain), not the proxied
   domain itself.
3. On **production**: paste that printed line into `personalweb`'s
   `authorized_keys` — at `/opt/personal-website/data/.ssh/authorized_keys`
   (that's `personalweb`'s actual home directory, set by `bootstrap.sh`;
   avoid `~` in a `sudo -u personalweb` one-liner, since it expands in the
   invoking shell's context, not the target user's):
   ```bash
   sudo -u personalweb bash -c 'mkdir -p /opt/personal-website/data/.ssh && chmod 700 /opt/personal-website/data/.ssh && cat >> /opt/personal-website/data/.ssh/authorized_keys' <<'EOF'
   <paste the restrict,command="..." line here>
   EOF
   sudo -u personalweb chmod 600 /opt/personal-website/data/.ssh/authorized_keys
   ```
   Create the file / fix permissions to `600` if it doesn't already exist.
   The line's `command="rsync --server --sender ..."` restriction means
   this key can only ever *read* the repo directory — it cannot write to
   production even if the Pi were compromised and the key leaked.
4. On **production**: produce a first snapshot by running the actual
   service (not a bare `sudo bash backup.sh`, which would run as root and
   leave the new files root-owned — unreadable by the Pi's key and
   unwritable by the next `personalweb`-run backup):
   `sudo systemctl start personal-website-backup`.
5. Test the pull manually from the Pi:
   `bash deploy/scripts/backup-pull.sh` (or, once installed,
   `systemctl --user start personal-website-backup-pull`) and confirm
   `restic -r <local mirror dir> snapshots` shows today's snapshot.
6. On **production**: `sudo systemctl enable --now personal-website-backup.timer`.

### Restoring from a backup

Two scripts automate the common restore paths. **Written and syntax-checked
(`bash -n`) but not yet run end-to-end against a real server** — dry-run one
of them against a disposable test box before trusting either during a real
incident:

- **Same box, DB/app wiped, `.env` intact** (e.g. after deliberately
  resetting a test server per the reset recipe above): run
  `deploy/scripts/restore.sh` directly on that box —
  `sudo bash restore.sh --releases-repo <owner>/<dist-repo>`. It restores
  the latest local snapshot's database and uploads, then installs the
  latest release.
- **Catastrophic outage — a brand-new EC2 instance, nothing local
  survived**: production can never reach the Pi (see above), so the Pi has
  to push instead of the target pulling. After `bootstrap.sh` and
  `gh auth login` are done on the new box, run `deploy/scripts/restore-remote.sh`
  **on the Pi**: `bash restore-remote.sh --target-user ubuntu --target-host
  <new-host> --ssh-key ~/aws-key.pem`. It pushes the Pi's backup mirror to
  the new box and remotely runs `restore.sh` there.

Both scripts print a full explanation of what they're about to do — and
require typing `yes` to confirm — before touching anything, and merge the
restored `.env`'s secrets (critically, `ENCRYPTION_KEY` — without it,
restored `SiteConfig` secrets like Mailgun/Stripe/Google OAuth keys are
undecryptable garbage) into the target's own `.env` without touching that
box's own `DATABASE_URL`. A successful from-scratch restore also relocates
the pushed repo into `$DATA_DIR/restic-repo`, so the very next scheduled
`personal-website-backup.timer` run continues the same backup lineage with
no extra setup.

Before touching anything, `restore.sh` also confirms the snapshot actually
has everything a restore needs (the DB dump, `.env`, and `uploads/` — the
same paths `backup.sh` backs up) and checks whether the box's own site is
currently up and answering health checks. If it is, a second gate kicks in:
typing `yes` alone is **not** enough — it requires typing `DESTROY` (this
can't be skipped with `--yes`, only with an explicit `--force`), specifically
to catch a mistyped `--target-host` on the Pi pointing this at a live site
by accident. If `install.sh`'s own post-install health check fails and it
rolls back to an older release, `restore.sh` also re-restores the
pre-migration dump so that older code isn't left running against a newer
release's schema changes.

The manual command sequence below is what both scripts automate — useful
as a reference for what's actually happening, or to restore by hand if
something about a given situation doesn't fit the scripts:

```bash
# Restore the latest snapshot's files (run against either production's own
# repo, or the Pi's mirrored copy if production itself is lost):
restic -r <repo-path> restore latest --target /tmp/restore

# Database (drop-and-recreate the schema first if restoring onto an existing DB):
gunzip -c /tmp/restore/opt/personal-website/data/backups/pg/personal_website.sql.gz \
    | pg_restore --clean --if-exists -d "$DATABASE_URL"

# App data directory (uploads, .env, certbot_domain.txt, etc.) — copy the
# restored files back into place:
cp -r /tmp/restore/opt/personal-website/data/uploads /opt/personal-website/data/
cp /tmp/restore/opt/personal-website/data/.env /opt/personal-website/data/.env
cp /tmp/restore/opt/personal-website/data/certbot_domain.txt /opt/personal-website/data/
```

`restic restore` needs `RESTIC_PASSWORD` set in its environment (or pass
`--password-file`) — it's in production's `$DATA_DIR/.env`, and was also
copied into the Pi's `~/.personal-website-build.env` during setup so a
restore is possible even if production itself is gone.

After restoring `.env`, restart the service: `sudo systemctl restart personal-website`.

## Health monitoring (crash-loop / disk / Certbot)

`deploy/scripts/health-watch.sh` runs every 15 minutes (`personal-website-healthwatch.timer`) and checks three things, each debounced to at most one alert per day (a marker file under `$DATA_DIR/monitoring/`, cleared automatically once the condition clears):

- **Crash-loop / DB reachability** — `personal-website.service` retries forever with no restart burst limit (`StartLimitIntervalSec=0`), so it self-heals on its own the instant a brief local-DB outage clears, and deliberately never reaches systemd's "failed" state. So instead of `systemctl is-failed`, this check probes the app directly (`curl http://127.0.0.1:$BACKEND_PORT/api/site-config`, the same request `install.sh`'s own post-deploy health check uses), retrying 3 times (up to ~70s total, since each attempt can itself take up to 10s before the 20s gap) before alerting — a brief blip self-heals silently; only a sustained outage triggers the alert.
- **Disk usage** — `df` on `/` and on `$DATA_DIR`, alerting above `BACKUP_DISK_ALERT_PERCENT` (default 85%).
- **Certbot expiry** — reads the live certificate's expiry date directly (`openssl x509 -enddate`) and alerts if fewer than `CERT_ALERT_DAYS` (default 14) remain, which would mean `certbot.timer` has silently stopped renewing.

Alerts use the same watcher-alert email path as backups, with `source` set to `crash-loop` / `disk` / `certbot` so the subject line identifies which subsystem is complaining.

### One-time setup

`sudo systemctl enable --now personal-website-healthwatch.timer` — no other configuration required (it reads the same `.env` as everything else). Optionally tune `BACKUP_DISK_ALERT_PERCENT` / `CERT_ALERT_DAYS` in `$DATA_DIR/.env`.

### Alert delivery and the database dependency

All watcher alerts (backup failure, crash-loop, disk, certbot, and the pre-existing gh-outage checks) normally send mail through the site's own Mailgun settings, read from `SiteConfig` in Postgres. That's a real gap for the crash-loop check specifically — if the database itself is down, the alert meant to report "the app is down" can fail to send for the same reason. `backend/watcher_alerts.py` falls back to a second, database-independent send path if `WATCHER_ALERT_FALLBACK_MAILGUN_API_KEY` / `_MAILGUN_DOMAIN` / `_FROM_EMAIL` / `_TO_EMAIL` are set in `$DATA_DIR/.env` (see `.env.example`) — plain, unencrypted values, deliberately not read from the database. Setting these is optional but recommended precisely because it's the one alert most likely to matter during a real database outage.

Note: if `journalctl -u personal-website` returns nothing in a crash-loop alert email (rather than the intended 20-line log tail), add `personalweb` to the `systemd-journal` group (`usermod -aG systemd-journal personalweb`) so it can read another service's journal.

## Orphan media cleanup

Deleting a blog post/project, or editing one to remove an image, never deletes the underlying uploaded file — nothing in this codebase does that on its own, so `backend/uploads` grows unbounded forever otherwise. `deploy/scripts/media-cleanup.sh` runs daily at 05:00 UTC (`personal-website-media-cleanup.timer`, after the backup timer — so each day's backup always captures the uploads directory before that day's cleanup runs) and reclaims that space safely. That margin is sized against `backup.sh`'s actual worst case (pg_dump, restic backup, and restic forget/prune each carry their own 1800s timeout, on top of `backup.timer`'s own randomized delay — ~04:40 UTC absolute latest), not a round-number guess — see the timer file's own comment.

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
