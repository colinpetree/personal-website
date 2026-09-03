from flask import Flask
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from extensions import db, login_manager
from dotenv import load_dotenv
import os

load_dotenv()

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    # Validate pooled connections before use and recycle them proactively —
    # without this, a connection silently killed by an idle timeout (AWS's
    # network path, Postgres itself) gets reused and fails with an opaque
    # "SSL error: decryption failed" / "connection reset by peer" instead of
    # being transparently replaced.
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'pool_pre_ping': True, 'pool_recycle': 280}
    secret_key = os.getenv('SECRET_KEY')
    is_production = os.getenv('FLASK_ENV') == 'production'
    if not secret_key:
        if is_production:
            raise RuntimeError('SECRET_KEY environment variable must be set in production')
        secret_key = 'dev-secret-change-in-production'
    app.config['SECRET_KEY'] = secret_key
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_SECURE'] = is_production
    if is_production:
        # gunicorn only ever accepts connections from Varnish on 127.0.0.1
        # (never exposed publicly — see deploy/scripts/bootstrap.sh's ufw
        # rules), and nginx always overwrites X-Forwarded-For with the real
        # client address before proxying in, so there's exactly one hop of
        # forwarding to trust here. Without this, request.remote_addr is
        # always the loopback address of whichever proxy connected to
        # gunicorn — breaking anything keyed on the visitor's real IP (the
        # login and contact-form rate limiters below).
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=0, x_port=0, x_prefix=0)
    # Deployment-time flag — lets forks of this project fully exclude the AI demo
    # feature (its own API keys/spend) without touching code. Not admin-toggleable;
    # ai_demo_enabled in SiteConfig is a separate runtime toggle for sites that have it.
    app.config['ENABLE_AI_DEMOS'] = os.getenv('ENABLE_AI_DEMOS', 'true').lower() == 'true'
    # Shared secret the Pi's content-watch.sh authenticates with when POSTing
    # to /api/watcher-alert — the Pi has no admin session cookie to send, so
    # this substitutes for @admin_required there. Unset by default (route
    # then always returns 403, never a silent no-op).
    app.config['WATCHER_ALERT_SECRET'] = os.getenv('WATCHER_ALERT_SECRET', '')

    frontend_origins = os.getenv('FRONTEND_ORIGIN', 'http://localhost:5173').split(',')
    CORS(app, supports_credentials=True, origins=[o.strip() for o in frontend_origins if o.strip()])
    db.init_app(app)
    login_manager.init_app(app)

    from routes.profile import profile_bp
    from routes.site_config import site_config_bp
    from routes.projects import projects_bp
    from routes.uploads import uploads_bp
    from routes.contact import contact_bp
    from routes.admin_auth import admin_auth_bp
    from routes.admin_config import admin_config_bp
    from routes.admin_accounts import admin_accounts_bp
    from routes.admin_projects import admin_projects_bp
    from routes.blog import blog_bp
    from routes.admin_blog import admin_blog_bp
    from routes.admin_blog_categories import admin_blog_categories_bp
    from routes.auth import auth_bp
    from routes.user import user_bp
    from routes.admin_users import admin_users_bp
    from routes.admin_history import admin_history_bp
    from routes.payment import payment_bp
    from routes.search import search_bp
    from routes.analytics_tracking import analytics_tracking_bp
    from routes.admin_analytics import admin_analytics_bp
    app.register_blueprint(profile_bp)
    app.register_blueprint(site_config_bp)
    app.register_blueprint(projects_bp)
    app.register_blueprint(uploads_bp)
    app.register_blueprint(contact_bp)
    app.register_blueprint(admin_auth_bp)
    app.register_blueprint(admin_config_bp)
    app.register_blueprint(admin_accounts_bp)
    app.register_blueprint(admin_projects_bp)
    app.register_blueprint(blog_bp)
    app.register_blueprint(admin_blog_bp)
    app.register_blueprint(admin_blog_categories_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(admin_users_bp)
    app.register_blueprint(admin_history_bp)
    app.register_blueprint(payment_bp)
    app.register_blueprint(search_bp)
    app.register_blueprint(analytics_tracking_bp)
    app.register_blueprint(admin_analytics_bp)

    if app.config['ENABLE_AI_DEMOS']:
        from routes.ai_demo import ai_demo_bp
        from routes.admin_ai_demo_links import admin_ai_demo_links_bp
        app.register_blueprint(ai_demo_bp)
        app.register_blueprint(admin_ai_demo_links_bp)

    return app

def _migrate_schema():
    """Idempotent, additive schema patches for columns added after a table
    already existed — db.create_all() only creates missing tables, it never
    alters existing ones. Safe to run on every startup."""
    from sqlalchemy import inspect, text

    inspector = inspect(db.engine)
    with db.engine.begin() as conn:
        user_columns = {c['name'] for c in inspector.get_columns('user')}
        if 'avatar_filename' not in user_columns:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN avatar_filename VARCHAR(255)'))
        if 'login_token_hash' not in user_columns:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN login_token_hash VARCHAR(255)'))
        if 'login_token_expires' not in user_columns:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN login_token_expires TIMESTAMP'))

        user_col_info = {c['name']: c for c in inspector.get_columns('user')}
        if user_col_info.get('google_id', {}).get('nullable') is False:
            conn.execute(text('ALTER TABLE "user" ALTER COLUMN google_id DROP NOT NULL'))

        config_columns = {c['name'] for c in inspector.get_columns('site_config')}
        if 'blog_comments_enabled' not in config_columns:
            conn.execute(text(
                'ALTER TABLE site_config ADD COLUMN blog_comments_enabled BOOLEAN NOT NULL DEFAULT TRUE'
            ))

        if 'ai_demo_access' not in user_columns:
            conn.execute(text(
                'ALTER TABLE "user" ADD COLUMN ai_demo_access BOOLEAN NOT NULL DEFAULT FALSE'
            ))
        if 'ai_demo_access_requested_at' not in user_columns:
            conn.execute(text(
                'ALTER TABLE "user" ADD COLUMN ai_demo_access_requested_at TIMESTAMP'
            ))

        blog_post_columns = {c['name'] for c in inspector.get_columns('blog_post')}
        if 'category_id' not in blog_post_columns:
            conn.execute(text(
                'ALTER TABLE blog_post ADD COLUMN category_id INTEGER REFERENCES blog_category(id)'
            ))

        blog_category_columns = {c['name'] for c in inspector.get_columns('blog_category')}
        if 'order' not in blog_category_columns:
            conn.execute(text(
                'ALTER TABLE blog_category ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0'
            ))

        for section in ('home', 'projects', 'about', 'contact', 'ai_demo', 'payment'):
            column = f'{section}_page_width'
            if column not in config_columns:
                conn.execute(text(
                    f"ALTER TABLE site_config ADD COLUMN {column} VARCHAR(20) NOT NULL DEFAULT 'regular'"
                ))

        if 'analytics_start_date' not in config_columns:
            conn.execute(text('ALTER TABLE site_config ADD COLUMN analytics_start_date DATE'))
            # Defaults to "today" for existing rows so every range clamps to
            # the day this feature was deployed, rather than to NULL (which
            # would leave ranges unclamped and could span dates with no data).
            conn.execute(text(
                'UPDATE site_config SET analytics_start_date = CURRENT_DATE WHERE analytics_start_date IS NULL'
            ))

        attempt_columns = {c['name'] for c in inspector.get_columns('analytics_attempt')}
        if 'visitor_key' not in attempt_columns:
            # No NOT NULL here even though the model declares one — these
            # rows are always stale within ~60s under normal operation
            # (check_rate_limit() sweeps them), so there's nothing meaningful
            # to backfill, and a NOT NULL ADD COLUMN would fail outright on
            # any row already in the table.
            conn.execute(text('ALTER TABLE analytics_attempt ADD COLUMN visitor_key VARCHAR(64)'))

        # db.create_all() only adds indexes when it creates the table itself
        # — since analytics_attempt already existed before these were added
        # to the model, they need the same explicit additive treatment as a
        # column would.
        attempt_indexes = {i['name'] for i in inspector.get_indexes('analytics_attempt')}
        if 'ix_analytics_attempt_visitor_created' not in attempt_indexes:
            conn.execute(text(
                'CREATE INDEX ix_analytics_attempt_visitor_created ON analytics_attempt (visitor_key, created_at)'
            ))
        if 'ix_analytics_attempt_ip_created' not in attempt_indexes:
            conn.execute(text(
                'CREATE INDEX ix_analytics_attempt_ip_created ON analytics_attempt (ip_address, created_at)'
            ))


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
        _migrate_schema()
    app.run(debug=True)
