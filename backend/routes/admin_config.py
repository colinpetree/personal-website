import os
import json
import uuid
import shutil
import subprocess
import logging
from datetime import datetime
from flask import Blueprint, jsonify, request, current_app
from flask_login import current_user
from models import SiteConfig, SiteEventLog
from crypto import encrypt, decrypt
from routes.admin_auth import admin_required, role_at_least
from email_utils import send_email, mail_configured
from upload_utils import save_and_optimize_image, save_favicon, IMAGE_OPTIMIZE_EXTENSIONS, HEADER_IMAGE_MAX_DIM, get_app_data_dir, get_uploads_dir
from varnish_purge import purge_all_public

logger = logging.getLogger(__name__)

admin_config_bp = Blueprint('admin_config', __name__)

ALLOWED_EXTENSIONS = {
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
    'mp4', 'webm', 'mov',
    'mp3', 'wav', 'ogg', 'flac', 'm4a',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'csv',
}

VIDEO_EXTENSIONS = {'mp4', 'webm', 'mov'}

# Matches the FileDropzone `accept` list on the Site icon field — no SVG,
# since ICO generation needs a raster source.
FAVICON_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

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
        'home_scrollable_nav_enabled': config.home_scrollable_nav_enabled,
        'home_page_width': config.home_page_width,
        'home_font_family': config.home_font_family,
        'blog_enabled': config.blog_enabled,
        'blog_page_name': config.blog_page_name,
        'blog_slug': config.blog_slug,
        'blog_text': config.blog_text,
        'blog_meta_description': config.blog_meta_description,
        'blog_font_family': config.blog_font_family,
        'projects_enabled': config.projects_enabled,
        'projects_page_name': config.projects_page_name,
        'projects_text': config.projects_text,
        'projects_meta_description': config.projects_meta_description,
        'projects_scrollable_nav_enabled': config.projects_scrollable_nav_enabled,
        'projects_slug': config.projects_slug,
        'projects_page_width': config.projects_page_width,
        'projects_font_family': config.projects_font_family,
        'contact_enabled': config.contact_enabled,
        'contact_page_name': config.contact_page_name,
        'contact_slug': config.contact_slug,
        'contact_text': config.contact_text,
        'contact_meta_description': config.contact_meta_description,
        'contact_scrollable_nav_enabled': config.contact_scrollable_nav_enabled,
        'contact_page_width': config.contact_page_width,
        'contact_font_family': config.contact_font_family,
        'mailgun_api_key_set': bool(config.mailgun_api_key),
        'mailgun_domain': config.mailgun_domain,
        'smtp_from_email': config.smtp_from_email,
        'forward_email': config.forward_email,
        'payment_enabled': config.payment_enabled,
        'payment_page_name': config.payment_page_name,
        'payment_slug': config.payment_slug,
        'payment_text': config.payment_text,
        'payment_meta_description': config.payment_meta_description,
        'payment_scrollable_nav_enabled': config.payment_scrollable_nav_enabled,
        'payment_page_width': config.payment_page_width,
        'payment_font_family': config.payment_font_family,
        'payment_comments_enabled': config.payment_comments_enabled,
        'stripe_publishable_key': config.stripe_publishable_key,
        'stripe_secret_key_set': bool(config.stripe_secret_key),
        'stripe_webhook_secret_set': bool(config.stripe_webhook_secret),
        'blog_comments_enabled': config.blog_comments_enabled,
        'analytics_start_date': config.analytics_start_date.isoformat() if config.analytics_start_date else None,
        'primary_navigation': json.loads(config.primary_navigation) if config.primary_navigation else [],
        'site_title_link': config.site_title_link,
    }
    # AI demo settings are only exposed to the admin UI when this deployment
    # has the feature built in — see app.config['ENABLE_AI_DEMOS'].
    if current_app.config['ENABLE_AI_DEMOS']:
        result['ai_demo_enabled'] = config.ai_demo_enabled
        result['ai_demo_page_name'] = config.ai_demo_page_name
        result['ai_demo_slug'] = config.ai_demo_slug
        result['ai_demo_text'] = config.ai_demo_text
        result['ai_demo_meta_description'] = config.ai_demo_meta_description
        result['ai_demo_scrollable_nav_enabled'] = config.ai_demo_scrollable_nav_enabled
        result['ai_demo_page_width'] = config.ai_demo_page_width
        result['ai_demo_font_family'] = config.ai_demo_font_family
    return result


