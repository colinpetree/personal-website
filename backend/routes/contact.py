from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from extensions import db
from models import SiteConfig, ContactAttempt, ContactSubmission
from crypto import decrypt
from email_utils import send_email, mail_configured
from routes.admin_auth import role_at_least

contact_bp = Blueprint('contact', __name__)

MAX_ATTEMPTS_PER_IP = 5
IP_WINDOW = timedelta(minutes=15)


def _mail_configured(config):
    return bool(config and config.contact_enabled and config.forward_email and mail_configured(config))


@contact_bp.route('/api/contact', methods=['POST'])
def submit_contact():
    config = SiteConfig.query.first()
    if not _mail_configured(config):
        return jsonify({'error': 'Contact form is not available.'}), 503

    ip = request.remote_addr or 'unknown'
    window_start = datetime.utcnow() - IP_WINDOW
    ContactAttempt.query.filter(ContactAttempt.created_at < window_start).delete()
    recent_attempts = ContactAttempt.query.filter(
        ContactAttempt.ip_address == ip,
        ContactAttempt.created_at >= window_start,
    ).count()
    if recent_attempts >= MAX_ATTEMPTS_PER_IP:
        db.session.commit()
        return jsonify({'error': 'Too many messages sent. Please try again later.'}), 429
    db.session.add(ContactAttempt(ip_address=ip))
    db.session.commit()

    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    subject = (data.get('subject') or '').strip()
    message = (data.get('message') or '').strip()

    if not all([name, email, subject, message]):
        return jsonify({'error': 'All fields are required.'}), 400

    if '@' not in email:
        return jsonify({'error': 'Invalid email address.'}), 400

    # Persisted before the send attempt so the submission is still on record
    # even if the email itself fails to go out.
    db.session.add(ContactSubmission(name=name, email=email, subject=subject, message=message))
    db.session.commit()

    body = f"From: {name} <{email}>\n\nSubject: {subject}\n\n{message}"
    full_subject = f"[Contact] {subject}"

    try:
        send_email(config, config.forward_email, full_subject, body, 'Contact Form', decrypt(config.mailgun_api_key), reply_to=f'{name} <{email}>')
    except Exception as e:
        return jsonify({'error': 'Failed to send message. Please try again later.'}), 500

    return jsonify({'message': 'Message sent successfully.'})


@contact_bp.route('/api/admin/contact/submissions', methods=['GET'])
@role_at_least('administrator')
def contact_submissions():
    try:
        limit = min(max(int(request.args.get('limit', 20)), 1), 100)
    except (TypeError, ValueError):
        limit = 20
    try:
        offset = max(int(request.args.get('offset', 0)), 0)
    except (TypeError, ValueError):
        offset = 0

    query = ContactSubmission.query.order_by(ContactSubmission.created_at.desc())
    total = query.count()
    rows = query.offset(offset).limit(limit).all()

    return jsonify({
        'submissions': [
            {
                'id': s.id,
                'name': s.name,
                'email': s.email,
                'subject': s.subject,
                'message': s.message,
                'created_at': s.created_at.isoformat() + 'Z',
            }
            for s in rows
        ],
        'has_more': offset + len(rows) < total,
    })
