from datetime import datetime
import stripe
from flask import Blueprint, jsonify, request
from extensions import db
from models import SiteConfig, Donation, User
from crypto import decrypt
from routes.auth import get_current_user, user_required
from routes.admin_auth import role_at_least

donate_bp = Blueprint('donate', __name__)

MIN_AMOUNT = 1
MAX_AMOUNT = 100000


def _donations_ready(config):
    return bool(config and config.donate_enabled and config.stripe_publishable_key and config.stripe_secret_key)


@donate_bp.route('/api/donate/create-checkout-session', methods=['POST'])
@user_required
def create_checkout_session():
    config = SiteConfig.query.first()
    if not _donations_ready(config):
        return jsonify({'error': 'Donations are not available.'}), 503

    user = get_current_user()
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
            customer_email=user.email,
            client_reference_id=str(user.id),
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except stripe.error.StripeError as e:
        return jsonify({'error': e.user_message or 'Could not start checkout. Please try again.'}), 502

    return jsonify({'url': session.url})


@donate_bp.route('/api/donate/manage-subscription', methods=['POST'])
@user_required
def manage_subscription():
    config = SiteConfig.query.first()
    if not _donations_ready(config):
        return jsonify({'error': 'Donations are not available.'}), 503

    user = get_current_user()
    donation = (
        Donation.query
        .filter_by(user_id=user.id, mode='subscription')
        .filter(Donation.stripe_customer_id.isnot(None))
        .order_by(Donation.created_at.desc())
        .first()
    )
    if not donation:
        return jsonify({'error': 'You do not have an active subscription to manage.'}), 404

    origin = request.headers.get('Origin') or (
        f'https://{config.domain}' if config.domain else request.host_url.rstrip('/')
    )
    return_url = f'{origin}/{config.donate_slug}'

    stripe.api_key = decrypt(config.stripe_secret_key)
    try:
        portal_session = stripe.billing_portal.Session.create(
            customer=donation.stripe_customer_id,
            return_url=return_url,
        )
    except stripe.error.StripeError as e:
        return jsonify({'error': e.user_message or 'Could not open the billing portal. Please try again.'}), 502

    return jsonify({'url': portal_session.url})


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

    event_type = event['type']

    if event_type == 'checkout.session.completed':
        session = event['data']['object']
        _record_donation(
            stripe_object_id=session['id'],
            user_id=getattr(session, 'client_reference_id', None),
            stripe_customer_id=getattr(session, 'customer', None),
            stripe_subscription_id=getattr(session, 'subscription', None),
            amount=(getattr(session, 'amount_total', None) or 0) / 100,
            mode=getattr(session, 'mode', None),
        )

    elif event_type == 'invoice.paid':
        invoice = event['data']['object']
        if getattr(invoice, 'billing_reason', None) != 'subscription_create':
            prior = (
                Donation.query
                .filter_by(stripe_customer_id=getattr(invoice, 'customer', None))
                .order_by(Donation.created_at.desc())
                .first()
            )
            if prior:
                _record_donation(
                    stripe_object_id=invoice['id'],
                    user_id=prior.user_id,
                    stripe_customer_id=getattr(invoice, 'customer', None),
                    stripe_subscription_id=getattr(invoice, 'subscription', None),
                    amount=(getattr(invoice, 'amount_paid', None) or 0) / 100,
                    mode='subscription',
                )

    return jsonify({'received': True})


def _record_donation(stripe_object_id, user_id, stripe_customer_id, stripe_subscription_id, amount, mode):
    if not stripe_object_id or not user_id:
        return
    if Donation.query.filter_by(stripe_object_id=stripe_object_id).first():
        return  # already recorded — idempotent against webhook retries

    donation = Donation(
        user_id=int(user_id),
        stripe_customer_id=stripe_customer_id,
        stripe_subscription_id=stripe_subscription_id,
        stripe_object_id=stripe_object_id,
        amount=amount,
        mode=mode or 'payment',
        created_at=datetime.utcnow(),
    )
    db.session.add(donation)
    db.session.commit()


@donate_bp.route('/api/admin/donate/summary', methods=['GET'])
@role_at_least('administrator')
def donate_summary():
    donations = Donation.query.order_by(Donation.created_at.desc()).all()

    total = sum(d.amount for d in donations)
    now = datetime.utcnow()
    this_month = sum(
        d.amount for d in donations
        if d.created_at.year == now.year and d.created_at.month == now.month
    )

    recent = donations[:20]
    user_ids = {d.user_id for d in recent}
    users = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}

    return jsonify({
        'total': total,
        'this_month': this_month,
        'recent': [
            {
                'id': d.id,
                'donor_name': users[d.user_id].name if d.user_id in users else 'Unknown',
                'donor_email': users[d.user_id].email if d.user_id in users else None,
                'amount': d.amount,
                'mode': d.mode,
                'created_at': d.created_at.isoformat(),
            }
            for d in recent
        ],
    })
