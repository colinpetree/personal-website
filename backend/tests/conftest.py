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
import atexit
import contextlib
import io
import ipaddress
import os
import shutil
import socket
import tempfile
from datetime import datetime, timedelta
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
for _var in ('ANTHROPIC_API_KEY', 'VOYAGE_API_KEY', 'GITHUB_MCP_TOKEN', 'WATCHER_ALERT_SECRET', 'VARNISH_PURGE_URL'):
    os.environ[_var] = ''

# Uploads and certbot_domain.txt are written under APP_DATA_DIR, which falls
# back to the backend folder itself. Tests get a throwaway folder instead, so
# they can never touch backend/uploads/ or the tracked certbot_domain.txt.
APP_DATA_DIR = tempfile.mkdtemp(prefix='pw-test-appdata-')
os.environ['APP_DATA_DIR'] = APP_DATA_DIR
atexit.register(shutil.rmtree, APP_DATA_DIR, ignore_errors=True)

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
    """login_as('editor') -> a test client logged in with that role. The
    account's id is on the client as `.admin_id`. Pass email= for a second
    account with the same role."""
    def _login(role, email=None):
        email = email or f'{role}@test.invalid'
        admin_id = make_admin(role, email=email)
        c = app.test_client()
        r = c.post('/api/admin/login', json={'email': email, 'password': PASSWORD})
        assert r.status_code == 200, r.get_json()
        c.admin_id = admin_id
        return c
    return _login


# ---- Side effects: cache purges, emails, background threads ---------------

class _Recorder(list):
    def __call__(self, *args, **kwargs):
        self.append((args, kwargs))


@pytest.fixture
def bans(monkeypatch):
    """Records Varnish cache bans/purges (the real ones are no-ops in tests).
    Each entry is the ban pattern, or 'purge_all_public'."""
    recorded = []
    import routes.admin_blog
    import routes.admin_blog_categories
    import routes.admin_config
    import routes.admin_docs
    import routes.admin_pages
    import routes.admin_projects
    for module in (routes.admin_blog, routes.admin_blog_categories, routes.admin_docs,
                   routes.admin_pages, routes.admin_projects):
        monkeypatch.setattr(module, 'ban_pattern', recorded.append)
    monkeypatch.setattr(routes.admin_config, 'purge_all_public', lambda: recorded.append('purge_all_public'))
    return recorded


@pytest.fixture
def sent_emails(monkeypatch, sync_threads):
    """Captures every email instead of calling Mailgun. Each entry is a dict
    with to, subject, body. Also runs admin_auth's background threads inline
    (sync_threads), so an email a thread sends always lands before the test
    checks, never after."""
    sent = []

    def fake_send(config, to, subject, body, *args, **kwargs):
        sent.append({'to': to, 'subject': subject, 'body': body})

    import email_utils
    monkeypatch.setattr(email_utils, 'send_email', fake_send)
    import importlib
    for name in ('admin_auth', 'admin_config', 'auth', 'contact', 'payment'):
        monkeypatch.setattr(importlib.import_module(f'routes.{name}'), 'send_email', fake_send)
    if AI_DEMOS_ENABLED:
        monkeypatch.setattr(importlib.import_module('routes.ai_demo'), 'send_email', fake_send)
    return sent


@pytest.fixture
def sync_threads(monkeypatch):
    """Runs routes.admin_auth's background threads (reset email, new-login
    notice) inline, so they finish inside the test instead of racing the
    next test's database reset."""
    import routes.admin_auth

    class InlineThread:
        def __init__(self, target, args=(), kwargs=None, daemon=None):
            self._run = lambda: target(*args, **(kwargs or {}))

        def start(self):
            self._run()

    monkeypatch.setattr(routes.admin_auth, 'Thread', InlineThread)


@pytest.fixture
def mail_configured_site(app):
    """Mailgun settings filled in, so mail-dependent features switch on."""
    from crypto import encrypt
    from extensions import db
    from models import SiteConfig
    with app.app_context():
        config = SiteConfig.query.first()
        config.forward_email = 'owner@test.invalid'
        config.mailgun_domain = 'mg.test.invalid'
        config.smtp_from_email = 'site@test.invalid'
        config.mailgun_api_key = encrypt('key-test')
        db.session.commit()


# ---- Data factories (shapes as in ci_fixture.py) --------------------------

def _add(app, obj):
    from extensions import db
    with app.app_context():
        db.session.add(obj)
        db.session.commit()
        return obj.id


