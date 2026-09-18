import hmac
import json
import logging
from datetime import timezone
from email.utils import format_datetime
from flask import Blueprint, jsonify, current_app, request
from sqlalchemy import func
from extensions import db
from models import SiteConfig, Profile, Project, BlogPost, Page

site_config_bp = Blueprint('site_config', __name__)
logger = logging.getLogger(__name__)


@site_config_bp.route('/api/site-config')
def get_site_config():
    config = SiteConfig.query.first()
    if not config:
        return jsonify({'error': 'Site not configured'}), 404

    # Whether each fixed page is enabled — drives both the page_content
    # gating below and the public `nav` field's `enabled` flags (read by
    # frontend/src/utils/meta.js's isNavEnabled() to 404/noindex a disabled
    # page). `home` is never gated (see the page_content comment below) and
    # `about` is gone entirely: About is a regular `Page` row now (see
    # backend/app.py's one-time About->Page migration), not a fixed
    # SiteConfig-backed page, so it has no enabled/disabled toggle here.
    enabled = {
        'blog': config.blog_enabled,
        'projects': config.projects_enabled,
        'contact': config.contact_enabled and bool(config.mailgun_api_key and config.mailgun_domain),
        'ai_demo': config.ai_demo_enabled and current_app.config['ENABLE_AI_DEMOS'],
        'payment': config.payment_enabled and bool(config.stripe_publishable_key),
    }
    names = {
        'blog': config.blog_page_name,
        'projects': config.projects_page_name,
        'contact': config.contact_page_name,
        'ai_demo': config.ai_demo_page_name,
        'payment': config.payment_page_name,
    }

    # Per-page content (text/meta description/layout) is only exposed for
    # pages that are actually enabled — a disabled page must be
    # indistinguishable from one that doesn't exist at all, so its real
    # content never reaches a client that hotlinks the page or calls this
    # endpoint directly, even though the toggle only otherwise affects
    # frontend routing. `home` is deliberately excluded from this gating:
    # `home_enabled` only ever meant "show in nav" (see AdminHomePage.jsx),
    # never "block the page", so home content always stays public.
    page_content = {}
    for key, text_field, meta_field, scroll_field, width_field, font_field in [
        ('projects', 'projects_text', 'projects_meta_description', 'projects_scrollable_nav_enabled', 'projects_page_width', 'projects_font_family'),
        ('blog', 'blog_text', 'blog_meta_description', None, None, 'blog_font_family'),
        ('contact', 'contact_text', 'contact_meta_description', 'contact_scrollable_nav_enabled', 'contact_page_width', 'contact_font_family'),
        ('ai_demo', 'ai_demo_text', 'ai_demo_meta_description', 'ai_demo_scrollable_nav_enabled', 'ai_demo_page_width', 'ai_demo_font_family'),
        ('payment', 'payment_text', 'payment_meta_description', 'payment_scrollable_nav_enabled', 'payment_page_width', 'payment_font_family'),
    ]:
        if not enabled[key]:
            continue
        page_content[text_field] = getattr(config, text_field)
        page_content[meta_field] = getattr(config, meta_field)
        if scroll_field:
            page_content[scroll_field] = getattr(config, scroll_field)
        if width_field:
            page_content[width_field] = getattr(config, width_field)
        page_content[font_field] = getattr(config, font_field)

    # Only return public-safe fields — no secrets (Mailgun API key, Stripe keys, OAuth secrets)
    return jsonify({
        'site_title': config.site_title,
        'favicon_filename': config.favicon_filename,
        'social_image_filename': config.social_image_filename,
        # Not a secret — it's the site's own public hostname, visible in every
        # visitor's URL bar already. Needed by the frontend to build absolute
        # og:image URLs (Open Graph/Twitter Card scrapers fetch images
        # directly and don't resolve relative URLs against the page).
        'domain': config.domain,
        # Per-page enabled flags/names — NOT the site's navigation menu
        # (that's `primary_navigation` below); this only feeds isNavEnabled()
        # gating and the AI demo pages' "Back to {name}" link.
        'nav': [{'key': key, 'name': names[key], 'enabled': enabled[key]} for key in enabled],
        # Also exposed individually as `<key>_page_name` — each public page's
        # meta() reads its own field directly (e.g. `data.ai_demo_page_name`)
        # rather than searching `nav`, matching how it already reads its own
        # `<key>_meta_description` alongside this. Unconditional, same as the
        # `name` inside `nav` above — a page's display name was never gated
        # on its enabled flag, only its actual content is (see page_content).
        **{f'{key}_page_name': names[key] for key in names},
        'primary_navigation': json.loads(config.primary_navigation) if config.primary_navigation else [],
        'site_title_link': config.site_title_link,
        'slugs': {
            'blog': config.blog_slug,
            'projects': config.projects_slug,
            'contact': config.contact_slug,
            'ai_demo': config.ai_demo_slug,
            'payment': config.payment_slug,
        },
        'users_enabled': config.users_enabled,
        'google_oauth_client_id': config.google_oauth_client_id,
        # home content is always public — see page_content comment above.
        'home_text': config.home_text,
        'home_meta_description': config.home_meta_description,
        'home_scrollable_nav_enabled': config.home_scrollable_nav_enabled,
        'home_page_width': config.home_page_width,
        'home_font_family': config.home_font_family,
        **page_content,
        'stripe_publishable_key': config.stripe_publishable_key,
        'payment_comments_enabled': config.payment_comments_enabled,
        'blog_comments_enabled': config.blog_comments_enabled,
    })


