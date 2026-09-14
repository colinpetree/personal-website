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
        # rules), and nginx sets X-Forwarded-For to the real client address
        # before proxying in — but Varnish itself then appends its OWN
        # connecting peer (nginx, reached over loopback) as a second entry,
        # e.g. "203.0.113.5, 127.0.0.1", even with a custom vcl_recv that
        # returns in every branch. Confirmed via varnishlog on test633.org:
        # BereqHeader X-Forwarded-For consistently carries two values, not
        # nginx's single one. x_for must be 2 (not 1) to correctly skip
        # Varnish's own loopback stamp and land on nginx's real value —
        # x_for=1 would instead pick Varnish's stamp itself (the rightmost
        # entry), making request.remote_addr always 127.0.0.1 for every
        # visitor and silently collapsing the login/contact-form rate
        # limiters below into one shared bucket.
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=2, x_proto=1, x_host=0, x_port=0, x_prefix=0)
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
    from routes.pages import pages_bp
    from routes.admin_pages import admin_pages_bp
    from routes.public_resolve import public_resolve_bp
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
    app.register_blueprint(pages_bp)
    app.register_blueprint(admin_pages_bp)
    app.register_blueprint(public_resolve_bp)
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
        if 'last_login_at' not in user_columns:
            conn.execute(text('ALTER TABLE "user" ADD COLUMN last_login_at TIMESTAMP'))

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

        for section in ('home', 'blog', 'projects', 'about', 'contact', 'ai_demo', 'payment'):
            column = f'{section}_font_family'
            if column not in config_columns:
                conn.execute(text(
                    f"ALTER TABLE site_config ADD COLUMN {column} VARCHAR(10) NOT NULL DEFAULT 'default'"
                ))

        if 'font_family' not in blog_post_columns:
            conn.execute(text(
                "ALTER TABLE blog_post ADD COLUMN font_family VARCHAR(10) NOT NULL DEFAULT 'default'"
            ))

        if 'list_thumbnail_filename' not in blog_post_columns:
            conn.execute(text('ALTER TABLE blog_post ADD COLUMN list_thumbnail_filename VARCHAR(255)'))
        if 'list_thumbnail_auto' not in blog_post_columns:
            conn.execute(text(
                'ALTER TABLE blog_post ADD COLUMN list_thumbnail_auto BOOLEAN NOT NULL DEFAULT TRUE'
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

        # Pages feature / Site Navigation — see slug_utils.py, routes/admin_pages.py,
        # models.py's Page/SiteConfig.primary_navigation|site_title_link|about_migrated.
        if 'primary_navigation' not in config_columns:
            conn.execute(text('ALTER TABLE site_config ADD COLUMN primary_navigation TEXT'))
        if 'site_title_link' not in config_columns:
            conn.execute(text(
                "ALTER TABLE site_config ADD COLUMN site_title_link VARCHAR(500) NOT NULL DEFAULT '/'"
            ))
        if 'about_migrated' not in config_columns:
            conn.execute(text(
                'ALTER TABLE site_config ADD COLUMN about_migrated BOOLEAN NOT NULL DEFAULT FALSE'
            ))


def _seed_pages_and_nav():
    """One-time, idempotent data seeding for the Pages feature — run once
    per startup, after _migrate_schema() has added the columns this reads/
    writes. Two independent steps:

      a) Migrates the old fixed About SiteConfig columns into a real Page
         row (About is no longer a hardcoded page — see slug_utils.py's
         comment on why 'about' is no longer a reserved slug). Gated on
         SiteConfig.about_migrated, NOT on "does a Page with this slug
         exist" — the latter would be fooled by a later slug rename and
         recreate a duplicate About page on the next restart.

      b) Seeds primary_navigation from the legacy nav_order + each fixed
         page's enabled/name/slug, so existing installs' visible nav is
         preserved across the upgrade. Gated on primary_navigation IS NULL,
         so it only ever runs once and never clobbers an admin's own edits.
         Runs after (a) so About's nav entry can point at its new Page-backed
         URL instead of the (now-unused) SiteConfig columns.
    """
    import json
    from models import SiteConfig, Page, BlogPost, DEFAULT_NAV_ORDER
    from slug_utils import unique_slug, get_reserved_slugs

    config = SiteConfig.query.first()
    if not config:
        return  # fresh install, nothing to migrate yet (seed.py hasn't run)

    # Direct object reference to whatever Page this run creates for About,
    # if any — used by the nav seed below so it doesn't need to re-query for
    # it. Only a same-run migration relies on this; see the fallback query
    # below for the (rare) case where about_migrated is already true but
    # primary_navigation is still NULL from a previous partial run.
    migrated_about = None

    if not config.about_migrated:
        if config.about_text or config.about_slug:
            candidate = config.about_slug or 'about'
            # Reserved-word/collision checks aren't skippable here even
            # though this is a one-time system migration: the OLD
            # admin_config.py PUT never validated about_slug against
            # reserved words or existing BlogPost slugs at all, so a legacy
            # install could already have an about_slug that collides with
            # something.
            final_slug = unique_slug([BlogPost, Page], candidate, get_reserved_slugs(config))
            migrated_about = Page(
                title=config.about_page_name or 'About',
                slug=final_slug,
                content_html=config.about_text,
                meta_description=config.about_meta_description,
                scrollable_nav_enabled=config.about_scrollable_nav_enabled,
                page_width=config.about_page_width,
                font_family=config.about_font_family,
                status='published' if config.about_enabled else 'draft',
                author_id=None,  # system-migrated, not attributable to any one admin
            )
            db.session.add(migrated_about)
        config.about_migrated = True
        db.session.commit()

    if config.primary_navigation is None:
        try:
            legacy_order = json.loads(config.nav_order) if config.nav_order else list(DEFAULT_NAV_ORDER)
        except (TypeError, ValueError):
            legacy_order = list(DEFAULT_NAV_ORDER)
        legacy_order = [key for key in legacy_order if key in DEFAULT_NAV_ORDER]
        legacy_order += [key for key in DEFAULT_NAV_ORDER if key not in legacy_order]

        if migrated_about is None:
            # about_migrated was already true on entry (a previous run did
            # step (a) but crashed before step (b)) — best-effort re-find by
            # the title that migration would have used, since there's no
            # stored id linking SiteConfig to it.
            migrated_about = Page.query.filter_by(title=config.about_page_name or 'About').order_by(Page.id.asc()).first()

        # "Enabled" here must match site_config.py's get_site_config() nav_items
        # computation exactly, not just the raw *_enabled flag — contact and
        # payment additionally require their third-party integration to
        # actually be configured, and ai_demo additionally requires the
        # deployment-level ENABLE_AI_DEMOS flag. Seeding a nav entry that the
        # live nav array itself would never have shown bakes a broken/
        # premature link into primary_navigation permanently, since this
        # seed only ever runs once (gated on primary_navigation IS NULL).
        from flask import current_app
        contact_enabled = config.contact_enabled and bool(config.mailgun_api_key and config.mailgun_domain)
        payment_enabled = config.payment_enabled and bool(config.stripe_publishable_key)
        ai_demo_enabled = config.ai_demo_enabled and current_app.config['ENABLE_AI_DEMOS']

        key_to_entry = {
            'home': (config.home_page_name, '/', config.home_enabled),
            'blog': (config.blog_page_name, f'/{config.blog_slug}', config.blog_enabled),
            'projects': (config.projects_page_name, f'/{config.projects_slug}', config.projects_enabled),
            'about': (
                (migrated_about.title if migrated_about else (config.about_page_name or 'About')),
                (f'/{migrated_about.slug}' if migrated_about else f'/{config.about_slug or "about"}'),
                (migrated_about.status == 'published') if migrated_about else config.about_enabled,
            ),
            'contact': (config.contact_page_name, f'/{config.contact_slug}', contact_enabled),
            'ai_demo': (config.ai_demo_page_name, f'/{config.ai_demo_slug}', ai_demo_enabled),
            'payment': (config.payment_page_name, f'/{config.payment_slug}', payment_enabled),
        }
        seeded = [
            {'label': name, 'url': url}
            for key in legacy_order
            for (name, url, enabled) in [key_to_entry[key]]
            if enabled
        ]
        config.primary_navigation = json.dumps(seeded)
        db.session.commit()


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
        _migrate_schema()
        _seed_pages_and_nav()
    # threaded=True so the dev server can actually process concurrent
    # requests (e.g. parallel image uploads from the editor's gallery
    # insert) instead of serializing them one at a time regardless of how
    # the frontend issues them. Production runs gunicorn with multiple sync
    # workers instead (see server.py), so this only matters for local dev.
    app.run(debug=True, threaded=True)
