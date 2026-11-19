"""The admin activity log (routes/admin_history.py)."""
from datetime import datetime, timedelta

import pytest


@pytest.fixture
def log_entry(app):
    def _add(admin_id, area='Post', action='edited', subject='A', minutes_ago=0):
        from extensions import db
        from models import SiteEventLog
        with app.app_context():
            db.session.add(SiteEventLog(
                admin_id=admin_id, admin_name='Someone', area=area, action_type=action, subject=subject,
                created_at=datetime.utcnow() - timedelta(minutes=minutes_ago),
            ))
            db.session.commit()
    return _add


@pytest.mark.parametrize('role,expected', [('contributor', 403), ('editor', 200)])
def test_needs_editor(login_as, role, expected):
    c = login_as(role)
    assert c.get('/api/admin/history').status_code == expected
    assert c.get('/api/admin/history/staff').status_code == expected


def test_real_actions_show_up(login_as):
    c = login_as('editor')
    c.post('/api/admin/blog/posts', json={'title': 'Logged Post'})
    entries = c.get('/api/admin/history').get_json()['entries']
    assert entries[0]['subject'] == 'Logged Post' and entries[0]['action_type'] == 'added'


def test_repeats_within_five_minutes_are_grouped(login_as, log_entry):
    c = login_as('editor')
    for minutes in (0, 2, 4):
        log_entry(c.admin_id, subject='Same Post', minutes_ago=minutes)
    log_entry(c.admin_id, subject='Same Post', minutes_ago=30)
    entries = c.get('/api/admin/history').get_json()['entries']
    assert [e['count'] for e in entries] == [3, 1]


def test_filters(login_as, make_admin, log_entry):
    c = login_as('editor')
    other = make_admin('editor', email='other@test.invalid')
    log_entry(c.admin_id, area='Post', action='added', subject='mine')
    log_entry(other, area='Settings', action='edited', subject='theirs')
    log_entry(other, area='Page', action='deleted', subject='gone')

    def subjects(query):
        return {e['subject'] for e in c.get(f'/api/admin/history?{query}').get_json()['entries']}

    assert subjects(f'admin_id={other}') == {'theirs', 'gone'}
    assert subjects('area=Post,Page') == {'mine', 'gone'}
    assert subjects('action=edited') == {'theirs'}
    assert subjects('area=,') == {'mine', 'theirs', 'gone'}


def test_pagination(login_as, log_entry):
    c = login_as('editor')
    for i in range(5):
        log_entry(c.admin_id, subject=f'Item {i}', minutes_ago=i)
    first = c.get('/api/admin/history?per_page=2&page=1').get_json()
    last = c.get('/api/admin/history?per_page=2&page=3').get_json()
    assert (len(first['entries']), first['has_more']) == (2, True)
    assert (len(last['entries']), last['has_more']) == (1, False)


def test_known_limit_deep_pages_are_empty(login_as, log_entry):
    """Documents a limitation, not a requirement: only the newest per_page*10
    raw entries are grouped, so pages past 10 come back empty even when older
    history exists."""
    c = login_as('editor')
    for i in range(12):
        log_entry(c.admin_id, subject=f'Item {i}', minutes_ago=i * 10)
    assert c.get('/api/admin/history?per_page=1&page=11').get_json()['entries'] == []


def test_staff_list(login_as, make_admin):
    make_admin('contributor', email='zed@test.invalid')
    staff = login_as('editor').get('/api/admin/history/staff').get_json()
    assert {s['role'] for s in staff} >= {'owner', 'editor', 'contributor'}
    names = [s['name'] for s in staff]
    assert names == sorted(names)
