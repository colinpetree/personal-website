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


@pytest.mark.parametrize('password,expected', [('1234567', 400), ('12345678', 201)])
def test_new_accounts_need_eight_character_passwords(login_as, password, expected):
    r = login_as('administrator').post('/api/admin/accounts', json={
        'full_name': 'N', 'email': 'n@test.invalid', 'password': password, 'role': 'contributor',
    })
    assert r.status_code == expected


def test_removed_staff_can_be_invited_again(app, login_as, make_admin, make_post, get, history):
    """Re-inviting a removed person's email switches their old account back on
    (keeping their posts and history linked) instead of failing with 409."""
    from models import AdminAccount, BlogPost
    leaving = login_as('editor', email='back@test.invalid')
    post_id = make_post('Their Post', author_id=leaving.admin_id)
    admin = login_as('administrator')
    admin.delete(f'/api/admin/accounts/{leaving.admin_id}')

    r = admin.post('/api/admin/accounts', json={
        'full_name': 'Back Again', 'email': 'back@test.invalid', 'password': 'a fresh password', 'role': 'contributor',
    })
    assert r.status_code == 201, r.get_json()
    assert r.get_json()['id'] == leaving.admin_id
    account = get(AdminAccount, leaving.admin_id)
    assert (account.is_active, account.full_name, account.role) == (True, 'Back Again', 'contributor')
    assert get(BlogPost, post_id).author_id == leaving.admin_id
    assert history()[0]['action'] == 'added'

    # The new password works, the old one doesn't, and a browser still holding
    # a sign-in from before the removal stays signed out.
    fresh = app.test_client()
    assert fresh.post('/api/admin/login', json={'email': 'back@test.invalid', 'password': PASSWORD}).status_code == 401
    assert fresh.post('/api/admin/login', json={'email': 'back@test.invalid', 'password': 'a fresh password'}).status_code == 200
    assert leaving.get('/api/admin/site-config').status_code == 401


def test_staff_can_take_over_a_removed_persons_email(app, login_as, make_admin, get):
    """Moving an active account onto a removed person's address used to fail
    with "already exists" for an account nobody could see."""
    from models import AdminAccount
    removed = make_admin('editor', email='shared@test.invalid')
    current = make_admin('editor', email='current@test.invalid')
    admin = login_as('administrator')
    admin.delete(f'/api/admin/accounts/{removed}')

    r = admin.put(f'/api/admin/accounts/{current}', json={'email': 'shared@test.invalid'})
    assert r.status_code == 200, r.get_json()
    assert get(AdminAccount, current).email == 'shared@test.invalid'
    old = get(AdminAccount, removed)
    assert old.is_active is False and old.email != 'shared@test.invalid'
    # The address now belongs to an active account, so it can't be re-invited.
    again = admin.post('/api/admin/accounts', json={'full_name': 'X', 'email': 'shared@test.invalid', 'password': 'p' * 12, 'role': 'contributor'})
    assert again.status_code == 409


def test_email_of_an_active_account_is_still_refused(login_as, make_admin):
    make_admin('editor', email='taken@test.invalid')
    target = make_admin('editor', email='mine@test.invalid')
    r = login_as('administrator').put(f'/api/admin/accounts/{target}', json={'email': 'taken@test.invalid'})
    assert r.status_code == 409


def test_reinvite_follows_the_same_role_rules(login_as):
    """An editor may only bring someone back as a Contributor."""
    target = login_as('administrator', email='was-admin@test.invalid')
    login_as('owner', email='owner2@test.invalid').delete(f'/api/admin/accounts/{target.admin_id}')
    r = login_as('editor').post('/api/admin/accounts', json={
        'full_name': 'X', 'email': 'was-admin@test.invalid', 'password': 'p' * 12, 'role': 'administrator',
    })
    assert r.status_code == 403


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
