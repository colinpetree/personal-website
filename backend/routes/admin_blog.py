import re
from datetime import datetime
from flask import Blueprint, jsonify, request
from flask_login import current_user
from extensions import db
from models import BlogPost, Comment, User, SiteEventLog
from routes.admin_auth import admin_required


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

RESERVED_SLUGS = {'', 'blog', 'projects', 'about', 'contact', 'demo', 'donate', 'admin', 'api'}


def _slugify(text):
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text


def _unique_slug(base, exclude_id=None):
    slug = base or 'untitled'
    if slug in RESERVED_SLUGS:
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
        'status': post.status,
        'publish_date': post.publish_date.isoformat() if post.publish_date else None,
        'thumbnail_filename': post.thumbnail_filename,
        'author_id': post.author_id,
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

    if 'title' in data:
        post.title = (data['title'] or 'Untitled').strip()

    if 'slug' in data:
        new_slug = _slugify(data['slug']) or _slugify(post.title) or 'untitled'
        if new_slug in RESERVED_SLUGS:
            return jsonify({'error': f'"{new_slug}" is a reserved path and cannot be used as a slug.'}), 400
        conflict = BlogPost.query.filter(BlogPost.slug == new_slug, BlogPost.id != post_id).first()
        if conflict:
            return jsonify({'error': 'A post with this slug already exists.'}), 400
        post.slug = new_slug

    for field in ('content_html', 'excerpt', 'meta_description', 'thumbnail_filename'):
        if field in data:
            setattr(post, field, data[field])

    if 'status' in data and data['status'] in ('draft', 'scheduled', 'published'):
        post.status = data['status']

    if 'publish_date' in data:
        post.publish_date = datetime.fromisoformat(data['publish_date']) if data['publish_date'] else None

    post.updated_at = datetime.utcnow()
    _log('Post', 'edited', post.title, subject_is_bold=True)
    db.session.commit()
    return jsonify(_post_to_dict(post, include_content=True))


@admin_blog_bp.route('/api/admin/blog/posts/<int:post_id>', methods=['DELETE'])
@admin_required
def delete_post(post_id):
    post = BlogPost.query.get_or_404(post_id)
    _log('Post', 'deleted', post.title, subject_is_bold=True)
    db.session.delete(post)
    db.session.commit()
    return jsonify({'message': 'Post deleted'})


@admin_blog_bp.route('/api/admin/blog/comments', methods=['GET'])
@admin_required
def list_comments():
    comments = Comment.query.order_by(Comment.created_at.asc()).all()
    result = []
    for c in comments:
        user = User.query.get(c.user_id) if c.user_id else None
        result.append({
            'id': c.id,
            'post_id': c.post_id,
            'post_title': c.post.title if c.post else None,
            'post_slug': c.post.slug if c.post else None,
            'author_name': user.name if user else (c.guest_name or 'Anonymous'),
            'author_email': user.email if user else c.guest_email,
            'is_user': user is not None,
            'content': c.content,
            'created_at': c.created_at.isoformat() + 'Z',
            'is_deleted': c.is_deleted,
            'parent_id': c.parent_id,
        })
    return jsonify(result)


@admin_blog_bp.route('/api/admin/blog/comments/<int:comment_id>', methods=['DELETE'])
@admin_required
def delete_comment(comment_id):
    comment = Comment.query.get_or_404(comment_id)
    excerpt = (comment.content or '')[:60]
    _log('Comment', 'deleted', f'"{excerpt}"')
    comment.is_deleted = True
    db.session.commit()
    return jsonify({'message': 'Comment deleted'})
