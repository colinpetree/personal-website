import requests
from flask import Blueprint, jsonify, request
from models import SiteConfig
from crypto import decrypt

contact_bp = Blueprint('contact', __name__)


def _send_email(config, to_address, subject, body_text, sender_label):
    """Send an email using the SiteConfig Mailgun settings. Raises on failure."""
    from_name = f'{config.site_title} {sender_label}'
    resp = requests.post(
        f'https://api.mailgun.net/v3/{config.mailgun_domain}/messages',
        auth=('api', config.mailgun_api_key),
        data={
            'from': f'{from_name} <{config.smtp_from_email}>',
            'to': [to_address],
            'subject': subject,
            'text': body_text,
        },
    )
    resp.raise_for_status()


def _mail_configured(config):
    return bool(
        config
        and config.contact_enabled
        and config.mailgun_api_key
        and config.mailgun_domain
        and config.smtp_from_email
        and config.forward_email
    )


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
        config.mailgun_api_key = decrypt(config.mailgun_api_key)
        _send_email(config, config.forward_email, full_subject, body, 'Contact Form')
    except Exception as e:
        return jsonify({'error': 'Failed to send message. Please try again later.'}), 500

    return jsonify({'message': 'Message sent successfully.'})
