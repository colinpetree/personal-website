"""Stripe webhook: only correctly signed events are accepted, and a paid
checkout is recorded once. Signatures are built locally with the same
scheme Stripe uses (HMAC-SHA256 over "<timestamp>.<payload>"), so nothing
goes to Stripe."""
import hashlib
import hmac
import json
import time

import pytest

WEBHOOK_SECRET = 'whsec_test_secret'


@pytest.fixture
def stripe_configured(app):
    from crypto import encrypt
    from extensions import db
    from models import SiteConfig
    with app.app_context():
        config = SiteConfig.query.first()
        config.stripe_secret_key = encrypt('sk_test_dummy')
        config.stripe_webhook_secret = encrypt(WEBHOOK_SECRET)
        db.session.commit()


def _signed(payload, secret=WEBHOOK_SECRET, timestamp=None):
    timestamp = int(timestamp or time.time())
    sig = hmac.new(secret.encode(), f'{timestamp}.{payload}'.encode(), hashlib.sha256).hexdigest()
    return {'Stripe-Signature': f't={timestamp},v1={sig}', 'Content-Type': 'application/json'}


def _checkout_event(session_id='cs_test_1', amount=2500):
    return json.dumps({
        'id': 'evt_test_1',
        'object': 'event',
        'type': 'checkout.session.completed',
        'data': {'object': {
            'id': session_id,
            'object': 'checkout.session',
            'amount_total': amount,
            'mode': 'payment',
            'customer': 'cus_test',
            'customer_details': {'email': 'payer@test.invalid'},
            'metadata': {'display_name': 'Payer', 'message': 'Thanks'},
        }},
    })


def _payments(app):
    from models import Payment
    with app.app_context():
        return Payment.query.all()


def test_unconfigured_webhook_is_refused(client):
    assert client.post('/api/payment/webhook', data='{}').status_code == 503


def test_unsigned_event_is_refused(app, client, stripe_configured):
    r = client.post('/api/payment/webhook', data=_checkout_event(), headers={'Content-Type': 'application/json'})
    assert r.status_code == 400
    assert _payments(app) == []


def test_event_signed_with_wrong_secret_is_refused(app, client, stripe_configured):
    payload = _checkout_event()
    r = client.post('/api/payment/webhook', data=payload, headers=_signed(payload, secret='whsec_wrong'))
    assert r.status_code == 400
    assert _payments(app) == []


def test_tampered_payload_is_refused(app, client, stripe_configured):
    payload = _checkout_event(amount=2500)
    headers = _signed(payload)
    r = client.post('/api/payment/webhook', data=_checkout_event(amount=1), headers=headers)
    assert r.status_code == 400
    assert _payments(app) == []


def test_old_event_is_refused(app, client, stripe_configured):
    """Replay protection: Stripe's default tolerance is 5 minutes."""
    payload = _checkout_event()
    r = client.post('/api/payment/webhook', data=payload, headers=_signed(payload, timestamp=time.time() - 3600))
    assert r.status_code == 400


def test_signed_checkout_is_recorded_once(app, client, stripe_configured):
    payload = _checkout_event()
    for _ in range(2):  # Stripe retries deliveries
        r = client.post('/api/payment/webhook', data=payload, headers=_signed(payload))
        assert r.status_code == 200, r.get_json()
    payments = _payments(app)
    assert len(payments) == 1
    assert float(payments[0].amount) == 25.0
    assert payments[0].email == 'payer@test.invalid'


def test_webhook_is_exempt_from_the_cross_site_guard(client, stripe_configured):
    payload = _checkout_event()
    headers = {**_signed(payload), 'Origin': 'https://stripe.com'}
    assert client.post('/api/payment/webhook', data=payload, headers=headers).status_code == 200
