from flask import Blueprint, jsonify, request
from extensions import db
from routes.auth import get_current_user, user_required

user_bp = Blueprint('user', __name__)


@user_bp.route('/api/user/profile', methods=['PUT'])
@user_required
def update_profile():
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    name = (data.get('name') or '').strip()
    title = (data.get('title') or '').strip()

    if not name:
        return jsonify({'error': 'Name is required'}), 400

    user.name = name
    user.title = title or None
    db.session.commit()

    return jsonify({
        'id': user.id,
        'name': user.name,
        'title': user.title,
        'email': user.email,
        'avatar_url': user.avatar_url,
        'can_comment': user.can_comment,
    })
