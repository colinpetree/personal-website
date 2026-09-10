# Deployment instructions

Full setup for a brand-new production server plus the automated build,
release, update, and backup pipeline. Assumes you are SSH'd into **both**
machines already:

- **[Pi]** — your build machine (Raspberry Pi or similar), where `gh` auth
  and the git checkout live.
- **[Prod]** — the production/test server (AWS EC2 Ubuntu 24.04), e.g.
  `ubuntu@<domain-or-ip>`.

Steps are numbered in the order you need to run them. Anything not required
for a working site is marked **(Optional)** — skip those on a first pass and
come back later.

Replace every `<placeholder>` with your actual value. `<domain>` means your
site's real domain (e.g. `example.com`); `<pi-host>` means the Pi's
hostname/IP as reachable from wherever you're running `scp`/`ssh` from.

---

## 0. Prerequisites

**[Pi]** Assuming the Pi is running **Ubuntu 24.04** (Server or Desktop,
ARM64) — install the build toolchain:

```bash
sudo apt update
sudo apt install -y git curl build-essential python3 python3-pip python3-venv python3-dev libpq-dev
```
`build-essential`/`python3-dev`/`libpq-dev` are there so `pip install` can
compile `psycopg2-binary` (and PyInstaller's other native deps) from source
if a prebuilt ARM64 wheel isn't available for a given package version —
harmless if everything resolves to prebuilt wheels instead.

Node.js: Ubuntu 24.04's own `apt` repo ships an older Node than this
project wants, so install current LTS via NodeSource instead:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v   # confirm v20.x / a matching npm
```

**[Pi]** Clone the source repo (public — no authentication needed):
```bash
mkdir -p ~/src
git clone https://github.com/colinpetree/personal-website.git ~/src/personal-website
cd ~/src/personal-website
```

**(Optional) [Pi]** Authenticate `gh` — only needed once you get to the
auto-update pipeline (step 5) or want to publish releases as GitHub Releases
instead of `scp`-ing tarballs by hand:
```bash
gh auth login
```

---

## 1. [Pi] Build the first release

```bash
cd ~/src/personal-website
bash deploy/scripts/build-on-pi.sh
```
This produces a tarball (+ `.sha256`) somewhere under
`~/personal-website-build/` — its exact subdirectory name depends on build
config that isn't set yet at this point, so don't hardcode the path; step 2
locates it for you automatically.

---

## 2. [Pi] Transfer the bootstrap files to production

None of `bootstrap.sh`, the very first `install.sh` run, or
`setup-auto-update-production.sh` already exist on a fresh server, and none
of them ship inside a release tarball — they have to be copied over by hand
before anything else can run. This requires the Pi to already be able to
SSH into production with an admin key (e.g. `~/aws-key.pem`, per this
project's usual convention — the Pi needs that key present, or pass your
own with `--key`).

```bash
cd ~/src/personal-website
bash deploy/scripts/first-install-transfer.sh --host <domain-or-ip> --user <ssh-user>
```
This finds the tarball built in step 1 by matching it against this
checkout's `VERSION` file (rather than guessing its path) and `scp`s it,
its `.sha256`, and the three scripts above into the target user's home
directory on production.

---

## 3. [Prod] Bootstrap the server (once, on a fresh box)

```bash
sudo bash bootstrap.sh --domain <domain>
```
`--domain` is optional here (you can set it later via `install.sh --domain`
or the admin UI instead), but providing it now lets `install.sh` obtain the
TLS certificate automatically in the next step. `--no-ai` is also optional —
pass it if this site shouldn't enable the AI Implementations demo section.

This installs Postgres/nginx/Varnish/ufw/restic, creates the `personalweb`
system user, generates `$DATA_DIR/.env` with fresh secrets, and configures
the firewall. Safe to re-run if interrupted.

---

## 4. [Prod] Install

```bash
sudo bash install.sh personal-website-v<X.Y.Z>.tar.gz
```
(Use the exact filename `first-install-transfer.sh` printed — it also
prints this exact command as a reminder.) This runs migrations, seeds the
initial `Profile`/`SiteConfig`/admin account, installs and enables the main
`personal-website` service, and **automatically enables** two of the timers
described below (health-monitoring and orphan-media-cleanup — no setup
needed for those). It prints a one-time-generated admin password at the
end.

Log in to confirm the site works:
```
https://<domain>/admin
```
Use the printed `admin@example.com` password. Change it from the admin UI
once logged in.

---

## 5. (Optional but recommended) Auto-updates — hand future releases off to the server itself

Lets production pull and install new releases on its own, instead of you
re-running `install.sh` by hand every time. Needs a **releases repo** — a
separate, normally-private GitHub repo that holds built release tarballs
(different from the public source repo cloned in step 0). Convention used by
this project's own scripts: `<owner>/personal-website-dist-<domain>`.

**[Prod]** (this is the copy `first-install-transfer.sh` placed in your home
directory in step 2 — it isn't part of the release tarball):
```bash
sudo bash ~/setup-auto-update-production.sh --domain <domain>
```
This installs/authenticates `gh` as root, generates a `WATCHER_ALERT_SECRET`
(prints it — copy it for the next step), points the updater at the releases
repo, and enables `personal-website-updater`.

**[Pi]**
```bash
cd ~/src/personal-website
bash deploy/scripts/setup-auto-update-pi.sh \
    --site-url https://<domain> \
    --watcher-secret <secret printed above>
```
This installs/authenticates `gh`, stores the secret + site URL in
`~/.personal-website-build.env`, and enables the Pi's own
`personal-website-publisher` content-watcher (auto-republishes prerendered
content when you edit the site, no code push needed).

**[Pi] (essential if you want real prerendered builds, not just placeholders)**
Add the site's real base URL to the build config, used by the build step to
prerender pages against the live site:
```bash
echo "PRERENDER_BASE_URL=https://<domain>" >> ~/.personal-website-build.env
```

From here on, publishing a new release is just:
```bash
# [Pi]
cd ~/src/personal-website
bash deploy/scripts/publish-release.sh --patch   # or --minor / --major
```
`personal-website-updater` on production picks it up and installs it
automatically within its poll interval — no more manual `scp`/`install.sh`
needed for ordinary releases. (`rollback.sh vX.Y.Z` on production still
exists for a manual revert if a release misbehaves.)

---

## 6. (Optional but recommended) Nightly backups — Pi-pulled restic repository

Production dumps Postgres + backs up uploads into a local, deduplicated
restic repository every night; the Pi pulls a copy of that repository on its
own schedule (production has no route back into the Pi's network, so the
Pi always initiates).

**[Prod]** Initialize the repository:
```bash
sudo bash /opt/personal-website/current/deploy/setup-restic-repo.sh
```
Copy the `RESTIC_PASSWORD=...` it prints.

**[Prod]** If this server was bootstrapped before this feature existed
(i.e. `personalweb`'s shell isn't already `/bin/bash` — a fresh bootstrap in
step 3 already sets this correctly, so this is only needed on an older
box):
```bash
sudo usermod -s /bin/bash personalweb
```

**[Pi]**
```bash
cd ~/src/personal-website
bash deploy/scripts/setup-backup-pull-pi.sh \
    --production-host <domain> \
    --restic-password <password printed above>
```
This installs `restic`, generates a dedicated read-only-restricted SSH key
(never reuses your admin key), stores the pull config, and enables
`personal-website-backup-pull.timer`. It prints an `authorized_keys` line at
the end.

**[Prod]** Paste that exact printed line onto production:
```bash
sudo -u personalweb bash -c 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys' <<'EOF'
<paste the restrict,command="..." line printed by setup-backup-pull-pi.sh>
EOF
sudo -u personalweb chmod 600 ~/.ssh/authorized_keys
```

**[Prod]** Run the backup once manually and enable the nightly timer:
```bash
sudo bash /opt/personal-website/current/deploy/backup.sh
restic -r /opt/personal-website/data/restic-repo snapshots   # confirm a snapshot exists
sudo systemctl enable --now personal-website-backup.timer
```

**[Pi]** Confirm the pull works end-to-end:
```bash
cd ~/src/personal-website
bash deploy/scripts/backup-pull.sh
restic -r ~/personal-website-backups snapshots   # should show today's snapshot
```

Full restore instructions (only needed in an actual disaster) are in
`deploy/BACKUP.md`.

---

## 7. Already automatic — no setup needed

These are enabled by `install.sh` on first install with no extra steps:

- **`personal-website-healthwatch.timer`** — crash-loop/disk/certificate-
  expiry monitoring, every 15 minutes.
- **`personal-website-media-cleanup.timer`** — deletes uploaded files no
  longer referenced anywhere, after a grace period.

**(Optional)** Tune their behavior via `$DATA_DIR/.env`:
`BACKUP_DISK_ALERT_PERCENT`, `CERT_ALERT_DAYS`, `ORPHAN_MEDIA_GRACE_DAYS`,
`ORPHAN_MEDIA_MAX_PER_RUN`, `BACKUP_RETENTION_DAYS`.

**(Optional)** Set `WATCHER_ALERT_FALLBACK_MAILGUN_API_KEY` /
`_MAILGUN_DOMAIN` / `_FROM_EMAIL` / `_TO_EMAIL` in `$DATA_DIR/.env` so
crash-loop/backup alerts can still be emailed if the database itself is
what's down (the normal alert path reads Mailgun config from the database).

---

## Summary — minimum path to a working site

Steps **0, 1, 2, 3, 4** only. Everything from step 5 onward is optional
automation layered on top of a server that's already fully working after
step 4.
