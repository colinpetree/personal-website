"""Production entrypoint — boots the Flask app under an embedded gunicorn,
instead of the Flask dev server used by app.py's __main__ block. This is
what backend/pyinstaller.spec packages, not app.py.

gunicorn is POSIX-only (imports fcntl) and cannot run on Windows at all, so
every gunicorn-dependent import in this module is deferred into the
functions that need it — this keeps `--check-imports` usable cross-platform
(e.g. for a quick sanity build on Windows before waiting on the Pi) even
though the app itself can only ever actually run on Linux.

Usage:
    server                       # runs migrations, then starts serving
    server --migrate-only        # runs migrations only, then exits (used by
                                  # deploy/scripts/install.sh before cutting
                                  # traffic over to a new release)
    server --check-imports       # imports every dependency PyInstaller is known
                                  # to have trouble bundling (see pyinstaller.spec)
                                  # and exits non-zero if any fail — a fast,
                                  # credential-free smoke test for missing hidden
                                  # imports, run by deploy/scripts/build-on-pi.sh
                                  # right after the frozen binary is built.
    server --seed-initial-data   # creates the first Profile/SiteConfig/AdminAccount
                                  # rows on a brand-new database, then exits. No-op
                                  # if any of the three already exist (safe to call
                                  # unconditionally — creates tables itself if
                                  # needed). AdminAccount always uses
                                  # admin@example.com / admin — change this
                                  # immediately after first login. Optionally reads
                                  # SITE_DOMAIN from the environment to pre-fill
                                  # SiteConfig.domain.
    server --db-is-fresh         # prints "true"/"false": whether schema_migrations
                                  # exists yet in the target database. Read-only,
                                  # always exits 0. install.sh uses this (rather
                                  # than its own local FIRST_INSTALL) to decide
                                  # whether to seed legacy migrations/initial data,
                                  # so resetting the database doesn't require also
                                  # resetting this server's systemd unit.
    server --send-deploy-report  # emails a success/failure report for the deploy
                                  # that just ran, using the site's own Mailgun
                                  # settings (SiteConfig.forward_email as the
                                  # recipient). Reads DEPLOY_REPORT_* env vars set
                                  # by install.sh (status, release/previous version,
                                  # domain, timestamp, health-check diagnostics on
                                  # failure). Always exits 0 and never raises —
                                  # silently does nothing if Mailgun/forward_email
                                  # isn't configured or sending fails, so a broken
                                  # mail setup can never break a deploy.
    server --purge-cache          # bans the Varnish-cached /api/blog|projects|
                                  # site-config|payment/comments responses (same
                                  # ban admin edits already trigger). Run by
                                  # install.sh right after a successful cutover, so
                                  # a Pi-built release's content is never left
                                  # behind Varnish's 60s safety-net TTL. Always
                                  # exits 0 — purge_all_public() never raises.
    server --send-watcher-alert   # emails the admin when a watcher loop (Pi or
                                  # production, see deploy/scripts/content-watch.sh
                                  # /update-watch.sh) has been unable to reach gh/
                                  # GitHub for 48h+. Reads WATCHER_ALERT_SOURCE/
                                  # WATCHER_ALERT_MESSAGE from the environment.
                                  # Unlike --send-deploy-report, this DOES signal
                                  # failure via its exit code (0 = actually sent,
                                  # 1 = not sent) — the caller uses that to decide
                                  # whether to stop retrying, so a silently-assumed
                                  # success here would defeat the whole feature.
"""
import os
import sys

_CHECK_IMPORT_MODULES = (
    # gunicorn.app.base (not bare 'gunicorn') so this actually exercises the
    # worker-class submodules --collect-submodules gunicorn is meant to catch
    # — importing just the top-level package would succeed even with those
    # missing.
    'gunicorn.app.base', 'cryptography', 'psycopg2', 'PIL', 'certifi',
    'anthropic', 'voyageai', 'stripe', 'mcp', 'pydantic', 'anyio',
)


