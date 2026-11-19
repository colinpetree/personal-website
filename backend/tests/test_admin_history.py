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


def test_deep_pages_reach_old_history(login_as, log_entry):
    """Pages past the 10th used to come back empty: only the newest
    per_page*10 raw entries were ever grouped."""
    c = login_as('editor')
    for i in range(25):
        log_entry(c.admin_id, subject=f'Item {i}', minutes_ago=i * 10)
    seen = []
    for page in range(1, 26):
        data = c.get(f'/api/admin/history?per_page=1&page={page}').get_json()
        assert len(data['entries']) == 1, f'page {page} is empty'
        seen.append(data['entries'][0]['subject'])
        assert data['has_more'] is (page < 25)
    assert seen == [f'Item {i}' for i in range(25)]
    assert c.get('/api/admin/history?per_page=1&page=26').get_json()['entries'] == []


def test_a_group_split_across_fetches_is_counted_whole(login_as, log_entry):
    """A run of repeats that straddles the boundary between two database
    fetches must still come back as one entry with the full count."""
    c = login_as('editor')
    log_entry(c.admin_id, subject='Newest', minutes_ago=0)
    for i in range(15):
        log_entry(c.admin_id, subject='Busy Post', minutes_ago=1 + i * 0.1)
    data = c.get('/api/admin/history?per_page=1&page=2').get_json()
    assert data['entries'][0]['subject'] == 'Busy Post'
    assert data['entries'][0]['count'] == 15
    assert data['has_more'] is False


def test_entry_logged_mid_request_does_not_repeat_a_row(login_as, log_entry, monkeypatch):
    """Another admin's action landing between two batch reads used to shift
    every older row down by one, so the next batch repeated a row."""
    import routes.admin_history as history_module
    c = login_as('editor')
    for i in range(15):
        log_entry(c.admin_id, subject=f'Item {i}', minutes_ago=10 + i * 10)

    real_group = history_module._group_entries
    calls = []

    def group_then_log_something(entries):
        if not calls:  # right after the first batch is read
            log_entry(c.admin_id, subject='Logged mid-request', minutes_ago=0)
        calls.append(1)
        return real_group(entries)

    monkeypatch.setattr(history_module, '_group_entries', group_then_log_something)
    # Page 10 needs 11 groups; the first batch (10 rows) has only 10, so a
    # second batch is read. Item 9 is the row the old offset read repeated,
    # which then merged with itself into a count of 2.
    data = c.get('/api/admin/history?per_page=1&page=10').get_json()
    assert len(calls) > 1, 'the request should have needed a second batch'
    assert data['entries'][0]['subject'] == 'Item 9'
    assert data['entries'][0]['count'] == 1


@pytest.mark.parametrize('query', ['page=0', 'page=-2', 'per_page=0', 'per_page=-5'])
def test_odd_paging_values(login_as, log_entry, query):
    c = login_as('editor')
    log_entry(c.admin_id, subject='Only')
    r = c.get(f'/api/admin/history?{query}')
    assert r.status_code == 200
    assert [e['subject'] for e in r.get_json()['entries']] == ['Only']


def test_staff_list(login_as, make_admin):
    make_admin('contributor', email='zed@test.invalid')
    staff = login_as('editor').get('/api/admin/history/staff').get_json()
    assert {s['role'] for s in staff} >= {'owner', 'editor', 'contributor'}
    names = [s['name'] for s in staff]
    assert names == sorted(names)
