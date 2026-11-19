"""Request-level protections: the cross-site write guard, CORS, and the
per-IP rate limits on login and the contact form."""
import pytest

from conftest import PASSWORD

FRONTEND = 'http://localhost:5173'


# ---- Cross-site writes ----------------------------------------------------

def test_cross_site_write_is_blocked(login_as):
    c = login_as('administrator')
    r = c.put('/api/admin/site-config', json={'site_title': 'Hacked'}, headers={'Origin': 'https://evil.example'})
    assert r.status_code == 403
    assert c.get('/api/admin/site-config').get_json()['site_title'] != 'Hacked'


@pytest.mark.parametrize('origin', [FRONTEND, 'http://localhost', None])
def test_same_site_and_originless_writes_allowed(login_as, origin):
    headers = {'Origin': origin} if origin else {}
    r = login_as('administrator').put('/api/admin/site-config', json={'site_title': 'Fine'}, headers=headers)
    assert r.status_code == 200


def test_cross_site_login_is_blocked(client, make_admin):
    make_admin('owner', email='owner2@test.invalid')
    r = client.post('/api/admin/login', json={'email': 'owner2@test.invalid', 'password': PASSWORD},
                    headers={'Origin': 'https://evil.example'})
    assert r.status_code == 403


def test_reads_are_not_blocked_by_origin(client):
    assert client.get('/api/site-config', headers={'Origin': 'https://evil.example'}).status_code == 200


# ---- CORS ------------------------------------------------------------------

def test_cors_allows_only_the_frontend_origin(client):
    good = client.get('/api/site-config', headers={'Origin': FRONTEND})
    assert good.headers.get('Access-Control-Allow-Origin') == FRONTEND
    assert good.headers.get('Access-Control-Allow-Credentials') == 'true'
    bad = client.get('/api/site-config', headers={'Origin': 'https://evil.example'})
    assert bad.headers.get('Access-Control-Allow-Origin') in (None, '')


# ---- Rate limits -------------------------------------------------------------

def test_login_rate_limit_per_ip(client, monkeypatch):
    import routes.admin_auth as admin_auth
    monkeypatch.setattr(admin_auth, 'MAX_ATTEMPTS_PER_IP', 3)
    codes = [
        client.post('/api/admin/login', json={'email': f'nobody{i}@test.invalid', 'password': 'x'}).status_code
        for i in range(5)
    ]
    assert codes[:3] == [401, 401, 401]
    assert codes[3:] == [429, 429]


@pytest.fixture
def contact_enabled(app, monkeypatch):
    from crypto import encrypt
    from extensions import db
    from models import SiteConfig
    with app.app_context():
        config = SiteConfig.query.first()
        config.contact_enabled = True
        config.forward_email = 'owner@test.invalid'
        config.mailgun_domain = 'mg.test.invalid'
        config.smtp_from_email = 'site@test.invalid'
        config.mailgun_api_key = encrypt('key-test')
        db.session.commit()
    sent = []
    import routes.contact as contact
    monkeypatch.setattr(contact, 'send_email', lambda *a, **k: sent.append((a, k)))
    return sent


def _message(i=0):
    return {'name': 'Visitor', 'email': 'visitor@test.invalid', 'subject': f'Hello {i}', 'message': 'Hi there'}


def test_contact_form_sends_and_stores(app, client, contact_enabled):
    from models import ContactSubmission
    r = client.post('/api/contact', json=_message())
    assert r.status_code == 200, r.get_json()
    assert len(contact_enabled) == 1
    with app.app_context():
        assert ContactSubmission.query.count() == 1


def test_contact_form_validates(client, contact_enabled):
    assert client.post('/api/contact', json={**_message(), 'email': 'not-an-email'}).status_code == 400
    assert client.post('/api/contact', json={**_message(), 'message': ''}).status_code == 400
    assert contact_enabled == []


def test_contact_rate_limit_per_ip(client, contact_enabled):
    codes = [client.post('/api/contact', json=_message(i)).status_code for i in range(7)]
    assert codes[:5] == [200] * 5
    assert codes[5:] == [429, 429]
    assert len(contact_enabled) == 5


def test_contact_form_off_when_mail_not_configured(client):
    assert client.post('/api/contact', json=_message()).status_code == 503
