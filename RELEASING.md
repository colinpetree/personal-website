# Releasing

Releases are built by GitHub Actions. There is nothing to SSH into and no version number to type.

- **Code:** `colinpetree/personal-website` (public) builds and tests every push to `main` and every pull request (`.github/workflows/ci.yml`, using `build-test.yml`). A push that passes leaves a draft release, and you publish it when you choose (`.github/workflows/release.yml`).
- **Versions** come from git tags (`vX.Y.Z`). The repo has no `VERSION` file and no "Release" commits, so there is nothing to pull after a release.
- **Your site:** your private dist repo (`colinpetree/personal-website-dist-colinpetree.com`) prerenders the site against its live content and publishes the release your server installs. Its `.github/workflows/publish.yml` calls `.github/workflows/build-instance.yml` here.
- **Production:** `update-watch.sh` installs the newest dist release within about 5 minutes, as before.

The Pi now only pulls a copy of the nightly backups (see `deploy/BACKUP.md`). If GitHub Actions is ever down, `deploy/scripts/publish-release.sh` still builds and publishes from the Pi as a manual fallback (`--patch`, or `--ref <branch>` to try a branch). A release made that way has no server bundle on the public repo, so the dist repo can't make content releases on top of it: run a normal GitHub release once GitHub is back.

## Every push: CI

Push to `main` and **CI** runs by itself (about 5 minutes). It builds the backend on ARM64 and runs the tests: dependency imports, migrations on a fresh Postgres and as an upgrade from the previous release, a prerender of sample content, a real-browser hydration test, and the CSP check.

- **Passed:** it leaves a **draft release** named `Candidate <sha>, tested against vX.Y.Z` on the Releases page, holding the exact files it tested, with the commits since the last release in its notes. Each passing push replaces the draft, so there is only ever one. Drafts are private and nothing installs them: until you publish, a push is only a test of the build.
- **Failed:** GitHub emails you. The previous draft (if any) stays as it was.
- Pushing again while CI is running cancels the older run; only the newest commit matters.

