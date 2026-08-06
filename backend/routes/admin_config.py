import os
import uuid
import base64
import io
import shutil
import subprocess
from flask import Blueprint, jsonify, request, current_app
from flask_login import current_user
from models import SiteConfig, SiteEventLog
from crypto import encrypt, decrypt
from routes.admin_auth import admin_required, role_at_least
from email_utils import send_email, mail_configured

admin_config_bp = Blueprint('admin_config', __name__)

ALLOWED_EXTENSIONS = {
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
    'mp4', 'webm', 'ogv', 'mov', 'avi',
    'mp3', 'wav', 'ogg', 'flac', 'm4a',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'csv',
}

IMAGE_OPTIMIZE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}


def _optimize_image(input_path, uploads_dir, base_name):
    """Convert image to WebP, generate 400/800/1200w variants, and a base64 LQIP.

    Returns (webp_filename, srcset_string, lqip_data_url).
    """
    from PIL import Image

    img = Image.open(input_path)
    # Flatten alpha to white for JPEG-based operations; keep alpha for WebP
    if img.mode == 'RGBA':
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    elif img.mode not in ('RGB',):
        img = img.convert('RGB')

    original_width = img.width

    # Full-size WebP
    webp_filename = f'{base_name}.webp'
    img.save(os.path.join(uploads_dir, webp_filename), 'WEBP', quality=82)

    # Responsive variants
    srcset_parts = []
    for w in (400, 800, 1200):
        if original_width > w:
            h = max(1, round(img.height * w / original_width))
            variant = img.resize((w, h), Image.LANCZOS)
        else:
            variant = img
        vname = f'{base_name}_{w}w.webp'
        variant.save(os.path.join(uploads_dir, vname), 'WEBP', quality=82)
        srcset_parts.append(f'/api/uploads/{vname} {w}w')
    srcset_parts.append(f'/api/uploads/{webp_filename}')
    srcset = ', '.join(srcset_parts)

    # LQIP: 32px wide blurred placeholder as base64 JPEG
    lqip_h = max(1, round(img.height * 32 / original_width))
    lqip_img = img.resize((32, lqip_h), Image.LANCZOS)
    buf = io.BytesIO()
    lqip_img.save(buf, 'JPEG', quality=20)
    lqip = f'data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}'

    return webp_filename, srcset, lqip

# Fields that are stored encrypted; GET returns _set booleans, PUT encrypts if provided
ENCRYPTED_FIELDS = ('mailgun_api_key', 'stripe_secret_key', 'stripe_webhook_secret', 'google_oauth_client_secret')


def _config_to_dict(config):
    """Serialize SiteConfig for the admin — includes all fields, secrets as _set flags."""
    result = {
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
        'home_meta_description': config.home_meta_description,
        'blog_enabled': config.blog_enabled,
        'blog_page_name': config.blog_page_name,
        'blog_slug': config.blog_slug,
        'projects_enabled': config.projects_enabled,
        'projects_page_name': config.projects_page_name,
        'projects_text': config.projects_text,
        'projects_meta_description': config.projects_meta_description,
        'projects_slug': config.projects_slug,
        'about_enabled': config.about_enabled,
        'about_page_name': config.about_page_name,
        'about_text': config.about_text,
        'about_meta_description': config.about_meta_description,
        'headshot_filename': config.headshot_filename,
        'about_slug': config.about_slug,
        'contact_enabled': config.contact_enabled,
        'contact_page_name': config.contact_page_name,
        'contact_slug': config.contact_slug,
        'mailgun_api_key_set': bool(config.mailgun_api_key),
        'mailgun_domain': config.mailgun_domain,
        'smtp_from_email': config.smtp_from_email,
        'forward_email': config.forward_email,
        'donate_enabled': config.donate_enabled,
        'donate_page_name': config.donate_page_name,
        'donate_slug': config.donate_slug,
        'stripe_publishable_key': config.stripe_publishable_key,
        'stripe_secret_key_set': bool(config.stripe_secret_key),
        'stripe_webhook_secret_set': bool(config.stripe_webhook_secret),
    }
    # AI demo settings are only exposed to the admin UI when this deployment
    # has the feature built in — see app.config['ENABLE_AI_DEMOS'].
    if current_app.config['ENABLE_AI_DEMOS']:
        result['ai_demo_enabled'] = config.ai_demo_enabled
        result['ai_demo_page_name'] = config.ai_demo_page_name
        result['ai_demo_slug'] = config.ai_demo_slug
    return result


@admin_config_bp.route('/api/admin/site-config', methods=['GET'])
@admin_required
def get_admin_config():
    config = SiteConfig.query.first()
    if not config:
        return jsonify({'error': 'No site config found'}), 404
    return jsonify(_config_to_dict(config))


ADMIN_ONLY_FIELDS = {
    'mailgun_api_key', 'mailgun_domain',
    'smtp_from_email', 'forward_email',
    'stripe_publishable_key', 'stripe_secret_key', 'stripe_webhook_secret',
}

