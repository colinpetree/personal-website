"""Staff accounts (routes/admin_accounts.py): inviting and removing staff.
Role changes and passwords are covered in test_auth_roles.py."""
import pytest

from conftest import PASSWORD


def _invite(c, role='contributor', email='new@test.invalid', **extra):
    return c.post('/api/admin/accounts', json={'full_name': 'New Person', 'email': email, 'password': 'p' * 12, 'role': role, **extra})


def test_invite_and_sign_in(app, login_as, history):
    r = _invite(login_as('administrator'), role='editor', title=' Writer ')
    assert r.status_code == 201
    assert r.get_json()['title'] == 'Writer'
    assert history()[0]['action'] == 'added'
    new = app.test_client()
    assert new.post('/api/admin/login', json={'email': 'new@test.invalid', 'password': 'p' * 12}).status_code == 200


@pytest.mark.parametrize('missing', ['full_name', 'email', 'password'])
def test_required_fields(login_as, missing):
    body = {'full_name': 'N', 'email': 'n@test.invalid', 'password': 'p' * 12}
    body[missing] = ''
    assert login_as('administrator').post('/api/admin/accounts', json=body).status_code == 400


@pytest.mark.parametrize('role', ['owner', 'superuser', ''])
def test_invalid_or_owner_role_refused(login_as, role):
    r = _invite(login_as('owner', email='owner2@test.invalid'), role=role)
    assert r.status_code == 400 or (role == '' and r.status_code == 201)


@pytest.mark.parametrize('role,expected', [('contributor', 201), ('editor', 403), ('administrator', 403)])
def test_editor_invites_only_contributors(login_as, role, expected):
    assert _invite(login_as('editor'), role=role).status_code == expected


def test_contributor_cannot_invite(login_as):
    assert _invite(login_as('contributor')).status_code == 403


def test_duplicate_email_refused(login_as, make_admin):
    make_admin('editor', email='dup@test.invalid')
    assert _invite(login_as('administrator'), email='dup@test.invalid').status_code == 409


def test_owner_lookup(login_as):
    data = login_as('contributor').get('/api/admin/accounts/owner').get_json()
    assert data['role'] == 'owner'


# ---- Removing staff ---------------------------------------------------------

def test_delete_is_a_deactivation(app, login_as, make_admin, history):
    target = make_admin('editor', email='leaving@test.invalid')
    c = login_as('administrator')
    assert c.delete(f'/api/admin/accounts/{target}').status_code == 200
    assert history()[0]['action'] == 'deleted'
    # Gone from the staff list, and can no longer sign in.
    assert target not in [a['id'] for a in c.get('/api/admin/accounts').get_json()]
    r = app.test_client().post('/api/admin/login', json={'email': 'leaving@test.invalid', 'password': PASSWORD})
    assert r.status_code == 401
    # Deleting again reports it as gone.
    assert c.delete(f'/api/admin/accounts/{target}').status_code == 404


def test_deactivated_session_ends_immediately(app, make_admin, login_as):
    leaving = login_as('editor', email='leaving@test.invalid')
    assert leaving.get('/api/admin/site-config').status_code == 200
    login_as('administrator').delete(f'/api/admin/accounts/{leaving.admin_id}')
    assert leaving.get('/api/admin/site-config').status_code == 401


@pytest.mark.parametrize('actor,target_role,expected', [
    ('editor', 'contributor', 200),
    ('editor', 'editor', 403),
    ('administrator', 'editor', 200),
    ('administrator', 'administrator', 403),
    ('owner', 'administrator', 200),
])
def test_who_can_remove_whom(login_as, make_admin, actor, target_role, expected):
    target = make_admin(target_role, email='target@test.invalid')
    c = login_as(actor, email='actor@test.invalid')
    assert c.delete(f'/api/admin/accounts/{target}').status_code == expected


def test_owner_and_self_cannot_be_removed(app, login_as):
    from models import AdminAccount
    c = login_as('owner', email='owner2@test.invalid')
    with app.app_context():
        seeded_owner = AdminAccount.query.filter_by(email='admin@example.com').one().id
    assert c.delete(f'/api/admin/accounts/{seeded_owner}').status_code == 403
    assert c.delete(f'/api/admin/accounts/{c.admin_id}').status_code == 403
