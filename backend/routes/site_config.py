import hmac
import json
import logging
from datetime import timezone
from email.utils import format_datetime
from flask import Blueprint, jsonify, current_app, request
from sqlalchemy import func
from extensions import db
from models import SiteConfig, Profile, Project, BlogPost, DEFAULT_NAV_ORDER

site_config_bp = Blueprint('site_config', __name__)
logger = logging.getLogger(__name__)


def _resolve_nav_order(config):
    """Admin-configured order (JSON array of keys) falling back to the
    default order, with any unknown/missing keys reconciled so a stale or
    unset value never drops a page from the nav."""
    try:
        saved = json.loads(config.nav_order) if config.nav_order else []
    except (TypeError, ValueError):
        saved = []
    order = [key for key in saved if key in DEFAULT_NAV_ORDER]
    order += [key for key in DEFAULT_NAV_ORDER if key not in order]
    return order


@site_config_bp.route('/api/site-config')
def get_site_config():
    config = SiteConfig.query.first()
    if not config:
        return jsonify({'error': 'Site not configured'}), 404

    nav_items = {
        'home': {
            'key': 'home',
            'name': config.home_page_name,
            'path': '/',
            'enabled': config.home_enabled,
        },
        'blog': {
            'key': 'blog',
            'name': config.blog_page_name,
            'path': f'/{config.blog_slug}',
            'enabled': config.blog_enabled,
        },
        'projects': {
            'key': 'projects',
            'name': config.projects_page_name,
            'path': f'/{config.projects_slug}',
            'enabled': config.projects_enabled,
        },
        'about': {
            'key': 'about',
            'name': config.about_page_name,
            'path': f'/{config.about_slug}',
            'enabled': config.about_enabled,
        },
        'contact': {
            'key': 'contact',
            'name': config.contact_page_name,
            'path': f'/{config.contact_slug}',
            # Contact requires Mailgun to be configured before showing
            'enabled': config.contact_enabled and bool(config.mailgun_api_key and config.mailgun_domain),
        },
        'ai_demo': {
            'key': 'ai_demo',
            'name': config.ai_demo_page_name,
            'path': f'/{config.ai_demo_slug}',
            # Also requires the deployment-time ENABLE_AI_DEMOS flag, so forks
            # without the AI demo feature never advertise it via the nav.
            'enabled': config.ai_demo_enabled and current_app.config['ENABLE_AI_DEMOS'],
        },
        'payment': {
            'key': 'payment',
            'name': config.payment_page_name,
            'path': f'/{config.payment_slug}',
            # Payment only requires Stripe to be configured — signing in is
            # optional now, guests can pay and manage subscriptions by email.
            'enabled': config.payment_enabled and bool(config.stripe_publishable_key),
        },
    }

    # Only return public-safe fields — no secrets (Mailgun API key, Stripe keys, OAuth secrets)
    return jsonify({
        'site_title': config.site_title,
        'favicon_filename': config.favicon_filename,
        # Not a secret — it's the site's own public hostname, visible in every
        # visitor's URL bar already. Needed by the frontend to build absolute
        # og:image URLs (Open Graph/Twitter Card scrapers fetch images
        # directly and don't resolve relative URLs against the page).
        'domain': config.domain,
        'nav': [nav_items[key] for key in _resolve_nav_order(config)],
        'slugs': {
            'blog': config.blog_slug,
            'projects': config.projects_slug,
            'about': config.about_slug,
            'contact': config.contact_slug,
            'ai_demo': config.ai_demo_slug,
            'payment': config.payment_slug,
        },
        'users_enabled': config.users_enabled,
        'google_oauth_client_id': config.google_oauth_client_id,
        # Page content fields needed by public pages
        'home_text': config.home_text,
        'projects_text': config.projects_text,
        'about_text': config.about_text,
        'blog_text': config.blog_text,
        'contact_text': config.contact_text,
        'ai_demo_text': config.ai_demo_text,
        'payment_text': config.payment_text,
        'home_meta_description': config.home_meta_description,
        'projects_meta_description': config.projects_meta_description,
        'about_meta_description': config.about_meta_description,
        'blog_meta_description': config.blog_meta_description,
        'contact_meta_description': config.contact_meta_description,
        'ai_demo_meta_description': config.ai_demo_meta_description,
        'payment_meta_description': config.payment_meta_description,
        'home_scrollable_nav_enabled': config.home_scrollable_nav_enabled,
        'projects_scrollable_nav_enabled': config.projects_scrollable_nav_enabled,
        'about_scrollable_nav_enabled': config.about_scrollable_nav_enabled,
        'contact_scrollable_nav_enabled': config.contact_scrollable_nav_enabled,
        'ai_demo_scrollable_nav_enabled': config.ai_demo_scrollable_nav_enabled,
        'payment_scrollable_nav_enabled': config.payment_scrollable_nav_enabled,
        'home_page_width': config.home_page_width,
        'projects_page_width': config.projects_page_width,
        'about_page_width': config.about_page_width,
        'contact_page_width': config.contact_page_width,
        'ai_demo_page_width': config.ai_demo_page_width,
        'payment_page_width': config.payment_page_width,
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
