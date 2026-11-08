# Running your own site without a build machine

Your site's pages are prerendered (built as ready-made HTML) so the server never runs Node. That means every content edit needs a rebuild somewhere. GitHub Actions does it, in a private repo of your own, so you need no Pi or other always-on build box: just your server and that repo.

How it fits together:

1. `colinpetree/personal-website` (public) builds and tests the code once per version and publishes a **server bundle** with each release.
2. Your private **dist repo** runs `publish.yml` (this folder). It prerenders your site against its live content, adds that version's server bundle, and publishes a release in your repo.
3. Your server's `update-watch.sh` installs the newest release in your repo.
4. Your server's `content-dispatch.sh` tells your repo to rebuild after you edit content.

## Setup

1. Install the server as usual (`bootstrap.sh`, then `install.sh` with a release tarball). The template tarball `personal-website-vX.Y.Z.tar.gz` on any public release works for a first install.
2. Create a **private** repo, for example `you/personal-website-dist-example.com`, with at least one commit (a README is enough).
3. Copy `publish.yml` from this folder into it as `.github/workflows/publish.yml`.
4. In that repo: Settings, Secrets and variables, Actions, **Variables**:
   - `SITE_URL`: `https://example.com`
   - `ORIGIN_HOST`: only if your site is behind Cloudflare or another proxy (see below)
   - `AI_DEMOS`: `false` to leave out the AI demo pages
   - `AUTO_UPGRADE`: `false` to stop new upstream versions installing automatically
5. Actions, **Publish site**, **Run workflow**. The first run publishes the newest upstream version, prerendered for your site.
6. On the server, point the updater at your repo and turn on content triggers (copy `deploy/scripts/setup-auto-update-production.sh` over first):

   ```
   sudo bash setup-auto-update-production.sh --releases-repo you/personal-website-dist-example.com --dispatch-token
   ```

   It asks for a fine-grained GitHub token with access to **only** your dist repo and **Actions: Read and write**.

Releases use your account's free GitHub Actions minutes for private repos. A site build takes 3 to 5 minutes and the 3-hourly check finishes in seconds, which stays well inside the free allowance.

## Behind Cloudflare?

GitHub's runners use datacenter IP addresses, which Cloudflare's bot protection may challenge. The build then can't read your site's content. The first run tells you if this happens.

- **Not proxied, or the first run passes:** leave `ORIGIN_HOST` unset.
- **The run reports a challenge:** set `ORIGIN_HOST` to your server's own DNS name, for example the AWS public DNS name you SSH to. The build then connects to your server directly for your domain (on the runner only), with the same URL and certificate.

`ORIGIN_HOST` needs two things that `bootstrap.sh` and `install.sh` set up by default: port 443 open to the internet, and a normal Let's Encrypt certificate for your domain. It **won't** work if you've firewalled 443 to Cloudflare's IPs only, use a Cloudflare Origin CA certificate, or run behind a Cloudflare Tunnel. In those cases, add a Cloudflare rule that skips bot checks for the build (paid plans), or turn off Bot Fight Mode.

## Things to know

- **Backups:** without a second machine, your restic backups live only on the server itself. Copying them somewhere else is up to you.
- **Workflow updates:** `publish.yml` follows `build-instance.yml@main`, so fixes arrive automatically. To review changes first, pin a commit SHA instead of `@main`.
- **CPU type:** server bundles are built for ARM64 (for example AWS Graviton `t4g`). x86 servers aren't supported yet.