def check_imports():
    import importlib
    failures = []
    for name in _CHECK_IMPORT_MODULES:
        try:
            importlib.import_module(name)
            print(f'OK   {name}')
        except Exception as e:
            print(f'FAIL {name}: {e}')
            failures.append(name)
    if failures:
        if failures == ['gunicorn.app.base'] and os.name == 'nt':
            print('\nNote: gunicorn is POSIX-only (imports fcntl) and is expected to fail '
                  'to import on Windows. This is not a real failure on the Linux build target.')
        else:
            print(f'\n{len(failures)} module(s) failed to import: {", ".join(failures)}')
            sys.exit(1)
    print('\nDependency imports OK.')


def run_migrations(app):
    """Runs db.create_all() + the hand-rolled column patcher + any pending
    .sql migrations. Must be called once in gunicorn's master process before
    workers are forked (see main() below) — never from a post_fork hook,
    or concurrent workers would race on the same CREATE TABLE/INSERT
    statements."""
    from app import _migrate_schema
    from extensions import db
    from schema_migrations import run_pending_migrations

    # Explicit env var rather than a __file__-relative guess — under
    # PyInstaller onedir freezing, __file__ semantics for the frozen module
    # aren't something to gamble a silent no-op on. install.sh/systemd both
    # set this to the release's sibling migrations/ dir; the fallback below
    # only matters if someone runs server.py directly from a source checkout.
    migrations_dir = os.getenv(
        'MIGRATIONS_DIR',
        os.path.join(os.path.dirname(os.path.abspath(__file__)), 'migrations'),
    )
    with app.app_context():
        db.create_all()
        _migrate_schema()
        run_pending_migrations(db.engine, migrations_dir)


def db_is_fresh(app):
    """True iff `schema_migrations` doesn't exist yet in the target database
    — a reliable, read-only signal that this database has never been through
    run_pending_migrations()/seed_known_migrations() before, independent of
    whether *this server* has installed a release before. install.sh uses
    this (not its own FIRST_INSTALL, which only reflects local systemd-unit
    presence) to decide whether to seed legacy migrations / initial data —
    otherwise resetting/replacing the database while the systemd unit is
    still installed would silently skip both, leaving the site permanently
    unconfigured with no admin account."""
    from sqlalchemy import inspect as sa_inspect
    from extensions import db
    with app.app_context():
        return not sa_inspect(db.engine).has_table('schema_migrations')


_DEFAULT_ADMIN_EMAIL = 'admin@example.com'
_DEFAULT_ADMIN_PASSWORD = 'admin'


def seed_initial_data(app):
    """Creates the first Profile/SiteConfig/AdminAccount rows on a brand-new
    database — the production equivalent of backend/seed.py, which is dev-only
    and isn't bundled into the PyInstaller release. Deliberately conservative:
    only acts when a table is completely empty, so re-running this on every
    install (like --seed-known-migrations) is always a safe no-op past the
    first. Never overwrites or reads back existing rows.

    AdminAccount always uses the same known default (admin@example.com /
    admin) rather than a generated one-time password — the goal is a
    first-install flow with zero manual steps between "run install.sh" and
    "log in", and a self-service password-change flow already exists in the
    admin UI for the user to secure the account immediately afterward."""
    from extensions import db
    from models import Profile, SiteConfig, AdminAccount

    with app.app_context():
        # Self-sufficient rather than trusting a prior --seed-known-migrations
        # call to have created these tables first — db.create_all() is a
        # cheap no-op for tables that already exist, so this is safe to call
        # unconditionally every time, including standalone/out-of-order runs.
        db.create_all()

        if not Profile.query.first():
            db.session.add(Profile(
                name='My Website',
                title='',
                bio='',
            ))
            print('Seeded Profile (edit via the admin panel).')

        if not SiteConfig.query.first():
            # Every non-home page gets an <h1> of its own nav label as a
            # starter — visibly "there's a page here" instead of a blank
            # editor when an admin opens it for the first time. Home is
            # deliberately excluded (welcome text reads fine without a
            # redundant "Home" heading above it).
            db.session.add(SiteConfig(
                site_title='My Website',
                home_enabled=True,
                home_page_name='Home',
                home_text='<p>Welcome.</p>',
                blog_page_name='Blog',
                blog_text='<h1>Blog</h1>',
                projects_page_name='Projects',
                projects_text='<h1>Projects</h1>',
                about_page_name='About',
                about_text='<h1>About</h1>',
                contact_page_name='Contact',
                contact_text='<h1>Contact</h1>',
                ai_demo_page_name='AI Implementations',
                ai_demo_text='<h1>AI Implementations</h1>',
                payment_page_name='Payment',
                payment_text='<h1>Payment</h1>',
                domain=os.getenv('SITE_DOMAIN') or None,
            ))
            print('Seeded SiteConfig (edit via the admin panel).')

        db.session.commit()

        if not AdminAccount.query.first():
            admin = AdminAccount(
                full_name='Admin',
                email=_DEFAULT_ADMIN_EMAIL,
                role='owner',
            )
            admin.set_password(_DEFAULT_ADMIN_PASSWORD)
            db.session.add(admin)
            db.session.commit()
            print('')
            print('==========================================================================')
            print(f' Admin account created — email: {_DEFAULT_ADMIN_EMAIL}  password: {_DEFAULT_ADMIN_PASSWORD}')
            print(' These are default, publicly-known credentials. Log in and change the')
            print(' password immediately via the admin profile menu.')
            print('==========================================================================')
        else:
            print('AdminAccount already exists — not creating another.')


