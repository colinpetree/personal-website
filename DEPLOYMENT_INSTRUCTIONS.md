# Deployment instructions

How to set up a brand-new site: one production server, plus a private GitHub
repo that builds your site's pages. GitHub Actions does all the building, so
there is no build machine to run. After this setup, content edits and new
versions install themselves.

Two places are involved:

- **[Prod]**: your server (AWS EC2, Ubuntu 24.04, ARM64, for example a
  `t4g.small`), reached with `ssh ubuntu@<server>`.
- **[GitHub]**: the GitHub website, in your browser.

Steps are in the order to run them. Anything not needed for a working site
is marked **(Optional)**.

Replace every `<placeholder>`. `<domain>` is your site's domain (for example
`example.com`). `<you>` is your GitHub username.

How the pieces fit together, once set up:

```
colinpetree/personal-website (public)       builds and tests each version once,
  Release vX.Y.Z                             publishes a server bundle
        |
        v
<you>/personal-website-dist-<domain> (private, yours)
  publish.yml                                prerenders YOUR site against its
                                             live content, publishes a release
        |
        v
your server                                  update-watch.sh installs the newest
                                             release every 5 minutes;
                                             content-dispatch.sh asks the dist
                                             repo to rebuild after you edit
```

---

## 0. Before you start

- An Ubuntu 24.04 **ARM64** server (AWS Graviton, for example `t4g.small`)
  with ports 22, 80 and 443 open. The prebuilt server bundles are ARM64 only.
- Your domain's DNS pointing at the server, so the TLS certificate can be
  issued during install. If the domain is proxied through Cloudflare, see
  step 4.
- A GitHub account.

---

## 1. [Prod] Download the setup files

Everything comes from the newest public release, so all the files match:

```bash
TAG="$(curl -fsSL https://api.github.com/repos/colinpetree/personal-website/releases/latest | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])')"
echo "Installing $TAG"
BASE="https://github.com/colinpetree/personal-website"
curl -fsSLO "$BASE/releases/download/$TAG/personal-website-$TAG.tar.gz"
curl -fsSLO "$BASE/releases/download/$TAG/personal-website-$TAG.tar.gz.sha256"
for f in bootstrap.sh install.sh setup-auto-update-production.sh; do
    curl -fsSLO "https://raw.githubusercontent.com/colinpetree/personal-website/$TAG/deploy/scripts/$f"
done
```

The `personal-website-<tag>.tar.gz` file is the **template build**: the full
site with no pages prerendered yet and the AI demo pages off. Your own dist
repo replaces it with a prerendered build in step 4.

---

## 2. [Prod] Bootstrap the server (once)

```bash
sudo bash bootstrap.sh --domain <domain>
```

This installs Postgres, nginx, Varnish, ufw, restic and `gh`, creates the
`personalweb` service user, writes `/opt/personal-website/data/.env` with
freshly generated secrets, and sets up the firewall. It's safe to re-run.

- `--domain` lets the next step get the TLS certificate automatically. You
  can leave it out and set the domain later.
- **(Optional)** `--no-ai` turns off the AI Implementations demo section on
  the server side (`ENABLE_AI_DEMOS=false`). It only takes effect on the first
  run. If you forgot it, set it afterwards:
  ```bash
  sudo sed -i 's/^ENABLE_AI_DEMOS=.*/ENABLE_AI_DEMOS=false/' /opt/personal-website/data/.env
  sudo systemctl restart personal-website
  ```
  Also set `AI_DEMOS=false` in step 4, so the pages are left out of the
  build too.

---

## 3. [Prod] Install

```bash
sudo bash install.sh personal-website-$TAG.tar.gz --tag "$TAG-template"
```

(`$TAG` is from step 1. In a new terminal, spell it out, for example
`sudo bash install.sh personal-website-v0.9.3.tar.gz --tag v0.9.3-template`.)

`--tag` names this install `vX.Y.Z-template`. Don't leave it out: your dist
repo's first release (step 4) is published as plain `vX.Y.Z`, and the server
only installs a release whose name differs from what's already installed, so
without it the server would keep this unprerendered template build.

This checks the download, sets up the database, gets the TLS certificate,
starts the site, and turns on the health check and media-cleanup timers. It
prints a one-time admin password at the end.

