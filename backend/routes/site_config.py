from flask import Blueprint, jsonify, current_app
from models import SiteConfig

site_config_bp = Blueprint('site_config', __name__)


@site_config_bp.route('/api/site-config')
def get_site_config():
    config = SiteConfig.query.first()
    if not config:
        return jsonify({'error': 'Site not configured'}), 404

    # Only return public-safe fields — no secrets (Mailgun API key, Stripe keys, OAuth secrets)
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
                'path': f'/{config.blog_slug}',
                'enabled': config.blog_enabled,
            },
            {
                'key': 'projects',
                'name': config.projects_page_name,
                'path': f'/{config.projects_slug}',
                'enabled': config.projects_enabled,
            },
            {
                'key': 'about',
                'name': config.about_page_name,
                'path': f'/{config.about_slug}',
                'enabled': config.about_enabled,
            },
            {
                'key': 'contact',
                'name': config.contact_page_name,
                'path': f'/{config.contact_slug}',
                # Contact requires Mailgun to be configured before showing
                'enabled': config.contact_enabled and bool(config.mailgun_api_key and config.mailgun_domain),
            },
            {
                'key': 'ai_demo',
                'name': config.ai_demo_page_name,
                'path': f'/{config.ai_demo_slug}',
                # Also requires the deployment-time ENABLE_AI_DEMOS flag, so forks
                # without the AI demo feature never advertise it via the nav.
                'enabled': config.ai_demo_enabled and current_app.config['ENABLE_AI_DEMOS'],
            },
            {
                'key': 'payment',
                'name': config.payment_page_name,
                'path': f'/{config.payment_slug}',
                # Payment requires Stripe to be configured and public users (Google login) enabled,
                # since paying now requires signing in.
                'enabled': config.payment_enabled and bool(config.stripe_publishable_key) and config.users_enabled,
            },
        ],
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
        'home_meta_description': config.home_meta_description,
        'projects_meta_description': config.projects_meta_description,
        'about_meta_description': config.about_meta_description,
        'headshot_filename': config.headshot_filename,
        'stripe_publishable_key': config.stripe_publishable_key,
    })
