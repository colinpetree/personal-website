"""Secret settings (Mailgun, Stripe, Google OAuth) are stored encrypted, are
never sent back to the browser, and only administrators can set them."""
import json

import pytest

SECRETS = {
    'mailgun_api_key': 'key-mailgun-plaintext-123',
    'stripe_secret_key': 'sk_test_plaintext_456',
    'stripe_webhook_secret': 'whsec_plaintext_789',
    'google_oauth_client_secret': 'google-plaintext-000',
}


def _raw_config(app):
    from sqlalchemy import text

    from extensions import db
    with app.app_context():
        return dict(db.session.execute(text('SELECT * FROM site_config LIMIT 1')).mappings().one())


def test_secrets_are_encrypted_at_rest(app, login_as):
    from crypto import decrypt
    r = login_as('administrator').put('/api/admin/site-config', json=SECRETS)
    assert r.status_code == 200, r.get_json()
    row = _raw_config(app)
    for field, plaintext in SECRETS.items():
        assert row[field] != plaintext, f'{field} stored as plaintext'
        assert plaintext not in json.dumps(row, default=str)
        assert decrypt(row[field]) == plaintext


def test_secrets_never_returned(app, client, login_as):
    admin = login_as('owner')
    admin.put('/api/admin/site-config', json=SECRETS)
    responses = {
        'admin site config': admin.get('/api/admin/site-config'),
        'public site config': client.get('/api/site-config'),
    }
    for name, r in responses.items():
        assert r.status_code == 200
        body = r.get_data(as_text=True)
        for plaintext in SECRETS.values():
            assert plaintext not in body, f'{name} leaks a secret'
    # The admin view says a value is set, without the value.
    data = responses['admin site config'].get_json()
    assert data.get('stripe_secret_key_set') is True


def test_saving_other_settings_keeps_secrets(app, login_as):
    from crypto import decrypt
    admin = login_as('administrator')
    admin.put('/api/admin/site-config', json=SECRETS)
    admin.put('/api/admin/site-config', json={'site_title': 'Renamed', 'mailgun_api_key': ''})
    row = _raw_config(app)
    assert decrypt(row['mailgun_api_key']) == SECRETS['mailgun_api_key']


@pytest.mark.parametrize('field', ['stripe_secret_key', 'mailgun_api_key', 'stripe_webhook_secret'])
def test_editor_cannot_set_secret_settings(app, login_as, field):
    r = login_as('editor').put('/api/admin/site-config', json={field: 'attacker-value'})
    assert r.status_code == 403
    assert not _raw_config(app)[field]
