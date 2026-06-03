from flask import Blueprint, jsonify, request
from extensions import db
from models import AdminAccount
from routes.admin_auth import admin_required

admin_accounts_bp = Blueprint('admin_accounts', __name__)


@admin_accounts_bp.route('/api/admin/accounts', methods=['GET'])
@admin_required
def list_accounts():
    accounts = AdminAccount.query.order_by(AdminAccount.id).all()
    return jsonify([
        {
            'id': a.id,
            'name': a.name,
            'title': a.title,
            'email': a.email,
            'is_primary': a.is_primary,
        }
        for a in accounts
    ])


@admin_accounts_bp.route('/api/admin/accounts', methods=['POST'])
@admin_required
def create_account():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''
    title = (data.get('title') or '').strip() or None

    if not all([name, email, password]):
        return jsonify({'error': 'Name, email, and password are required'}), 400

    if AdminAccount.query.filter_by(email=email).first():
        return jsonify({'error': 'An account with that email already exists'}), 409

    account = AdminAccount(name=name, title=title, email=email, is_primary=False)
    account.set_password(password)
    db.session.add(account)
    db.session.commit()

    return jsonify({
        'id': account.id,
        'name': account.name,
        'title': account.title,
        'email': account.email,
        'is_primary': account.is_primary,
    }), 201


@admin_accounts_bp.route('/api/admin/accounts/<int:account_id>', methods=['DELETE'])
@admin_required
def delete_account(account_id):
    account = AdminAccount.query.get_or_404(account_id)

    if account.is_primary:
        return jsonify({'error': 'The primary admin account cannot be deleted'}), 403

    db.session.delete(account)
    db.session.commit()
    return jsonify({'message': 'Account deleted'})
