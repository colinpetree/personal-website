"""Blog posts and comments from the admin side (routes/admin_blog.py)."""
from datetime import datetime, timedelta

import pytest


@pytest.fixture
def blog_on(app):
    from extensions import db
    from models import SiteConfig
    with app.app_context():
        SiteConfig.query.first().blog_enabled = True
        db.session.commit()


def _post(get, post_id):
    from models import BlogPost
    return get(BlogPost, post_id)


# ---- Create and list --------------------------------------------------------

def test_create_post_is_a_draft_by_the_author(login_as, history, bans):
    c = login_as('editor')
    r = c.post('/api/admin/blog/posts', json={'title': 'My First Post'})
    assert r.status_code == 201
    post = r.get_json()
    assert post['status'] == 'draft'
    assert post['slug'] == 'my-first-post'
    assert post['author_id'] == c.admin_id
    assert history()[0] == {'area': 'Post', 'action': 'added', 'subject': 'My First Post', 'suffix': None, 'admin_id': c.admin_id}
    assert '^/api/blog' in bans and '^/api/resolve' in bans


def test_blank_title_becomes_untitled(login_as):
    post = login_as('editor').post('/api/admin/blog/posts', json={'title': '   '}).get_json()
    assert post['title'] == 'Untitled'


def test_slug_is_unique_across_posts_and_pages(login_as, make_page):
    make_page('Shared Name')
    post = login_as('editor').post('/api/admin/blog/posts', json={'title': 'Shared Name'}).get_json()
    assert post['slug'] != 'shared-name'


def test_list_promotes_scheduled_posts_that_are_due(login_as, make_post, get):
    due = make_post('Due', status='scheduled', publish_date=datetime.utcnow() - timedelta(minutes=1))
    later = make_post('Later', status='scheduled', publish_date=datetime.utcnow() + timedelta(days=1))
    posts = {p['id']: p for p in login_as('editor').get('/api/admin/blog/posts').get_json()}
    assert posts[due]['status'] == 'published'
    assert posts[later]['status'] == 'scheduled'


def test_get_unknown_post_is_404(login_as):
    assert login_as('editor').get('/api/admin/blog/posts/9999').status_code == 404


# ---- Update -------------------------------------------------------------------

def test_update_fields_and_audit(login_as, make_post, get, history):
    post_id = make_post('Draft', status='draft')
    c = login_as('editor')
    r = c.put(f'/api/admin/blog/posts/{post_id}', json={
        'title': 'Renamed', 'excerpt': 'Short', 'content_html': '<p>New</p>', 'meta_description': 'Meta',
    })
    assert r.status_code == 200
    post = _post(get, post_id)
    assert (post.title, post.excerpt, post.content_html, post.meta_description) == ('Renamed', 'Short', '<p>New</p>', 'Meta')
    assert history()[0]['action'] == 'edited'


def test_slug_collision_is_resolved_and_reported(login_as, make_post):
    make_post('Taken', slug='taken')
    post_id = make_post('Mine', slug='mine', status='draft')
    data = login_as('editor').put(f'/api/admin/blog/posts/{post_id}', json={'slug': 'taken'}).get_json()
    assert data['slug'] != 'taken' and data['slug'].startswith('taken')
    assert data['slug_collided'] is True


@pytest.mark.parametrize('slug', ['admin', 'api', 'blog'])
def test_reserved_slug_refused(login_as, make_post, slug):
    post_id = make_post('Mine', status='draft')
    assert login_as('editor').put(f'/api/admin/blog/posts/{post_id}', json={'slug': slug}).status_code == 400


@pytest.mark.parametrize('bad', [True, 'abc', 1.5, 9999])
def test_invalid_category_refused(login_as, make_post, bad):
    post_id = make_post('Mine', status='draft')
    assert login_as('editor').put(f'/api/admin/blog/posts/{post_id}', json={'category_id': bad}).status_code == 400


