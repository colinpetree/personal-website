import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import Blueprint, jsonify, request
from models import SiteConfig

contact_bp = Blueprint('contact', __name__)


def _send_email(config, to_address, subject, body_text):
    """Send an email using the SiteConfig SMTP settings. Raises on failure."""
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = f'{config.smtp_sender_name} <{config.smtp_from_email}>'
    msg['To'] = to_address
    msg.attach(MIMEText(body_text, 'plain'))

    port = config.smtp_port or 587

    if port == 465:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(config.smtp_host, port, context=context) as server:
            server.login(config.smtp_user, config.smtp_password)
            server.sendmail(config.smtp_from_email, to_address, msg.as_string())
    else:
        with smtplib.SMTP(config.smtp_host, port) as server:
            server.ehlo()
            server.starttls()
            server.login(config.smtp_user, config.smtp_password)
            server.sendmail(config.smtp_from_email, to_address, msg.as_string())


def _smtp_configured(config):
    return bool(
        config
        and config.contact_enabled
        and config.smtp_host
        and config.smtp_user
        and config.smtp_password
        and config.smtp_from_email
    )


@contact_bp.route('/api/contact', methods=['POST'])
def submit_contact():
    config = SiteConfig.query.first()
    if not _smtp_configured(config):
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
        _send_email(config, config.smtp_from_email, full_subject, body)
    except Exception as e:
        return jsonify({'error': 'Failed to send message. Please try again later.'}), 500

    return jsonify({'message': 'Message sent successfully.'})
