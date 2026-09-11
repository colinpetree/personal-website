from datetime import datetime
from flask import Blueprint, jsonify, request
from flask_login import current_user
from extensions import db
from models import Page, BlogPost, SiteConfig, SiteEventLog
from routes.admin_auth import admin_required, role_at_least
from varnish_purge import ban_pattern
from sanitize_html import sanitize_content_html
from slug_utils import slugify, unique_slug, get_reserved_slugs

admin_pages_bp = Blueprint('admin_pages', __name__)


def _log(area, action_type, subject, subject_is_bold=False):
    entry = SiteEventLog(
        admin_id=current_user.id,
        admin_name=current_user.full_name,
        admin_avatar=current_user.avatar_filename,
        area=area,
        action_type=action_type,
        subject=subject,
        subject_is_bold=subject_is_bold,
    )
    db.session.add(entry)


def _reserved_slugs():
    return get_reserved_slugs(SiteConfig.query.first())


def _ban_public_caches():
    # /api/resolve/<slug> is what the public :slug route actually fetches
    # (see routes/public_resolve.py) — banning only /api/pages would leave a
    # stale cached resolve response outliving this edit/publish/unpublish.
    ban_pattern('^/api/pages')
    ban_pattern('^/api/resolve')


def _page_to_dict(page, include_content=False):
    d = {
        'id': page.id,
        'title': page.title,
        'slug': page.slug,
        'meta_description': page.meta_description,
        'scrollable_nav_enabled': page.scrollable_nav_enabled,
        'page_width': page.page_width,
        'font_family': page.font_family,
        'status': page.status,
        'author_id': page.author_id,
        'created_at': page.created_at.isoformat() + 'Z',
        'updated_at': page.updated_at.isoformat() + 'Z',
    }
    if include_content:
        d['content_html'] = page.content_html
    return d


@admin_pages_bp.route('/api/admin/pages', methods=['GET'])
@admin_required
def list_pages():
    pages = Page.query.order_by(Page.updated_at.desc()).all()
    return jsonify([_page_to_dict(p) for p in pages])


@admin_pages_bp.route('/api/admin/pages', methods=['POST'])
@admin_required
def create_page():
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or 'Untitled').strip()
    slug = unique_slug([BlogPost, Page], slugify(title), _reserved_slugs())
    page = Page(
        title=title,
        slug=slug,
        status='draft',
        author_id=current_user.id,
    )
    db.session.add(page)
    _log('Page', 'added', title, subject_is_bold=True)
    db.session.commit()
    _ban_public_caches()
    return jsonify(_page_to_dict(page, include_content=True)), 201


@admin_pages_bp.route('/api/admin/pages/<int:page_id>', methods=['GET'])
@admin_required
def get_page(page_id):
    page = Page.query.get_or_404(page_id)
    return jsonify(_page_to_dict(page, include_content=True))


@admin_pages_bp.route('/api/admin/pages/<int:page_id>', methods=['PUT'])
@admin_required
def update_page(page_id):
    page = Page.query.get_or_404(page_id)
    data = request.get_json(silent=True) or {}

    if current_user.role == 'contributor':
        if page.author_id != current_user.id:
            return jsonify({'error': 'You can only edit your own pages'}), 403
        if data.get('status') == 'published':
            return jsonify({'error': 'Contributors cannot publish pages'}), 403

    if 'title' in data:
        page.title = (data['title'] or 'Untitled').strip()

    if 'slug' in data:
        new_slug = slugify(data['slug']) or slugify(page.title) or 'untitled'
        if new_slug in _reserved_slugs():
            return jsonify({'error': f'"{new_slug}" is a reserved path and cannot be used as a slug.'}), 400
        conflict = (
            Page.query.filter(Page.slug == new_slug, Page.id != page_id).first()
            or BlogPost.query.filter_by(slug=new_slug).first()
        )
        if conflict:
            return jsonify({'error': 'A page with this slug already exists.'}), 400
        page.slug = new_slug

    for field in ('content_html', 'meta_description', 'scrollable_nav_enabled', 'page_width', 'font_family'):
        if field in data:
            value = data[field]
            # Same trust model as admin_blog.py's update_post — contributors
            # are the lowest-trust writable role, so their HTML is sanitized
            # to block stored XSS from a malicious/compromised account.
            # Editor/administrator/owner content is trusted as-is.
            if field == 'content_html' and current_user.role == 'contributor':
                try:
                    value = sanitize_content_html(value)
                except ValueError:
                    return jsonify({'error': 'Invalid content_html'}), 400
            setattr(page, field, value)

    original_status = page.status

    if 'status' in data and data['status'] in ('draft', 'published'):
        page.status = data['status']

    page.updated_at = datetime.utcnow()

    # Same reasoning as admin_blog.py's update_post: a page losing
    # 'published' status drops out of get_content_version()'s Page filter
    # (WHERE status == 'published') the moment this commits, so the
    # updated_at bump above never reaches the public fingerprint on its own
    # — bump SiteConfig's row (unconditionally one of the fingerprinted
    # tables) to force the fingerprint to move for exactly this transition.
    if original_status == 'published' and page.status != 'published':
        fingerprint_config = SiteConfig.query.first()
        if fingerprint_config:
            fingerprint_config.updated_at = datetime.utcnow()

    _log('Page', 'edited', page.title, subject_is_bold=True)
    db.session.commit()
    _ban_public_caches()
    return jsonify(_page_to_dict(page, include_content=True))


@admin_pages_bp.route('/api/admin/pages/<int:page_id>', methods=['DELETE'])
@role_at_least('editor')
def delete_page(page_id):
    page = Page.query.get_or_404(page_id)
    was_published = page.status == 'published'
    _log('Page', 'deleted', page.title, subject_is_bold=True)
    db.session.delete(page)

    # Same reasoning as admin_blog.py's delete_post: deleting a published
    # page only moves get_content_version()'s Page MAX(updated_at) if it
    # happened to hold that max — deleting any other published page leaves
    # the fingerprint unchanged, so force the bump via SiteConfig instead.
    if was_published:
        fingerprint_config = SiteConfig.query.first()
        if fingerprint_config:
            fingerprint_config.updated_at = datetime.utcnow()

    db.session.commit()
    _ban_public_caches()
    return jsonify({'message': 'Page deleted'})
