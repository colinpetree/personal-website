from flask import Blueprint, jsonify
from models import SiteConfig

site_config_bp = Blueprint('site_config', __name__)


@site_config_bp.route('/api/site-config')
def get_site_config():
    config = SiteConfig.query.first()
    if not config:
        return jsonify({'error': 'Site not configured'}), 404

    # Only return public-safe fields — no secrets (SMTP password, Stripe keys, OAuth secrets)
    return jsonify({
        'site_title': config.site_title,
        'favicon_filename': config.favicon_filename,
        'nav': [
            {
                'key': 'home',
                'name': config.home_page_name,
                'path': '/',
                'enabled': config.home_enabled,
            },
            {
                'key': 'blog',
                'name': config.blog_page_name,
                'path': '/blog',
                'enabled': config.blog_enabled,
            },
            {
                'key': 'projects',
                'name': config.projects_page_name,
                'path': '/projects',
                'enabled': config.projects_enabled,
            },
            {
                'key': 'about',
                'name': config.about_page_name,
                'path': '/about',
                'enabled': config.about_enabled,
            },
            {
                'key': 'contact',
                'name': config.contact_page_name,
                'path': '/contact',
                # Contact requires SMTP to be configured before showing
                'enabled': config.contact_enabled and bool(config.smtp_host),
            },
            {
                'key': 'ai_demo',
                'name': config.ai_demo_page_name,
                'path': '/demo',
                'enabled': config.ai_demo_enabled,
            },
            {
                'key': 'donate',
                'name': config.donate_page_name,
                'path': '/donate',
                # Donate requires Stripe publishable key to be configured
                'enabled': config.donate_enabled and bool(config.stripe_publishable_key),
            },
        ],
        'users_enabled': config.users_enabled,
        'google_oauth_client_id': config.google_oauth_client_id,
    })