Log in at `https://<domain>/admin` with `admin@example.com` and that
password, then change the password from the admin menu.

---

## 4. [GitHub] Create your dist repo

This private repo builds your site's pages with GitHub Actions and holds the
releases your server installs.

1. Create a **private** repo named `personal-website-dist-<domain>`. Tick
   "Add a README file" so it has a first commit.
2. In it, **Add file**, then **Create new file**. Name it
   `.github/workflows/publish.yml` and paste in the contents of
   [`deploy/instance/publish.yml`](deploy/instance/publish.yml). Commit it to
   `main`.
3. **Settings**, **Secrets and variables**, **Actions**, **Variables** tab.
   Add:
   - `SITE_URL` = `https://<domain>`
   - **(Optional)** `ORIGIN_HOST`: only if your domain is proxied (for example
     through Cloudflare). Set it to the server's own DNS name, such as its AWS
     public DNS (`ec2-1-2-3-4.us-east-2.compute.amazonaws.com`, shown in the
     EC2 console). The build then talks to your server directly instead of
     through the proxy, whose bot protection can block GitHub. It needs port
     443 open to the internet and the normal Let's Encrypt certificate, which
     steps 2 and 3 set up. The AWS name changes if the instance is stopped
     and started (not a plain reboot) unless it has an Elastic IP; update the
     variable if that happens.
   - **(Optional)** `AI_DEMOS` = `false` to leave out the AI demo pages.
   - **(Optional)** `AUTO_UPGRADE` = `false` to stop new versions installing
     automatically. Content edits still publish.
4. **Actions**, **Publish site**, **Run workflow**. In about a minute it
   publishes your first prerendered release. The run's summary says what it
   did; if it can't reach your site, it says so and suggests `ORIGIN_HOST`.

Building uses your account's free GitHub Actions minutes for private repos.
A build takes about a minute, and the 3-hourly check finishes in seconds
when nothing changed, which stays well inside the free allowance.

---

## 5. [GitHub + Prod] Turn on automatic installs and content rebuilds

**[GitHub]** Create a fine-grained token: your profile picture, **Settings**,
**Developer settings**, **Personal access tokens**, **Fine-grained tokens**,
**Generate new token**:

- **Repository access:** *Only select repositories*, just your dist repo.
- **Permissions:** **Actions**, **Read and write**. Nothing else.
- **Expiration:** up to a year. Note the date; you get an email if it stops
  working.

Copy it; GitHub shows it only once.

**[Prod]**
```bash
sudo bash setup-auto-update-production.sh --releases-repo <you>/personal-website-dist-<domain> --dispatch-token
```

- It signs `gh` in as root (follow the device-code prompt the first time) so
  the server can download your private dist repo's releases.
- It points `personal-website-updater` at your dist repo and turns it on:
  the server checks for a new release every 5 minutes and installs it.
- It asks for the token (input hidden), stores it root-only in
  `/etc/personal-website/github-dispatch-token`, and turns on
  `personal-website-content-dispatch.timer`. About 7 minutes after you stop
  editing content, the server asks your dist repo to rebuild.
- It prints a `WATCHER_ALERT_SECRET` if it generated one. You only need it for
  step 7.

Within a few minutes the server installs the prerendered release from step 4.
From now on:

| You do | What happens |
|---|---|
| Edit content in the admin area | Live in about 10 to 15 minutes |
| Nothing (a new version is released upstream) | Your dist repo picks it up within 3 hours and your server installs it |

---

## 6. [Prod] Nightly backups

Production backs up its database, uploads and secrets into a local restic
repository every night, keeping 14 days.

```bash
sudo bash /opt/personal-website/current/deploy/setup-restic-repo.sh
```

**Save the `RESTIC_PASSWORD=...` it prints somewhere safe, off the server.**
Without it the backups can't be restored.

```bash
sudo systemctl start personal-website-backup          # run one now
sudo journalctl -u personal-website-backup -n 20 --no-pager   # should end with "Backup complete"
sudo systemctl enable --now personal-website-backup.timer
```

Always start a backup through the service as above, never with a bare
`sudo bash backup.sh`: a root run leaves root-owned files that break the next
nightly run.

