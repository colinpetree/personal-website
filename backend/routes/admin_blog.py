import re
from datetime import datetime
from flask import Blueprint, jsonify, request
from flask_login import current_user
from extensions import db
from models import BlogPost, Comment, User, AdminAccount, SiteEventLog, SiteConfig, BlogCategory
from routes.admin_auth import admin_required, role_at_least
from varnish_purge import ban_pattern
from sanitize_html import sanitize_content_html


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

admin_blog_bp = Blueprint('admin_blog', __name__)

_STATIC_RESERVED = {'', 'admin', 'api', 'profile', 'search'}


def _get_reserved_slugs():
    config = SiteConfig.query.first()
    if config:
        return _STATIC_RESERVED | {
            config.blog_slug, config.projects_slug, config.about_slug,
            config.contact_slug, config.ai_demo_slug, config.payment_slug,
        }
    return _STATIC_RESERVED | {'blog', 'projects', 'about', 'contact', 'demo', 'payment'}


def _slugify(text):
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text


def _unique_slug(base, exclude_id=None):
    slug = base or 'untitled'
    reserved = _get_reserved_slugs()
    if slug in reserved:
        slug = slug + '-post'
    counter = 1
    while True:
        q = BlogPost.query.filter_by(slug=slug)
        if exclude_id:
            q = q.filter(BlogPost.id != exclude_id)
        if not q.first():
            return slug
        slug = f'{base}-{counter}'
        counter += 1


def _post_to_dict(post, include_content=False):
    d = {
        'id': post.id,
        'title': post.title,
        'slug': post.slug,
        'excerpt': post.excerpt,
        'meta_description': post.meta_description,
        'scrollable_nav_enabled': post.scrollable_nav_enabled,
        'status': post.status,
        'publish_date': post.publish_date.isoformat() if post.publish_date else None,
        'thumbnail_filename': post.thumbnail_filename,
        'thumbnail_caption': post.thumbnail_caption,
        'thumbnail_width': post.thumbnail_width,
        'thumbnail_height': post.thumbnail_height,
        'author_id': post.author_id,
        'category_id': post.category_id,
        'created_at': post.created_at.isoformat() + 'Z',
        'updated_at': post.updated_at.isoformat() + 'Z',
    }
    if include_content:
        d['content_html'] = post.content_html
    return d


def _promote_scheduled():
    now = datetime.utcnow()
    BlogPost.query.filter(
        BlogPost.status == 'scheduled',
        BlogPost.publish_date <= now
    ).update({'status': 'published'})
    db.session.commit()


@admin_blog_bp.route('/api/admin/blog/posts', methods=['GET'])
@admin_required
def list_posts():
    _promote_scheduled()
    posts = BlogPost.query.order_by(BlogPost.updated_at.desc()).all()
    return jsonify([_post_to_dict(p) for p in posts])


@admin_blog_bp.route('/api/admin/blog/posts', methods=['POST'])
@admin_required
def create_post():
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or 'Untitled').strip()
    slug = _unique_slug(_slugify(title))
    post = BlogPost(
        title=title,
        slug=slug,
        status='draft',
        author_id=current_user.id,
    )
    db.session.add(post)
    _log('Post', 'added', title, subject_is_bold=True)
    db.session.commit()
    ban_pattern('^/api/blog')
    return jsonify(_post_to_dict(post, include_content=True)), 201


@admin_blog_bp.route('/api/admin/blog/posts/<int:post_id>', methods=['GET'])
@admin_required
def get_post(post_id):
    _promote_scheduled()
    post = BlogPost.query.get_or_404(post_id)
    return jsonify(_post_to_dict(post, include_content=True))


