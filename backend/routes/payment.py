from datetime import datetime, timedelta
import stripe
from flask import Blueprint, jsonify, request, current_app
from extensions import db
from models import SiteConfig, Payment, User, PortalLinkRequest
from crypto import decrypt
from routes.auth import get_current_user, user_required
from routes.admin_auth import role_at_least
from email_utils import send_email, mail_configured

payment_bp = Blueprint('payment', __name__)

MIN_AMOUNT = 1
MAX_AMOUNT = 100000

MESSAGE_MAX_LEN = 500
DISPLAY_NAME_MAX_LEN = 100

GUEST_PORTAL_WINDOW = timedelta(hours=1)
GUEST_PORTAL_MAX_PER_IP = 5
GUEST_PORTAL_GENERIC_MESSAGE = "If that email has an active subscription, we've sent a management link."


def _payments_ready(config):
    return bool(config and config.payment_enabled and config.stripe_publishable_key and config.stripe_secret_key)


@payment_bp.route('/api/payment/create-checkout-session', methods=['POST'])
def create_checkout_session():
    config = SiteConfig.query.first()
    if not _payments_ready(config):
        return jsonify({'error': 'Payments are not available.'}), 503

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

    message = (data.get('message') or '').strip()[:MESSAGE_MAX_LEN] or None
    # display_name only means anything for guests — signed-in users are identified via User.name.
    display_name = (data.get('display_name') or '').strip()[:DISPLAY_NAME_MAX_LEN] or None if not user else None

    price_data = {
        'currency': 'usd',
        'unit_amount': int(round(amount * 100)),
        'product_data': {'name': 'Monthly support' if mode == 'subscription' else 'One-time payment'},
    }
    if mode == 'subscription':
        interval = data.get('interval') or 'month'
        if interval not in ('month', 'year'):
            return jsonify({'error': 'Invalid billing interval.'}), 400
        price_data['recurring'] = {'interval': interval}

    origin = request.headers.get('Origin') or (
        f'https://{config.domain}' if config.domain else request.host_url.rstrip('/')
    )
    # {CHECKOUT_SESSION_ID} is a literal Stripe template placeholder — substituted
    # server-side by Stripe once the session completes, not by this f-string.
    return_url = f'{origin}/{config.payment_slug}?status=return&session_id={{CHECKOUT_SESSION_ID}}'

    metadata = {}
    if message:
        metadata['message'] = message
    if display_name:
        metadata['display_name'] = display_name

    session_params = {
        'mode': mode,
        'ui_mode': 'embedded_page',
        'payment_method_types': ['card'],
        'line_items': [{'price_data': price_data, 'quantity': 1}],
        'return_url': return_url,
    }
    if user:
        session_params['customer_email'] = user.email
        session_params['client_reference_id'] = str(user.id)
    elif mode == 'payment':
        # customer_creation is only settable in payment/setup mode — subscription
        # mode always creates a Customer on its own.
        session_params['customer_creation'] = 'if_required'
    if metadata:
        session_params['metadata'] = metadata
        if mode == 'subscription':
            session_params['subscription_data'] = {'metadata': metadata}

    stripe.api_key = decrypt(config.stripe_secret_key)
    try:
        session = stripe.checkout.Session.create(**session_params)
    except stripe.error.StripeError as e:
        return jsonify({'error': e.user_message or 'Could not start checkout. Please try again.'}), 502

    return jsonify({'client_secret': session.client_secret})


@payment_bp.route('/api/payment/checkout-session-status', methods=['GET'])
def checkout_session_status():
    config = SiteConfig.query.first()
    if not _payments_ready(config):
        return jsonify({'error': 'Payments are not available.'}), 503

    session_id = request.args.get('session_id')
    if not session_id:
        return jsonify({'error': 'Missing session_id.'}), 400

    stripe.api_key = decrypt(config.stripe_secret_key)
    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except stripe.error.StripeError as e:
        return jsonify({'error': e.user_message or 'Could not retrieve checkout session.'}), 502

    return jsonify({'status': session.status, 'payment_status': session.payment_status})