@site_config_bp.route('/api/content-version', methods=['GET', 'HEAD'])
def get_content_version():
    """Public fingerprint of everything that feeds a prerendered page —
    polled by the Pi's content-watch.sh to detect edits that should trigger
    a rebuild. Returned as a standard Last-Modified header (not a JSON body)
    so the poller is a plain `curl -sI | grep`, and so this behaves like the
    ordinary HTTP conditional-request mechanism it actually is."""
    candidates = [
        db.session.query(func.max(SiteConfig.updated_at)).scalar(),
        db.session.query(func.max(Profile.updated_at)).scalar(),
        db.session.query(func.max(Project.updated_at)).scalar(),
        db.session.query(func.max(BlogPost.updated_at)).filter(BlogPost.status == 'published').scalar(),
        db.session.query(func.max(Page.updated_at)).filter(Page.status == 'published').scalar(),
    ]
    latest = max((c for c in candidates if c is not None), default=None)
    resp = current_app.response_class(status=204)
    if latest:
        resp.headers['Last-Modified'] = format_datetime(latest.replace(tzinfo=timezone.utc), usegmt=True)
    current_app.logger.debug('get_content_version: latest=%s', latest)
    return resp


@site_config_bp.route('/api/watcher-alert', methods=['POST'])
def post_watcher_alert():
    """Lets the Pi's content-watch.sh email the admin when its gh auth has
    been broken for an extended period — the Pi has no DB/Mailgun access of
    its own, so this is the only path it has to raise an alert. Not under
    /api/admin/: the Pi has no session cookie, so this is secured with a
    pre-shared secret (constant-time compared) instead of @admin_required."""
    secret = current_app.config.get('WATCHER_ALERT_SECRET', '')
    given = request.headers.get('X-Watcher-Secret', '')
    if not secret or not hmac.compare_digest(secret, given):
        # Never log `given` itself — logging a rejected secret attempt is
        # exactly the kind of thing that turns into a secret leaking into
        # log files. The fact of a rejection is the useful signal (repeated
        # ones could mean a misconfigured Pi, or someone probing this
        # endpoint), not the value that was tried.
        logger.warning('post_watcher_alert: rejected request with invalid/missing X-Watcher-Secret from %s',
                        request.remote_addr)
        return jsonify({'error': 'forbidden'}), 403
    data = request.get_json(silent=True) or {}
    from watcher_alerts import send_watcher_alert
    sent = send_watcher_alert(data.get('source', 'pi'), data.get('message', 'gh calls have been failing.'))
    # 502, not 200, on failure — content-watch.sh's `curl -sf` only touches
    # its ALERT_SENT_FILE on a 2xx response, so a genuine send failure here
    # needs to read as a failed request, not a successful one with a false
    # ok:true, or the Pi would stop retrying an alert that never actually
    # reached an inbox.
    return jsonify({'ok': sent}), (200 if sent else 502)
