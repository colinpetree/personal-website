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
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-change-in-production')
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

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
    from routes.auth import auth_bp
    from routes.user import user_bp
    from routes.admin_users import admin_users_bp
    from routes.admin_history import admin_history_bp
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
    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(admin_users_bp)
    app.register_blueprint(admin_history_bp)

    return app

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
    app.run(debug=True)
