"""Site settings (routes/admin_config.py) beyond secrets: navigation, fixed
page addresses, user accounts, domain, audit log and the test email.
Secret handling is in test_settings_secrets.py."""
import json
import os

import pytest

from conftest import APP_DATA_DIR


def _config(app):
    from models import SiteConfig
    with app.app_context():
        config = SiteConfig.query.first()
        return {c.name: getattr(config, c.name) for c in config.__table__.columns}


@pytest.fixture
def editor(login_as):
    return login_as('editor')


# ---- Navigation -------------------------------------------------------------

def test_navigation_saved_with_menus(app, editor, bans):
    nav = [
        {'label': 'Blog', 'url': '/blog'},
        {'label': 'More', 'url': 'ignored', 'children': [
            {'label': 'Docs', 'url': '/docs', 'children': [{'label': 'too deep', 'url': '/x'}]},
        ]},
    ]
    assert editor.put('/api/admin/site-config', json={'primary_navigation': nav}).status_code == 200
    saved = json.loads(_config(app)['primary_navigation'])
    assert saved == [
        {'label': 'Blog', 'url': '/blog'},
        {'label': 'More', 'url': '', 'children': [{'label': 'Docs', 'url': '/docs'}]},
    ]
    assert 'purge_all_public' in bans


@pytest.mark.parametrize('nav,fragment', [
    ('not a list', 'must be a list'),
    ([{'label': f'L{i}', 'url': '/'} for i in range(51)], 'at most 50'),
    ([{'label': '', 'url': '/'}], 'needs a label'),
    ([{'label': 'x' * 201, 'url': '/'}], 'needs a label'),
    ([{'label': 'No URL'}], 'needs a URL'),
    ([{'label': 'Long', 'url': '/' + 'x' * 2000}], 'needs a URL'),
    ([{'label': 'Menu', 'children': 'nope'}], 'not in a valid format'),
    ([{'label': 'Menu', 'children': [{'label': f'C{i}', 'url': '/'} for i in range(21)]}], 'at most'),
    ([{'label': 'Menu', 'children': [{'label': 'No URL'}]}], 'needs a label'),
    (['just a string'], 'needs a label'),
])
def test_navigation_validation(app, editor, nav, fragment):
    before = _config(app)['primary_navigation']
    r = editor.put('/api/admin/site-config', json={'primary_navigation': nav})
    assert r.status_code == 400 and fragment in r.get_json()['error']
    assert _config(app)['primary_navigation'] == before


# ---- Fixed page addresses -----------------------------------------------------

@pytest.mark.parametrize('slug', ['admin', 'api', 'search', 'profile', '', 'Has Spaces', 'UPPER', '-edge-', 'a/b'])
def test_bad_fixed_page_address_refused(app, editor, slug):
    r = editor.put('/api/admin/site-config', json={'blog_slug': slug})
    assert r.status_code == 400
    assert _config(app)['blog_slug'] != slug


def test_two_fixed_pages_cannot_share_an_address(editor):
    r = editor.put('/api/admin/site-config', json={'blog_slug': 'news', 'projects_slug': 'news'})
    assert r.status_code == 400


def test_fixed_page_cannot_take_a_page_or_post_address(editor, make_page, make_post):
    make_page('Existing', slug='existing-page')
    make_post('Existing Post', slug='existing-post')
    assert editor.put('/api/admin/site-config', json={'blog_slug': 'existing-page'}).status_code == 400
    assert editor.put('/api/admin/site-config', json={'projects_slug': 'existing-post'}).status_code == 400


def test_valid_address_change_and_unchanged_resave(app, editor):
    assert editor.put('/api/admin/site-config', json={'blog_slug': 'writing'}).status_code == 200
    assert _config(app)['blog_slug'] == 'writing'
    # The blog settings form always sends the current slug back.
    assert editor.put('/api/admin/site-config', json={'blog_slug': 'writing', 'blog_page_name': 'Writing'}).status_code == 200


def test_swapping_two_addresses_in_one_save(app, editor):
    config = _config(app)
    blog, projects = config['blog_slug'], config['projects_slug']
    r = editor.put('/api/admin/site-config', json={'blog_slug': projects, 'projects_slug': blog})
    assert r.status_code == 200
    assert (_config(app)['blog_slug'], _config(app)['projects_slug']) == (projects, blog)


# ---- Other settings -----------------------------------------------------------

def test_user_accounts_need_mail(app, editor, login_as):
    assert editor.put('/api/admin/site-config', json={'users_enabled': True}).status_code == 400
    assert _config(app)['users_enabled'] is not True


def test_user_accounts_with_mail(app, editor, mail_configured_site):
    assert editor.put('/api/admin/site-config', json={'users_enabled': True}).status_code == 200


def test_domain_is_written_for_certbot(editor):
    assert editor.put('/api/admin/site-config', json={'domain': 'example.org'}).status_code == 200
    with open(os.path.join(APP_DATA_DIR, 'certbot_domain.txt')) as f:
        assert f.read() == 'example.org'


def test_saves_are_audited_with_the_changed_keys(editor, history):
    editor.put('/api/admin/site-config', json={'site_title': 'T', 'timezone': 'Europe/London', 'not_a_field': 1})
    entry = history()[0]
    assert entry['area'] == 'Settings'
    assert entry['subject'] == 'Site (site_title, timezone)'


def test_fixed_page_text_drops_inactive_header_media(app, editor):
    html = '<header class="header-full" data-background-type="color" data-header-image="old.webp"></header>'
    editor.put('/api/admin/site-config', json={'home_text': html})
    assert 'old.webp' not in _config(app)['home_text']


def test_ai_demo_fields_only_when_the_feature_exists(app, editor):
    from conftest import AI_DEMOS_ENABLED
    editor.put('/api/admin/site-config', json={'ai_demo_page_name': 'Demos!'})
    assert (_config(app)['ai_demo_page_name'] == 'Demos!') is AI_DEMOS_ENABLED


# ---- Test email ---------------------------------------------------------------

def _test_emails(sent):
    # Signing in also emails a "new sign-in" notice; only test emails count here.
    return [m for m in sent if m['subject'].startswith('Test email')]


@pytest.mark.parametrize('role,expected', [('editor', 403), ('administrator', 503)])
def test_test_email_needs_administrator(login_as, role, expected):
    assert login_as(role).post('/api/admin/contact/test-email', json={'to': 'me@test.invalid'}).status_code == expected


@pytest.mark.parametrize('to', ['', 'not-an-email'])
def test_test_email_validates_the_address(login_as, mail_configured_site, sent_emails, to):
    assert login_as('administrator').post('/api/admin/contact/test-email', json={'to': to}).status_code == 400
    assert _test_emails(sent_emails) == []


def test_test_email_sends(login_as, mail_configured_site, sent_emails):
    r = login_as('administrator').post('/api/admin/contact/test-email', json={'to': 'me@test.invalid'})
    assert r.status_code == 200
    assert [m['to'] for m in _test_emails(sent_emails)] == ['me@test.invalid']


def test_test_email_reports_a_mailgun_failure(login_as, mail_configured_site, monkeypatch):
    import routes.admin_config

    def failing(*args, **kwargs):
        raise RuntimeError('Mailgun said no')

    monkeypatch.setattr(routes.admin_config, 'send_email', failing)
    assert login_as('administrator').post('/api/admin/contact/test-email', json={'to': 'me@test.invalid'}).status_code == 500
