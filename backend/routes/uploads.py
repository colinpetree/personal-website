import os
from flask import Blueprint, send_from_directory, request, abort
from upload_utils import get_uploads_dir

uploads_bp = Blueprint('uploads', __name__)

# Types that can carry executable script content (SVG scripts/event handlers,
# raw HTML) — served as a forced download instead of inline, so viewing an
# uploaded file directly in the browser can never execute same-origin JS.
INLINE_UNSAFE_EXTENSIONS = {'svg', 'html', 'htm', 'xml'}


@uploads_bp.route('/favicon.ico')
def serve_favicon():
    """Fixed well-known path — overwritten on each Site icon upload (see
    save_favicon in upload_utils.py). Exists alongside the <link rel="icon">
    tag Navbar.jsx/AdminLayout.jsx set dynamically, for browsers/crawlers/
    tools that request /favicon.ico directly without ever parsing that tag."""
    uploads_dir = get_uploads_dir()
    if not os.path.exists(os.path.join(uploads_dir, 'favicon.ico')):
        abort(404)
    response = send_from_directory(uploads_dir, 'favicon.ico')
    response.cache_control.public = True
    response.cache_control.max_age = 86400
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@uploads_bp.route('/api/uploads/<path:filename>')
def serve_upload(filename):
    uploads_dir = get_uploads_dir()
    friendly_name = request.args.get('name')
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if friendly_name:
        response = send_from_directory(uploads_dir, filename, as_attachment=True, download_name=friendly_name)
    elif ext in INLINE_UNSAFE_EXTENSIONS:
        response = send_from_directory(uploads_dir, filename, as_attachment=True)
    else:
        response = send_from_directory(uploads_dir, filename)
        response.cache_control.public = True
        response.cache_control.max_age = 31536000
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response
