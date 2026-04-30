from flask import Blueprint, jsonify
from models import Profile

profile_bp = Blueprint('profile', __name__)

@profile_bp.route('/api/profile')
def get_profile():
    profile = Profile.query.first()
    if not profile:
        return jsonify({'error': 'Profile not found'}), 404
    return jsonify({
        'name': profile.name,
        'title': profile.title,
        'bio': profile.bio
    })
