from flask import Blueprint, send_from_directory, request
from upload_utils import get_uploads_dir

uploads_bp = Blueprint('uploads', __name__)


@uploads_bp.route('/api/uploads/<path:filename>')
def serve_upload(filename):
    uploads_dir = get_uploads_dir()
    friendly_name = request.args.get('name')
    if friendly_name:
        return send_from_directory(uploads_dir, filename, as_attachment=True, download_name=friendly_name)
    response = send_from_directory(uploads_dir, filename)
    response.cache_control.public = True
    response.cache_control.max_age = 31536000
    return response
