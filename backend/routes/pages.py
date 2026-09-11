from flask import Blueprint, jsonify, request
from models import Page

pages_bp = Blueprint('pages', __name__)


@pages_bp.route('/api/pages/<slug>')
def get_page(slug):
    page = Page.query.filter_by(slug=slug, status='published').first_or_404()
    return jsonify({
        'id': page.id,
        'title': page.title,
        'slug': page.slug,
        'content_html': page.content_html,
        'meta_description': page.meta_description,
        'scrollable_nav_enabled': page.scrollable_nav_enabled,
        'page_width': page.page_width,
        'font_family': page.font_family,
        'updated_at': page.updated_at.isoformat() + 'Z',
    })


@pages_bp.route('/api/pages')
def list_pages():
    # Published-only, on purpose — this is the sole feed the prerender
    # pipeline's listAllPublishedPageSlugs() paginates through (see
    # frontend/src/lib/prerenderData.js). Leaking a draft slug here would
    # bake that draft into the static prerendered build and make it
    # publicly reachable/crawlable, defeating "not public until published."
    page_num = request.args.get('page', 1, type=int) or 1
    per_page = request.args.get('per_page', 50, type=int) or 50
    pagination = (
        Page.query.filter_by(status='published')
        .order_by(Page.updated_at.desc())
        .paginate(page=page_num, per_page=per_page, error_out=False)
    )
    return jsonify({
        # 'items' (not 'pages') to avoid colliding with the pagination
        # page-count field below — mirrors /api/blog's 'posts'/'pages' split.
        'items': [{'slug': p.slug, 'updated_at': p.updated_at.isoformat() + 'Z'} for p in pagination.items],
        'total': pagination.total,
        'page': page_num,
        'pages': pagination.pages,
    })
