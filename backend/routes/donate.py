import stripe
from flask import Blueprint, jsonify, request
from extensions import db
from models import SiteConfig, SiteEventLog
from crypto import decrypt

donate_bp = Blueprint('donate', __name__)

MIN_AMOUNT = 1
MAX_AMOUNT = 100000


def _donations_ready(config):
    return bool(config and config.donate_enabled and config.stripe_publishable_key and config.stripe_secret_key)


@donate_bp.route('/api/donate/create-checkout-session', methods=['POST'])
def create_checkout_session():
    config = SiteConfig.query.first()
    if not _donations_ready(config):
        return jsonify({'error': 'Donations are not available.'}), 503

    data = request.get_json(silent=True) or {}

    mode = data.get('mode')
    if mode not in ('payment', 'subscription'):
        return jsonify({'error': 'Invalid payment mode.'}), 400

    try:
        amount = float(data.get('amount'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid amount.'}), 400

    if amount < MIN_AMOUNT or amount > MAX_AMOUNT:
        return jsonify({'error': f'Amount must be between ${MIN_AMOUNT} and ${MAX_AMOUNT}.'}), 400

    price_data = {
        'currency': 'usd',
        'unit_amount': int(round(amount * 100)),
        'product_data': {'name': 'Monthly support' if mode == 'subscription' else 'One-time donation'},
    }
    if mode == 'subscription':
        interval = data.get('interval') or 'month'
        if interval not in ('month', 'year'):
            return jsonify({'error': 'Invalid billing interval.'}), 400
        price_data['recurring'] = {'interval': interval}

    origin = request.headers.get('Origin') or (
        f'https://{config.domain}' if config.domain else request.host_url.rstrip('/')
    )
    success_url = f'{origin}/{config.donate_slug}?status=success'
    cancel_url = f'{origin}/{config.donate_slug}?status=cancelled'

    stripe.api_key = decrypt(config.stripe_secret_key)
    try:
        session = stripe.checkout.Session.create(
            mode=mode,
            payment_method_types=['card'],
            line_items=[{'price_data': price_data, 'quantity': 1}],
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except stripe.error.StripeError as e:
        return jsonify({'error': e.user_message or 'Could not start checkout. Please try again.'}), 502

    return jsonify({'url': session.url})


@donate_bp.route('/api/donate/webhook', methods=['POST'])
def stripe_webhook():
    config = SiteConfig.query.first()
    if not config or not config.stripe_webhook_secret or not config.stripe_secret_key:
        return jsonify({'error': 'Webhook not configured.'}), 503

    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature', '')
    webhook_secret = decrypt(config.stripe_webhook_secret)

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except (ValueError, stripe.error.SignatureVerificationError):
        return jsonify({'error': 'Invalid signature.'}), 400

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        amount_total = (session.get('amount_total') or 0) / 100
        kind = 'monthly donation' if session.get('mode') == 'subscription' else 'one-time donation'
        entry = SiteEventLog(
            admin_id=None,
            admin_name='Stripe',
            admin_avatar=None,
            area='Donation',
            action_type='added',
            subject=f'${amount_total:.2f} {kind}',
            subject_is_bold=True,
        )
        db.session.add(entry)
        db.session.commit()

    return jsonify({'received': True})
