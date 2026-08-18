from flask import Flask
from flask_cors import CORS
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
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-change-in-production')
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    # Deployment-time flag — lets forks of this project fully exclude the AI demo
    # feature (its own API keys/spend) without touching code. Not admin-toggleable;
    # ai_demo_enabled in SiteConfig is a separate runtime toggle for sites that have it.
    app.config['ENABLE_AI_DEMOS'] = os.getenv('ENABLE_AI_DEMOS', 'true').lower() == 'true'

    CORS(app, supports_credentials=True)
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


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
        _migrate_schema()
    app.run(debug=True)