@payment_bp.route('/api/payment/manage-subscription', methods=['POST'])
@user_required
def manage_subscription():
    config = SiteConfig.query.first()
    if not _payments_ready(config):
        return jsonify({'error': 'Payments are not available.'}), 503

    user = get_current_user()
    payment = (
        Payment.query
        .filter_by(user_id=user.id, mode='subscription')
        .filter(Payment.stripe_customer_id.isnot(None))
        .order_by(Payment.created_at.desc())
        .first()
    )
    if not payment:
        return jsonify({'error': 'You do not have an active subscription to manage.'}), 404

    origin = request.headers.get('Origin') or (
        f'https://{config.domain}' if config.domain else request.host_url.rstrip('/')
    )
    return_url = f'{origin}/{config.payment_slug}'

    stripe.api_key = decrypt(config.stripe_secret_key)
    try:
        portal_session = stripe.billing_portal.Session.create(
            customer=payment.stripe_customer_id,
            return_url=return_url,
        )
    except stripe.error.StripeError as e:
        return jsonify({'error': e.user_message or 'Could not open the billing portal. Please try again.'}), 502

    return jsonify({'url': portal_session.url})


@payment_bp.route('/api/payment/guest-portal-link', methods=['POST'])
def guest_portal_link():
    config = SiteConfig.query.first()
    if not _payments_ready(config):
        return jsonify({'error': 'Payments are not available.'}), 503

    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    if not email or '@' not in email:
        return jsonify({'error': 'A valid email is required.'}), 400

    # IP-based throttling, mirroring the LoginAttempt pattern used for admin
    # login lockout — always record the attempt so the window is accurate,
    # regardless of whether a match is found below.
    ip = request.remote_addr or 'unknown'
    window_start = datetime.utcnow() - GUEST_PORTAL_WINDOW
    PortalLinkRequest.query.filter(PortalLinkRequest.created_at < window_start).delete()
    recent_attempts = PortalLinkRequest.query.filter(
        PortalLinkRequest.ip_address == ip,
        PortalLinkRequest.created_at >= window_start,
    ).count()
    db.session.add(PortalLinkRequest(ip_address=ip))
    db.session.commit()

    # Never reveal whether the email matched — same generic response either way,
    # and any failure below (Stripe error, mail failure) is swallowed silently
    # rather than surfaced, so the response can't be used to distinguish outcomes.
    if recent_attempts < GUEST_PORTAL_MAX_PER_IP:
        try:
            payment = (
                Payment.query
                .filter(db.func.lower(Payment.email) == email.lower())
                .filter_by(mode='subscription')
                .filter(Payment.stripe_customer_id.isnot(None))
                .order_by(Payment.created_at.desc())
                .first()
            )
            if payment:
                origin = request.headers.get('Origin') or (
                    f'https://{config.domain}' if config.domain else request.host_url.rstrip('/')
                )
                stripe.api_key = decrypt(config.stripe_secret_key)
                portal_session = stripe.billing_portal.Session.create(
                    customer=payment.stripe_customer_id,
                    return_url=f'{origin}/{config.payment_slug}',
                )
                if mail_configured(config):
                    send_email(
                        config,
                        email,
                        f'Manage your {config.payment_page_name} subscription',
                        f'Manage or cancel your subscription here: {portal_session.url}',
                        'Billing',
                        decrypt(config.mailgun_api_key),
                    )
        except Exception:
            # Never let the failure change the response shape (that would leak
            # whether the email matched) — but still log it, otherwise a broken
            # Stripe key or mail config fails silently forever with no trace.
            current_app.logger.exception('guest_portal_link: failed to create portal session or send email')

    return jsonify({'message': GUEST_PORTAL_GENERIC_MESSAGE})


@payment_bp.route('/api/payment/webhook', methods=['POST'])
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
        # StripeObject has no .get() — attribute access with a default (via
        # getattr) is the only safe way to read a possibly-absent field.
        customer_details = getattr(session, 'customer_details', None)
        metadata = getattr(session, 'metadata', None)
        _record_payment(
            stripe_object_id=session['id'],
            user_id=getattr(session, 'client_reference_id', None),
            stripe_customer_id=getattr(session, 'customer', None),
            stripe_subscription_id=getattr(session, 'subscription', None),
            amount=(getattr(session, 'amount_total', None) or 0) / 100,
            mode=getattr(session, 'mode', None),
            email=getattr(customer_details, 'email', None) if customer_details else None,
            display_name=getattr(metadata, 'display_name', None) if metadata else None,
            message=getattr(metadata, 'message', None) if metadata else None,
        )

    elif event_type == 'invoice.paid':
        invoice = event['data']['object']
        if getattr(invoice, 'billing_reason', None) != 'subscription_create':
            prior = (
                Payment.query
                .filter_by(stripe_customer_id=getattr(invoice, 'customer', None))
                .order_by(Payment.created_at.desc())
                .first()
            )
            if prior:
                # A renewal isn't a new act of commenting — carry forward who they
                # are, but not the message that accompanied the original payment.
                _record_payment(
                    stripe_object_id=invoice['id'],
                    user_id=prior.user_id,
                    stripe_customer_id=getattr(invoice, 'customer', None),
                    stripe_subscription_id=getattr(invoice, 'subscription', None),
                    amount=(getattr(invoice, 'amount_paid', None) or 0) / 100,
                    mode='subscription',
                    email=prior.email,
                    display_name=prior.display_name,
                    message=None,
                )

    return jsonify({'received': True})


