from flask import Blueprint, jsonify, request
from extensions import db
from routes.auth import get_current_user, user_required
from upload_utils import save_and_optimize_image, IMAGE_OPTIMIZE_EXTENSIONS, get_uploads_dir

user_bp = Blueprint('user', __name__)


def _user_dict(user):
    return {
        'id': user.id,
        'name': user.name,
        'title': user.title,
        'email': user.email,
        'avatar_url': user.display_avatar_url,
        'avatar_filename': user.avatar_filename,
        'can_comment': user.can_comment,
        'ai_demo_access': user.ai_demo_access,
    }


@user_bp.route('/api/user/profile', methods=['PUT'])
@user_required
def update_profile():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401
    data = request.get_json(silent=True) or {}

    name = (data.get('name') or '').strip()
    title = (data.get('title') or '').strip()

    if not name:
        return jsonify({'error': 'Name is required'}), 400

    user.name = name
    user.title = title or None
    db.session.commit()

    return jsonify(_user_dict(user))


@user_bp.route('/api/user/upload-avatar', methods=['POST'])
@user_required
def upload_avatar():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in IMAGE_OPTIMIZE_EXTENSIONS:
        return jsonify({'error': 'File type not allowed. Use PNG, JPG, or WebP.'}), 400

    uploads_dir = get_uploads_dir()
    try:
        filename, _srcset, _lqip = save_and_optimize_image(file, uploads_dir)
    except Exception:
        return jsonify({'error': 'Could not process image. The file may be corrupted or unsupported.'}), 400

    user.avatar_filename = filename
    db.session.commit()

    return jsonify(_user_dict(user))


@user_bp.route('/api/user/avatar', methods=['DELETE'])
@user_required
def delete_avatar():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    user.avatar_filename = None
    db.session.commit()

    return jsonify(_user_dict(user))