@admin_config_bp.route('/api/admin/site-config', methods=['GET'])
@admin_required
def get_admin_config():
    config = SiteConfig.query.first()
    if not config:
        return jsonify({'error': 'No site config found'}), 404
    result = _config_to_dict(config)
    # Operational metadata about the running deployment, not a SiteConfig DB
    # column — added directly here rather than through _config_to_dict.
    from version import get_app_version, get_prerendered_at
    result['app_version'] = get_app_version()
    result['prerendered_at'] = get_prerendered_at()
    return jsonify(result)


ADMIN_ONLY_FIELDS = {
    'mailgun_api_key', 'mailgun_domain',
    'smtp_from_email', 'forward_email',
    'stripe_publishable_key', 'stripe_secret_key', 'stripe_webhook_secret',
    'analytics_start_date',
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
        'site_title', 'site_description', 'domain', 'favicon_filename', 'timezone', 'users_enabled', 'site_title_link',
        'home_enabled', 'home_page_name', 'home_text', 'home_meta_description', 'home_scrollable_nav_enabled', 'home_page_width', 'home_font_family',
        'blog_enabled', 'blog_page_name', 'blog_slug', 'blog_text', 'blog_meta_description', 'blog_comments_enabled', 'blog_font_family',
        'projects_enabled', 'projects_page_name', 'projects_text', 'projects_meta_description', 'projects_scrollable_nav_enabled', 'projects_slug', 'projects_page_width', 'projects_font_family',
        'contact_enabled', 'contact_page_name', 'contact_slug', 'contact_text', 'contact_meta_description', 'contact_scrollable_nav_enabled', 'contact_page_width', 'contact_font_family',
        'mailgun_domain', 'smtp_from_email', 'forward_email',
        'payment_enabled', 'payment_page_name', 'stripe_publishable_key', 'payment_slug', 'payment_comments_enabled',
        'payment_text', 'payment_meta_description', 'payment_scrollable_nav_enabled', 'payment_page_width', 'payment_font_family',
    ]
    if current_app.config['ENABLE_AI_DEMOS']:
        plain_fields += ['ai_demo_enabled', 'ai_demo_page_name', 'ai_demo_slug', 'ai_demo_text', 'ai_demo_meta_description', 'ai_demo_scrollable_nav_enabled', 'ai_demo_page_width', 'ai_demo_font_family']
    for field in plain_fields:
        if field in data:
            setattr(config, field, data[field])

    # Primary navigation (Pages feature, Ghost-style freeform label/url
    # pairs) — validated separately since it needs JSON (de)serialization.
    # No stricter URL validation than "non-empty string" — arbitrary internal
    # or external URLs are intentionally allowed, matching Ghost's own
    # leniency.
    if 'primary_navigation' in data:
        nav_items = data['primary_navigation']
        valid = isinstance(nav_items, list) and len(nav_items) <= 50
        if valid:
            for item in nav_items:
                if (
                    not isinstance(item, dict)
                    or not isinstance(item.get('label'), str) or not item['label'].strip() or len(item['label']) > 200
                    or not isinstance(item.get('url'), str) or not item['url'].strip() or len(item['url']) > 2000
                ):
                    valid = False
                    break
        if not valid:
            return jsonify({'error': 'Invalid primary_navigation'}), 400
        config.primary_navigation = json.dumps(
            [{'label': item['label'], 'url': item['url']} for item in nav_items]
        )

    # Analytics start date — validated/parsed separately since it's a Date,
    # not a plain string field.
    if 'analytics_start_date' in data:
        raw = data['analytics_start_date']
        if raw:
            if not isinstance(raw, str):
                return jsonify({'error': 'Invalid analytics_start_date'}), 400
            try:
                config.analytics_start_date = datetime.strptime(raw, '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'error': 'Invalid analytics_start_date'}), 400
        else:
            config.analytics_start_date = None

    # Google OAuth client ID — a stray leading/trailing space (easy to pick up
    # via copy-paste from Google Cloud Console) makes Google reject it outright
    # with a cryptic "Error 401: invalid_client", so strip it here rather than
    # storing it verbatim.
    if 'google_oauth_client_id' in data:
        config.google_oauth_client_id = (data['google_oauth_client_id'] or '').strip()

    # Encrypted fields — only update if a non-empty value is provided
    if data.get('mailgun_api_key'):
        config.mailgun_api_key = encrypt(data['mailgun_api_key'])
    if data.get('stripe_secret_key'):
        config.stripe_secret_key = encrypt(data['stripe_secret_key'])
    if data.get('stripe_webhook_secret'):
        config.stripe_webhook_secret = encrypt(data['stripe_webhook_secret'])
    if data.get('google_oauth_client_secret'):
        config.google_oauth_client_secret = encrypt(data['google_oauth_client_secret'].strip())

    # User accounts require Mailgun to be configured, since magic-link
    # sign-in and account-related emails depend on it — Google sign-in is
    # an optional add-on layered on top, not a substitute. Only block the
    # request that's actively turning users_enabled on; don't re-validate
    # this on every unrelated save, since a site with a pre-existing
    # users_enabled=True (from before Mailgun sign-in existed) shouldn't
    # get every future settings save rejected because of it.
    if data.get('users_enabled') and not mail_configured(config):
        return jsonify({'error': 'Mailgun must be configured before enabling user accounts'}), 400

    # Write domain to certbot_domain.txt when set
    if 'domain' in data and data['domain']:
        cert_file = os.path.join(get_app_data_dir(), 'certbot_domain.txt')
        with open(cert_file, 'w') as f:
            f.write(data['domain'])

    # Log the settings change
    changed_keys = [k for k in data if k in plain_fields or k in ('primary_navigation', 'mailgun_api_key', 'stripe_secret_key', 'stripe_webhook_secret', 'google_oauth_client_id', 'google_oauth_client_secret', 'analytics_start_date')]
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
    purge_all_public()
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
    uploads_dir = get_uploads_dir()
    os.makedirs(uploads_dir, exist_ok=True)

    if ext in IMAGE_OPTIMIZE_EXTENSIONS:
        # HeaderNode's full/fullscreen/linear layouts render this image edge-to-edge at up
        # to the full viewport width, well beyond the ~1200 CSS px content column the
        # default cap is tuned for, so the editor flags header uploads to use a wider cap.
        max_dim_kwargs = {'max_dim': HEADER_IMAGE_MAX_DIM} if request.form.get('context') == 'header' else {}
        try:
            filename, srcset, lqip, width, height = save_and_optimize_image(file, uploads_dir, **max_dim_kwargs)
        except Exception:
            return jsonify({'error': 'Could not process image. The file may be corrupted or unsupported.'}), 400
        return jsonify({
            'filename': filename,
            'original_name': file.filename,
            'mime_type': 'image/webp',
            'size': os.path.getsize(os.path.join(uploads_dir, filename)),
            'srcset': srcset,
            'lqip': lqip,
            'width': width,
            'height': height,
        })

    filename = f'{base_name}.{ext}'
    saved_path = os.path.join(uploads_dir, filename)
    file.save(saved_path)

    poster_filename = None
    if ext in VIDEO_EXTENSIONS:
        candidate = f'{base_name}_poster.jpg'
        candidate_path = os.path.join(uploads_dir, candidate)
        try:
            if _extract_video_poster(saved_path, candidate_path):
                poster_filename = candidate
        except Exception:
            logger.exception('Failed to extract video poster for %s', filename)

    return jsonify({
        'filename': filename,
        'original_name': file.filename,
        'mime_type': file.mimetype or '',
        'size': os.path.getsize(saved_path),
        'poster_filename': poster_filename,
    })


@admin_config_bp.route('/api/admin/upload-favicon', methods=['POST'])
@admin_required
def upload_favicon():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in FAVICON_EXTENSIONS:
        return jsonify({'error': 'File type not allowed.'}), 400

    uploads_dir = get_uploads_dir()
    os.makedirs(uploads_dir, exist_ok=True)

    try:
        filename = save_favicon(file, uploads_dir)
    except Exception:
        return jsonify({'error': 'Could not process image. The file may be corrupted or unsupported.'}), 400

    return jsonify({'filename': filename})


def _extract_video_poster(input_path, output_path):
    """Best-effort: grabs a representative (non-blank) frame via ffmpeg's
    `thumbnail` filter for use as the video's poster image. Returns False on
    any failure (missing ffmpeg, corrupt video, etc.) rather than raising —
    unlike _transcode_to_mp3, a poster is a nice-to-have, not the primary
    deliverable of a video upload."""
    if not shutil.which('ffmpeg'):
        return False
    result = subprocess.run(
        ['ffmpeg', '-y', '-i', input_path,
         '-vf', 'thumbnail,scale=640:-1', '-frames:v', '1',
         output_path],
        capture_output=True, timeout=60
    )
    return result.returncode == 0


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
    uploads_dir = get_uploads_dir()
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

    try:
        send_email(config, to_address, 'Test email from your website', 'This is a test email confirming your Mailgun settings are working.', 'Test Email', decrypt(config.mailgun_api_key))
    except Exception:
        return jsonify({'error': 'Failed to send test email. Check your Mailgun settings.'}), 500

    return jsonify({'message': f'Test email sent to {to_address}'})
