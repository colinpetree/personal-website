from functools import wraps
from flask import Blueprint, jsonify, request, session
from flask_login import login_user, logout_user, current_user
from extensions import login_manager
from models import AdminAccount

admin_auth_bp = Blueprint('admin_auth', __name__)


@login_manager.user_loader
def load_user(user_id):
    return AdminAccount.query.get(int(user_id))


def admin_required(f):
    """Decorator that returns 401 JSON instead of redirecting, for API routes."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated


@admin_auth_bp.route('/api/admin/login', methods=['POST'])
def login():
    if current_user.is_authenticated:
        return jsonify({'id': current_user.id, 'name': current_user.name, 'email': current_user.email})

    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    account = AdminAccount.query.filter_by(email=email).first()
    if not account or not account.check_password(password):
        return jsonify({'error': 'Invalid credentials'}), 401

    login_user(account, remember=True)
    return jsonify({'id': account.id, 'name': account.name, 'email': account.email})


@admin_auth_bp.route('/api/admin/logout', methods=['POST'])
def logout():
    logout_user()
    return jsonify({'message': 'Logged out'})


@admin_auth_bp.route('/api/admin/me')
def me():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Not authenticated'}), 401
    return jsonify({
        'id': current_user.id,
        'name': current_user.name,
        'title': current_user.title,
        'email': current_user.email,
        'is_primary': current_user.is_primary,
    })