def _record_payment(stripe_object_id, user_id, stripe_customer_id, stripe_subscription_id, amount, mode,
                     email=None, display_name=None, message=None):
    if not stripe_object_id:
        return
    if Payment.query.filter_by(stripe_object_id=stripe_object_id).first():
        return  # already recorded — idempotent against webhook retries

    resolved_name = None
    if user_id:
        user = User.query.get(int(user_id))
        if user:
            resolved_name = user.name
            if not email:
                email = user.email
    if not resolved_name:
        resolved_name = (display_name or '').strip()[:DISPLAY_NAME_MAX_LEN] or None
    if not resolved_name:
        resolved_name = 'Anonymous'

    payment = Payment(
        user_id=int(user_id) if user_id else None,
        email=email,
        display_name=resolved_name,
        message=(message or '').strip()[:MESSAGE_MAX_LEN] or None,
        stripe_customer_id=stripe_customer_id,
        stripe_subscription_id=stripe_subscription_id,
        stripe_object_id=stripe_object_id,
        amount=amount,
        mode=mode or 'payment',
        created_at=datetime.utcnow(),
    )
    db.session.add(payment)
    db.session.commit()


@payment_bp.route('/api/payment/comments', methods=['GET'])
def payment_comments():
    config = SiteConfig.query.first()
    if not config or not config.payment_comments_enabled:
        return jsonify({'enabled': False, 'comments': [], 'has_more': False})

    try:
        limit = min(max(int(request.args.get('limit', 20)), 1), 50)
    except (TypeError, ValueError):
        limit = 20
    try:
        offset = max(int(request.args.get('offset', 0)), 0)
    except (TypeError, ValueError):
        offset = 0

    query = (
        Payment.query
        .filter(Payment.comment_visible.is_(True))
        .filter(Payment.message.isnot(None))
        .filter(Payment.message != '')
        .order_by(Payment.created_at.desc())
    )
    total = query.count()
    rows = query.offset(offset).limit(limit).all()

    user_ids = {p.user_id for p in rows if p.user_id}
    users = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}

    return jsonify({
        'enabled': True,
        'comments': [
            {
                'id': p.id,
                'display_name': p.display_name or 'Anonymous',
                'amount': p.amount,
                'mode': p.mode,
                'message': p.message,
                'created_at': p.created_at.isoformat(),
                'avatar_url': users[p.user_id].display_avatar_url if p.user_id in users else None,
            }
            for p in rows
        ],
        'has_more': offset + len(rows) < total,
    })


@payment_bp.route('/api/admin/payment/transactions', methods=['GET'])
@role_at_least('administrator')
def payment_transactions():
    try:
        limit = min(max(int(request.args.get('limit', 20)), 1), 100)
    except (TypeError, ValueError):
        limit = 20
    try:
        offset = max(int(request.args.get('offset', 0)), 0)
    except (TypeError, ValueError):
        offset = 0

    query = Payment.query.order_by(Payment.created_at.desc())
    total = query.count()
    rows = query.offset(offset).limit(limit).all()

    user_ids = {p.user_id for p in rows if p.user_id}
    users = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}

    return jsonify({
        'transactions': [
            {
                'id': p.id,
                'donor_name': users[p.user_id].name if p.user_id in users else (p.display_name or p.email or 'Unknown'),
                'donor_email': users[p.user_id].email if p.user_id in users else p.email,
                'amount': p.amount,
                'mode': p.mode,
                'message': p.message,
                'comment_visible': p.comment_visible,
                'created_at': p.created_at.isoformat(),
            }
            for p in rows
        ],
        'has_more': offset + len(rows) < total,
    })
