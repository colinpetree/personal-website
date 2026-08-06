from functools import wraps
import json
import base64
import secrets
from flask import Blueprint, jsonify, request, session, redirect, current_app
from flask_login import current_user, logout_user
from extensions import db
from models import User, SiteConfig
from crypto import decrypt

auth_bp = Blueprint('auth', __name__)

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

    next_url = request.args.get('next', '/')
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
        next_url = state_data.get('nx', '/')
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
    if not user:
        user = User(google_id=google_id, email=email, name=name, avatar_url=avatar_url)
        db.session.add(user)
    db.session.commit()

    # A fresh Google sign-in always wins over a stale admin session in the same
    # browser — otherwise /api/auth/me's admin-first check would keep masking
    # this user indefinitely.
    if current_user.is_authenticated:
        logout_user()
    session['user_id'] = user.id
    return redirect(next_url)


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
            'is_staff': True,
        })

    user = get_current_user()
    if user:
        return jsonify({
            'id': user.id,
            'name': user.name,
            'title': user.title,
            'email': user.email,
            'avatar_url': user.avatar_url,
            'can_comment': user.can_comment,
        })

    return jsonify({'error': 'Not authenticated'}), 401
