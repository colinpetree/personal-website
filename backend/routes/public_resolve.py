from datetime import datetime
from flask import Blueprint, jsonify, abort
from models import Page, BlogPost, BlogCategory, SiteConfig, DocsItem

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
        'docs': _docs_dict(page),
    }


def _docs_dict(page):
    """The docs sidebar + next/previous links for a page that belongs to a
    DocsSection, or None. Only published pages are listed (drafts stay in
    the section but are hidden), and a label is only listed when at least
    one published page sits under it before the next label."""
    membership = DocsItem.query.filter_by(page_id=page.id).first()
    # section is None only for an orphaned row (should never happen); render
    # the page without a sidebar rather than failing the whole request.
    if not membership or not membership.section:
        return None
    section = membership.section
    rows = (
        DocsItem.query
        .outerjoin(Page, DocsItem.page_id == Page.id)
        .add_columns(Page.title, Page.slug, Page.status)
        .filter(DocsItem.section_id == section.id)
        .order_by(DocsItem.order)
        .all()
    )

    items = []
    pending_label = None
    for item, title, slug, status in rows:
        if item.kind == 'label':
            pending_label = {'kind': 'label', 'label': item.label}
        elif status == 'published':
            if pending_label:
                items.append(pending_label)
                pending_label = None
            items.append({'kind': 'page', 'title': title, 'slug': slug})

    pages = [i for i in items if i['kind'] == 'page']
    index = next((n for n, p in enumerate(pages) if p['slug'] == page.slug), None)
    previous = pages[index - 1] if index is not None and index > 0 else None
    next_page = pages[index + 1] if index is not None and index + 1 < len(pages) else None
    # The section's name is only for organizing sections in the admin, so
    # it isn't sent; a visible heading is added as a label item instead.
    return {
        'items': items,
        'previous': {'title': previous['title'], 'slug': previous['slug']} if previous else None,
        'next': {'title': next_page['title'], 'slug': next_page['slug']} if next_page else None,
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
