"""Shared setup for the backend test suite (pytest).

Runs the real Flask app against a real, throwaway Postgres database, built
the same way install.sh builds production's: seed known migrations, seed the
initial rows, then run every migration (server.py's own functions, not a
copy of them).

Database: set TEST_DATABASE_URL. Its database name must end in "_test" or
start with "ci_", so these tests (which empty every table between tests) can
never run against a real database:

    TEST_DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/personal_website_test
    cd backend && .venv\\Scripts\\python -m pytest

app.py calls load_dotenv(), which never overrides a variable that is already
set, so everything below is set before the app is imported.
"""
import contextlib
import io
import ipaddress
import os
import socket
from urllib.parse import urlparse

import pytest

# ---- Environment, before anything imports the app ------------------------

_TEST_DB = os.environ.get('TEST_DATABASE_URL', '')
_db_name = urlparse(_TEST_DB).path.lstrip('/')
if not _TEST_DB or not (_db_name.endswith('_test') or _db_name.startswith('ci_')):
    raise pytest.UsageError(
        'Set TEST_DATABASE_URL to a throwaway Postgres database whose name ends '
        'in "_test" or starts with "ci_" (every table in it is emptied between tests).'
    )
os.environ['DATABASE_URL'] = _TEST_DB

from cryptography.fernet import Fernet  # noqa: E402

os.environ['SECRET_KEY'] = 'test-secret-key'
os.environ['ENCRYPTION_KEY'] = Fernet.generate_key().decode()
os.environ['FLASK_ENV'] = 'testing'
os.environ['FRONTEND_ORIGIN'] = 'http://localhost:5173'
os.environ.setdefault('ENABLE_AI_DEMOS', 'false')
for _var in ('ANTHROPIC_API_KEY', 'VOYAGE_API_KEY', 'GITHUB_MCP_TOKEN', 'WATCHER_ALERT_SECRET'):
    os.environ[_var] = ''

AI_DEMOS_ENABLED = os.environ['ENABLE_AI_DEMOS'].lower() == 'true'

# ---- No network: anything but the local database fails the test ----------

_real_connect = socket.socket.connect
_ALLOWED_HOSTS = {'localhost', urlparse(_TEST_DB).hostname}


def _is_local(address):
    if isinstance(address, tuple):
        host = address[0]
    else:
        return True  # Unix socket
    if host in _ALLOWED_HOSTS:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _guarded_connect(self, address):
    if not _is_local(address):
        raise RuntimeError(f'Test tried to open a network connection to {address!r}. Mock the outside service instead.')
    return _real_connect(self, address)


socket.socket.connect = _guarded_connect


# ---- App and database -----------------------------------------------------

def _quiet(fn, *args):
    # seed_initial_data prints the generated admin password; keep it out of logs.
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*args)


@pytest.fixture(scope='session')
def app():
    from sqlalchemy import text

    from app import _seed_pages_and_nav, create_app
    from extensions import db
    from schema_migrations import LEGACY_MIGRATIONS, seed_known_migrations
    from server import run_migrations, seed_initial_data

    app = create_app()
    app.config['TESTING'] = True

    with app.app_context():
        # Check the database the app really connected to, not just the
        # environment variable, before wiping it.
        connected_to = db.engine.url.database or ''
        if not (connected_to.endswith('_test') or connected_to.startswith('ci_')):
            pytest.exit(f'Refusing to reset database "{connected_to}": not a throwaway test database.', returncode=2)
        # Start from an empty schema every run.
        with db.engine.begin() as conn:
            conn.execute(text('DROP SCHEMA public CASCADE'))
            conn.execute(text('CREATE SCHEMA public'))
        # install.sh's order on a brand-new server.
        db.create_all()
        seed_known_migrations(db.engine, LEGACY_MIGRATIONS)
    _quiet(seed_initial_data, app)
    _quiet(run_migrations, app)

    app.extensions['test_reseed'] = lambda: (_quiet(seed_initial_data, app), _seed_pages_and_nav())
    yield app


@pytest.fixture(autouse=True)
def clean_db(app):
    """Every test starts from a freshly seeded database."""
    from sqlalchemy import text

    from extensions import db

    yield
    with app.app_context():
        db.session.remove()
        tables = [t.name for t in db.metadata.sorted_tables]
        with db.engine.begin() as conn:
            conn.execute(text('TRUNCATE {} RESTART IDENTITY CASCADE'.format(', '.join(f'"{t}"' for t in tables))))
        app.extensions['test_reseed']()
        db.session.commit()
        db.session.remove()


@pytest.fixture
def db_session(app):
    from extensions import db
    with app.app_context():
        yield db.session


@pytest.fixture
def client(app):
    return app.test_client()


# ---- Admin accounts -------------------------------------------------------

ROLES = ['contributor', 'editor', 'administrator', 'owner']
PASSWORD = 'correct horse battery staple'


@pytest.fixture
def make_admin(app):
    """make_admin('editor') -> AdminAccount id, with password PASSWORD."""
    from extensions import db
    from models import AdminAccount

    def _make(role, email=None):
        with app.app_context():
            account = AdminAccount(full_name=f'Test {role}', email=email or f'{role}@test.invalid', role=role)
            account.set_password(PASSWORD)
            db.session.add(account)
            db.session.commit()
            return account.id
    return _make


@pytest.fixture
def login_as(app, make_admin):
    """login_as('editor') -> a test client logged in with that role."""
    def _login(role):
        make_admin(role)
        c = app.test_client()
        r = c.post('/api/admin/login', json={'email': f'{role}@test.invalid', 'password': PASSWORD})
        assert r.status_code == 200, r.get_json()
        return c
    return _login
