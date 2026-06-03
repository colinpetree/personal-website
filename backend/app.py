from flask import Flask
from flask_cors import CORS
from extensions import db
from dotenv import load_dotenv
import os

load_dotenv()

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    CORS(app)
    db.init_app(app)

    from routes.profile import profile_bp
    from routes.site_config import site_config_bp
    from routes.projects import projects_bp
    from routes.uploads import uploads_bp
    app.register_blueprint(profile_bp)
    app.register_blueprint(site_config_bp)
    app.register_blueprint(projects_bp)
    app.register_blueprint(uploads_bp)

    return app

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
    app.run(debug=True)
