from datetime import datetime
from flask import Blueprint, jsonify, request
from extensions import db
from models import BlogPost, Comment

blog_bp = Blueprint('blog', __name__)

RESERVED_SLUGS = {'', 'blog', 'projects', 'about', 'contact', 'demo', 'donate', 'admin', 'api'}


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
        'created_at': post.created_at.isoformat(),
        'updated_at': post.updated_at.isoformat(),
    }
    if include_content:
        d['content_html'] = post.content_html
    return d


def _comment_dict(c):
    return {
        'id': c.id,
        'content': c.content,
        'guest_name': c.guest_name,
        'created_at': c.created_at.isoformat(),
        'replies': [
            _comment_dict(r)
            for r in c.replies.filter_by(is_deleted=False).order_by(Comment.created_at).all()
        ],
    }


@blog_bp.route('/api/blog')
def list_posts():
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 10, type=int), 50)
    now = datetime.utcnow()
    q = (
        BlogPost.query
        .filter_by(status='published')
        .filter(
            (BlogPost.publish_date == None) | (BlogPost.publish_date <= now)
        )
        .order_by(
            BlogPost.publish_date.desc().nullslast(),
            BlogPost.created_at.desc()
        )
    )
    pagination = q.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        'posts': [_post_to_dict(p) for p in pagination.items],
        'total': pagination.total,
        'page': page,
        'pages': pagination.pages,
    })


@blog_bp.route('/api/blog/<slug>')
def get_post(slug):
    now = datetime.utcnow()
    post = BlogPost.query.filter_by(slug=slug, status='published').filter(
        (BlogPost.publish_date == None) | (BlogPost.publish_date <= now)
    ).first_or_404()
    return jsonify(_post_to_dict(post, include_content=True))


@blog_bp.route('/api/blog/<slug>/comments')
def list_comments(slug):
    post = BlogPost.query.filter_by(slug=slug).first_or_404()
    top_level = (
        Comment.query
        .filter_by(post_id=post.id, parent_id=None, is_deleted=False)
        .order_by(Comment.created_at)
        .all()
    )
    return jsonify([_comment_dict(c) for c in top_level])


@blog_bp.route('/api/blog/<slug>/comments', methods=['POST'])
def post_comment(slug):
    post = BlogPost.query.filter_by(slug=slug, status='published').first_or_404()
    data = request.get_json(silent=True) or {}

    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    content = (data.get('content') or '').strip()
    parent_id = data.get('parent_id')

    if not name or not content:
        return jsonify({'error': 'Name and message are required.'}), 400
    if email and '@' not in email:
        return jsonify({'error': 'Invalid email address.'}), 400

    comment = Comment(
        post_id=post.id,
        parent_id=parent_id,
        content=content,
        guest_name=name,
        guest_email=email or None,
    )
    db.session.add(comment)
    db.session.commit()
    return jsonify(_comment_dict(comment)), 201
