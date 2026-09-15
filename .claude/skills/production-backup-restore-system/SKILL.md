---
name: production-backup-restore-system
description: How the nightly Postgres/uploads backup pipeline and the on-demand disaster-recovery restore scripts work, the files involved on each machine, and the data flow between the build box ("the Pi") and a production/test server. Invoke whenever testing, debugging, or extending backup.sh, backup-pull.sh, backup-status.sh, restore.sh, restore-remote.sh, setup-restic-repo.sh, setup-backup-pull-pi.sh, personal-website-backup.timer/.service, personal-website-backup-pull.timer/.service, personal-website-media-cleanup.timer/.service, or anything under "backup"/"restore"/"restic"/"disaster recovery" in this project. Covers how to run a real restore drill and interpret the logs on both machines.
---

# Production Backup and Restore System

Two independent but connected systems live under `deploy/scripts/`:

1. **Ongoing backup** (`backup.sh` -> `backup-pull.sh` -> `backup-status.sh`): runs on its own schedule, no human involvement on a healthy day. Silent on success, emails on failure.
2. **On-demand restore** (`restore.sh` + `restore-remote.sh`): deliberately manual, run by a human during an actual incident or a drill. Both were built and validated end to end against a real server in this project's own testing history; see "What has actually been verified" below.

## Important: "the Pi" is a role, not a specific device

Throughout this project's scripts, comments, and docs, "the Pi" refers to **whichever machine is set up as the build box**: the one that checks out this git repo, runs `build-on-pi.sh`/`publish-release.sh`, holds a `gh`-authenticated CLI, and stores the SSH keys used to reach production/test servers. In this project's own setup that happens to be a physical Raspberry Pi, which is why the name stuck, but nothing about the backup or restore system requires actual Raspberry Pi hardware. It could just as easily be a small cloud VM, a spare desktop, or any other always-on machine you control. If you're setting this up fresh, read "the Pi" everywhere in this skill (and in `deploy/BACKUP.md`) as "the build box," full stop.

The one property that actually matters is **network reachability, not hardware**: the build box must be able to open an outbound SSH connection to the production/test server, and the production/test server must never need to reach back the other way. In this project's own deployment that constraint comes from the Pi sitting on a residential/university network with no port-forwarding and a rotating public IP, but the same one-way design is the right call for any build box that isn't guaranteed a stable, externally-reachable address.

## Component inventory

| File | Runs where | Role |
|---|---|---|
| `deploy/scripts/backup.sh` | Production/target server, nightly via `personal-website-backup.timer`, as `personalweb` | `pg_dump` + `restic backup` (uploads, the dump, `.env`, `certbot_domain.txt`) into a local restic repository at `$DATA_DIR/restic-repo`, then `restic forget --keep-daily 14 --prune`. Silent on success; emails via the watcher-alert path on any failure. |
| `deploy/scripts/backup-pull.sh` | The build box, nightly via a `systemctl --user` timer (`personal-website-backup-pull.timer`) | `rsync` **pulls** production's restic repo down to a local mirror (`~/personal-website-backups` by convention), using a dedicated read-only-restricted SSH key, then verifies a fresh snapshot actually landed via `restic snapshots`. Alerts via an HTTP POST to production's `/api/watcher-alert` on failure (the build box has no direct Mailgun access of its own). |
| `deploy/scripts/backup-status.sh` | The build box, manual | Read-only: prints the local mirror's snapshot list and repo size (deduplicated and raw), for eyeballing between silent nightly runs. |
| `deploy/scripts/setup-restic-repo.sh` | Production/target server, once | Generates `RESTIC_PASSWORD`, appends it to `$DATA_DIR/.env`, runs `restic init`. |
| `deploy/scripts/setup-backup-pull-pi.sh` | The build box, once | Generates the dedicated, restricted SSH keypair for pulling, writes pull config into `~/.personal-website-build.env`, installs the pull timer. Prints an `authorized_keys` line to paste onto production. |
| `deploy/scripts/restore.sh` | **The target server itself** (production or test), as root, on demand | The actual restore logic: restic-restores the DB dump/uploads/secrets from a local restic repo, merges secrets into `.env`, `pg_restore`s the database, restores uploads, then downloads and installs the latest GitHub release. Reusable standalone for the common "same box, DB/app wiped, `.env` survived" case. |
| `deploy/scripts/restore-remote.sh` | **The build box**, on demand | Orchestrator only, for a genuinely from-scratch target. Since the target can never reach the build box, this script pushes the build box's backup mirror *to* the target over SSH, then remotely invokes `restore.sh` there. Does none of the actual restoring itself. |
| `deploy/systemd/personal-website-media-cleanup.service`/`.timer` | Production/target server, daily | Not backup/restore itself, but scheduled with backup timing in mind: runs after `backup.sh`'s worst-case completion time so a day's backup always captures uploads before that day's orphan-cleanup can delete anything. See "Scheduling relationships" below. |