Pull requests (including Dependabot's) run the same tests, without leaving a draft.

## Every code release: Publish release

1. Check the newest CI run on `main` passed (a `Candidate` draft exists for it).
2. GitHub, **Actions**, **Publish release**, **Run workflow**. Leave "Use workflow from" on `main`, pick `patch`, `minor` or `major`, and run it. From a terminal: `gh workflow run release.yml -f bump=patch`.
3. That's it. Nothing is rebuilt. The run (about a minute):
   - works out the next version from the newest release tag (shown in the run summary, for example "v0.9.6 -> v0.9.7");
   - relabels the draft's tested files as that version (`deploy/scripts/reversion-release.sh`, which checks nothing else changed);
   - tags the tested commit `vX.Y.Z` and publishes the draft as the release;
   - starts your dist repo's `publish.yml` (if `DIST_DISPATCH_TOKEN` is set), which prerenders your site and publishes it. Production installs it on its next check.

The run summary lists any commits on `main` that came after the tested build and so are **not** in the release (their CI failed or hadn't finished).

If it stops:

- **"No tested build waiting":** push to `main` and wait for CI to pass.
- **"upgrade-migration test is out of date":** a release was published after this draft was built. Open the newest CI run on `main`, **Re-run all jobs**, then publish again.
- **Failed partway** (for example a GitHub error while uploading): just run it again with the same bump. Once a run starts, it renames the draft to `Publishing <sha>...`, and the next run carries on with that draft and its tag. To give up on it instead, delete the `Publishing` draft on the Releases page (and its tag, if one was pushed); the next CI run on `main` makes a new Candidate.
- **"replaced by a newer build":** a push to `main` finished CI at the same moment you started. Nothing was tagged; run it again.

Pushing to `main` while Publish release runs is fine: CI never deletes a `Publishing` draft, and a draft whose upload was cut off stays named `Uploading <sha>`, so it can never be published.

On the 1st of each month, **Actions**, **Dependency audit** checks the packages in the latest release, and what the next release would ship, for known security problems. If it finds any, the run fails and GitHub emails you; the run's summary shows the details. Run it any time from the same page.

Each release's notes list the Python and npm packages that changed since the previous release. Read them: version ranges in `backend/requirements.txt` mean a release can pick up a new version of, say, stripe-python without any change of yours (that is how checkout broke in `f314ee8`).

## Content edits

Nothing to do. About 7 minutes after you stop editing, production's `content-dispatch` timer starts your dist repo's `publish.yml`. It prerenders the pages again (3 to 5 minutes), and production installs the result within 5 minutes. The dist repo also checks every 3 hours by itself, in case a trigger was missed.

## Checking a branch

**Tests only:** open a pull request, or Actions, **CI**, Run workflow, choose your branch in "Use workflow from", `mode: trial`. Nothing is published. From a terminal: `gh workflow run ci.yml --ref <branch> -f mode=trial`.

**Try it on colinpetree.com:** Actions, **CI**, Run workflow, your branch, `mode: test` (`gh workflow run ci.yml --ref <branch> -f mode=test`).

- It runs every test, then publishes a **pre-release** `vX.Y.Z-test.<branch>.<sha>` (other sites never install pre-releases) and sends it to your dist repo, which publishes it for production. Site Settings shows the test version once it's live.
- While a test build is live, automatic content updates pause, so an edit can't quietly replace your test with `main`. Edits are saved; they're prerendered when the test ends.
- If the branch adds database migrations, the run stops unless you tick `allow_migrations`. Back up first (`sudo systemctl start personal-website-backup` on production). Migrations stay applied when you go back to stable: adding tables or columns is harmless, anything destructive needs `restore.sh`.
- **Never edit a migration file after test-deploying it.** Migrations are recorded by file name and won't run again; add a new one instead.

To end a test:

- **Ship it:** merge to `main`, wait for CI, and run Publish release with `patch`/`minor`/`major`. The newer version replaces the test.
- **Change it:** push more commits and run `test` again.
- **Go back:** in the dist repo, Actions, Publish site, Run workflow, `mode: resume`. It rebuilds the last stable version and production reinstalls it.

## One-time setup

**Public repo** (`colinpetree/personal-website`, Settings, Secrets and variables, Actions):

- Secret `DIST_DISPATCH_TOKEN` (optional but recommended): a fine-grained token with access to only your dist repo(s) and **Actions: Read and write**. Lets a release start your site build immediately instead of within 3 hours.
- Variable `OWN_DIST_REPOS`: `colinpetree/personal-website-dist-colinpetree.com` (space-separated if several).

**Dist repo** (`colinpetree/personal-website-dist-colinpetree.com`):

- Add `deploy/instance/publish.yml` from this repo as `.github/workflows/publish.yml`.
- Variables: `SITE_URL=https://colinpetree.com` and `ORIGIN_HOST=<the AWS DNS name you SSH to>`. `ORIGIN_HOST` makes the build talk to the server directly instead of through Cloudflare. Update it if the server's address ever changes.

**Production:**

- Copy `deploy/scripts/setup-auto-update-production.sh` to the server (it isn't shipped inside releases), then run `sudo bash setup-auto-update-production.sh --releases-repo colinpetree/personal-website-dist-colinpetree.com --dispatch-token`. It asks for a fine-grained token with access to only the dist repo and **Actions: Read and write**, stores it root-only in `/etc/personal-website/github-dispatch-token` and enables `personal-website-content-dispatch.timer`. It needs a release built by GitHub Actions installed first, since that is what ships the timer. The token isn't in the backups: after restoring onto a new server, run the script with `--dispatch-token` again.
- Check every 5 minutes instead of 30 (servers set up before this change keep their old value): `echo 300 | sudo tee /opt/personal-website/data/update-check-interval-seconds`.

Fine-grained tokens expire. When the production token stops working you get one alert email, and edits still publish through the 3-hourly check. Make a new token and re-run the setup script with `--dispatch-token`.

## Where to look when something is wrong

- CI, a release or a site build: the run's page under Actions. Failures are emailed to you.
- Production installing: `sudo journalctl -u personal-website-updater -n 50`
- Content triggers: `sudo journalctl -u personal-website-content-dispatch -n 20`
- Roll back by hand: `sudo bash /opt/personal-website/current/deploy/rollback.sh`
