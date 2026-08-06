from datetime import datetime
from flask import Blueprint, jsonify, request, session
from flask_login import current_user
from extensions import db
from models import AdminAccount, BlogPost, Comment, SiteConfig, User
from crypto import decrypt

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
        'thumbnail_caption': post.thumbnail_caption,
        'thumbnail_width': post.thumbnail_width,
        'thumbnail_height': post.thumbnail_height,
        'created_at': post.created_at.isoformat() + 'Z',
        'updated_at': post.updated_at.isoformat() + 'Z',
    }
    if include_content:
        d['content_html'] = post.content_html
    return d


def _comment_dict(c):
    user = User.query.get(c.user_id) if c.user_id else None
    admin = AdminAccount.query.get(c.admin_id) if c.admin_id else None
    if admin:
        author_name = admin.full_name
        author_title = admin.title
        author_avatar = f'/api/uploads/{admin.avatar_filename}' if admin.avatar_filename else None
        is_owner_author = admin.role == 'owner'
    elif user:
        author_name = user.name
        author_title = user.title
        author_avatar = user.avatar_url
        is_owner_author = False
    else:
        author_name = c.guest_name or 'Anonymous'
        author_title = None
        author_avatar = None
        is_owner_author = False

    return {
        'id': c.id,
        'content': c.content,
        'author_name': author_name,
        'author_title': author_title,
        'author_avatar': author_avatar,
        'user_id': c.user_id,
        'admin_id': c.admin_id,
        'is_user': user is not None or admin is not None,
        'is_owner_author': is_owner_author,
        'is_staff': admin is not None and not is_owner_author,
        'guest_name': c.guest_name,
        'like_count': c.like_count or 0,
        'created_at': c.created_at.isoformat() + 'Z',
        'replies': [
            _comment_dict(r)
            for r in c.replies.filter_by(is_deleted=False).order_by(Comment.created_at).all()
        ],
    }


def _mail_ready(config):
    return bool(
        config
        and config.mailgun_api_key
        and config.mailgun_domain
        and config.smtp_from_email
        and config.forward_email
    )


def _promote_scheduled():
    now = datetime.utcnow()
    BlogPost.query.filter(
        BlogPost.status == 'scheduled',
        BlogPost.publish_date <= now
    ).update({'status': 'published'})
    db.session.commit()


@blog_bp.route('/api/blog')
def list_posts():
    _promote_scheduled()
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


@blog_bp.route('/api/blog/author')
def get_blog_author():
    """Returns the Owner account info for public blog attribution."""
    owner = AdminAccount.query.filter_by(role='owner').first()
    if not owner:
        return jsonify({'name': None, 'avatar_filename': None})
    return jsonify({
        'name': owner.full_name,
        'avatar_filename': owner.avatar_filename,
    })


@blog_bp.route('/api/blog/<slug>/comments', methods=['POST'])
def post_comment(slug):
    post = BlogPost.query.filter_by(slug=slug, status='published').first_or_404()
    config = SiteConfig.query.first()
    data = request.get_json(silent=True) or {}
    parent_id = data.get('parent_id')
    content = (data.get('content') or '').strip()

    # Admin session takes priority — staff can always comment
    if current_user.is_authenticated:
        if not content:
            return jsonify({'error': 'Message is required.'}), 400
        comment = Comment(post_id=post.id, admin_id=current_user.id, parent_id=parent_id, content=content)
    elif config and config.users_enabled:
        uid = session.get('user_id')
        if not uid:
            return jsonify({'error': 'Sign in with Google to comment.'}), 401
        user = User.query.get(uid)
        if not user:
            return jsonify({'error': 'User not found.'}), 401
        if not user.can_comment:
            return jsonify({'error': 'You are not allowed to comment.'}), 403
        if not content:
            return jsonify({'error': 'Message is required.'}), 400
        comment = Comment(post_id=post.id, user_id=uid, parent_id=parent_id, content=content)
    else:
        name = (data.get('name') or '').strip()
        email = (data.get('email') or '').strip()
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


@blog_bp.route('/api/blog/<slug>/comments/<int:comment_id>/like', methods=['POST', 'DELETE'])
def toggle_like(slug, comment_id):
    post = BlogPost.query.filter_by(slug=slug).first_or_404()
    comment = Comment.query.filter_by(id=comment_id, post_id=post.id, is_deleted=False).first_or_404()
    if request.method == 'POST':
        comment.like_count = (comment.like_count or 0) + 1
    else:
        comment.like_count = max(0, (comment.like_count or 0) - 1)
    db.session.commit()
    return jsonify({'like_count': comment.like_count})


@blog_bp.route('/api/blog/<slug>/comments/<int:comment_id>/report', methods=['POST'])
def report_comment(slug, comment_id):
    from email_utils import send_email
    post = BlogPost.query.filter_by(slug=slug).first_or_404()
    comment = Comment.query.filter_by(id=comment_id, post_id=post.id, is_deleted=False).first_or_404()
    config = SiteConfig.query.first()

    if _mail_ready(config):
        author = User.query.get(comment.user_id) if comment.user_id else None
        author_name = author.name if author else (comment.guest_name or 'Anonymous')
        author_email = author.email if author else (comment.guest_email or 'N/A')
        domain = (config.domain or 'localhost:5173').rstrip('/')
        post_url = f"https://{domain}/{post.slug}#comment-{comment.id}"
        body = (
            f"A comment has been reported on your website.\n\n"
            f"Comment by: {author_name} ({author_email})\n"
            f"Posted on: {comment.created_at.strftime('%B %d, %Y')}\n\n"
            f"Comment text:\n{comment.content}\n\n"
            f"View comment: {post_url}"
        )
        try:
            config.mailgun_api_key = decrypt(config.mailgun_api_key)
            send_email(config, config.forward_email, 'Website Comment Reported', body, 'Comment Reply')
        except Exception:
            pass

    return jsonify({'ok': True})
