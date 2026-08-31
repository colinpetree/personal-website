from flask import Blueprint, jsonify, request
from models import SiteConfig
from crypto import decrypt
from email_utils import send_email, mail_configured

contact_bp = Blueprint('contact', __name__)


def _mail_configured(config):
    return bool(config and config.contact_enabled and config.forward_email and mail_configured(config))


@contact_bp.route('/api/contact', methods=['POST'])
def submit_contact():
    config = SiteConfig.query.first()
    if not _mail_configured(config):
        return jsonify({'error': 'Contact form is not available.'}), 503

    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    subject = (data.get('subject') or '').strip()
    message = (data.get('message') or '').strip()

    if not all([name, email, subject, message]):
        return jsonify({'error': 'All fields are required.'}), 400

    if '@' not in email:
        return jsonify({'error': 'Invalid email address.'}), 400

    body = f"From: {name} <{email}>\n\n{message}"
    full_subject = f"[Contact] {subject}"

    try:
        send_email(config, config.forward_email, full_subject, body, 'Contact Form', decrypt(config.mailgun_api_key))
    except Exception as e:
        return jsonify({'error': 'Failed to send message. Please try again later.'}), 500

    return jsonify({'message': 'Message sent successfully.'})