def send_deploy_report(app):
    """Emails a success/failure report for the deploy that just ran, reusing
    the site's own Mailgun settings (same config the public contact form
    uses) and its forward_email as the recipient. Every fact comes from
    DEPLOY_REPORT_* env vars set by install.sh — this function has no
    knowledge of the deploy process itself, only what it's told.

    Deliberately silent on any failure (unconfigured Mailgun, bad
    ENCRYPTION_KEY, network error, missing env var, ...): a broken mail setup
    must never be the reason a deploy script itself fails or emits noise.
    Mirrors the exact silent-failure pattern already used for the "comment
    reported" ops notification in routes/blog.py's report_comment()."""
    try:
        from crypto import decrypt
        from email_utils import send_email, mail_configured
        from models import SiteConfig

        with app.app_context():
            config = SiteConfig.query.first()
            if not config or not config.forward_email or not mail_configured(config):
                return

            status = os.getenv('DEPLOY_REPORT_STATUS', 'unknown')
            release = os.getenv('DEPLOY_REPORT_RELEASE', 'unknown')
            previous = os.getenv('DEPLOY_REPORT_PREVIOUS', 'none')
            domain = os.getenv('DEPLOY_REPORT_DOMAIN') or os.getenv('DEPLOY_REPORT_HOSTNAME', 'unknown host')
            label = f'{previous} → {release}'

            lines = [
                f'Status: {status}',
                f'Server: {os.getenv("DEPLOY_REPORT_HOSTNAME", "unknown")}',
                f'Domain: {os.getenv("DEPLOY_REPORT_DOMAIN", "(none configured)")}',
                f'Previous version: {previous}',
                f'New version: {release}',
                f'Timestamp: {os.getenv("DEPLOY_REPORT_TIMESTAMP", "unknown")}',
                f'Disk usage: {os.getenv("DEPLOY_REPORT_DISK", "unknown")}',
                f'Health-check attempts: {os.getenv("DEPLOY_REPORT_ATTEMPTS", "unknown")}',
            ]

            if status == 'success':
                subject = f'[Deploy] {domain}: {label} succeeded'
            else:
                stage = os.getenv('DEPLOY_REPORT_STAGE', 'unknown')
                rolled_back = os.getenv('DEPLOY_REPORT_ROLLED_BACK', 'false') == 'true'
                subject = f'[Deploy] {domain}: {label} FAILED at {stage}'
                subject += f' — rolled back to {previous}' if rolled_back else ' — NO ROLLBACK AVAILABLE'
                lines.append(f'Failed stage: {stage}')
                lines.append(f'Rolled back: {"yes, to " + previous if rolled_back else "no"}')
                health_error = os.getenv('DEPLOY_REPORT_HEALTH_ERROR')
                if health_error:
                    lines.append(f'Last health-check error: {health_error}')
                log_tail = os.getenv('DEPLOY_REPORT_LOG_TAIL')
                if log_tail:
                    # install.sh truncates this by byte count (tail -c), which
                    # can split a multi-byte UTF-8 character mid-sequence. Python
                    # decodes env vars with surrogateescape, so the broken bytes
                    # load fine here but would raise UnicodeEncodeError deep
                    # inside requests' strict-UTF-8 body encoding later — right
                    # when this diagnostic-heavy failure email matters most.
                    # Re-encoding with surrogateescape/decoding with replace
                    # swaps any such fragment for U+FFFD instead of failing.
                    log_tail = log_tail.encode('utf-8', 'surrogateescape').decode('utf-8', 'replace')
                    lines.append('')
                    lines.append('Recent service log:')
                    lines.append(log_tail)

            body = '\n'.join(lines)

            try:
                send_email(config, config.forward_email, subject, body, 'Deploy Report', decrypt(config.mailgun_api_key))
            except Exception:
                pass
    except Exception:
        pass