These backups live on the server itself, so they don't protect against
losing the server. Step 7 keeps a second copy elsewhere.

---

## 7. (Optional) Keep a copy of the backups on your own machine

A machine you own (a Raspberry Pi, a home server, any always-on Linux box)
can pull a copy of the backups every night. Production never connects to it;
it always connects out to production. Nothing else depends on this machine.

**[Your machine]** Install `git` and clone the repo (only its scripts are used):
```bash
sudo apt install -y git
git clone https://github.com/colinpetree/personal-website.git ~/src/personal-website
cd ~/src/personal-website
bash deploy/scripts/setup-backup-pull-pi.sh \
    --production-host <server's AWS DNS name or Elastic IP> \
    --restic-password <RESTIC_PASSWORD from step 6> \
    --site-url https://<domain> \
    --watcher-secret <WATCHER_ALERT_SECRET>
```

- `--production-host` must reach SSH directly: use the AWS DNS name or an
  Elastic IP, not a Cloudflare-proxied domain (Cloudflare doesn't forward
  SSH).
- `--site-url` and `--watcher-secret` let a failed pull email you through the
  site. The secret is `WATCHER_ALERT_SECRET` in
  `/opt/personal-website/data/.env` on production
  (`sudo grep WATCHER_ALERT_SECRET /opt/personal-website/data/.env`).

It installs restic, creates a dedicated SSH key that can only *read* the
backups, and turns on `personal-website-backup-pull.timer`. It prints one
`authorized_keys` line at the end.

**[Prod]** Add that line for the `personalweb` user. Its home is
`/opt/personal-website/data`, so don't use `~`:
```bash
sudo -u personalweb bash -c 'mkdir -p /opt/personal-website/data/.ssh && chmod 700 /opt/personal-website/data/.ssh && cat >> /opt/personal-website/data/.ssh/authorized_keys' <<'EOF'
<paste the restrict,command="..." line printed by setup-backup-pull-pi.sh>
EOF
sudo -u personalweb chmod 600 /opt/personal-website/data/.ssh/authorized_keys
```

**[Your machine]** Check it works:
```bash
cd ~/src/personal-website
bash deploy/scripts/backup-pull.sh
bash deploy/scripts/backup-status.sh   # should list today's snapshot
```

Restoring, in a real disaster or as a drill, is in
[`deploy/BACKUP.md`](deploy/BACKUP.md).

---

## 8. Already automatic

Turned on by `install.sh` with no extra steps:

- **`personal-website-healthwatch.timer`**: crash-loop, disk-space and
  certificate-expiry checks every 15 minutes, emailing you about problems.
- **`personal-website-media-cleanup.timer`**: removes uploaded files nothing
  refers to any more, after a grace period.

**(Optional)** Tune them in `/opt/personal-website/data/.env`:
`BACKUP_DISK_ALERT_PERCENT`, `CERT_ALERT_DAYS`, `ORPHAN_MEDIA_GRACE_DAYS`,
`ORPHAN_MEDIA_MIN_REFERENCED_RATIO`, `ORPHAN_MEDIA_MIN_REFERENCED_FLOOR`,
`ORPHAN_MEDIA_REFERENCED_HISTORY_WINDOW`, `ORPHAN_MEDIA_MAX_PER_RUN_FLOOR`,
`ORPHAN_MEDIA_MAX_PER_RUN_PERCENT`, `BACKUP_RETENTION_DAYS`.

**(Optional)** Set `WATCHER_ALERT_FALLBACK_MAILGUN_API_KEY`,
`_MAILGUN_DOMAIN`, `_FROM_EMAIL` and `_TO_EMAIL` there too, so alerts still
reach you if the database is what's down (the normal path reads the Mailgun
settings from the database). Alerts need Mailgun set up in the admin area
(Integrations) either way.

---

## Minimum path to a working site

Steps **0 to 3** give a working site (the template build, no prerendered
pages). Steps **4 and 5** add prerendering and automatic updates, and are
what you want for a real site. Step 6 is strongly recommended; step 7 is
optional.

For releasing new versions of the code itself, testing a branch on a live
site, and troubleshooting, see [`RELEASING.md`](RELEASING.md).
