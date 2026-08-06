import csv
import io
from flask import Blueprint, jsonify, request, Response
from flask_login import current_user
from extensions import db
from models import User, Comment, SiteEventLog
from routes.admin_auth import admin_required, role_at_least

admin_users_bp = Blueprint('admin_users', __name__)


def _log(admin, area, action_type, subject, subject_is_bold=False, subject_suffix=None):
    entry = SiteEventLog(
        admin_id=admin.id,
        admin_name=admin.full_name,
        admin_avatar=admin.avatar_filename,
        area=area,
        action_type=action_type,
        subject=subject,
        subject_suffix=subject_suffix,
        subject_is_bold=subject_is_bold,
    )
    db.session.add(entry)


def _user_dict(u, comment_count):
    return {
        'id': u.id,
        'name': u.name,
        'email': u.email,
        'title': u.title,
        'avatar_url': u.avatar_url,
        'can_comment': u.can_comment,
        'created_at': u.created_at.isoformat() + 'Z',
        'comment_count': comment_count,
    }


@admin_users_bp.route('/api/admin/users')
@role_at_least('administrator')
def list_users():
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)

    pagination = User.query.order_by(User.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    users = []
    for u in pagination.items:
        count = Comment.query.filter_by(user_id=u.id, is_deleted=False).count()
        users.append(_user_dict(u, count))

    return jsonify({
        'users': users,
        'total': pagination.total,
        'page': page,
        'pages': pagination.pages,
    })


@admin_users_bp.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@role_at_least('administrator')
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}

    edited = False
    comment_status_suffix = None

    if 'can_comment' in data:
        new_can_comment = bool(data['can_comment'])
        if new_can_comment != user.can_comment:
            user.can_comment = new_can_comment
            edited = True
            comment_status_suffix = '(blocked from commenting)' if not new_can_comment else '(unblocked from commenting)'

    if 'name' in data:
        new_name = (data['name'] or '').strip()
        if not new_name:
            return jsonify({'error': 'Name is required'}), 400
        if new_name != user.name:
            user.name = new_name
            edited = True

    if 'email' in data:
        new_email = (data['email'] or '').strip()
        if not new_email:
            return jsonify({'error': 'Email is required'}), 400
        if new_email != user.email:
            if User.query.filter(User.id != user_id, User.email == new_email).first():
                return jsonify({'error': 'A user with that email already exists'}), 409
            user.email = new_email
            edited = True

    if 'title' in data:
        new_title = (data['title'] or '').strip() or None
        if new_title != user.title:
            user.title = new_title
            edited = True

    if edited:
        _log(current_user, 'User', 'edited', user.name, subject_is_bold=True, subject_suffix=comment_status_suffix)

    db.session.commit()
    count = Comment.query.filter_by(user_id=user.id, is_deleted=False).count()
    return jsonify(_user_dict(user, count))


@admin_users_bp.route('/api/admin/users/export.csv')
@role_at_least('administrator')
def export_users():
    users = User.query.order_by(User.created_at).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Name', 'Email', 'Title', 'Can Comment', 'Comments', 'Joined'])
    for u in users:
        count = Comment.query.filter_by(user_id=u.id, is_deleted=False).count()
        writer.writerow([
            u.id,
            u.name,
            u.email,
            u.title or '',
            'Yes' if u.can_comment else 'No',
            count,
            u.created_at.strftime('%Y-%m-%d'),
        ])

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=users.csv'},
    )