@admin_config_bp.route('/api/admin/site-config', methods=['PUT'])
@role_at_least('editor')
def update_admin_config():
    config = SiteConfig.query.first()
    if not config:
        return jsonify({'error': 'No site config found'}), 404

    data = request.get_json(silent=True) or {}

    if current_user.role == 'editor' and ADMIN_ONLY_FIELDS & set(data.keys()):
        return jsonify({'error': 'Insufficient permissions to update these settings'}), 403

    # Plain fields — update if present in payload
    plain_fields = [
        'site_title', 'site_description', 'domain', 'favicon_filename', 'timezone', 'users_enabled',
        'google_oauth_client_id',
        'home_enabled', 'home_page_name', 'home_text', 'home_meta_description',
        'blog_enabled', 'blog_page_name', 'blog_slug',
        'projects_enabled', 'projects_page_name', 'projects_text', 'projects_meta_description', 'projects_slug',
        'about_enabled', 'about_page_name', 'about_text', 'about_meta_description', 'headshot_filename', 'about_slug',
        'contact_enabled', 'contact_page_name', 'contact_slug',
        'mailgun_domain', 'smtp_from_email', 'forward_email',
        'donate_enabled', 'donate_page_name', 'stripe_publishable_key', 'donate_slug',
    ]
    if current_app.config['ENABLE_AI_DEMOS']:
        plain_fields += ['ai_demo_enabled', 'ai_demo_page_name', 'ai_demo_slug']
    for field in plain_fields:
        if field in data:
            setattr(config, field, data[field])

    # Encrypted fields — only update if a non-empty value is provided
    if data.get('mailgun_api_key'):
        config.mailgun_api_key = encrypt(data['mailgun_api_key'])
    if data.get('stripe_secret_key'):
        config.stripe_secret_key = encrypt(data['stripe_secret_key'])
    if data.get('stripe_webhook_secret'):
        config.stripe_webhook_secret = encrypt(data['stripe_webhook_secret'])
    if data.get('google_oauth_client_secret'):
        config.google_oauth_client_secret = encrypt(data['google_oauth_client_secret'])

    # Write domain to certbot_domain.txt when set
    if 'domain' in data and data['domain']:
        cert_file = os.path.join(current_app.root_path, 'certbot_domain.txt')
        with open(cert_file, 'w') as f:
            f.write(data['domain'])

    # Log the settings change
    changed_keys = [k for k in data if k in plain_fields or k in ('mailgun_api_key', 'stripe_secret_key', 'stripe_webhook_secret', 'google_oauth_client_secret')]
    if changed_keys:
        subject = 'Site (' + ', '.join(changed_keys) + ')'
        entry = SiteEventLog(
            admin_id=current_user.id,
            admin_name=current_user.full_name,
            admin_avatar=current_user.avatar_filename,
            area='Settings',
            action_type='edited',
            subject=subject,
            subject_is_bold=False,
        )
        from extensions import db
        db.session.add(entry)

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
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({'error': 'File type not allowed.'}), 400

    base_name = uuid.uuid4().hex
    uploads_dir = os.path.join(current_app.root_path, 'uploads')
    os.makedirs(uploads_dir, exist_ok=True)

    if ext in IMAGE_OPTIMIZE_EXTENSIONS:
        tmp_path = os.path.join(uploads_dir, f'{base_name}_tmp.{ext}')
        file.save(tmp_path)
        try:
            filename, srcset, lqip = _optimize_image(tmp_path, uploads_dir, base_name)
        except Exception:
            return jsonify({'error': 'Could not process image. The file may be corrupted or unsupported.'}), 400
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        return jsonify({
            'filename': filename,
            'original_name': file.filename,
            'mime_type': 'image/webp',
            'size': os.path.getsize(os.path.join(uploads_dir, filename)),
            'srcset': srcset,
            'lqip': lqip,
        })

    filename = f'{base_name}.{ext}'
    saved_path = os.path.join(uploads_dir, filename)
    file.save(saved_path)
    return jsonify({
        'filename': filename,
        'original_name': file.filename,
        'mime_type': file.mimetype or '',
        'size': os.path.getsize(saved_path),
    })


def _transcode_to_mp3(input_path, output_path):
    if not shutil.which('ffmpeg'):
        raise FileNotFoundError('ffmpeg not found')
    result = subprocess.run(
        ['ffmpeg', '-y', '-i', input_path,
         '-codec:a', 'libmp3lame', '-qscale:a', '4',
         output_path],
        capture_output=True, timeout=60
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode())


@admin_config_bp.route('/api/admin/upload-recording', methods=['POST'])
@admin_required
def upload_recording():
    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'No file provided'}), 400

    base = uuid.uuid4().hex
    uploads_dir = os.path.join(current_app.root_path, 'uploads')
    os.makedirs(uploads_dir, exist_ok=True)

    orig_ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in (file.filename or '') else 'webm'
    tmp_path = os.path.join(uploads_dir, f'{base}_tmp.{orig_ext}')
    mp3_filename = f'{base}.mp3'
    mp3_path = os.path.join(uploads_dir, mp3_filename)

    file.save(tmp_path)
    try:
        _transcode_to_mp3(tmp_path, mp3_path)
    except FileNotFoundError:
        return jsonify({'error': 'ffmpeg_not_found'}), 500
    except Exception as e:
        return jsonify({'error': 'transcode_failed', 'detail': str(e)}), 500
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return jsonify({
        'filename': mp3_filename,
        'original_name': 'recording.mp3',
        'mime_type': 'audio/mpeg',
        'size': os.path.getsize(mp3_path),
    })


@admin_config_bp.route('/api/admin/contact/test-email', methods=['POST'])
@role_at_least('administrator')
def test_email():
    config = SiteConfig.query.first()
    if not mail_configured(config):
        return jsonify({'error': 'Mailgun is not configured'}), 503

    data = request.get_json(silent=True) or {}
    to_address = (data.get('to') or '').strip()
    if not to_address or '@' not in to_address:
        return jsonify({'error': 'A valid recipient email is required'}), 400

    # Decrypt API key for sending
    config.mailgun_api_key = decrypt(config.mailgun_api_key)
    try:
        send_email(config, to_address, 'Test email from your website', 'This is a test email confirming your Mailgun settings are working.', 'Test Email')
    except Exception:
        return jsonify({'error': 'Failed to send test email. Check your Mailgun settings.'}), 500

    return jsonify({'message': f'Test email sent to {to_address}'})
