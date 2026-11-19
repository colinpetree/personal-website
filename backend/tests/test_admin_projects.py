"""Projects (routes/admin_projects.py)."""
import pytest


def _project(get, project_id):
    from models import Project
    return get(Project, project_id)


@pytest.mark.parametrize('role,expected', [('contributor', 403), ('editor', 201)])
def test_create_needs_editor(login_as, role, expected):
    assert login_as(role).post('/api/admin/projects', json={'title': 'P'}).status_code == expected


def test_any_staff_can_list_in_order(login_as, make_project):
    make_project('Second', order=2)
    make_project('First', order=1)
    titles = [p['title'] for p in login_as('contributor').get('/api/admin/projects').get_json()]
    assert titles == ['First', 'Second']


def test_create_appends_at_the_end(login_as, make_project, bans):
    make_project('Existing', order=5)
    data = login_as('editor').post('/api/admin/projects', json={
        'title': ' New ', 'description': 'D', 'url': 'https://example.com', 'visible': False,
    }).get_json()
    assert data['title'] == 'New' and data['order'] == 6 and data['visible'] is False
    assert '^/api/projects' in bans


@pytest.mark.parametrize('payload', [{}, {'title': ''}, {'title': '   '}])
def test_title_required_on_create(login_as, payload):
    assert login_as('editor').post('/api/admin/projects', json=payload).status_code == 400


def test_update(login_as, make_project, get):
    project_id = make_project('Old')
    r = login_as('editor').put(f'/api/admin/projects/{project_id}', json={'title': ' New ', 'visible': False, 'url': ''})
    assert r.status_code == 200
    project = _project(get, project_id)
    assert (project.title, project.visible, project.url) == ('New', False, None)


@pytest.mark.parametrize('title', ['', '   ', None])
def test_title_required_on_update(login_as, make_project, get, title):
    project_id = make_project('Keep Me')
    assert login_as('editor').put(f'/api/admin/projects/{project_id}', json={'title': title}).status_code == 400
    assert _project(get, project_id).title == 'Keep Me'


def test_delete_always_bumps_the_fingerprint(login_as, make_project, get, config_updated_at, old_content):
    project_id = make_project('Gone')
    before = config_updated_at()
    assert login_as('editor').delete(f'/api/admin/projects/{project_id}').status_code == 200
    assert _project(get, project_id) is None
    assert config_updated_at() > before


def test_reorder(login_as, make_project, get):
    a, b = make_project('A', order=1), make_project('B', order=2)
    assert login_as('editor').put('/api/admin/projects/reorder', json=[{'id': a, 'order': 2}, {'id': b, 'order': 1}]).status_code == 200
    assert (_project(get, a).order, _project(get, b).order) == (2, 1)


@pytest.mark.parametrize('body', [{'id': 1, 'order': 2}, 'text', [1, 2], [{'id': 'x', 'order': 1}], [{'id': 1, 'order': 'first'}]])
def test_reorder_rejects_malformed_bodies(login_as, make_project, body):
    make_project('A')
    assert login_as('editor').put('/api/admin/projects/reorder', json=body).status_code == 400


def test_unknown_project_is_404(login_as):
    c = login_as('editor')
    assert c.put('/api/admin/projects/9999', json={'title': 'X'}).status_code == 404
    assert c.delete('/api/admin/projects/9999').status_code == 404
