"""Staff "forgot password" and reset (routes/admin_auth.py), end to end:
the reset email is captured, its link is followed, and the new password
is used to sign in."""
import re
from datetime import datetime, timedelta

import pytest

from conftest import PASSWORD

NEW_PASSWORD = 'a brand new password'


@pytest.fixture
def mail(mail_configured_site, sent_emails, sync_threads):
    return sent_emails


def _token_from(email):
    match = re.search(r'reset-password\?token=([\w-]+)', email['body'])
    assert match, email['body']
    return match.group(1)


def _forgot(client, email):
    return client.post('/api/admin/forgot-password', json={'email': email})


def test_full_reset_flow(app, client, make_admin, mail, get):
    from models import AdminAccount
    account_id = make_admin('editor', email='me@test.invalid')
    assert _forgot(client, 'me@test.invalid').status_code == 200
    assert len(mail) == 1 and mail[0]['to'] == 'me@test.invalid'
    token = _token_from(mail[0])
    assert get(AdminAccount, account_id).reset_token != token  # only a hash is stored

    r = client.post('/api/admin/reset-password', json={'token': token, 'new_password': NEW_PASSWORD})
    assert r.status_code == 200
    login = app.test_client()
    assert login.post('/api/admin/login', json={'email': 'me@test.invalid', 'password': PASSWORD}).status_code == 401
    assert login.post('/api/admin/login', json={'email': 'me@test.invalid', 'password': NEW_PASSWORD}).status_code == 200


def test_link_uses_the_site_domain(app, client, make_admin, mail):
    from extensions import db
    from models import SiteConfig
    with app.app_context():
        SiteConfig.query.first().domain = 'example.org'
        db.session.commit()
    make_admin('editor', email='me@test.invalid')
    _forgot(client, 'me@test.invalid')
    assert 'https://example.org/admin/reset-password?token=' in mail[0]['body']


def test_same_answer_whether_or_not_the_email_exists(client, make_admin, mail):
    make_admin('editor', email='me@test.invalid')
    known = _forgot(client, 'me@test.invalid')
    unknown = _forgot(client, 'nobody@test.invalid')
    assert (known.status_code, known.get_json()) == (unknown.status_code, unknown.get_json())
    assert [m['to'] for m in mail] == ['me@test.invalid']


def test_no_email_for_deactivated_account(app, client, make_admin, mail):
    from extensions import db
    from models import AdminAccount
    account_id = make_admin('editor', email='gone@test.invalid')
    with app.app_context():
        db.session.get(AdminAccount, account_id).is_active = False
        db.session.commit()
    _forgot(client, 'gone@test.invalid')
    assert mail == []


def test_no_email_when_mail_is_not_configured(client, make_admin, sent_emails, sync_threads):
    make_admin('editor', email='me@test.invalid')
    assert _forgot(client, 'me@test.invalid').status_code == 200
    assert sent_emails == []


def test_per_address_limit(client, make_admin, mail):
    make_admin('editor', email='me@test.invalid')
    codes = [_forgot(client, 'me@test.invalid').status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]
    assert len(mail) == 3


def test_per_ip_limit(client, mail):
    codes = [_forgot(client, f'person{i}@test.invalid').status_code for i in range(6)]
    assert codes == [200] * 5 + [429]


@pytest.mark.parametrize('body,expected', [
    ({}, 400),
    ({'token': 'x'}, 400),
    ({'token': 'x', 'new_password': 'short'}, 400),
    ({'token': 'not-a-real-token', 'new_password': NEW_PASSWORD}, 400),
])
def test_reset_validation(client, body, expected):
    assert client.post('/api/admin/reset-password', json=body).status_code == expected


def _issue_token(client, mail):
    _forgot(client, 'me@test.invalid')
    return _token_from(mail[-1])


def test_token_works_once(client, make_admin, mail):
    make_admin('editor', email='me@test.invalid')
    token = _issue_token(client, mail)
    assert client.post('/api/admin/reset-password', json={'token': token, 'new_password': NEW_PASSWORD}).status_code == 200
    assert client.post('/api/admin/reset-password', json={'token': token, 'new_password': 'another password'}).status_code == 400


def test_expired_token_refused(app, client, make_admin, mail):
    from extensions import db
    from models import AdminAccount
    account_id = make_admin('editor', email='me@test.invalid')
    token = _issue_token(client, mail)
    with app.app_context():
        db.session.get(AdminAccount, account_id).reset_token_expires = datetime.utcnow() - timedelta(minutes=1)
        db.session.commit()
    assert client.post('/api/admin/reset-password', json={'token': token, 'new_password': NEW_PASSWORD}).status_code == 400


def test_reset_clears_lockout_and_ends_sessions(app, client, make_admin, mail, get):
    from extensions import db
    from models import AdminAccount
    account_id = make_admin('editor', email='me@test.invalid')
    signed_in = app.test_client()
    signed_in.post('/api/admin/login', json={'email': 'me@test.invalid', 'password': PASSWORD})
    with app.app_context():
        account = db.session.get(AdminAccount, account_id)
        account.failed_login_attempts = 5
        account.lockout_until = datetime.utcnow() + timedelta(minutes=10)
        db.session.commit()
    token = _issue_token(client, mail)
    client.post('/api/admin/reset-password', json={'token': token, 'new_password': NEW_PASSWORD})
    account = get(AdminAccount, account_id)
    assert (account.failed_login_attempts, account.lockout_until) == (0, None)
    assert signed_in.get('/api/admin/site-config').status_code == 401


def test_new_location_sign_in_notice(app, make_admin, mail):
    make_admin('editor', email='me@test.invalid')
    app.test_client().post('/api/admin/login', json={'email': 'me@test.invalid', 'password': PASSWORD})
    assert [m['subject'] for m in mail] == ['New admin sign-in on your site']
    # Same browser location again: no second notice.
    app.test_client().post('/api/admin/login', json={'email': 'me@test.invalid', 'password': PASSWORD})
    assert len(mail) == 1
