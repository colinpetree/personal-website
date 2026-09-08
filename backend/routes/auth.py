from functools import wraps
from datetime import datetime, timedelta
from threading import Thread
import json
import base64
import hashlib
import secrets
from urllib.parse import quote
from flask import Blueprint, jsonify, request, session, redirect, current_app
from flask_login import current_user, logout_user
from extensions import db
from models import User, SiteConfig
from crypto import decrypt
from email_utils import send_email, mail_configured

auth_bp = Blueprint('auth', __name__)

MAGIC_LINK_TTL = timedelta(minutes=15)

GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'


def get_current_user():
    """Returns the signed-in User, or None. Does not cover the admin-as-visitor
    case — that has no User row, see `me()` for how it's surfaced to the frontend."""
    user_id = session.get('user_id')
    if user_id:
        return User.query.get(user_id)
    return None


def user_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user_id') and not current_user.is_authenticated:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated


def _redirect_uri(config):
    if config.domain and not current_app.debug:
        return f'https://{config.domain}/api/auth/google/callback'
    return request.host_url.rstrip('/') + '/api/auth/google/callback'


@auth_bp.route('/api/auth/google')
def google_login():
    config = SiteConfig.query.first()
    if not config or not config.users_enabled:
        return jsonify({'error': 'User accounts are disabled'}), 403
    if not config.google_oauth_client_id:
        return jsonify({'error': 'Google OAuth not configured'}), 503

    from routes.admin_auth import _safe_next_path
    next_url = _safe_next_path(request.args.get('next', '/'))
    client_id = config.google_oauth_client_id
    redirect_uri = _redirect_uri(config)

    nonce = secrets.token_urlsafe(16)
    state = base64.urlsafe_b64encode(
        json.dumps({'n': nonce, 'nx': next_url}).encode()
    ).decode().rstrip('=')
    session['oauth_nonce'] = nonce

    from authlib.integrations.requests_client import OAuth2Session
    client = OAuth2Session(client_id, redirect_uri=redirect_uri, scope='openid email profile')
    uri, _ = client.create_authorization_url(GOOGLE_AUTH_URL, state=state)
    return redirect(uri)


@auth_bp.route('/api/auth/google/callback')
def google_callback():
    config = SiteConfig.query.first()
    if not config or not config.users_enabled:
        return redirect('/')

    client_id = config.google_oauth_client_id
    client_secret = decrypt(config.google_oauth_client_secret)
    redirect_uri = _redirect_uri(config)

    raw_state = request.args.get('state', '')
    try:
        padding = '=' * (-len(raw_state) % 4)
        state_data = json.loads(base64.urlsafe_b64decode(raw_state + padding))
        nonce = state_data.get('n')
        from routes.admin_auth import _safe_next_path
        next_url = _safe_next_path(state_data.get('nx', '/'))
    except Exception:
        nonce = None
        next_url = '/'

    if nonce != session.pop('oauth_nonce', None):
        return redirect('/?auth_error=1')

    try:
        from authlib.integrations.requests_client import OAuth2Session
        client = OAuth2Session(
            client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
        )
        client.fetch_token(GOOGLE_TOKEN_URL, authorization_response=request.url)
        userinfo = client.get(GOOGLE_USERINFO_URL).json()
    except Exception:
        return redirect('/?auth_error=1')

    google_id = userinfo.get('sub')
    email = userinfo.get('email', '')
    name = userinfo.get('name') or email
    avatar_url = userinfo.get('picture')

    user = User.query.filter_by(google_id=google_id).first()
    if not user and email:
        # No Google-linked account yet — but an account may already exist for
        # this email via magic-link sign-in (which has no google_id). Link the
        # Google identity onto it instead of trying to insert a second row
        # with the same email, which would violate the unique constraint.
        user = User.query.filter(db.func.lower(User.email) == email.lower()).first()
        if user:
            user.google_id = google_id
            if not user.avatar_url:
                user.avatar_url = avatar_url
    if not user:
        user = User(google_id=google_id, email=email, name=name, avatar_url=avatar_url)
        db.session.add(user)
    user.last_login_at = datetime.utcnow()
    db.session.commit()

    # A fresh Google sign-in always wins over a stale admin session in the same
    # browser — otherwise /api/auth/me's admin-first check would keep masking
    # this user indefinitely.
    if current_user.is_authenticated:
        logout_user()
    session['user_id'] = user.id
    return redirect(next_url)


