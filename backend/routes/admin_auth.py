from functools import wraps
from flask import Blueprint, jsonify, request
from flask_login import login_user, logout_user, current_user
from extensions import login_manager
from models import AdminAccount

admin_auth_bp = Blueprint('admin_auth', __name__)

ROLE_ORDER = ['contributor', 'editor', 'administrator', 'owner']


def _account_dict(account):
    return {
        'id': account.id,
        'full_name': account.full_name,
        'title': account.title,
        'location': account.location,
        'email': account.email,
        'role': account.role,
        'avatar_filename': account.avatar_filename,
    }


@login_manager.user_loader
def load_user(user_id):
    return AdminAccount.query.get(int(user_id))


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated


def role_required(*allowed_roles):
    """Decorator that requires the current admin to have one of the specified roles."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({'error': 'Authentication required'}), 401
            if current_user.role not in allowed_roles:
                return jsonify({'error': 'Insufficient permissions'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator


def role_at_least(min_role):
    """Decorator that requires the current admin to have at least min_role in the hierarchy."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({'error': 'Authentication required'}), 401
            if ROLE_ORDER.index(current_user.role) < ROLE_ORDER.index(min_role):
                return jsonify({'error': 'Insufficient permissions'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator


@admin_auth_bp.route('/api/admin/login', methods=['POST'])
def login():
    if current_user.is_authenticated:
        return jsonify(_account_dict(current_user))

    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    account = AdminAccount.query.filter_by(email=email).first()
    if not account or not account.check_password(password):
        return jsonify({'error': 'Invalid credentials'}), 401

    login_user(account, remember=True)
    return jsonify(_account_dict(account))


@admin_auth_bp.route('/api/admin/logout', methods=['POST'])
def logout():
    logout_user()
    return jsonify({'message': 'Logged out'})


@admin_auth_bp.route('/api/admin/me')
def me():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Not authenticated'}), 401
    return jsonify(_account_dict(current_user))


@admin_auth_bp.route('/api/auth/admin-me')
def public_admin_me():
    """Public endpoint — lets the public site detect a logged-in admin session."""
    if not current_user.is_authenticated:
        return jsonify({'error': 'Not authenticated'}), 401
    return jsonify({
        'id': current_user.id,
        'name': current_user.full_name,
        'avatar_filename': current_user.avatar_filename,
        'role': current_user.role,
    })
