from flask import Blueprint, jsonify

from models import BlogPost, Page, SiteConfig
from routes.admin_auth import admin_required
from routes.search import section_enabled

admin_internal_links_bp = Blueprint('admin_internal_links', __name__)

# 'about' is deliberately excluded — About is now a regular Page row
# (see the about-to-Page migration), picked up by the Page query below.
_FIXED_SECTIONS = ['home', 'blog', 'projects', 'contact', 'ai_demo', 'payment']


@admin_internal_links_bp.route('/api/admin/internal-links', methods=['GET'])
@admin_required
def list_internal_links():
    links = []

    config = SiteConfig.query.first()
    if config:
        for section in _FIXED_SECTIONS:
            if not section_enabled(config, section):
                continue
            slug = '' if section == 'home' else getattr(config, f'{section}_slug')
            links.append({
                'title': getattr(config, f'{section}_page_name'),
                'url': f'/{slug}' if slug else '/',
            })

    for page in Page.query.filter_by(status='published').all():
        links.append({'title': page.title, 'url': f'/{page.slug}'})

    for post in BlogPost.query.filter_by(status='published').all():
        links.append({'title': post.title, 'url': f'/{post.slug}'})

    links.sort(key=lambda l: l['url'].lower())
    return jsonify(links)