def test_category_set_and_cleared(login_as, make_post, make_category, get):
    post_id = make_post('Mine', status='draft')
    cat = make_category('News')
    c = login_as('editor')
    c.put(f'/api/admin/blog/posts/{post_id}', json={'category_id': cat})
    assert _post(get, post_id).category_id == cat
    c.put(f'/api/admin/blog/posts/{post_id}', json={'category_id': None})
    assert _post(get, post_id).category_id is None


def test_unknown_status_is_ignored(login_as, make_post, get):
    post_id = make_post('Mine', status='draft')
    login_as('editor').put(f'/api/admin/blog/posts/{post_id}', json={'status': 'deleted'})
    assert _post(get, post_id).status == 'draft'


@pytest.mark.parametrize('bad_date', ['not a date', '2026-13-45', 'yesterday'])
def test_invalid_publish_date_is_400(login_as, make_post, get, bad_date):
    post_id = make_post('Mine', status='draft')
    r = login_as('editor').put(f'/api/admin/blog/posts/{post_id}', json={'publish_date': bad_date})
    assert r.status_code == 400
    assert _post(get, post_id).publish_date is None


def test_schedule_with_publish_date(login_as, make_post, get):
    post_id = make_post('Mine', status='draft')
    when = (datetime.utcnow() + timedelta(days=2)).replace(microsecond=0)
    login_as('editor').put(f'/api/admin/blog/posts/{post_id}', json={'status': 'scheduled', 'publish_date': when.isoformat()})
    post = _post(get, post_id)
    assert post.status == 'scheduled' and post.publish_date == when


HEADER = ('<header class="header-full" data-background-type="image" data-header-image="a.webp" '
          'data-header-video="old.mp4"></header><p>x</p>')


def test_publishing_drops_the_inactive_header_video(login_as, make_post, get):
    post_id = make_post('Mine', status='draft', html=HEADER)
    c = login_as('editor')
    c.put(f'/api/admin/blog/posts/{post_id}', json={'content_html': HEADER})
    assert 'old.mp4' in _post(get, post_id).content_html  # draft keeps both
    c.put(f'/api/admin/blog/posts/{post_id}', json={'status': 'published'})
    html = _post(get, post_id).content_html
    assert 'old.mp4' not in html and 'a.webp' in html


def test_unpublish_bumps_the_content_fingerprint(login_as, make_post, config_updated_at, old_content):
    post_id = make_post('Live', status='published')
    before = config_updated_at()
    login_as('editor').put(f'/api/admin/blog/posts/{post_id}', json={'status': 'draft'})
    assert config_updated_at() > before


def test_draft_edit_does_not_bump_the_fingerprint(login_as, make_post, config_updated_at, old_content):
    post_id = make_post('Quiet', status='draft')
    before = config_updated_at()
    login_as('editor').put(f'/api/admin/blog/posts/{post_id}', json={'title': 'Still quiet'})
    assert config_updated_at() == before


# ---- Contributors ---------------------------------------------------------------

def test_contributor_edits_own_draft(login_as, get):
    c = login_as('contributor')
    post_id = c.post('/api/admin/blog/posts', json={'title': 'Mine'}).get_json()['id']
    assert c.put(f'/api/admin/blog/posts/{post_id}', json={'title': 'Mine 2'}).status_code == 200


def test_contributor_html_is_sanitized(login_as, get):
    c = login_as('contributor')
    post_id = c.post('/api/admin/blog/posts', json={'title': 'Mine'}).get_json()['id']
    c.put(f'/api/admin/blog/posts/{post_id}', json={'content_html': '<p>Hi</p><script>alert(1)</script>'})
    assert '<script' not in _post(get, post_id).content_html


@pytest.mark.parametrize('status', ['published', 'scheduled'])
def test_contributor_cannot_publish_or_schedule(login_as, get, status):
    c = login_as('contributor')
    post_id = c.post('/api/admin/blog/posts', json={'title': 'Mine'}).get_json()['id']
    assert c.put(f'/api/admin/blog/posts/{post_id}', json={'status': status}).status_code == 403
    assert _post(get, post_id).status == 'draft'


