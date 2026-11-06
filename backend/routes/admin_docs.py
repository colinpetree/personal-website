from datetime import datetime
from flask import Blueprint, jsonify, request
from flask_login import current_user
from sqlalchemy.exc import IntegrityError
from extensions import db
from models import DocsSection, DocsItem, Page, SiteConfig, SiteEventLog
from routes.admin_auth import role_at_least
from varnish_purge import ban_pattern

admin_docs_bp = Blueprint('admin_docs', __name__)


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


def _ban_public_caches():
    # The docs sidebar ships inside each member page's /api/resolve/<slug>
    # response (see public_resolve.py), so that's the cache to drop.
    ban_pattern('^/api/resolve')


def _bump_fingerprint_config():
    # A deleted section's updated_at leaves get_content_version()'s MAX()
    # entirely, which only moves the fingerprint if it happened to hold the
    # max. Same SiteConfig trick as admin_pages.py's delete_page.
    config = SiteConfig.query.first()
    if config:
        config.updated_at = datetime.utcnow()


def _section_summary(section):
    page_items = [i for i in section.items if i.kind == 'page']
    return {
        'id': section.id,
        'name': section.name,
        'item_count': len(section.items),
        'page_count': len(page_items),
        'published_page_count': sum(1 for i in page_items if i.page and i.page.status == 'published'),
        'created_at': section.created_at.isoformat() + 'Z',
        'updated_at': section.updated_at.isoformat() + 'Z',
    }


def _item_to_dict(item):
    d = {'id': item.id, 'kind': item.kind}
    if item.kind == 'label':
        d['label'] = item.label
    else:
        d['page_id'] = item.page_id
        d['page_title'] = item.page.title if item.page else None
        d['page_slug'] = item.page.slug if item.page else None
        d['page_status'] = item.page.status if item.page else None
    return d


def _section_to_dict(section):
    d = _section_summary(section)
    d['items'] = [_item_to_dict(i) for i in section.items]
    return d


@admin_docs_bp.route('/api/admin/docs', methods=['GET'])
@role_at_least('editor')
def list_sections():
    sections = DocsSection.query.order_by(DocsSection.created_at.asc()).all()
    return jsonify([_section_summary(s) for s in sections])


@admin_docs_bp.route('/api/admin/docs', methods=['POST'])
@role_at_least('editor')
def create_section():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    if len(name) > 200:
        return jsonify({'error': 'Name must be 200 characters or fewer'}), 400
    section = DocsSection(name=name)
    db.session.add(section)
    _log('Docs', 'added', name, subject_is_bold=True)
    db.session.commit()
    return jsonify(_section_to_dict(section)), 201


@admin_docs_bp.route('/api/admin/docs/<int:section_id>', methods=['GET'])
@role_at_least('editor')
def get_section(section_id):
    section = DocsSection.query.get_or_404(section_id)
    return jsonify(_section_to_dict(section))


def _parse_items(raw_items, section_id):
    """Validates the PUT body's item list. Returns (items, error) where items
    is a list of plain dicts ready to become DocsItem rows."""
    if not isinstance(raw_items, list):
        return None, 'Invalid items'
    parsed = []
    seen_page_ids = set()
    for raw in raw_items:
        if not isinstance(raw, dict):
            return None, 'Invalid items'
        kind = raw.get('kind')
        if kind == 'label':
            label = (raw.get('label') or '').strip()
            if not label:
                return None, 'Section labels cannot be blank'
            if len(label) > 300:
                return None, 'Section labels must be 300 characters or fewer'
            parsed.append({'kind': 'label', 'label': label})
        elif kind == 'page':
            page_id = raw.get('page_id')
            if not isinstance(page_id, int) or isinstance(page_id, bool):
                return None, 'Every page row needs a page selected'
            if page_id in seen_page_ids:
                return None, 'A page can only appear once in a docs section'
            seen_page_ids.add(page_id)
            parsed.append({'kind': 'page', 'page_id': page_id})
        else:
            return None, 'Invalid items'

    if seen_page_ids:
        pages = {p.id: p for p in Page.query.filter(Page.id.in_(seen_page_ids)).all()}
        missing = seen_page_ids - pages.keys()
        if missing:
            return None, 'One or more selected pages no longer exist'
        taken = (
            DocsItem.query
            .filter(DocsItem.page_id.in_(seen_page_ids), DocsItem.section_id != section_id)
            .first()
        )
        if taken:
            return None, f'"{pages[taken.page_id].title}" is already in the "{taken.section.name}" docs section'
    return parsed, None


@admin_docs_bp.route('/api/admin/docs/<int:section_id>', methods=['PUT'])
@role_at_least('editor')
def update_section(section_id):
    section = DocsSection.query.get_or_404(section_id)
    data = request.get_json(silent=True) or {}

    if 'name' in data:
        name = (data['name'] or '').strip()
        if not name:
            return jsonify({'error': 'Name is required'}), 400
        if len(name) > 200:
            return jsonify({'error': 'Name must be 200 characters or fewer'}), 400
        section.name = name

    if 'items' in data:
        items, error = _parse_items(data['items'], section.id)
        if error:
            return jsonify({'error': error}), 400
        # The unit of work flushes INSERTs before DELETEs, so replacing the
        # list in one flush would trip DocsItem.page_id's unique constraint
        # for any page that stays in the section. Delete and flush first.
        for old in list(section.items):
            db.session.delete(old)
        db.session.flush()
        db.session.expire(section, ['items'])
        for index, item in enumerate(items):
            db.session.add(DocsItem(section_id=section.id, order=index, **item))

    # Always bumped: the name and order are baked into every member page's
    # prerendered sidebar, so any save should reach the content fingerprint.
    section.updated_at = datetime.utcnow()
    _log('Docs', 'edited', section.name, subject_is_bold=True)
    try:
        db.session.commit()
    except IntegrityError:
        # Another admin added the same page to a different section between
        # _parse_items' check and this commit.
        db.session.rollback()
        return jsonify({'error': 'One of these pages was just added to another docs section. Reload and try again.'}), 400
    _ban_public_caches()
    db.session.refresh(section)
    return jsonify(_section_to_dict(section))


@admin_docs_bp.route('/api/admin/docs/<int:section_id>', methods=['DELETE'])
@role_at_least('editor')
def delete_section(section_id):
    section = DocsSection.query.get_or_404(section_id)
    _log('Docs', 'deleted', section.name, subject_is_bold=True)
    db.session.delete(section)
    _bump_fingerprint_config()
    db.session.commit()
    _ban_public_caches()
    return jsonify({'message': 'Docs section deleted'})