def _gunicorn_options():
    return {
        'bind': os.getenv('GUNICORN_BIND', '127.0.0.1:8000'),
        'workers': int(os.getenv('GUNICORN_WORKERS', '3')),
        'worker_class': 'sync',
        'graceful_timeout': int(os.getenv('GUNICORN_GRACEFUL_TIMEOUT', '30')),
        'max_requests': int(os.getenv('GUNICORN_MAX_REQUESTS', '1000')),
        'max_requests_jitter': int(os.getenv('GUNICORN_MAX_REQUESTS_JITTER', '100')),
        'accesslog': '-',
        'errorlog': '-',
    }


def _run_gunicorn(app):
    from gunicorn.app.base import BaseApplication

    class _GunicornApp(BaseApplication):
        """Standard "embed gunicorn" pattern — avoids depending on the
        `gunicorn` console script being on PATH, which matters once this is
        frozen into a PyInstaller bundle."""

        def __init__(self, application, options):
            self.application = application
            self.options = options
            super().__init__()

        def load_config(self):
            for key, value in self.options.items():
                if key in self.cfg.settings and value is not None:
                    self.cfg.set(key.lower(), value)

        def load(self):
            return self.application

    _GunicornApp(app, _gunicorn_options()).run()


def main():
    if '--check-imports' in sys.argv:
        check_imports()
        return

    from app import create_app
    app = create_app()

    if '--db-is-fresh' in sys.argv:
        print('true' if db_is_fresh(app) else 'false')
        return

    if '--seed-known-migrations' in sys.argv:
        from extensions import db
        from schema_migrations import seed_known_migrations, LEGACY_MIGRATIONS
        with app.app_context():
            db.create_all()
            seed_known_migrations(db.engine, LEGACY_MIGRATIONS)
        return

    if '--migrate-only' in sys.argv:
        run_migrations(app)
        return

    if '--seed-initial-data' in sys.argv:
        seed_initial_data(app)
        return

    if '--send-deploy-report' in sys.argv:
        send_deploy_report(app)
        return

    if '--purge-cache' in sys.argv:
        from varnish_purge import purge_all_public
        purge_all_public()
        return

    if '--send-watcher-alert' in sys.argv:
        from watcher_alerts import send_watcher_alert
        with app.app_context():
            sent = send_watcher_alert(os.getenv('WATCHER_ALERT_SOURCE', 'production'),
                                       os.getenv('WATCHER_ALERT_MESSAGE', 'gh calls have been failing.'))
        sys.exit(0 if sent else 1)   # exit code, not a bare `return` — update-watch.sh
                                       # branches on this to decide whether the outage
                                       # was actually alerted or needs retrying

    run_migrations(app)
    _run_gunicorn(app)


if __name__ == '__main__':
    main()