@admin_blog_bp.route('/api/admin/blog/posts/<int:post_id>', methods=['PUT'])
@admin_required
def update_post(post_id):
    post = BlogPost.query.get_or_404(post_id)
    data = request.get_json(silent=True) or {}

    if current_user.role == 'contributor':
        if post.author_id != current_user.id:
            return jsonify({'error': 'You can only edit your own posts'}), 403
        if data.get('status') in ('published', 'scheduled'):
            return jsonify({'error': 'Contributors cannot publish or schedule posts'}), 403

    if 'title' in data:
        post.title = (data['title'] or 'Untitled').strip()

    if 'slug' in data:
        new_slug = _slugify(data['slug']) or _slugify(post.title) or 'untitled'
        if new_slug in _get_reserved_slugs():
            return jsonify({'error': f'"{new_slug}" is a reserved path and cannot be used as a slug.'}), 400
        conflict = BlogPost.query.filter(BlogPost.slug == new_slug, BlogPost.id != post_id).first()
        if conflict:
            return jsonify({'error': 'A post with this slug already exists.'}), 400
        post.slug = new_slug

    for field in ('content_html', 'excerpt', 'meta_description', 'scrollable_nav_enabled', 'thumbnail_filename', 'thumbnail_caption', 'thumbnail_width', 'thumbnail_height'):
        if field in data:
            value = data[field]
            # Contributors are the lowest-trust writable role — sanitize their
            # HTML so a malicious/compromised contributor account can't plant
            # stored XSS. Editor/administrator/owner content is trusted as-is
            # (same trust level as editing site config directly).
            if field == 'content_html' and current_user.role == 'contributor':
                try:
                    value = sanitize_content_html(value)
                except ValueError:
                    return jsonify({'error': 'Invalid content_html'}), 400
            setattr(post, field, value)

    if 'category_id' in data:
        category_id = data['category_id']
        if category_id is None:
            post.category_id = None
        elif not isinstance(category_id, int) or isinstance(category_id, bool):
            return jsonify({'error': 'Invalid category_id'}), 400
        else:
            category = BlogCategory.query.get(category_id)
            if not category:
                return jsonify({'error': 'Category not found'}), 400
            post.category_id = category.id

    original_status = post.status

    if 'status' in data and data['status'] in ('draft', 'scheduled', 'published'):
        post.status = data['status']

    if 'publish_date' in data:
        post.publish_date = datetime.fromisoformat(data['publish_date']) if data['publish_date'] else None

    post.updated_at = datetime.utcnow()

    # A post losing 'published' status (unpublish, or back to draft/
    # scheduled) drops out of get_content_version()'s BlogPost filter
    # (`WHERE status == 'published'`) the moment this commits — so the
    # updated_at bump above never reaches the public fingerprint, and the
    # Pi's content-watcher sees no change and skips the rebuild that's
    # supposed to pull the now-unpublished page down. Publishing (or
    # staying published) doesn't need this: that bump already lands inside
    # the filter on its own. Piggybacking on SiteConfig's row (always
    # exists, already one of the four fingerprinted tables) is the least
    # invasive way to force the fingerprint to move for exactly this
    # transition, without also triggering a rebuild for routine
    # draft-to-draft edits the way removing the status filter entirely
    # would.
    if original_status == 'published' and post.status != 'published':
        fingerprint_config = SiteConfig.query.first()
        if fingerprint_config:
            fingerprint_config.updated_at = datetime.utcnow()

    _log('Post', 'edited', post.title, subject_is_bold=True)
    db.session.commit()
    ban_pattern('^/api/blog')
    return jsonify(_post_to_dict(post, include_content=True))


@admin_blog_bp.route('/api/admin/blog/posts/<int:post_id>', methods=['DELETE'])
@role_at_least('editor')
def delete_post(post_id):
    post = BlogPost.query.get_or_404(post_id)
    was_published = post.status == 'published'
    _log('Post', 'deleted', post.title, subject_is_bold=True)
    db.session.delete(post)

    # Same reasoning as update_post()'s unpublish branch: get_content_version()
    # fingerprints BlogPost via MAX(updated_at) WHERE status == 'published',
    # so deleting a row only moves that MAX() if the deleted post happened to
    # hold it — deleting any OTHER published post leaves the fingerprint
    # unchanged, and the Pi's content-watcher would skip the rebuild that's
    # supposed to pull the now-deleted post's stale prerendered page down.
    if was_published:
        fingerprint_config = SiteConfig.query.first()
        if fingerprint_config:
            fingerprint_config.updated_at = datetime.utcnow()

    db.session.commit()
    ban_pattern('^/api/blog')
    return jsonify({'message': 'Post deleted'})


@admin_blog_bp.route('/api/admin/blog/comments', methods=['GET'])
@role_at_least('editor')
def list_comments():
    comments = Comment.query.order_by(Comment.created_at.asc()).all()
    result = []
    for c in comments:
        admin = AdminAccount.query.get(c.admin_id) if c.admin_id else None
        user = User.query.get(c.user_id) if c.user_id else None
        result.append({
            'id': c.id,
            'post_id': c.post_id,
            'post_title': c.post.title if c.post else None,
            'post_slug': c.post.slug if c.post else None,
            'author_name': admin.full_name if admin else (user.name if user else (c.guest_name or 'Anonymous')),
            'author_email': user.email if user else c.guest_email,
            'is_user': user is not None,
            'is_owner_author': admin is not None and admin.role == 'owner',
            'is_staff': admin is not None and admin.role != 'owner',
            'content': c.content,
            'created_at': c.created_at.isoformat() + 'Z',
            'is_deleted': c.is_deleted,
            'parent_id': c.parent_id,
        })
    return jsonify(result)


@admin_blog_bp.route('/api/admin/blog/comments/<int:comment_id>', methods=['DELETE'])
@role_at_least('editor')
def delete_comment(comment_id):
    comment = Comment.query.get_or_404(comment_id)
    excerpt = (comment.content or '')[:60]
    _log('Comment', 'deleted', f'"{excerpt}"')
    comment.is_deleted = True
    db.session.commit()
    ban_pattern('^/api/blog')
    return jsonify({'message': 'Comment deleted'})