## Data flow, end to end

```
Production / target server                          Build box ("the Pi" - a role, not
(colinpetree.com, test633.org, ...)                   a specific device - see above)

  backup.sh (nightly, personalweb)
    pg_dump --format=custom
    restic backup (uploads, dump, .env,
      certbot_domain.txt)
    -> $DATA_DIR/restic-repo
        |
        |  rsync PULL, initiated BY the build
        |  box (production can never reach the
        `----------------------------------->   backup-pull.sh (nightly, systemd --user)
                                                    -> ~/personal-website-backups
                                                  backup-status.sh (manual, read-only)

======================================== disaster ========================================

  restore.sh (root, on demand)              <-----.
    stop app                                       |  restore-remote.sh pushes the mirror
    restic restore (DB dump, uploads, .env)        |  to the target over SSH (again, the
    merge secrets into .env, keep DATABASE_URL     |  build box reaches out; the target
    pg_restore                                     |  never needs to reach back), then
    restore uploads                                |  scp's restore.sh + a one-time
    relocate repo to $DATA_DIR/restic-repo         |  restic password file, then SSHes in
      (compares restic's own repository ID,        |  and runs restore.sh remotely with
       not just the path, before refusing to       |  --yes (confirmation already
       overwrite - see gotcha #1 below)            |  happened on the build box side)
    gh release download + install.sh               |
                                                    `---- restore-remote.sh (run by hand,
                                                          from the build box)
```

Same one-way constraint drives both halves: whichever machine can only ever be reached *from* the other, not reach out to it (the build box in this project's case), must always be the one that initiates. Backups flow build-box-pulls-from-production; a from-scratch restore flows build-box-pushes-to-target. If your own build box's network situation is reversed (a stable server, a rotating-IP target instead), flip which side pulls and which pushes, but keep the reachable side as the one always dialing out.

## Restore: two invocation shapes

**Same box, DB/app wiped, `.env` and restic repo still local** (e.g. after deliberately resetting a test server, or a partial failure that didn't destroy the whole instance): run `restore.sh` directly on that box.

```bash
sudo bash restore.sh
```

`--releases-repo` is optional: it defaults to `UPDATE_WATCH_RELEASES_REPO` from the installed updater unit if present, else derives `personal-website-dist-<domain>` from the box's own `certbot_domain.txt` (the same convention `publish-release.sh` uses on the build box), printing which of the two it used.

**Catastrophic outage, a brand-new instance, nothing local survived**: after `bootstrap.sh` and `gh auth login` are done on the new box, run `restore-remote.sh` **on the build box**:

```bash
bash restore-remote.sh --target-user ubuntu --target-host <new-host> --ssh-key ~/aws-key.pem
```

It preflight-checks the local mirror's health, the target's reachability/bootstrap state, and `gh auth status` on the target before pushing anything, then drives `restore.sh` there over SSH, streaming its output live.

### Safety gates in `restore.sh`

Two independent confirmations, deliberately different in what they guard against:

- **Plain `yes` prompt**: skippable with `--yes`. Guards against running the script by accident with no thought at all.
- **Domain-typing gate**: fires only if the target's app is currently up and answering `/api/site-config`. Requires typing the box's own domain (read from `certbot_domain.txt`), not an arbitrary word, the same "type the resource name to confirm" pattern GitHub/Heroku use for deleting a repo/app. **Cannot be skipped by `--yes`**, only by an explicit `--force`, specifically because `restore-remote.sh` always passes `--yes` to the remote invocation (there's no one at that terminal to answer a prompt). If `--yes` alone could bypass this gate too, the one scenario it exists for (a mistyped `--target-host` on the build box, pointed at a live site by accident) would sail straight through undetected.

## Known gotchas, found during real testing

These were real bugs hit while actually running a restore drill against a live server, not just reasoned through, worth knowing before re-diagnosing them from scratch:

1. **A pushed copy of a box's own backup looks like a conflicting repository if you only compare paths.** `restore-remote.sh` pushes the build box's mirror to a throwaway path (`~/restic-repo`) on the target; if the target already has its own repo at the canonical `$DATA_DIR/restic-repo` (true for any box that already runs its own nightly `backup.sh`), a naive "does this path already exist" check refuses to relocate, even when the two are byte-for-byte the same repository. Fixed by comparing restic's own permanent repository ID (`restic cat config`, set once at `restic init`) instead of the filesystem path: only a genuinely *different* repository ID still triggers the safe refusal.
2. **f-strings with backslash-escaped quotes inside `{...}` are a syntax error on Python older than 3.12.** PEP 701 lifted this restriction in 3.12; production's Ubuntu 24.04 ships 3.12 so this can hide there, but an older build box's `python3` will throw `SyntaxError: unexpected character after line continuation character` on something like `f"{s[\"time\"]}"`. Assign plain variables outside the f-string instead of indexing inside `{...}`.
3. **`restic snapshots --last` is deprecated in favor of `--latest 1`.** Both scripts use `--latest 1` now; the deprecation warning only surfaces if you run the older flag without redirecting stderr, so it can go unnoticed inside a script that suppresses it.
4. **`journalctl -u personal-website` returns nothing for a non-root user, even a same-owning-user one.** The intuitive fix (add `personalweb` to the `systemd-journal` group) works but widens what the app's *own* service account can read to every unit's journal on the box, not just its own, a real blast-radius increase if the app process itself is ever compromised, since `personalweb` is what gunicorn runs as. The better fix, used here: run the log-reading service (`personal-website-healthwatch.service`) as root instead, matching the precedent `personal-website-updater.service` already sets for its own `--send-watcher-alert` call.
5. **A service with no restart burst limit never reaches `failed`, silently defeating any monitoring that checks `systemctl is-failed`.** `personal-website.service`'s `Restart=on-failure` with no `StartLimitBurst` (intentional, so a brief local-DB blip self-heals with no manual restart) means it retries forever instead of ever landing in `failed` state. `health-watch.sh`'s crash-loop check was rewritten to probe the app's own HTTP endpoint directly (3 attempts, up to ~70s) instead of relying on unit state, so a brief blip still self-heals silently while a sustained outage still alerts.
6. **`install.sh`'s automatic rollback-on-failed-health-check can pair old code with a newer database schema.** If `restore.sh` restores data and installs a release whose migrations run before a failed health check triggers `install.sh`'s own rollback to an older release, that older code is left running against a schema it was never written for. `restore.sh` detects this specific case (by checking whether `current` now points somewhere other than the tag it tried to install) and re-restores the pre-migration dump so the rolled-back code gets data matching the schema it actually expects.

## Scheduling relationships worth knowing

- `personal-website-backup.timer` (03:00 UTC) always fires before `personal-website-backup-pull.timer` on the build box (05:30 UTC): enough margin past production's own systemd unit's `TimeoutStartSec` ceiling, not just the sum of `backup.sh`'s individual step timeouts.
- `personal-website-media-cleanup.timer` (05:00 UTC) runs after `backup.sh`'s realistic worst-case completion (~04:40 UTC, computed from `backup.timer`'s own randomized delay plus each step's timeout), so a day's backup always captures the uploads directory before that day's cleanup can delete anything from it, same-day retention safety, not a coincidence.
- Retention (`--keep-daily 14`) means at most one snapshot survives per calendar day. Running a manual backup on top of that day's automatic one doesn't create two snapshots long-term: the prune step keeps only the most recent same-day snapshot.

## What has actually been verified

Both `restore.sh` and `restore-remote.sh` have been run for real against a live test server (not just written and reasoned through), including the full Pi-driven push path, the domain-confirmation gate, and the repository-ID fix. The crash-loop self-heal-plus-alert behavior has also been verified live: Postgres stopped, the app confirmed to self-heal via infinite restart with zero manual intervention, and the alert confirmed to fire via the database-independent fallback Mailgun path with an accurate message and a populated log tail. See `deploy/BACKUP.md` for the authoritative, always-current description of each script's flags and behavior; this skill is the practical map of how the pieces fit together and what's already been learned the hard way.

## Testing locally, before touching real hardware

There's no automated test suite for these scripts. The realistic way to exercise them without a live incident:

1. **Same-box case**: on a test server, deliberately reset it (stop the app, `DROP`/`CREATE DATABASE`, clear `releases/` and `current`, leave `.env` and the restic repo alone), then run `restore.sh` there directly.
2. **From-scratch case**: provision a genuinely fresh instance, `bootstrap.sh` it, confirm `gh auth login`, then run `restore-remote.sh` from the build box pointed at it.
3. **Manual backup trigger**, useful before either drill so you're restoring from a fresh, known snapshot rather than waiting for the next scheduled run: `sudo systemctl start personal-website-backup` on the target, then `bash backup-pull.sh` (or `systemctl --user start personal-website-backup-pull`) on the build box.

## Getting logs

On the target server:
```bash
sudo journalctl -u personal-website-backup -n 50 --no-pager
sudo journalctl -u personal-website-backup --since "today" --no-pager
```

On the build box:
```bash
bash deploy/scripts/backup-status.sh   # snapshot list + repo size, read-only
```

`restore.sh`'s own output is self-contained (it prints its full info banner, every step, and a summary) whether run directly or streamed live through `restore-remote.sh` over SSH: there's no separate log file to go hunting for after the fact beyond whatever terminal captured the run.
