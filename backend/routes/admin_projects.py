from datetime import datetime
from flask import Blueprint, jsonify, request
from extensions import db
from models import Project, SiteConfig
from routes.admin_auth import admin_required, role_at_least
from varnish_purge import ban_pattern
from upload_utils import get_uploads_dir, thumbnail_variant_filename

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
@role_at_least('editor')
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
        image_filename=thumbnail_variant_filename(data.get('image_filename'), get_uploads_dir()) if data.get('image_filename') else None,
        order=max_order + 1,
        visible=data.get('visible', True),
    )
    db.session.add(project)
    db.session.commit()
    ban_pattern('^/api/projects')
    return jsonify(_project_to_dict(project)), 201


@admin_projects_bp.route('/api/admin/projects/<int:project_id>', methods=['PUT'])
@role_at_least('editor')
def update_project(project_id):
    project = Project.query.get_or_404(project_id)
    data = request.get_json(silent=True) or {}

    for field in ('title', 'description', 'url', 'order', 'visible'):
        if field in data:
            setattr(project, field, data[field] or None if field not in ('order', 'visible') else data[field])

    # image_filename only ever renders small (admin list icon, edit preview,
    # public card), so it's converted to its pre-generated 400w variant here
    # rather than stored as the full-size filename the uploader sends.
    if 'image_filename' in data:
        raw = data['image_filename']
        project.image_filename = thumbnail_variant_filename(raw, get_uploads_dir()) if raw else None

    if 'title' in data and not (data.get('title') or '').strip():
        return jsonify({'error': 'Title is required'}), 400
    if 'title' in data:
        project.title = data['title'].strip()

    db.session.commit()
    ban_pattern('^/api/projects')
    return jsonify(_project_to_dict(project))


@admin_projects_bp.route('/api/admin/projects/<int:project_id>', methods=['DELETE'])
@role_at_least('editor')
def delete_project(project_id):
    project = Project.query.get_or_404(project_id)
    db.session.delete(project)

    # get_content_version() fingerprints Project via a plain, unfiltered
    # MAX(updated_at) — but removing a row only moves that MAX() if the
    # deleted project happened to hold it. Deleting any OTHER project (which
    # is the common case) leaves the fingerprint unchanged, so the Pi's
    # content-watcher would skip the rebuild that's supposed to pull the
    # now-deleted project off the prerendered /projects page. Unconditional
    # here (unlike BlogPost's fix) since there's no status/visible filter
    # for a deletion to fall out of in the first place — every delete needs
    # this, not just ones matching some condition.
    fingerprint_config = SiteConfig.query.first()
    if fingerprint_config:
        fingerprint_config.updated_at = datetime.utcnow()

    db.session.commit()
    ban_pattern('^/api/projects')
    return jsonify({'message': 'Project deleted'})


@admin_projects_bp.route('/api/admin/projects/reorder', methods=['PUT'])
@role_at_least('editor')
def reorder_projects():
    """Accepts [{id, order}, ...] and bulk-updates order values."""
    items = request.get_json(silent=True) or []
    for item in items:
        project = Project.query.get(item.get('id'))
        if project:
            project.order = item.get('order', project.order)
    db.session.commit()
    ban_pattern('^/api/projects')
    return jsonify({'message': 'Order updated'})
