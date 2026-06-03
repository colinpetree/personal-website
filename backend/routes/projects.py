from flask import Blueprint, jsonify
from models import Project

projects_bp = Blueprint('projects', __name__)


@projects_bp.route('/api/projects')
def get_projects():
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
