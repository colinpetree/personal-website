from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError
from extensions import db
from models import BlogPost, Page, PageView, Project, ProjectClick, ShareEvent, SiteConfig
from analytics_utils import check_rate_limit, compute_visitor_key, is_admin_session, is_bot_request

analytics_tracking_bp = Blueprint('analytics_tracking', __name__)

KNOWN_PAGE_KEYS = {'home', 'blog', 'projects', 'contact', 'ai_demo', 'payment'}
KNOWN_SHARE_PLATFORMS = {'copy_link', 'email', 'facebook', 'linkedin', 'x', 'bluesky'}


@analytics_tracking_bp.route('/api/analytics/track-view', methods=['POST'])
def track_view():
    if is_admin_session() or is_bot_request():
        return jsonify({'ok': True})

    config = SiteConfig.query.first()
    visitor_key = compute_visitor_key(config)
    if check_rate_limit(visitor_key):
        return jsonify({'error': 'Too many requests'}), 429

    data = request.get_json(silent=True) or {}
    page_type = data.get('page_type')
    page_key = (data.get('page_key') or '').strip()

    if page_type == 'page':
        if page_key not in KNOWN_PAGE_KEYS:
            return jsonify({'error': 'Unknown page_key'}), 400
    elif page_type == 'blog_post':
        if not BlogPost.query.filter_by(slug=page_key, status='published').first():
            return jsonify({'error': 'Unknown page_key'}), 400
    elif page_type == 'custom_page':
        # Pages are open-ended/admin-creatable, so — unlike the fixed
        # KNOWN_PAGE_KEYS set — this validates dynamically against the Page
        # table, the same pattern 'blog_post' already uses against BlogPost.
        if not Page.query.filter_by(slug=page_key, status='published').first():
            return jsonify({'error': 'Unknown page_key'}), 400
    else:
        return jsonify({'error': 'Invalid page_type'}), 400

    db.session.add(PageView(
        page_type=page_type,
        page_key=page_key,
        visitor_key=visitor_key,
    ))
    db.session.commit()
    return jsonify({'ok': True})


@analytics_tracking_bp.route('/api/analytics/track-share', methods=['POST'])
def track_share():
    if is_admin_session() or is_bot_request():
        return jsonify({'ok': True})

    config = SiteConfig.query.first()
    visitor_key = compute_visitor_key(config)
    if check_rate_limit(visitor_key):
        return jsonify({'error': 'Too many requests'}), 429

    data = request.get_json(silent=True) or {}
    post_id = data.get('post_id')
    platform = data.get('platform')

    if platform not in KNOWN_SHARE_PLATFORMS:
        return jsonify({'error': 'Invalid platform'}), 400
    if not isinstance(post_id, int) or isinstance(post_id, bool):
        return jsonify({'error': 'Unknown post_id'}), 400
    if not BlogPost.query.filter_by(id=post_id, status='published').first():
        return jsonify({'error': 'Unknown post_id'}), 400

    db.session.add(ShareEvent(
        post_id=post_id,
        platform=platform,
        visitor_key=visitor_key,
    ))
    try:
        db.session.commit()
    except IntegrityError:
        # Same visitor already shared this post via this platform today —
        # treat as a normal success, the client shouldn't see or care that
        # it was a no-op dedup rather than a fresh insert.
        db.session.rollback()
    return jsonify({'ok': True})


@analytics_tracking_bp.route('/api/analytics/track-project-click', methods=['POST'])
def track_project_click():
    if is_admin_session() or is_bot_request():
        return jsonify({'ok': True})

    config = SiteConfig.query.first()
    visitor_key = compute_visitor_key(config)
    if check_rate_limit(visitor_key):
        return jsonify({'error': 'Too many requests'}), 429

    data = request.get_json(silent=True) or {}
    project_id = data.get('project_id')

    if not isinstance(project_id, int) or isinstance(project_id, bool):
        return jsonify({'error': 'Unknown project_id'}), 400
    if not Project.query.filter_by(id=project_id, visible=True).first():
        return jsonify({'error': 'Unknown project_id'}), 400

    db.session.add(ProjectClick(project_id=project_id))
    db.session.commit()
    return jsonify({'ok': True})
