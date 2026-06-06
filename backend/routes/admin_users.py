import csv
import io
from flask import Blueprint, jsonify, request, Response
from extensions import db
from models import User, Comment
from routes.admin_auth import admin_required

admin_users_bp = Blueprint('admin_users', __name__)


def _user_dict(u, comment_count):
    return {
        'id': u.id,
        'name': u.name,
        'email': u.email,
        'title': u.title,
        'avatar_url': u.avatar_url,
        'can_comment': u.can_comment,
        'created_at': u.created_at.isoformat(),
        'comment_count': comment_count,
    }


@admin_users_bp.route('/api/admin/users')
@admin_required
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
@admin_required
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}

    if 'can_comment' in data:
        user.can_comment = bool(data['can_comment'])

    db.session.commit()
    count = Comment.query.filter_by(user_id=user.id, is_deleted=False).count()
    return jsonify(_user_dict(user, count))


@admin_users_bp.route('/api/admin/users/export.csv')
@admin_required
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
