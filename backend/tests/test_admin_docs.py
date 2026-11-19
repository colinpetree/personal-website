"""Docs sections (routes/admin_docs.py) and how deleting a member page
affects them (routes/admin_pages.py)."""
import pytest


def _section(c, section_id):
    return c.get(f'/api/admin/docs/{section_id}').get_json()


@pytest.mark.parametrize('role,expected', [('contributor', 403), ('editor', 201)])
def test_create_needs_editor(login_as, role, expected):
    assert login_as(role).post('/api/admin/docs', json={'name': 'Guide'}).status_code == expected


@pytest.mark.parametrize('name', ['', '   ', 'x' * 201])
def test_name_validation(login_as, name):
    assert login_as('editor').post('/api/admin/docs', json={'name': name}).status_code == 400


def test_create_list_and_get(login_as, history):
    c = login_as('editor')
    created = c.post('/api/admin/docs', json={'name': ' Guide '}).get_json()
    assert created['name'] == 'Guide' and created['items'] == []
    assert [s['name'] for s in c.get('/api/admin/docs').get_json()] == ['Guide']
    assert _section(c, created['id'])['id'] == created['id']
    assert history()[0] == {'area': 'Docs', 'action': 'added', 'subject': 'Guide', 'suffix': None, 'admin_id': c.admin_id}


def test_set_items_and_counts(login_as, make_page, make_docs_section, bans):
    live = make_page('Live Page')
    draft = make_page('Draft Page', status='draft')
    section_id = make_docs_section('Guide')
    c = login_as('editor')
    r = c.put(f'/api/admin/docs/{section_id}', json={'items': [
        {'kind': 'label', 'label': ' Start '},
        {'kind': 'page', 'page_id': live},
        {'kind': 'page', 'page_id': draft},
    ]})
    assert r.status_code == 200, r.get_json()
    data = r.get_json()
    assert [i['kind'] for i in data['items']] == ['label', 'page', 'page']
    assert data['items'][0]['label'] == 'Start'
    assert (data['page_count'], data['published_page_count']) == (2, 1)
    assert '^/api/resolve' in bans


def test_replacing_items_can_keep_the_same_page(login_as, make_page, make_docs_section):
    """Delete-then-insert of the same page must not trip DocsItem's unique page_id."""
    page = make_page('Stays')
    section_id = make_docs_section('Guide', page_ids=[page])
    c = login_as('editor')
    r = c.put(f'/api/admin/docs/{section_id}', json={'items': [{'kind': 'label', 'label': 'New'}, {'kind': 'page', 'page_id': page}]})
    assert r.status_code == 200, r.get_json()
    assert [i.get('page_id') for i in r.get_json()['items']] == [None, page]


@pytest.mark.parametrize('items,message', [
    ('not a list', 'Invalid items'),
    ([{'kind': 'label', 'label': '  '}], 'blank'),
    ([{'kind': 'label', 'label': 'x' * 301}], '300'),
    ([{'kind': 'page', 'page_id': 'abc'}], 'page selected'),
    ([{'kind': 'page', 'page_id': True}], 'page selected'),
    ([{'kind': 'page', 'page_id': 9999}], 'no longer exist'),
    ([{'kind': 'other'}], 'Invalid items'),
    (['string item'], 'Invalid items'),
])
def test_item_validation(login_as, make_docs_section, items, message):
    section_id = make_docs_section('Guide')
    r = login_as('editor').put(f'/api/admin/docs/{section_id}', json={'items': items})
    assert r.status_code == 400
    assert message in r.get_json()['error']


def test_page_appears_once_per_section(login_as, make_page, make_docs_section):
    page = make_page('Once')
    section_id = make_docs_section('Guide')
    r = login_as('editor').put(f'/api/admin/docs/{section_id}', json={'items': [{'kind': 'page', 'page_id': page}] * 2})
    assert r.status_code == 400 and 'only appear once' in r.get_json()['error']


def test_page_cannot_be_in_two_sections(login_as, make_page, make_docs_section):
    page = make_page('Claimed')
    make_docs_section('First', page_ids=[page])
    second = make_docs_section('Second')
    r = login_as('editor').put(f'/api/admin/docs/{second}', json={'items': [{'kind': 'page', 'page_id': page}]})
    assert r.status_code == 400 and 'already in the "First"' in r.get_json()['error']


def test_rename_validation(login_as, make_docs_section):
    section_id = make_docs_section('Guide')
    c = login_as('editor')
    assert c.put(f'/api/admin/docs/{section_id}', json={'name': ''}).status_code == 400
    assert c.put(f'/api/admin/docs/{section_id}', json={'name': 'x' * 201}).status_code == 400
    assert c.put(f'/api/admin/docs/{section_id}', json={'name': 'Renamed'}).get_json()['name'] == 'Renamed'


def test_any_save_reaches_the_content_fingerprint(login_as, make_docs_section, client, request):
    section_id = make_docs_section('Guide')
    request.getfixturevalue('old_content')  # after creating, so the section is old too
    before = client.get('/api/content-version').headers['Last-Modified']
    login_as('editor').put(f'/api/admin/docs/{section_id}', json={'name': 'Guide'})
    assert client.get('/api/content-version').headers['Last-Modified'] != before


def test_delete_section_keeps_pages_and_bumps_fingerprint(login_as, make_page, make_docs_section, get, config_updated_at, old_content):
    from models import DocsSection, Page
    page = make_page('Member')
    section_id = make_docs_section('Guide', page_ids=[page])
    before = config_updated_at()
    assert login_as('editor').delete(f'/api/admin/docs/{section_id}').status_code == 200
    assert get(DocsSection, section_id) is None
    assert get(Page, page) is not None
    assert config_updated_at() > before


def test_deleting_a_member_page_removes_it_from_the_section(login_as, make_page, make_docs_section, get, old_content):
    from models import DocsSection
    page = make_page('Member')
    section_id = make_docs_section('Guide', page_ids=[page])
    before = get(DocsSection, section_id).updated_at
    c = login_as('editor')
    assert c.delete(f'/api/admin/pages/{page}').status_code == 200
    assert _section(c, section_id)['items'] == []
    assert get(DocsSection, section_id).updated_at > before


def test_unknown_section_is_404(login_as):
    c = login_as('editor')
    assert c.get('/api/admin/docs/9999').status_code == 404
    assert c.put('/api/admin/docs/9999', json={'name': 'x'}).status_code == 404
    assert c.delete('/api/admin/docs/9999').status_code == 404
