"""Drafts stay private, publishing makes content public, contributors are
limited to their own drafts, and publishing changes the content fingerprint
that triggers a prerender rebuild (/api/content-version)."""
from datetime import datetime, timedelta

import pytest


def _new_page(c, title, html='<p>Body</p>'):
    r = c.post('/api/admin/pages', json={'title': title})
    assert r.status_code == 201, r.get_json()
    page = r.get_json()
    r = c.put(f"/api/admin/pages/{page['id']}", json={'content_html': html})
    assert r.status_code == 200, r.get_json()
    return page


def _publish(c, page_id):
    r = c.put(f'/api/admin/pages/{page_id}', json={'status': 'published'})
    assert r.status_code == 200, r.get_json()


def test_draft_page_is_private_until_published(client, login_as):
    editor = login_as('editor')
    page = _new_page(editor, 'Secret Plans')
    slug = page['slug']

    assert client.get(f'/api/pages/{slug}').status_code == 404
    assert client.get(f'/api/resolve/{slug}').status_code == 404
    assert slug not in client.get('/api/pages').get_data(as_text=True)
    assert slug not in client.get('/api/search?q=Secret').get_data(as_text=True)

    _publish(editor, page['id'])
    assert client.get(f'/api/pages/{slug}').status_code == 200
    assert client.get(f'/api/resolve/{slug}').get_json()['title'] == 'Secret Plans'
    assert slug in client.get('/api/pages').get_data(as_text=True)


def test_slugs_never_collide(login_as):
    editor = login_as('editor')
    a = _new_page(editor, 'Same Title')
    b = _new_page(editor, 'Same Title')
    assert a['slug'] != b['slug']


def test_reserved_slug_refused(login_as):
    editor = login_as('editor')
    page = _new_page(editor, 'Anything')
    assert editor.put(f"/api/admin/pages/{page['id']}", json={'slug': 'admin'}).status_code == 400


def test_contributor_cannot_publish(login_as):
    c = login_as('contributor')
    page = _new_page(c, 'My Draft')
    assert c.put(f"/api/admin/pages/{page['id']}", json={'status': 'published'}).status_code == 403


def test_contributor_cannot_edit_someone_elses_page(app, login_as):
    editor_page = _new_page(login_as('editor'), 'Editor Page')
    c = login_as('contributor')
    assert c.put(f"/api/admin/pages/{editor_page['id']}", json={'title': 'Mine now'}).status_code == 403


def test_contributor_html_is_sanitized_but_editor_html_is_trusted(app, login_as):
    from models import Page
    dirty = '<p>Hi</p><img src="x" onerror="alert(1)">'
    contributor_page = _new_page(login_as('contributor'), 'C', html=dirty)
    editor_page = _new_page(login_as('editor'), 'E', html=dirty)
    with app.app_context():
        assert 'onerror' not in Page.query.get(contributor_page['id']).content_html
        assert 'onerror' in Page.query.get(editor_page['id']).content_html


def _content_version(client):
    from email.utils import parsedate_to_datetime
    r = client.get('/api/content-version')
    assert r.status_code == 204
    value = r.headers.get('Last-Modified')
    return parsedate_to_datetime(value) if value else None


@pytest.fixture
def old_content(app):
    """Moves every fingerprinted timestamp a day back, so a change today shows."""
    from sqlalchemy import text

    from extensions import db
    with app.app_context():
        for table in ('site_config', 'profile', 'project', 'blog_post', 'page', 'docs_section'):
            db.session.execute(text(f"UPDATE {table} SET updated_at = :t"), {'t': datetime.utcnow() - timedelta(days=1)})
        db.session.commit()


def test_publishing_changes_the_content_fingerprint(client, login_as, old_content):
    editor = login_as('editor')
    page = _new_page(editor, 'Fingerprint Page')
    before = _content_version(client)
    # A draft is not on the public site, so it must not trigger a rebuild.
    assert _content_version(client) == before
    _publish(editor, page['id'])
    after = _content_version(client)
    assert after > before


def test_editing_a_draft_does_not_change_the_fingerprint(client, login_as, old_content):
    editor = login_as('editor')
    before = _content_version(client)
    page = _new_page(editor, 'Quiet Draft')
    editor.put(f"/api/admin/pages/{page['id']}", json={'content_html': '<p>Changed</p>'})
    assert _content_version(client) == before


def test_site_settings_change_the_fingerprint(client, login_as, old_content):
    before = _content_version(client)
    login_as('editor').put('/api/admin/site-config', json={'site_title': 'New Title'})
    assert _content_version(client) > before
