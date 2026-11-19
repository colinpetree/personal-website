"""Who can reach what. Two layers:

1. Every route under /api/admin answers 401 to an anonymous request, except
   the few that must work logged out (PUBLIC_ADMIN_ROUTES). Routes are read
   from the app itself, so a new admin route is covered the day it is added,
   and one registered without its auth decorator fails here.
2. The role hierarchy (contributor < editor < administrator < owner) holds on
   the routes where a wrong answer would hand out more access: staff
   accounts, roles, passwords, site settings.
"""
import re

import pytest

from conftest import AI_DEMOS_ENABLED, PASSWORD

# Admin-prefixed routes that must work without a login.
PUBLIC_ADMIN_ROUTES = {
    ('POST', '/api/admin/login'),
    ('POST', '/api/admin/logout'),
    ('GET', '/api/admin/me'),             # reports "not logged in"
    ('GET', '/api/admin/enter-public-site'),
    ('POST', '/api/admin/forgot-password'),
    ('POST', '/api/admin/reset-password'),
}


def _admin_routes(app):
    for rule in app.url_map.iter_rules():
        if not rule.rule.startswith('/api/admin'):
            continue
        for method in sorted(rule.methods - {'HEAD', 'OPTIONS'}):
            yield method, rule.rule


def _concrete(rule):
    return re.sub(r'<(?:\w+:)?\w+>', '1', rule)


def test_every_admin_route_requires_login(app, client):
    routes = list(_admin_routes(app))
    assert len(routes) > 50, 'route discovery found too few admin routes'
    open_routes = []
    for method, rule in routes:
        if (method, rule) in PUBLIC_ADMIN_ROUTES:
            continue
        r = client.open(_concrete(rule), method=method, json={})
        if r.status_code != 401:
            open_routes.append(f'{method} {rule} -> {r.status_code}')
    assert not open_routes, 'Admin routes reachable without logging in:\n' + '\n'.join(open_routes)


def test_public_admin_route_list_is_current(app):
    """Keeps PUBLIC_ADMIN_ROUTES from listing routes that no longer exist."""
    existing = set(_admin_routes(app))
    assert PUBLIC_ADMIN_ROUTES <= existing, PUBLIC_ADMIN_ROUTES - existing


def test_me_reports_logged_out(client):
    r = client.get('/api/admin/me')
    assert r.status_code == 200
    assert not (r.get_json() or {}).get('email')


# ---- Login ----------------------------------------------------------------

def test_login_rejects_wrong_password(client, make_admin):
    make_admin('editor')
    r = client.post('/api/admin/login', json={'email': 'editor@test.invalid', 'password': 'wrong'})
    assert r.status_code == 401
    assert client.get('/api/admin/site-config').status_code == 401


def test_login_locks_account_after_repeated_failures(client, make_admin):
    make_admin('editor')
    for _ in range(5):
        client.post('/api/admin/login', json={'email': 'editor@test.invalid', 'password': 'wrong'})
    # Locked: even the right password is refused for now.
    r = client.post('/api/admin/login', json={'email': 'editor@test.invalid', 'password': PASSWORD})
    assert r.status_code == 401


def test_deactivated_account_cannot_log_in(app, client, make_admin):
    from extensions import db
    from models import AdminAccount
    account_id = make_admin('editor')
    with app.app_context():
        db.session.get(AdminAccount, account_id).is_active = False
        db.session.commit()
    r = client.post('/api/admin/login', json={'email': 'editor@test.invalid', 'password': PASSWORD})
    assert r.status_code == 401


def test_logout_everywhere_ends_other_sessions(app, make_admin):
    make_admin('editor')
    a, b = app.test_client(), app.test_client()
    for c in (a, b):
        assert c.post('/api/admin/login', json={'email': 'editor@test.invalid', 'password': PASSWORD}).status_code == 200
    assert a.post('/api/admin/logout-everywhere').status_code == 200
    # b's cookies were issued before, so b is logged out.
    assert b.get('/api/admin/site-config').status_code == 401


# ---- Role hierarchy on sensitive routes -----------------------------------

@pytest.mark.parametrize('role,expected', [
    ('contributor', 403), ('editor', 200), ('administrator', 200), ('owner', 200),
])
def test_staff_list_needs_editor(login_as, role, expected):
    assert login_as(role).get('/api/admin/accounts').status_code == expected


@pytest.mark.parametrize('role,expected', [
    ('contributor', 403), ('editor', 403), ('administrator', 200), ('owner', 200),
])
def test_user_list_needs_administrator(login_as, role, expected):
    assert login_as(role).get('/api/admin/users').status_code == expected


@pytest.mark.parametrize('role', ['contributor', 'editor', 'administrator', 'owner'])
def test_nobody_promotes_themselves_to_owner(app, login_as, role):
    """Ownership only moves through the owner-only make-owner transfer."""
    from models import AdminAccount
    c = login_as(role)
    with app.app_context():
        own_id = AdminAccount.query.filter_by(email=f'{role}@test.invalid').one().id
        owners_before = AdminAccount.query.filter_by(role='owner').count()
    r = c.put(f'/api/admin/accounts/{own_id}', json={'role': 'owner'})
    with app.app_context():
        assert AdminAccount.query.filter_by(role='owner').count() == owners_before, f'{role} made themselves owner'
        assert AdminAccount.query.get(own_id).role == role
    if role != 'owner':
        assert r.status_code == 403


