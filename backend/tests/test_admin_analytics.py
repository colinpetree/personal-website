"""Admin analytics (routes/admin_analytics.py).

Data is seeded at 12:00 UTC on whole days with timezone UTC, so day
boundaries never decide a result. analytics_start_date is set 40 days back:
without it the range starts today, and anything seeded earlier would be
silently left out.
"""
from datetime import datetime, time, timedelta

import pytest

def _today():
    # The site is set to UTC, so "today" is the UTC date, not this machine's.
    return datetime.utcnow().date()


ENDPOINTS = ['overview', 'blog', 'detail?type=page&key=home', 'payments']


def _noon(days_ago):
    return datetime.combine(_today() - timedelta(days=days_ago), time(12))


@pytest.fixture
def analytics_site(app):
    from extensions import db
    from models import SiteConfig
    with app.app_context():
        config = SiteConfig.query.first()
        config.timezone = 'Etc/UTC'
        config.analytics_start_date = _today() - timedelta(days=40)
        config.blog_enabled = True
        db.session.commit()


@pytest.fixture
def admin(login_as):
    return login_as('administrator')


@pytest.mark.parametrize('endpoint', ENDPOINTS)
@pytest.mark.parametrize('range_', ['7d', '30d', '3mo', '6mo', '1yr', 'all'])
def test_every_range_answers(admin, analytics_site, endpoint, range_):
    sep = '&' if '?' in endpoint else '?'
    assert admin.get(f'/api/admin/analytics/{endpoint}{sep}range={range_}').status_code == 200


@pytest.mark.parametrize('endpoint', ENDPOINTS)
def test_invalid_range_is_400(admin, endpoint):
    sep = '&' if '?' in endpoint else '?'
    assert admin.get(f'/api/admin/analytics/{endpoint}{sep}range=forever').status_code == 400


@pytest.mark.parametrize('role,overview,payments', [('contributor', 403, 403), ('editor', 200, 403), ('administrator', 200, 200)])
def test_roles(login_as, role, overview, payments):
    c = login_as(role)
    assert c.get('/api/admin/analytics/overview').status_code == overview
    assert c.get('/api/admin/analytics/payments').status_code == payments


def _day(series, days_ago):
    target = (_today() - timedelta(days=days_ago)).isoformat()
    return next(point for point in series if point['date'] == target)


def test_overview_counts_views_per_day_and_visitor(admin, analytics_site, make_page_view):
    make_page_view('page', 'home', _noon(2), visitor_key='a')
    make_page_view('page', 'home', _noon(2), visitor_key='a')
    make_page_view('page', 'home', _noon(2), visitor_key='b')
    make_page_view('page', 'home', _noon(50), visitor_key='old')  # before analytics_start_date
    data = admin.get('/api/admin/analytics/overview?range=30d').get_json()
    assert _day(data['series'], 2) == {'date': _day(data['series'], 2)['date'], 'views': 3, 'unique_visitors': 2}
    home = next(p for p in data['pages'] if p.get('key') == 'home')
    assert (home['views'], home['unique_visitors']) == (3, 2)


def test_range_cuts_off_older_views(admin, analytics_site, make_page_view):
    make_page_view('page', 'home', _noon(10))
    assert admin.get('/api/admin/analytics/overview?range=7d').get_json()['series'][0]['date'] >= (_today() - timedelta(days=6)).isoformat()
    home7 = next(p for p in admin.get('/api/admin/analytics/overview?range=7d').get_json()['pages'] if p.get('key') == 'home')
    home30 = next(p for p in admin.get('/api/admin/analytics/overview?range=30d').get_json()['pages'] if p.get('key') == 'home')
    assert (home7['views'], home30['views']) == (0, 1)


def test_series_covers_every_day_in_range(admin, analytics_site):
    series = admin.get('/api/admin/analytics/overview?range=7d').get_json()['series']
    assert len(series) == 7
    assert series[-1]['date'] == _today().isoformat()


def test_blog_post_stats(admin, analytics_site, make_post, make_page_view, make_comment):
    post_id = make_post('Popular', slug='popular')
    make_page_view('blog_post', 'popular', _noon(1), visitor_key='a')
    make_page_view('blog_post', 'popular', _noon(1), visitor_key='b')
    make_comment(post_id, 'nice')
    posts = admin.get('/api/admin/analytics/blog?range=7d').get_json()['posts']
    stats = next(p for p in posts if p['id'] == post_id)
    assert (stats['views'], stats['unique_visitors'], stats['comments']) == (2, 2, 1)


def test_detail_for_a_post_and_a_page(admin, analytics_site, make_post, make_page, make_page_view):
    post_id = make_post('Detailed', slug='detailed')
    page_id = make_page('About Us', slug='about-us')
    make_page_view('blog_post', 'detailed', _noon(1))
    make_page_view('custom_page', 'about-us', _noon(1))
    post = admin.get(f'/api/admin/analytics/detail?type=post&key={post_id}&range=7d').get_json()
    page = admin.get(f'/api/admin/analytics/detail?type=custom_page&key={page_id}&range=7d').get_json()
    assert (post['label'], post['views']) == ('Detailed', 1)
    assert (page['label'], page['views']) == ('About Us', 1)


@pytest.mark.parametrize('query,expected', [
    ('type=page&key=nonsense', 404),
    ('type=post&key=abc', 400),
    ('type=post&key=9999', 404),
    ('type=custom_page&key=abc', 400),
    ('type=custom_page&key=9999', 404),
    ('type=bogus&key=1', 400),
])
def test_detail_errors(admin, query, expected):
    assert admin.get(f'/api/admin/analytics/detail?{query}').status_code == expected


def test_payment_totals(admin, analytics_site, make_payment):
    make_payment(10.0, created_at=_noon(1))
    make_payment(5.5, created_at=_noon(1))
    make_payment(100.0, created_at=_noon(60))  # outside the range, inside all-time
    data = admin.get('/api/admin/analytics/payments?range=7d').get_json()
    assert (data['total_amount'], data['total_count']) == (15.5, 2)
    assert data['all_time_total'] == 115.5
    day = _day(data['series'], 1)
    assert (day['amount'], day['count']) == (15.5, 2)
