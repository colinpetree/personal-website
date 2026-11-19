"""The AI demo access-approval loop: a visitor asks, staff see the request,
an administrator grants access, and the visitor gets in. Only runs with
ENABLE_AI_DEMOS=true (production's setting); the demo endpoint used is the
source PDF download, which sits behind the same checks as the model calls
but never calls a model."""
import pytest

from conftest import AI_DEMOS_ENABLED

pytestmark = pytest.mark.skipif(not AI_DEMOS_ENABLED, reason='AI demo routes are only registered with ENABLE_AI_DEMOS=true')

DEMO = '/api/ai-demo/rag/source.pdf'


@pytest.fixture
def demos_on(app, mail_configured_site):
    from extensions import db
    from models import SiteConfig
    with app.app_context():
        SiteConfig.query.first().ai_demo_enabled = True
        db.session.commit()


@pytest.fixture
def visitor(app, make_user):
    """A signed-in public visitor (session as set by Google or magic-link sign-in)."""
    user_id = make_user('Curious Visitor', email='curious@test.invalid')
    c = app.test_client()
    with c.session_transaction() as s:
        s['user_id'] = user_id
    c.user_id = user_id
    return c


def test_request_review_grant_and_use(app, demos_on, visitor, login_as, sent_emails):
    assert visitor.get(DEMO).status_code == 403

    r = visitor.post('/api/ai-demo/request-access', json={'demo_key': 'rag'})
    assert r.status_code == 200
    notice = [m for m in sent_emails if m['subject'] == 'AI Demo Access Request']
    assert len(notice) == 1 and 'curious@test.invalid' in notice[0]['body']

    admin = login_as('administrator')
    requests = admin.get('/api/admin/ai-demo/access-requests').get_json()['requests']
    assert [(q['email'], q['access_granted']) for q in requests] == [('curious@test.invalid', False)]

    assert admin.put(f'/api/admin/users/{visitor.user_id}', json={'ai_demo_access': True}).status_code == 200
    response = visitor.get(DEMO)
    assert response.status_code == 200
    response.close()
    assert admin.get('/api/admin/ai-demo/access-requests').get_json()['requests'][0]['access_granted'] is True


def test_a_second_request_sends_no_second_email(demos_on, visitor, sent_emails):
    visitor.post('/api/ai-demo/request-access', json={'demo_key': 'rag'})
    visitor.post('/api/ai-demo/request-access', json={'demo_key': 'rag'})
    assert len([m for m in sent_emails if m['subject'] == 'AI Demo Access Request']) == 1


def test_revoking_access_locks_the_visitor_out(demos_on, visitor, login_as):
    admin = login_as('administrator')
    admin.put(f'/api/admin/users/{visitor.user_id}', json={'ai_demo_access': True})
    admin.put(f'/api/admin/users/{visitor.user_id}', json={'ai_demo_access': False})
    assert visitor.get(DEMO).status_code == 403


def test_staff_always_have_access(demos_on, login_as):
    response = login_as('contributor').get(DEMO)
    assert response.status_code == 200
    response.close()


@pytest.mark.parametrize('role,expected', [('editor', 403), ('administrator', 200)])
def test_request_list_needs_administrator(demos_on, login_as, role, expected):
    assert login_as(role).get('/api/admin/ai-demo/access-requests').status_code == expected


def test_turned_off_page_hides_everything(app, visitor):
    """ai_demo_enabled off (the default): the demo routes behave as if they did not exist."""
    assert visitor.get(DEMO).status_code == 404
    assert visitor.post('/api/ai-demo/request-access', json={}).status_code == 404
