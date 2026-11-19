"""Freeform Pages (routes/admin_pages.py), beyond test_content_lifecycle.py:
delete rules, slug handling and audit/cache side effects."""
import pytest


def _page(get, page_id):
    from models import Page
    return get(Page, page_id)


def test_list_and_get(login_as, make_page):
    page_id = make_page('Listed', html='<p>Hello</p>')
    c = login_as('contributor')
    assert page_id in [p['id'] for p in c.get('/api/admin/pages').get_json()]
    assert c.get(f'/api/admin/pages/{page_id}').get_json()['content_html'] == '<p>Hello</p>'
    assert c.get('/api/admin/pages/9999').status_code == 404


def test_create_is_audited_and_drops_caches(login_as, history, bans):
    login_as('editor').post('/api/admin/pages', json={'title': 'New Page'})
    assert history()[0]['area'] == 'Page' and history()[0]['action'] == 'added'
    assert bans


def test_slug_collision_flag(login_as, make_page, make_post):
    make_post('Taken', slug='taken')
    page_id = make_page('Mine', status='draft')
    data = login_as('editor').put(f'/api/admin/pages/{page_id}', json={'slug': 'Taken'}).get_json()
    assert data['slug'] != 'taken' and data['slug_collided'] is True


def test_delete_page(login_as, make_page, get, history):
    page_id = make_page('Gone', status='draft')
    assert login_as('editor').delete(f'/api/admin/pages/{page_id}').status_code == 200
    assert _page(get, page_id) is None
    assert history()[0]['action'] == 'deleted'


def test_deleting_published_bumps_fingerprint_but_draft_does_not(login_as, make_page, config_updated_at, old_content):
    c = login_as('editor')
    before = config_updated_at()
    c.delete(f"/api/admin/pages/{make_page('Draft', status='draft')}")
    assert config_updated_at() == before
    c.delete(f"/api/admin/pages/{make_page('Live')}")
    assert config_updated_at() > before


def test_contributor_deletes_only_own_drafts(login_as, make_page, make_admin):
    other = make_admin('editor', email='other@test.invalid')
    c = login_as('contributor')
    own_draft = make_page('Own Draft', status='draft', author_id=c.admin_id)
    own_live = make_page('Own Live', author_id=c.admin_id)
    others = make_page('Theirs', status='draft', author_id=other)
    assert c.delete(f'/api/admin/pages/{own_live}').status_code == 403
    assert c.delete(f'/api/admin/pages/{others}').status_code == 403
    assert c.delete(f'/api/admin/pages/{own_draft}').status_code == 200


@pytest.mark.parametrize('field,value', [('title', '   '), ('slug', '!!!')])
def test_blank_title_or_slug_falls_back(login_as, make_page, get, field, value):
    page_id = make_page('Real Title', status='draft')
    login_as('editor').put(f'/api/admin/pages/{page_id}', json={field: value})
    page = _page(get, page_id)
    assert page.title and page.slug


def test_publishing_drops_the_inactive_header_image(login_as, make_page, get):
    html = ('<header class="header-full" data-background-type="video" data-header-image="old.webp" '
            'data-header-video="v.mp4"></header>')
    page_id = make_page('Hero', status='draft', html=html)
    login_as('editor').put(f'/api/admin/pages/{page_id}', json={'status': 'published'})
    saved = _page(get, page_id).content_html
    assert 'old.webp' not in saved and 'v.mp4' in saved