def _send_magic_link_if_valid(app, email, next_url):
    """Runs in a background thread, after the response has already been sent —
    keeps magic_link_request()'s response time identical whether or not the
    email matches an existing account, so timing can't be used to enumerate
    registered users. Mirrors admin_auth._send_reset_email_if_valid."""
    with app.app_context():
        try:
            config = SiteConfig.query.first()
            if not (config and config.users_enabled and mail_configured(config) and email):
                return

            user = User.query.filter_by(email=email).first()
            if not user:
                user = User(email=email, name=email.split('@')[0], can_comment=True)
                db.session.add(user)

            token = secrets.token_urlsafe(32)
            user.login_token_hash = hashlib.sha256(token.encode()).hexdigest()
            user.login_token_expires = datetime.utcnow() + MAGIC_LINK_TTL
            db.session.commit()

            next_param = f'&next={quote(next_url)}' if next_url else ''
            if config.domain:
                link_url = f'https://{config.domain.rstrip("/")}/auth/magic?token={token}{next_param}'
            else:
                # Dev fallback — the Flask backend isn't where the frontend route
                # lives; that's the Vite dev server.
                link_url = f'http://localhost:5173/auth/magic?token={token}{next_param}'

            send_email(
                config,
                user.email,
                'Your sign-in link',
                f'Click the link below to sign in.\n\n'
                f'{link_url}\n\n'
                f'This link expires in 15 minutes. If you did not request this, you can ignore this email.',
                'Sign In',
                decrypt(config.mailgun_api_key),
            )
        except Exception:
            # Silent by design — this runs after the response is already sent,
            # so there's nothing left to report the failure to.
            pass


@auth_bp.route('/api/auth/magic-link/request', methods=['POST'])
def magic_link_request():
    config = SiteConfig.query.first()
    if not config or not config.users_enabled:
        return jsonify({'error': 'User accounts are disabled'}), 403

    from routes.admin_auth import _safe_next_path

    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    next_url = _safe_next_path(data.get('next'))

    app = current_app._get_current_object()
    Thread(target=_send_magic_link_if_valid, args=(app, email, next_url), daemon=True).start()

    # Always return a generic response immediately so neither the response body
    # nor its timing can be used to enumerate registered emails.
    return jsonify({'message': 'If that email is registered, a sign-in link has been sent.'})


@auth_bp.route('/api/auth/magic-link/verify', methods=['POST'])
def magic_link_verify():
    config = SiteConfig.query.first()
    if not config or not config.users_enabled:
        return jsonify({'error': 'User accounts are disabled'}), 403

    data = request.get_json(silent=True) or {}
    token = data.get('token') or ''
    if not token:
        return jsonify({'error': 'Token is required'}), 400

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    user = User.query.filter_by(login_token_hash=token_hash).first()
    if not user or not user.login_token_expires or user.login_token_expires < datetime.utcnow():
        return jsonify({'error': 'Invalid or expired sign-in link'}), 400

    user.login_token_hash = None
    user.login_token_expires = None
    user.last_login_at = datetime.utcnow()
    db.session.commit()

    # A fresh magic-link sign-in always wins over a stale admin session in the
    # same browser — same rule as google_callback's precedence.
    if current_user.is_authenticated:
        logout_user()
    session['user_id'] = user.id

    from routes.user import _user_dict
    return jsonify(_user_dict(user))


@auth_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    if session.get('user_id'):
        session.pop('user_id', None)
    elif current_user.is_authenticated:
        logout_user()
    return jsonify({'message': 'Logged out'})


@auth_bp.route('/api/auth/me')
def me():
    # Admin session takes priority, matching post_comment()'s precedence — staff
    # are always shown (and always comment) as themselves, even if a stale
    # regular-user session also happens to be present in the same browser.
    if current_user.is_authenticated:
        return jsonify({
            'id': current_user.id,
            'name': current_user.full_name,
            'title': current_user.title,
            'email': current_user.email,
            'avatar_url': f'/api/uploads/{current_user.avatar_filename}' if current_user.avatar_filename else None,
            'can_comment': True,
            'ai_demo_access': True,
            'is_staff': True,
        })

    user = get_current_user()
    if user:
        from routes.user import _user_dict
        return jsonify(_user_dict(user))

    return jsonify({'error': 'Not authenticated'}), 401
