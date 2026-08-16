from flask import Blueprint, jsonify, request
from flask_login import current_user
from extensions import db
from models import AiDemoAccessLink, SiteEventLog
from routes.admin_auth import role_at_least

admin_ai_demo_links_bp = Blueprint('admin_ai_demo_links', __name__)


def _log(admin, action_type, subject):
    entry = SiteEventLog(
        admin_id=admin.id,
        admin_name=admin.full_name,
        admin_avatar=admin.avatar_filename,
        area='AI Demo',
        action_type=action_type,
        subject=subject,
        subject_is_bold=True,
    )
    db.session.add(entry)


def _link_dict(link):
    return {'demo_key': link.demo_key, 'url': link.url, 'text': link.text}


@admin_ai_demo_links_bp.route('/api/admin/ai-demo/access-links')
@role_at_least('editor')
def list_access_links():
    links = AiDemoAccessLink.query.all()
    return jsonify({l.demo_key: _link_dict(l) for l in links})


@admin_ai_demo_links_bp.route('/api/admin/ai-demo/access-links/<demo_key>', methods=['PUT'])
@role_at_least('editor')
def upsert_access_link(demo_key):
    data = request.get_json(silent=True) or {}
    url = (data.get('url') or '').strip()
    text = (data.get('text') or '').strip()

    if not url or not text:
        return jsonify({'error': 'Both a link and display text are required.'}), 400

    link = AiDemoAccessLink.query.filter_by(demo_key=demo_key).first()
    action_type = 'edited' if link else 'added'
    if not link:
        link = AiDemoAccessLink(demo_key=demo_key)
        db.session.add(link)
    link.url = url
    link.text = text

    _log(current_user, action_type, demo_key)
    db.session.commit()
    return jsonify(_link_dict(link))


@admin_ai_demo_links_bp.route('/api/admin/ai-demo/access-links/<demo_key>', methods=['DELETE'])
@role_at_least('editor')
def delete_access_link(demo_key):
    link = AiDemoAccessLink.query.filter_by(demo_key=demo_key).first()
    if link:
        db.session.delete(link)
        _log(current_user, 'deleted', demo_key)
        db.session.commit()
    return jsonify({'message': 'Deleted'})
