from flask import Blueprint, jsonify, request
from extensions import db
from models import Project
from routes.admin_auth import admin_required

admin_projects_bp = Blueprint('admin_projects', __name__)


def _project_to_dict(p):
    return {
        'id': p.id,
        'title': p.title,
        'description': p.description,
        'url': p.url,
        'image_filename': p.image_filename,
        'order': p.order,
        'visible': p.visible,
    }


@admin_projects_bp.route('/api/admin/projects', methods=['GET'])
@admin_required
def list_projects():
    projects = Project.query.order_by(Project.order.asc(), Project.id.asc()).all()
    return jsonify([_project_to_dict(p) for p in projects])


@admin_projects_bp.route('/api/admin/projects', methods=['POST'])
@admin_required
def create_project():
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Title is required'}), 400

    # Place new project at the end
    max_order = db.session.query(db.func.max(Project.order)).scalar() or 0
    project = Project(
        title=title,
        description=data.get('description') or None,
        url=data.get('url') or None,
        image_filename=data.get('image_filename') or None,
        order=max_order + 1,
        visible=data.get('visible', True),
    )
    db.session.add(project)
    db.session.commit()
    return jsonify(_project_to_dict(project)), 201


@admin_projects_bp.route('/api/admin/projects/<int:project_id>', methods=['PUT'])
@admin_required
def update_project(project_id):
    project = Project.query.get_or_404(project_id)
    data = request.get_json(silent=True) or {}

    for field in ('title', 'description', 'url', 'image_filename', 'order', 'visible'):
        if field in data:
            setattr(project, field, data[field] or None if field not in ('order', 'visible') else data[field])

    if 'title' in data and not (data.get('title') or '').strip():
        return jsonify({'error': 'Title is required'}), 400
    if 'title' in data:
        project.title = data['title'].strip()

    db.session.commit()
    return jsonify(_project_to_dict(project))


@admin_projects_bp.route('/api/admin/projects/<int:project_id>', methods=['DELETE'])
@admin_required
def delete_project(project_id):
    project = Project.query.get_or_404(project_id)
    db.session.delete(project)
    db.session.commit()
    return jsonify({'message': 'Project deleted'})


@admin_projects_bp.route('/api/admin/projects/reorder', methods=['PUT'])
@admin_required
def reorder_projects():
    """Accepts [{id, order}, ...] and bulk-updates order values."""
    items = request.get_json(silent=True) or []
    for item in items:
        project = Project.query.get(item.get('id'))
        if project:
            project.order = item.get('order', project.order)
    db.session.commit()
    return jsonify({'message': 'Order updated'})
