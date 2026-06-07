from flask import Blueprint, jsonify, request
from flask_login import current_user
from extensions import db
from models import AdminAccount, SiteEventLog
from routes.admin_auth import admin_required, role_at_least, ROLE_ORDER

admin_accounts_bp = Blueprint('admin_accounts', __name__)

VALID_ROLES = ['contributor', 'editor', 'administrator', 'owner']


def _account_dict(a):
    return {
        'id': a.id,
        'full_name': a.full_name,
        'title': a.title,
        'location': a.location,
        'email': a.email,
        'role': a.role,
        'avatar_filename': a.avatar_filename,
    }


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


@admin_accounts_bp.route('/api/admin/accounts', methods=['GET'])
@role_at_least('editor')
def list_accounts():
    accounts = AdminAccount.query.filter_by(is_active=True).order_by(AdminAccount.id).all()
    return jsonify([_account_dict(a) for a in accounts])


@admin_accounts_bp.route('/api/admin/accounts/owner', methods=['GET'])
@admin_required
def get_owner():
    owner = AdminAccount.query.filter_by(role='owner', is_active=True).first()
    if not owner:
        return jsonify({'error': 'No owner account found'}), 404
    return jsonify(_account_dict(owner))


@admin_accounts_bp.route('/api/admin/accounts', methods=['POST'])
@role_at_least('editor')
def create_account():
    data = request.get_json(silent=True) or {}
    full_name = (data.get('full_name') or '').strip()
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''
    title = (data.get('title') or '').strip() or None
    role = (data.get('role') or 'contributor').strip()

    if not all([full_name, email, password]):
        return jsonify({'error': 'Name, email, and password are required'}), 400

    if role not in ['contributor', 'editor', 'administrator']:
        return jsonify({'error': 'Invalid role'}), 400

    # Editors can only create contributors
    if current_user.role == 'editor' and role != 'contributor':
        return jsonify({'error': 'Editors can only invite Contributors'}), 403

    # Only administrators+ can create administrators
    if role == 'administrator' and ROLE_ORDER.index(current_user.role) < ROLE_ORDER.index('administrator'):
        return jsonify({'error': 'Insufficient permissions to create this role'}), 403

    if AdminAccount.query.filter_by(email=email).first():
        return jsonify({'error': 'An account with that email already exists'}), 409

    account = AdminAccount(full_name=full_name, title=title, email=email, role=role)
    account.set_password(password)
    db.session.add(account)
    _log(current_user, 'User', 'added', full_name, subject_is_bold=True)
    db.session.commit()

    return jsonify(_account_dict(account)), 201


@admin_accounts_bp.route('/api/admin/accounts/<int:account_id>', methods=['PUT'])
@admin_required
def update_account(account_id):
    account = AdminAccount.query.get_or_404(account_id)
    data = request.get_json(silent=True) or {}

    # Only administrators+ can edit other accounts
    is_own_account = current_user.id == account_id
    if not is_own_account and ROLE_ORDER.index(current_user.role) < ROLE_ORDER.index('administrator'):
        return jsonify({'error': 'Insufficient permissions'}), 403

    if 'full_name' in data:
        account.full_name = (data['full_name'] or '').strip() or account.full_name
    if 'title' in data:
        account.title = (data['title'] or '').strip() or None
    if 'location' in data:
        account.location = (data['location'] or '').strip() or None
    if 'email' in data:
        new_email = (data['email'] or '').strip()
        if new_email and new_email != account.email:
            if AdminAccount.query.filter_by(email=new_email).first():
                return jsonify({'error': 'An account with that email already exists'}), 409
            account.email = new_email
    if 'avatar_filename' in data:
        account.avatar_filename = data['avatar_filename'] or None

    # Role changes require administrator+, can't change owner's role
    if 'role' in data:
        new_role = data['role']
        if account.role == 'owner' and new_role != 'owner':
            return jsonify({'error': "The Owner's role cannot be changed here"}), 403
        if ROLE_ORDER.index(current_user.role) < ROLE_ORDER.index('administrator'):
            # Editors can only change between contributor and editor
            if current_user.role == 'editor' and new_role not in ['contributor', 'editor']:
                return jsonify({'error': 'Insufficient permissions to assign this role'}), 403
        if new_role not in ['contributor', 'editor', 'administrator', 'owner']:
            return jsonify({'error': 'Invalid role'}), 400
        old_role = account.role
        account.role = new_role
        if old_role != new_role:
            _log(current_user, 'User', 'edited',
                 account.full_name,
                 subject_is_bold=True,
                 subject_suffix=f'(role: {old_role} → {new_role})')
    else:
        _log(current_user, 'User', 'edited', account.full_name, subject_is_bold=True)

    db.session.commit()
    return jsonify(_account_dict(account))


@admin_accounts_bp.route('/api/admin/accounts/<int:account_id>/password', methods=['PUT'])
@admin_required
def update_password(account_id):
    account = AdminAccount.query.get_or_404(account_id)
    data = request.get_json(silent=True) or {}

    # Admins can reset others' passwords without old_password; self-change requires old_password
    is_own_account = current_user.id == account_id
    old_password = data.get('old_password') or ''
    new_password = data.get('new_password') or ''

    if not new_password:
        return jsonify({'error': 'New password is required'}), 400

    if is_own_account:
        if not old_password:
            return jsonify({'error': 'Current password is required'}), 400
        if not account.check_password(old_password):
            return jsonify({'error': 'Current password is incorrect'}), 400
    else:
        if ROLE_ORDER.index(current_user.role) < ROLE_ORDER.index('administrator'):
            return jsonify({'error': 'Insufficient permissions'}), 403

    account.set_password(new_password)
    db.session.commit()
    return jsonify({'message': 'Password updated'})


@admin_accounts_bp.route('/api/admin/accounts/<int:account_id>/make-owner', methods=['POST'])
@admin_required
def make_owner(account_id):
    if current_user.role != 'owner':
        return jsonify({'error': 'Only the Owner can transfer ownership'}), 403

    target = AdminAccount.query.get_or_404(account_id)
    if target.role != 'administrator':
        return jsonify({'error': 'Only an Administrator can be made Owner'}), 400
    if target.id == current_user.id:
        return jsonify({'error': 'You are already the Owner'}), 400

    target.role = 'owner'
    current_user.role = 'administrator'
    _log(current_user, 'User', 'edited',
         f'Ownership transferred to {target.full_name}',
         subject_is_bold=True)
    db.session.commit()
    return jsonify({'message': 'Ownership transferred', 'new_owner': _account_dict(target)})


@admin_accounts_bp.route('/api/admin/accounts/<int:account_id>', methods=['DELETE'])
@role_at_least('editor')
def delete_account(account_id):
    account = AdminAccount.query.get_or_404(account_id)

    if not account.is_active:
        return jsonify({'error': 'Account not found'}), 404
    if account.role == 'owner':
        return jsonify({'error': 'The Owner account cannot be deleted'}), 403
    if account.id == current_user.id:
        return jsonify({'error': 'You cannot delete your own account'}), 403
    if current_user.role == 'editor' and account.role != 'contributor':
        return jsonify({'error': 'Editors can only delete Contributors'}), 403
    if current_user.role == 'administrator' and account.role == 'administrator':
        return jsonify({'error': 'Administrators cannot delete other Administrators'}), 403

    _log(current_user, 'User', 'deleted', account.full_name, subject_is_bold=True)
    account.is_active = False
    db.session.commit()
    return jsonify({'message': 'Account deleted'})
