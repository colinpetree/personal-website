from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from models import SiteEventLog, AdminAccount
from routes.admin_auth import role_at_least

admin_history_bp = Blueprint('admin_history', __name__)


def _group_entries(entries):
    """Group consecutive same (admin_id, area, action_type, subject) within 5 minutes."""
    grouped = []
    for entry in entries:
        if (
            grouped
            and grouped[-1]['admin_id'] == entry.admin_id
            and grouped[-1]['area'] == entry.area
            and grouped[-1]['action_type'] == entry.action_type
            and grouped[-1]['subject'] == entry.subject
            and (grouped[-1]['_latest_dt'] - entry.created_at) < timedelta(minutes=5)
        ):
            grouped[-1]['count'] += 1
        else:
            grouped.append({
                'id': entry.id,
                'admin_id': entry.admin_id,
                'admin_name': entry.admin_name,
                'admin_avatar': entry.admin_avatar,
                'area': entry.area,
                'action_type': entry.action_type,
                'subject': entry.subject,
                'subject_suffix': entry.subject_suffix,
                'subject_is_bold': entry.subject_is_bold,
                'created_at': entry.created_at.isoformat(),
                'count': 1,
                '_latest_dt': entry.created_at,
            })
    # Remove internal tracking field
    for g in grouped:
        del g['_latest_dt']
    return grouped


@admin_history_bp.route('/api/admin/history', methods=['GET'])
@role_at_least('editor')
def get_history():
    admin_id = request.args.get('admin_id', type=int)
    area = request.args.get('area')          # comma-separated e.g. "Post,Settings"
    action = request.args.get('action')      # comma-separated e.g. "added,edited"
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 50, type=int), 200)

    query = SiteEventLog.query.order_by(SiteEventLog.created_at.desc())

    if admin_id:
        query = query.filter(SiteEventLog.admin_id == admin_id)

    if area:
        areas = [a.strip() for a in area.split(',') if a.strip()]
        if areas:
            query = query.filter(SiteEventLog.area.in_(areas))

    if action:
        actions = [a.strip() for a in action.split(',') if a.strip()]
        if actions:
            query = query.filter(SiteEventLog.action_type.in_(actions))

    # Fetch more than needed to allow for grouping, then paginate grouped results
    raw_entries = query.limit(per_page * 10).all()
    grouped = _group_entries(raw_entries)

    # Simple pagination on grouped results
    start = (page - 1) * per_page
    page_items = grouped[start:start + per_page]

    return jsonify({
        'entries': page_items,
        'page': page,
        'has_more': len(grouped) > start + per_page,
    })


@admin_history_bp.route('/api/admin/history/staff', methods=['GET'])
@role_at_least('editor')
def get_staff_list():
    """Returns the list of staff accounts for the search dropdown."""
    accounts = AdminAccount.query.order_by(AdminAccount.full_name).all()
    return jsonify([
        {
            'id': a.id,
            'name': a.full_name,
            'avatar_filename': a.avatar_filename,
            'role': a.role,
        }
        for a in accounts
    ])