def test_contributor_cannot_touch_others_or_published(login_as, make_post, make_admin):
    other = make_admin('editor', email='other@test.invalid')
    others_draft = make_post('Theirs', status='draft', author_id=other)
    c = login_as('contributor')
    own_live = make_post('Own Live', status='published', author_id=c.admin_id)
    for post_id in (others_draft, own_live):
        assert c.put(f'/api/admin/blog/posts/{post_id}', json={'title': 'x'}).status_code == 403
        assert c.delete(f'/api/admin/blog/posts/{post_id}').status_code == 403


# ---- Delete ---------------------------------------------------------------------

def test_delete_post(login_as, make_post, get, history, bans):
    post_id = make_post('Gone', status='draft')
    assert login_as('editor').delete(f'/api/admin/blog/posts/{post_id}').status_code == 200
    assert _post(get, post_id) is None
    assert history()[0]['action'] == 'deleted'
    assert '^/api/blog' in bans


def test_contributor_deletes_own_draft(login_as, get):
    c = login_as('contributor')
    post_id = c.post('/api/admin/blog/posts', json={'title': 'Mine'}).get_json()['id']
    assert c.delete(f'/api/admin/blog/posts/{post_id}').status_code == 200


def test_deleting_published_bumps_fingerprint_but_draft_does_not(login_as, make_post, config_updated_at, old_content):
    c = login_as('editor')
    draft = make_post('Draft', status='draft')
    before = config_updated_at()
    c.delete(f'/api/admin/blog/posts/{draft}')
    assert config_updated_at() == before
    live = make_post('Live', status='published')
    c.delete(f'/api/admin/blog/posts/{live}')
    assert config_updated_at() > before


def test_delete_unknown_post_is_404(login_as):
    assert login_as('editor').delete('/api/admin/blog/posts/9999').status_code == 404


# ---- Comments -------------------------------------------------------------------

@pytest.mark.parametrize('role,expected', [('contributor', 403), ('editor', 200)])
def test_comment_list_needs_editor(login_as, role, expected):
    assert login_as(role).get('/api/admin/blog/comments').status_code == expected


def test_comment_list_names_each_kind_of_author(login_as, make_post, make_comment, make_user, make_admin):
    post_id = make_post('With Comments')
    user = make_user('Reader')
    staff = make_admin('editor', email='staff@test.invalid')
    make_comment(post_id, 'from a reader', user_id=user)
    make_comment(post_id, 'from staff', admin_id=staff)
    make_comment(post_id, 'from a guest', guest_name='Guest Person')
    rows = {r['content']: r for r in login_as('administrator').get('/api/admin/blog/comments').get_json()}
    assert rows['from a reader']['author_name'] == 'Reader' and rows['from a reader']['is_user'] is True
    assert rows['from staff']['is_staff'] is True and rows['from staff']['author_name'] == 'Test editor'
    assert rows['from a guest']['author_name'] == 'Guest Person'
    assert rows['from a reader']['post_title'] == 'With Comments'


def test_delete_comment_is_a_soft_delete(login_as, make_post, make_comment, get, history):
    from models import Comment
    comment_id = make_comment(make_post('P'), 'Rude words here')
    assert login_as('editor').delete(f'/api/admin/blog/comments/{comment_id}').status_code == 200
    comment = get(Comment, comment_id)
    assert comment is not None and comment.is_deleted is True
    assert history()[0]['subject'] == '"Rude words here"'


def test_staff_comment_is_attributed_to_the_account(login_as, make_post, blog_on):
    make_post('Open Post', slug='open-post')
    owner = login_as('owner', email='owner2@test.invalid')
    r = owner.post('/api/blog/open-post/comments', json={'content': 'From the owner'})
    assert r.status_code == 201
    rows = owner.get('/api/admin/blog/comments').get_json()
    mine = next(r for r in rows if r['content'] == 'From the owner')
    assert mine['is_owner_author'] is True and mine['is_staff'] is False