def test_administrator_cannot_make_another_account_owner(app, login_as, make_admin):
    from models import AdminAccount
    other = make_admin('editor', email='other@test.invalid')
    r = login_as('administrator').put(f'/api/admin/accounts/{other}', json={'role': 'owner'})
    assert r.status_code == 403
    with app.app_context():
        assert AdminAccount.query.get(other).role == 'editor'


@pytest.mark.parametrize('role,allowed', [
    ('contributor', set()),
    ('editor', {'contributor', 'editor'}),
])
def test_lower_roles_cannot_raise_their_own_role(app, login_as, role, allowed):
    from models import AdminAccount
    c = login_as(role)
    with app.app_context():
        own_id = AdminAccount.query.filter_by(email=f'{role}@test.invalid').one().id
    for target in ('editor', 'administrator'):
        if target in allowed or target == role:
            continue
        r = c.put(f'/api/admin/accounts/{own_id}', json={'role': target})
        assert r.status_code == 403, f'{role} set own role to {target}: {r.status_code}'
        with app.app_context():
            assert AdminAccount.query.get(own_id).role == role


def test_profile_save_with_unchanged_role_still_works(app, login_as):
    """The staff profile modal always sends the current role back."""
    from models import AdminAccount
    c = login_as('contributor')
    with app.app_context():
        own_id = AdminAccount.query.filter_by(email='contributor@test.invalid').one().id
    r = c.put(f'/api/admin/accounts/{own_id}', json={'full_name': 'New Name', 'role': 'contributor'})
    assert r.status_code == 200
    assert r.get_json()['full_name'] == 'New Name'


def test_administrator_can_still_change_other_roles(app, login_as, make_admin):
    from models import AdminAccount
    other = make_admin('contributor', email='other@test.invalid')
    r = login_as('administrator').put(f'/api/admin/accounts/{other}', json={'role': 'editor'})
    assert r.status_code == 200
    with app.app_context():
        assert AdminAccount.query.get(other).role == 'editor'


def test_editor_cannot_edit_another_account(app, login_as, make_admin):
    other = make_admin('contributor', email='other@test.invalid')
    r = login_as('editor').put(f'/api/admin/accounts/{other}', json={'full_name': 'Renamed'})
    assert r.status_code == 403


def test_editor_cannot_reset_another_password(login_as, make_admin):
    other = make_admin('contributor', email='other@test.invalid')
    r = login_as('editor').put(f'/api/admin/accounts/{other}/password', json={'new_password': 'x' * 20})
    assert r.status_code == 403


@pytest.mark.parametrize('whose', ['own', 'other'])
def test_password_changes_need_eight_characters(app, login_as, make_admin, whose):
    from models import AdminAccount
    c = login_as('administrator')
    if whose == 'own':
        with app.app_context():
            target = AdminAccount.query.filter_by(email='administrator@test.invalid').one().id
        body = {'old_password': PASSWORD, 'new_password': 'short'}
    else:
        target = make_admin('editor', email='other@test.invalid')
        body = {'new_password': 'short'}
    r = c.put(f'/api/admin/accounts/{target}/password', json=body)
    assert r.status_code == 400 and '8' in r.get_json()['error']
    body['new_password'] = 'long enough now'
    assert c.put(f'/api/admin/accounts/{target}/password', json=body).status_code == 200


def test_own_password_change_needs_current_password(app, login_as):
    from models import AdminAccount
    c = login_as('editor')
    with app.app_context():
        own_id = AdminAccount.query.filter_by(email='editor@test.invalid').one().id
    r = c.put(f'/api/admin/accounts/{own_id}/password', json={'new_password': 'y' * 20})
    assert r.status_code == 400
    r = c.put(f'/api/admin/accounts/{own_id}/password', json={'old_password': 'wrong', 'new_password': 'y' * 20})
    assert r.status_code == 400


def test_only_owner_transfers_ownership(login_as, make_admin):
    target = make_admin('administrator', email='target@test.invalid')
    assert login_as('administrator').post(f'/api/admin/accounts/{target}/make-owner').status_code == 403


def test_editor_cannot_invite_administrators(login_as):
    r = login_as('editor').post('/api/admin/accounts', json={
        'full_name': 'New', 'email': 'new@test.invalid', 'role': 'administrator', 'password': 'z' * 20,
    })
    assert r.status_code == 403


@pytest.mark.parametrize('role,expected', [
    ('contributor', 403), ('editor', 200),
])
def test_site_settings_need_editor(login_as, role, expected):
    assert login_as(role).put('/api/admin/site-config', json={'site_title': 'Changed'}).status_code == expected


# ---- AI demos (production runs with ENABLE_AI_DEMOS=true) -----------------

@pytest.mark.skipif(not AI_DEMOS_ENABLED, reason='AI demo routes are only registered with ENABLE_AI_DEMOS=true')
def test_ai_demos_need_a_signed_in_user(app, client):
    """Every endpoint that calls a paid model needs a signed-in user, so an
    anonymous visitor can never spend API credit."""
    from extensions import db
    from models import SiteConfig
    with app.app_context():
        SiteConfig.query.first().ai_demo_enabled = True
        db.session.commit()
    public = {'/api/ai-demo/access-links'}
    checked = 0
    for rule in app.url_map.iter_rules():
        if not rule.rule.startswith('/api/ai-demo/') or rule.rule in public:
            continue
        for method in rule.methods - {'HEAD', 'OPTIONS'}:
            r = client.open(_concrete(rule.rule), method=method, json={'message': 'hi'})
            assert r.status_code == 401, f'{method} {rule.rule} -> {r.status_code}'
            checked += 1
    assert checked >= 10
