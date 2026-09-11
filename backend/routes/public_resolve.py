from datetime import datetime
from flask import Blueprint, jsonify, abort
from models import Page, BlogPost, BlogCategory, SiteConfig

public_resolve_bp = Blueprint('public_resolve', __name__)


def _page_dict(page):
    return {
        'kind': 'page',
        'id': page.id,
        'title': page.title,
        'slug': page.slug,
        'content_html': page.content_html,
        'meta_description': page.meta_description,
        'scrollable_nav_enabled': page.scrollable_nav_enabled,
        'page_width': page.page_width,
        'font_family': page.font_family,
        'updated_at': page.updated_at.isoformat() + 'Z',
    }


def _post_dict(post):
    category = BlogCategory.query.get(post.category_id) if post.category_id else None
    return {
        'kind': 'post',
        'id': post.id,
        'title': post.title,
        'slug': post.slug,
        'content_html': post.content_html,
        'excerpt': post.excerpt,
        'meta_description': post.meta_description,
        'scrollable_nav_enabled': post.scrollable_nav_enabled,
        'font_family': post.font_family,
        'publish_date': post.publish_date.isoformat() if post.publish_date else None,
        'thumbnail_filename': post.thumbnail_filename,
        'thumbnail_caption': post.thumbnail_caption,
        'thumbnail_width': post.thumbnail_width,
        'thumbnail_height': post.thumbnail_height,
        'list_thumbnail_filename': post.list_thumbnail_filename,
        'category_id': post.category_id,
        'category_name': category.name if category else None,
        'category_slug': category.slug if category else None,
        'created_at': post.created_at.isoformat() + 'Z',
        'updated_at': post.updated_at.isoformat() + 'Z',
    }


@public_resolve_bp.route('/api/resolve/<slug>')
def resolve_slug(slug):
    """Single lookup the public :slug catch-all (and the prerender pipeline,
    indirectly) uses to figure out whether a URL is a Page or a blog post —
    they now share the same top-level slug namespace. Checks Page first,
    then BlogPost; 404s if neither matches (a draft/unpublished/deleted
    slug is indistinguishable from one that never existed)."""
    page = Page.query.filter_by(slug=slug, status='published').first()
    if page:
        return jsonify(_page_dict(page))

    # Pages have no site-wide enable/disable toggle, so the check above is
    # unconditional — but Blog does (SiteConfig.blog_enabled), and blog.py's
    # own public GET /api/blog/<slug> 404s a published post outright when
    # it's off (see blog.py's _require_blog_enabled — a disabled blog must
    # be indistinguishable from one that never existed). This lookup has to
    # replicate that same gate, or disabling Blog site-wide would stop
    # actually hiding individual published posts reachable by direct URL
    # the moment something starts calling this endpoint instead of
    # /api/blog/<slug> directly.
    config = SiteConfig.query.first()
    if config and config.blog_enabled:
        now = datetime.utcnow()
        post = (
            BlogPost.query
            .filter_by(slug=slug, status='published')
            .filter((BlogPost.publish_date == None) | (BlogPost.publish_date <= now))
            .first()
        )
        if post:
            return jsonify(_post_dict(post))

    abort(404)