@pytest.fixture
def make_post(app):
    def _make(title='Post', slug=None, status='published', author_id=None, html='<p>Body</p>', **fields):
        from models import BlogPost
        publish_date = fields.pop('publish_date', datetime.utcnow() - timedelta(days=1) if status == 'published' else None)
        return _add(app, BlogPost(title=title, slug=slug or title.lower().replace(' ', '-'), status=status,
                                  content_html=html, author_id=author_id, publish_date=publish_date, **fields))
    return _make


@pytest.fixture
def make_page(app):
    def _make(title='Page', slug=None, status='published', author_id=None, html='<p>Body</p>', **fields):
        from models import Page
        return _add(app, Page(title=title, slug=slug or title.lower().replace(' ', '-'), status=status,
                              content_html=html, author_id=author_id, **fields))
    return _make


@pytest.fixture
def make_category(app):
    def _make(name='Category', order=0):
        from models import BlogCategory
        return _add(app, BlogCategory(name=name, slug=name.lower().replace(' ', '-'), order=order))
    return _make


@pytest.fixture
def make_project(app):
    def _make(title='Project', order=0, visible=True):
        from models import Project
        return _add(app, Project(title=title, description='Desc', url='https://example.com', order=order, visible=visible))
    return _make


@pytest.fixture
def make_user(app):
    def _make(name='Visitor', email=None, **fields):
        from models import User
        return _add(app, User(name=name, email=email or f'{name.lower().replace(" ", ".")}@test.invalid', **fields))
    return _make


@pytest.fixture
def make_comment(app):
    def _make(post_id, content='A comment', **fields):
        from models import Comment
        return _add(app, Comment(post_id=post_id, content=content, **fields))
    return _make


@pytest.fixture
def make_payment(app):
    def _make(amount=10.0, created_at=None, object_id=None, **fields):
        from models import Payment
        import uuid
        return _add(app, Payment(amount=amount, mode=fields.pop('mode', 'payment'),
                                 stripe_object_id=object_id or f'cs_{uuid.uuid4().hex}',
                                 created_at=created_at or datetime.utcnow(), **fields))
    return _make


@pytest.fixture
def make_page_view(app):
    def _make(page_type, page_key, created_at, visitor_key='v1'):
        from models import PageView
        return _add(app, PageView(page_type=page_type, page_key=page_key, visitor_key=visitor_key, created_at=created_at))
    return _make


@pytest.fixture
def make_docs_section(app):
    def _make(name='Docs', page_ids=()):
        from extensions import db
        from models import DocsItem, DocsSection
        with app.app_context():
            section = DocsSection(name=name)
            db.session.add(section)
            db.session.flush()
            for i, page_id in enumerate(page_ids):
                db.session.add(DocsItem(section_id=section.id, kind='page', page_id=page_id, order=i))
            db.session.commit()
            return section.id
    return _make


@pytest.fixture
def get(app):
    """get(Model, id) -> a detached copy of the row's current state, or None."""
    def _get(model, obj_id):
        from extensions import db
        with app.app_context():
            obj = db.session.get(model, obj_id)
            if obj is not None:
                db.session.expunge(obj)
            return obj
    return _get


@pytest.fixture
def history(app):
    """history() -> the admin audit log, newest first, as dicts."""
    def _history():
        from models import SiteEventLog
        with app.app_context():
            return [
                {'area': e.area, 'action': e.action_type, 'subject': e.subject,
                 'suffix': e.subject_suffix, 'admin_id': e.admin_id}
                for e in SiteEventLog.query.order_by(SiteEventLog.id.desc()).all()
            ]
    return _history


@pytest.fixture
def config_updated_at(app):
    """config_updated_at() -> SiteConfig.updated_at, the content-fingerprint
    row admin deletes and unpublishes bump."""
    def _read():
        from models import SiteConfig
        with app.app_context():
            return SiteConfig.query.first().updated_at
    return _read


@pytest.fixture
def old_content(app):
    """Moves every fingerprinted timestamp a day back, so a change today shows."""
    from sqlalchemy import text

    from extensions import db
    with app.app_context():
        for table in ('site_config', 'profile', 'project', 'blog_post', 'page', 'docs_section'):
            db.session.execute(text(f'UPDATE {table} SET updated_at = :t'), {'t': datetime.utcnow() - timedelta(days=1)})
        db.session.commit()
