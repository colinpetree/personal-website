import os
from flask import Blueprint, send_from_directory, current_app

uploads_bp = Blueprint('uploads', __name__)


@uploads_bp.route('/api/uploads/<path:filename>')
def serve_upload(filename):
    uploads_dir = os.path.join(current_app.root_path, 'uploads')
    return send_from_directory(uploads_dir, filename)
