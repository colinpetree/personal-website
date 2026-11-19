"""Smaller admin endpoints: internal link picker, AI demo access links,
contact submissions, payment transactions and the "enter public site"
redirect."""
import pytest

from conftest import AI_DEMOS_ENABLED

# The AI demo blueprints are only registered with ENABLE_AI_DEMOS=true.
needs_ai_demos = pytest.mark.skipif(not AI_DEMOS_ENABLED, reason='AI demo routes are only registered with ENABLE_AI_DEMOS=true')


# ---- Internal links (editor link picker) ------------------------------------

def test_internal_links(app, login_as, make_page, make_post):
    from extensions import db
    from models import SiteConfig
    with app.app_context():
        config = SiteConfig.query.first()
        config.blog_enabled, config.projects_enabled = True, False
        db.session.commit()
    make_page('Zebra Page', slug='zebra')
    make_page('Hidden Draft', slug='hidden', status='draft')
    make_post('Alpha Post', slug='alpha')
    links = login_as('contributor').get('/api/admin/internal-links').get_json()
    urls = [link['url'] for link in links]
    assert '/zebra' in urls and '/alpha' in urls and '/blog' in urls
    assert '/hidden' not in urls and '/projects' not in urls
    assert urls == sorted(urls, key=str.lower)


# ---- AI demo access links ---------------------------------------------------------

@needs_ai_demos
def test_access_link_upsert_and_delete(login_as, history):
    c = login_as('editor')
    url = '/api/admin/ai-demo/access-links/rag'
    assert c.put(url, json={'url': 'https://example.com/a', 'text': 'Ask me'}).status_code == 200
    assert c.put(url, json={'url': 'https://example.com/b', 'text': 'Ask again'}).status_code == 200
    assert [h['action'] for h in history()[:2]] == ['edited', 'added']
    assert c.get('/api/admin/ai-demo/access-links').get_json() == {'rag': {'demo_key': 'rag', 'url': 'https://example.com/b', 'text': 'Ask again'}}
    assert c.delete(url).status_code == 200
    assert c.delete(url).status_code == 200  # deleting twice is fine
    assert c.get('/api/admin/ai-demo/access-links').get_json() == {}


@needs_ai_demos
@pytest.mark.parametrize('body', [{}, {'url': 'https://x'}, {'text': 'only text'}, {'url': '  ', 'text': '  '}])
def test_access_link_needs_both_fields(login_as, body):
    assert login_as('editor').put('/api/admin/ai-demo/access-links/rag', json=body).status_code == 400


@needs_ai_demos
def test_access_links_need_editor(login_as):
    assert login_as('contributor').get('/api/admin/ai-demo/access-links').status_code == 403


# ---- Contact submissions and payment transactions ------------------------------

@pytest.fixture
def submissions(app):
    from datetime import datetime, timedelta

    from extensions import db
    from models import ContactSubmission
    with app.app_context():
        for i in range(5):
            db.session.add(ContactSubmission(name=f'N{i}', email=f'n{i}@test.invalid', subject=f'S{i}', message='m',
                                             created_at=datetime.utcnow() - timedelta(minutes=i)))
        db.session.commit()


@pytest.mark.parametrize('role,expected', [('editor', 403), ('administrator', 200)])
def test_inbox_needs_administrator(login_as, role, expected):
    c = login_as(role)
    assert c.get('/api/admin/contact/submissions').status_code == expected
    assert c.get('/api/admin/payment/transactions').status_code == expected


def test_contact_submissions_page_through_newest_first(login_as, submissions):
    c = login_as('administrator')
    first = c.get('/api/admin/contact/submissions?limit=2').get_json()
    last = c.get('/api/admin/contact/submissions?limit=2&offset=4').get_json()
    assert [s['subject'] for s in first['submissions']] == ['S0', 'S1'] and first['has_more'] is True
    assert [s['subject'] for s in last['submissions']] == ['S4'] and last['has_more'] is False


@pytest.mark.parametrize('query', ['limit=0', 'limit=-3', 'limit=abc', 'offset=-1', 'offset=abc', 'limit=100000'])
def test_contact_submissions_tolerate_odd_paging(login_as, submissions, query):
    r = login_as('administrator').get(f'/api/admin/contact/submissions?{query}')
    assert r.status_code == 200 and 1 <= len(r.get_json()['submissions']) <= 100


def test_payment_transactions_name_the_payer(login_as, make_payment, make_user):
    user_id = make_user('Known Payer', email='known@test.invalid')
    make_payment(20.0, user_id=user_id)
    make_payment(5.0, display_name='Guest Name', email='guest@test.invalid')
    make_payment(1.0)
    rows = login_as('administrator').get('/api/admin/payment/transactions').get_json()['transactions']
    names = {r['donor_name'] for r in rows}
    assert names == {'Known Payer', 'Guest Name', 'Unknown'}
    assert next(r for r in rows if r['donor_name'] == 'Known Payer')['donor_email'] == 'known@test.invalid'


# ---- Enter public site ------------------------------------------------------------

@pytest.mark.parametrize('next_url,expected', [
    ('/blog', '/blog'),
    ('//evil.example/path', '/'),
    ('/\\evil.example', '/'),
    ('https://evil.example', '/'),
    ('', '/'),
])
def test_enter_public_site_only_redirects_on_site(login_as, next_url, expected):
    r = login_as('editor').get(f'/api/admin/enter-public-site?next={next_url}')
    assert r.status_code == 302
    assert r.headers['Location'] == expected


def test_enter_public_site_signs_out_the_visitor_account(login_as, make_user):
    c = login_as('editor')
    with c.session_transaction() as s:
        s['user_id'] = make_user('Visitor')
    c.get('/api/admin/enter-public-site')
    with c.session_transaction() as s:
        assert 'user_id' not in s


def test_enter_public_site_logged_out_goes_to_login(client):
    r = client.get('/api/admin/enter-public-site')
    assert r.status_code == 302 and r.headers['Location'].endswith('/admin/login')
