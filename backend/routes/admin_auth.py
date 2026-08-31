from functools import wraps
from datetime import datetime, timedelta
from threading import Thread
import hashlib
import secrets
from flask import Blueprint, jsonify, request, session, redirect, current_app
from flask_login import login_user, logout_user, current_user
from extensions import db, login_manager
from models import AdminAccount, SiteConfig, LoginAttempt
from crypto import decrypt
from email_utils import send_email, mail_configured

admin_auth_bp = Blueprint('admin_auth', __name__)

ROLE_ORDER = ['contributor', 'editor', 'administrator', 'owner']

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=15)
MAX_ATTEMPTS_PER_IP = 50
IP_WINDOW = timedelta(minutes=15)


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
    account = AdminAccount.query.get(int(user_id))
    if account is None or not account.is_active:
        return None
    return account


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

    ip = request.remote_addr or 'unknown'
    ip_window_start = datetime.utcnow() - IP_WINDOW
    LoginAttempt.query.filter(LoginAttempt.created_at < ip_window_start).delete()
    recent_attempts = LoginAttempt.query.filter(
        LoginAttempt.ip_address == ip,
        LoginAttempt.created_at >= ip_window_start,
    ).count()
    if recent_attempts >= MAX_ATTEMPTS_PER_IP:
        db.session.commit()
        return jsonify({'error': 'Too many login attempts. Please try again later.'}), 429

    account = AdminAccount.query.filter_by(email=email).first()

    now = datetime.utcnow()
    if account and account.lockout_until:
        if account.lockout_until > now:
            db.session.add(LoginAttempt(ip_address=ip))
            db.session.commit()
            return jsonify({'error': 'Invalid credentials'}), 401
        account.lockout_until = None
        account.failed_login_attempts = 0

    if not account or not account.check_password(password):
        if account:
            # Atomic SQL-level increment (not a Python read-modify-write) so
            # concurrent failed attempts for the same account can't lose
            # updates to each other.
            AdminAccount.query.filter_by(id=account.id).update(
                {AdminAccount.failed_login_attempts: AdminAccount.failed_login_attempts + 1},
                synchronize_session=False,
            )
            db.session.flush()
            db.session.refresh(account)
            if account.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
                account.lockout_until = now + LOCKOUT_DURATION
        db.session.add(LoginAttempt(ip_address=ip))
        db.session.commit()
        return jsonify({'error': 'Invalid credentials'}), 401

    account.failed_login_attempts = 0
    account.lockout_until = None

    if not account.is_active:
        db.session.commit()
        return jsonify({'error': 'Account has been deactivated'}), 401

    db.session.commit()
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


def _safe_next_path(next_url):
    """Only allow same-site relative paths — rejects absolute URLs and the
    protocol-relative `//host` form (including its `/\\host` backslash variant,
    which browsers normalize to `//host` for http(s) URLs), both of which
    would redirect off-site."""
    if not next_url or not next_url.startswith('/'):
        return '/'
    if next_url.replace('\\', '/').startswith('//'):
        return '/'
    return next_url


@admin_auth_bp.route('/api/admin/enter-public-site')
def enter_public_site():
    """Admin-triggered navigation to the public site as themselves — evicts any
    regular user signed in on this browser so the public UI shows the admin."""
    if not current_user.is_authenticated:
        return redirect('/admin/login')
    session.pop('user_id', None)
    return redirect(_safe_next_path(request.args.get('next')))


def _send_reset_email_if_valid(app, email):
    """Runs in a background thread, after the response has already been sent —
    keeps forgot_password()'s response time identical whether or not the email
    matches an account, so timing can't be used to enumerate admin emails."""
    with app.app_context():
        try:
            account = AdminAccount.query.filter_by(email=email).first() if email else None
            config = SiteConfig.query.first()
            if not (account and account.is_active and mail_configured(config)):
                return

            token = secrets.token_urlsafe(32)
            account.reset_token = hashlib.sha256(token.encode()).hexdigest()
            account.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
            db.session.commit()

            if config.domain:
                reset_url = f'https://{config.domain.rstrip("/")}/admin/reset-password?token={token}'
            else:
                # Dev fallback — the Flask backend isn't where the frontend route
                # lives; that's the Vite dev server.
                reset_url = f'http://localhost:5173/admin/reset-password?token={token}'

            send_email(
                config,
                account.email,
                'Reset your admin password',
                f'A password reset was requested for your admin account.\n\n'
                f'Reset your password: {reset_url}\n\n'
                f'This link expires in 1 hour. If you did not request this, you can ignore this email.',
                'Admin',
                decrypt(config.mailgun_api_key),
            )
        except Exception:
            # Silent by design — this runs after the response is already sent,
            # so there's nothing left to report the failure to.
            pass


@admin_auth_bp.route('/api/admin/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()

    app = current_app._get_current_object()
    Thread(target=_send_reset_email_if_valid, args=(app, email), daemon=True).start()

    # Always return a generic response immediately so neither the response body
    # nor its timing can be used to enumerate admin emails.
    return jsonify({'message': 'If that email is registered, a reset link has been sent.'})


@admin_auth_bp.route('/api/admin/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json(silent=True) or {}
    token = data.get('token') or ''
    new_password = data.get('new_password') or ''

    if not token or not new_password:
        return jsonify({'error': 'Token and new password are required'}), 400
    if len(new_password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    account = AdminAccount.query.filter_by(reset_token=token_hash).first()
    if not account or not account.reset_token_expires or account.reset_token_expires < datetime.utcnow():
        return jsonify({'error': 'Invalid or expired reset link'}), 400

    account.set_password(new_password)
    account.reset_token = None
    account.reset_token_expires = None
    # A completed email-based reset proves ownership through a separate channel
    # from the password itself, so it's safe to clear any brute-force lockout.
    account.failed_login_attempts = 0
    account.lockout_until = None
    db.session.commit()
    return jsonify({'message': 'Password updated'})
