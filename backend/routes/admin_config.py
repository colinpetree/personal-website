import os
import uuid
from flask import Blueprint, jsonify, request, current_app
from models import SiteConfig
from crypto import encrypt, decrypt
from routes.admin_auth import admin_required
from routes.contact import _send_email, _smtp_configured

admin_config_bp = Blueprint('admin_config', __name__)

ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# Fields that are stored encrypted; GET returns _set booleans, PUT encrypts if provided
ENCRYPTED_FIELDS = ('smtp_password', 'stripe_secret_key', 'google_oauth_client_secret')


def _config_to_dict(config):
    """Serialize SiteConfig for the admin — includes all fields, secrets as _set flags."""
    return {
        'site_title': config.site_title,
        'site_description': config.site_description,
        'domain': config.domain,
        'favicon_filename': config.favicon_filename,
        'timezone': config.timezone,
        'users_enabled': config.users_enabled,
        'google_oauth_client_id': config.google_oauth_client_id,
        'google_oauth_client_secret_set': bool(config.google_oauth_client_secret),
        'google_oauth_redirect_uri': (
            f'https://{config.domain}/api/auth/google/callback'
            if config.domain and not current_app.debug
            else request.host_url.rstrip('/') + '/api/auth/google/callback'
        ),
        'home_enabled': config.home_enabled,
        'home_page_name': config.home_page_name,
        'home_text': config.home_text,
        'blog_enabled': config.blog_enabled,
        'blog_page_name': config.blog_page_name,
        'blog_slug': config.blog_slug,
        'projects_enabled': config.projects_enabled,
        'projects_page_name': config.projects_page_name,
        'projects_text': config.projects_text,
        'projects_slug': config.projects_slug,
        'about_enabled': config.about_enabled,
        'about_page_name': config.about_page_name,
        'about_text': config.about_text,
        'headshot_filename': config.headshot_filename,
        'about_slug': config.about_slug,
        'contact_enabled': config.contact_enabled,
        'contact_page_name': config.contact_page_name,
        'contact_slug': config.contact_slug,
        'smtp_host': config.smtp_host,
        'smtp_port': config.smtp_port,
        'smtp_user': config.smtp_user,
        'smtp_password_set': bool(config.smtp_password),
        'smtp_from_email': config.smtp_from_email,
        'smtp_sender_name': config.smtp_sender_name,
        'forward_email': config.forward_email,
        'ai_demo_enabled': config.ai_demo_enabled,
        'ai_demo_page_name': config.ai_demo_page_name,
        'ai_demo_slug': config.ai_demo_slug,
        'donate_enabled': config.donate_enabled,
        'donate_page_name': config.donate_page_name,
        'donate_slug': config.donate_slug,
        'stripe_publishable_key': config.stripe_publishable_key,
        'stripe_secret_key_set': bool(config.stripe_secret_key),
    }


@admin_config_bp.route('/api/admin/site-config', methods=['GET'])
@admin_required
def get_admin_config():
    config = SiteConfig.query.first()
    if not config:
        return jsonify({'error': 'No site config found'}), 404
    return jsonify(_config_to_dict(config))


@admin_config_bp.route('/api/admin/site-config', methods=['PUT'])
@admin_required
def update_admin_config():
    config = SiteConfig.query.first()
    if not config:
        return jsonify({'error': 'No site config found'}), 404

    data = request.get_json(silent=True) or {}

    # Plain fields — update if present in payload
    plain_fields = [
        'site_title', 'site_description', 'domain', 'favicon_filename', 'timezone', 'users_enabled',
        'google_oauth_client_id',
        'home_enabled', 'home_page_name', 'home_text',
        'blog_enabled', 'blog_page_name', 'blog_slug',
        'projects_enabled', 'projects_page_name', 'projects_text', 'projects_slug',
        'about_enabled', 'about_page_name', 'about_text', 'headshot_filename', 'about_slug',
        'contact_enabled', 'contact_page_name', 'contact_slug',
        'smtp_host', 'smtp_port', 'smtp_user', 'smtp_from_email', 'smtp_sender_name', 'forward_email',
        'ai_demo_enabled', 'ai_demo_page_name', 'ai_demo_slug',
        'donate_enabled', 'donate_page_name', 'stripe_publishable_key', 'donate_slug',
    ]
    for field in plain_fields:
        if field in data:
            setattr(config, field, data[field])

    # Encrypted fields — only update if a non-empty value is provided
    if data.get('smtp_password'):
        config.smtp_password = encrypt(data['smtp_password'])
    if data.get('stripe_secret_key'):
        config.stripe_secret_key = encrypt(data['stripe_secret_key'])
    if data.get('google_oauth_client_secret'):
        config.google_oauth_client_secret = encrypt(data['google_oauth_client_secret'])

    # Write domain to certbot_domain.txt when set
    if 'domain' in data and data['domain']:
        cert_file = os.path.join(current_app.root_path, 'certbot_domain.txt')
        with open(cert_file, 'w') as f:
            f.write(data['domain'])

    from extensions import db
    db.session.commit()
    return jsonify(_config_to_dict(config))


@admin_config_bp.route('/api/admin/upload', methods=['POST'])
@admin_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({'error': f'File type not allowed. Allowed: {", ".join(ALLOWED_IMAGE_EXTENSIONS)}'}), 400

    filename = f'{uuid.uuid4().hex}.{ext}'
    uploads_dir = os.path.join(current_app.root_path, 'uploads')
    os.makedirs(uploads_dir, exist_ok=True)
    file.save(os.path.join(uploads_dir, filename))

    return jsonify({'filename': filename})


@admin_config_bp.route('/api/admin/contact/test-email', methods=['POST'])
@admin_required
def test_email():
    config = SiteConfig.query.first()
    smtp_ready = bool(
        config
        and config.smtp_host
        and config.smtp_user
        and config.smtp_password
        and config.smtp_from_email
    )
    if not smtp_ready:
        return jsonify({'error': 'SMTP is not configured'}), 503

    data = request.get_json(silent=True) or {}
    to_address = (data.get('to') or '').strip()
    if not to_address or '@' not in to_address:
        return jsonify({'error': 'A valid recipient email is required'}), 400

    # Decrypt password for sending
    config.smtp_password = decrypt(config.smtp_password)
    try:
        _send_email(config, to_address, 'Test email from your website', 'This is a test email confirming your SMTP settings are working.')
    except Exception:
        return jsonify({'error': 'Failed to send test email. Check your SMTP settings.'}), 500

    return jsonify({'message': f'Test email sent to {to_address}'})
