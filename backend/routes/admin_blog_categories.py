import re
from datetime import datetime
from flask import Blueprint, jsonify, request
from flask_login import current_user
from extensions import db
from models import BlogCategory, BlogPost, SiteEventLog
from routes.admin_auth import admin_required, role_at_least
from varnish_purge import ban_pattern


def _log(area, action_type, subject, subject_is_bold=False):
    entry = SiteEventLog(
        admin_id=current_user.id,
        admin_name=current_user.full_name,
        admin_avatar=current_user.avatar_filename,
        area=area,
        action_type=action_type,
        subject=subject,
        subject_is_bold=subject_is_bold,
    )
    db.session.add(entry)


admin_blog_categories_bp = Blueprint('admin_blog_categories', __name__)


def _slugify(text):
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text


def _unique_slug(base, exclude_id=None):
    slug = base or 'category'
    counter = 1
    while True:
        q = BlogCategory.query.filter_by(slug=slug)
        if exclude_id:
            q = q.filter(BlogCategory.id != exclude_id)
        if not q.first():
            return slug
        slug = f'{base}-{counter}'
        counter += 1


def _category_to_dict(category, post_count=None):
    d = {
        'id': category.id,
        'name': category.name,
        'slug': category.slug,
        'order': category.order,
        'created_at': category.created_at.isoformat() + 'Z',
    }
    if post_count is not None:
        d['post_count'] = post_count
    return d


@admin_blog_categories_bp.route('/api/admin/blog/categories', methods=['GET'])
@admin_required
def list_categories():
    categories = BlogCategory.query.order_by(BlogCategory.order.asc(), BlogCategory.id.asc()).all()
    result = []
    for c in categories:
        post_count = BlogPost.query.filter_by(category_id=c.id).count()
        result.append(_category_to_dict(c, post_count=post_count))
    return jsonify(result)


@admin_blog_categories_bp.route('/api/admin/blog/categories', methods=['POST'])
@role_at_least('editor')
def create_category():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    if BlogCategory.query.filter_by(name=name).first():
        return jsonify({'error': 'A category with this name already exists.'}), 400

    slug = _unique_slug(_slugify(name))
    max_order = db.session.query(db.func.max(BlogCategory.order)).scalar() or 0
    category = BlogCategory(name=name, slug=slug, order=max_order + 1)
    db.session.add(category)
    _log('Category', 'added', name, subject_is_bold=True)
    db.session.commit()
    ban_pattern('^/api/blog')
    return jsonify(_category_to_dict(category, post_count=0)), 201


@admin_blog_categories_bp.route('/api/admin/blog/categories/reorder', methods=['PUT'])
@role_at_least('editor')
def reorder_categories():
    """Accepts [{id, order}, ...] and bulk-updates order values."""
    items = request.get_json(silent=True) or []
    for item in items:
        category = BlogCategory.query.get(item.get('id'))
        if category:
            category.order = item.get('order', category.order)
    db.session.commit()
    ban_pattern('^/api/blog')
    return jsonify({'message': 'Order updated'})


@admin_blog_categories_bp.route('/api/admin/blog/categories/<int:category_id>', methods=['PUT'])
@role_at_least('editor')
def update_category(category_id):
    category = BlogCategory.query.get_or_404(category_id)
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    conflict = BlogCategory.query.filter(BlogCategory.name == name, BlogCategory.id != category_id).first()
    if conflict:
        return jsonify({'error': 'A category with this name already exists.'}), 400

    category.name = name
    category.slug = _unique_slug(_slugify(name), exclude_id=category_id)
    _log('Category', 'edited', name, subject_is_bold=True)
    db.session.commit()
    ban_pattern('^/api/blog')
    post_count = BlogPost.query.filter_by(category_id=category.id).count()
    return jsonify(_category_to_dict(category, post_count=post_count))


@admin_blog_categories_bp.route('/api/admin/blog/categories/<int:category_id>', methods=['DELETE'])
@role_at_least('editor')
def delete_category(category_id):
    category = BlogCategory.query.get_or_404(category_id)
    BlogPost.query.filter_by(category_id=category.id).update({'category_id': None})
    _log('Category', 'deleted', category.name, subject_is_bold=True)
    db.session.delete(category)
    db.session.commit()
    ban_pattern('^/api/blog')
    return jsonify({'message': 'Category deleted'})
