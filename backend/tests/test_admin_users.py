"""Public user accounts as managed by staff (routes/admin_users.py)."""
import csv
import io
from datetime import datetime

import pytest


def _user(get, user_id):
    from models import User
    return get(User, user_id)


@pytest.mark.parametrize('role,expected', [('editor', 403), ('administrator', 200)])
def test_needs_administrator(login_as, make_user, role, expected):
    user_id = make_user('Reader')
    c = login_as(role)
    assert c.get('/api/admin/users').status_code == expected
    assert c.put(f'/api/admin/users/{user_id}', json={'can_comment': False}).status_code == expected
    assert c.get('/api/admin/users/export.csv').status_code == expected


def test_list_with_comment_counts(login_as, make_user, make_post, make_comment):
    user_id = make_user('Reader')
    post_id = make_post('P')
    make_comment(post_id, 'kept', user_id=user_id)
    make_comment(post_id, 'removed', user_id=user_id, is_deleted=True)
    data = login_as('administrator').get('/api/admin/users').get_json()
    assert data['total'] == 1
    assert data['users'][0]['comment_count'] == 1


def test_pagination(login_as, make_user):
    for i in range(5):
        make_user(f'User {i}')
    c = login_as('administrator')
    first = c.get('/api/admin/users?per_page=2&page=1').get_json()
    last = c.get('/api/admin/users?per_page=2&page=3').get_json()
    assert (len(first['users']), first['pages'], len(last['users'])) == (2, 3, 1)


@pytest.mark.parametrize('per_page', ['0', '-5', '1000', 'abc'])
def test_odd_page_sizes_do_not_break_the_list(login_as, make_user, per_page):
    make_user('Reader')
    r = login_as('administrator').get(f'/api/admin/users?per_page={per_page}')
    assert r.status_code == 200
    assert 1 <= len(r.get_json()['users']) <= 100


def test_block_and_grant_with_audit_note(login_as, make_user, get, history):
    user_id = make_user('Reader')
    r = login_as('administrator').put(f'/api/admin/users/{user_id}', json={'can_comment': False, 'ai_demo_access': True})
    assert r.status_code == 200
    user = _user(get, user_id)
    assert (user.can_comment, user.ai_demo_access) == (False, True)
    assert history()[0]['suffix'] == '(blocked from commenting, AI demo access granted)'


def test_no_change_is_not_audited(login_as, make_user, history):
    user_id = make_user('Reader')
    login_as('administrator').put(f'/api/admin/users/{user_id}', json={'can_comment': True, 'name': 'Reader'})
    assert history() == []


@pytest.mark.parametrize('field', ['name', 'email'])
def test_name_and_email_required(login_as, make_user, field):
    user_id = make_user('Reader')
    assert login_as('administrator').put(f'/api/admin/users/{user_id}', json={field: '  '}).status_code == 400


def test_duplicate_email_refused(login_as, make_user):
    make_user('Taken', email='taken@test.invalid')
    user_id = make_user('Reader')
    assert login_as('administrator').put(f'/api/admin/users/{user_id}', json={'email': 'taken@test.invalid'}).status_code == 409


def test_unknown_user_is_404(login_as):
    assert login_as('administrator').put('/api/admin/users/9999', json={'can_comment': False}).status_code == 404


def test_csv_export(login_as, make_user):
    make_user('Signed In', email='in@test.invalid', last_login_at=datetime(2026, 3, 4), title='Dr')
    make_user('Never', email='never@test.invalid', can_comment=False)
    r = login_as('administrator').get('/api/admin/users/export.csv')
    assert r.mimetype == 'text/csv'
    assert 'attachment' in r.headers['Content-Disposition']
    rows = list(csv.reader(io.StringIO(r.get_data(as_text=True))))
    assert rows[0][:3] == ['ID', 'Name', 'Email']
    by_email = {row[2]: row for row in rows[1:]}
    assert by_email['in@test.invalid'][3:5] == ['Dr', 'Verified']
    assert by_email['in@test.invalid'][9] == '2026-03-04'
    assert by_email['never@test.invalid'][4:6] == ['Unverified', 'No']


def test_csv_neutralizes_spreadsheet_formulas(login_as, make_user):
    """A name like =HYPERLINK(...) must not become a live formula when the
    export is opened in Excel or Sheets (CSV injection)."""
    make_user('=HYPERLINK("https://evil.example","click")', email='formula@test.invalid')
    body = login_as('administrator').get('/api/admin/users/export.csv').get_data(as_text=True)
    row = next(r for r in csv.reader(io.StringIO(body)) if r and r[2] == 'formula@test.invalid')
    assert not row[1].startswith(('=', '+', '-', '@'))
