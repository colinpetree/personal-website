from flask import Blueprint, abort, jsonify
from models import Project, SiteConfig

projects_bp = Blueprint('projects', __name__)


@projects_bp.route('/api/projects')
def get_projects():
    # A disabled projects page must be indistinguishable from one that never
    # existed — 404 the API too, not just the frontend route (see
    # ProjectsPage.jsx's own nav-enabled check).
    config = SiteConfig.query.first()
    if not (config and config.projects_enabled):
        abort(404)

    projects = (
        Project.query
        .filter_by(visible=True)
        .order_by(Project.order.asc(), Project.id.asc())
        .all()
    )
    return jsonify([
        {
            'id': p.id,
            'title': p.title,
            'description': p.description,
            'url': p.url,
            'image_filename': p.image_filename,
        }
        for p in projects
    ])
