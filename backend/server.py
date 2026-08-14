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
            db.session.add(SiteConfig(
                site_title='My Website',
                home_enabled=True,
                home_page_name='Home',
                home_text='<p>Welcome.</p>',
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

    run_migrations(app)
    _run_gunicorn(app)


if __name__ == '__main__':
    main()
