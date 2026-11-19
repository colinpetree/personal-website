"""Blog categories (routes/admin_blog_categories.py)."""
import pytest


def _category(get, cat_id):
    from models import BlogCategory
    return get(BlogCategory, cat_id)


@pytest.mark.parametrize('role,expected', [('contributor', 403), ('editor', 201)])
def test_create_needs_editor(login_as, role, expected):
    assert login_as(role).post('/api/admin/blog/categories', json={'name': 'News'}).status_code == expected


def test_any_staff_can_list(login_as, make_category, make_post):
    cat = make_category('News')
    make_post('In News', category_id=cat)
    rows = login_as('contributor').get('/api/admin/blog/categories').get_json()
    assert rows[0]['name'] == 'News' and rows[0]['post_count'] == 1


def test_create_appends_and_slugifies(login_as, make_category, history, bans):
    make_category('First', order=3)
    data = login_as('editor').post('/api/admin/blog/categories', json={'name': ' Tips & Tricks '}).get_json()
    assert data['name'] == 'Tips & Tricks'
    assert data['slug'] == 'tips-tricks'
    assert data['order'] == 4
    assert history()[0]['action'] == 'added'
    assert '^/api/blog' in bans


@pytest.mark.parametrize('payload', [{}, {'name': ''}, {'name': '   '}])
def test_name_required(login_as, payload):
    assert login_as('editor').post('/api/admin/blog/categories', json=payload).status_code == 400


def test_duplicate_name_refused(login_as, make_category):
    make_category('News')
    assert login_as('editor').post('/api/admin/blog/categories', json={'name': 'News'}).status_code == 400


def test_slug_stays_unique(login_as, make_category):
    make_category('News')  # slug "news"
    data = login_as('editor').post('/api/admin/blog/categories', json={'name': 'News!'}).get_json()
    assert data['slug'] == 'news-1'


def test_rename(login_as, make_category, get):
    cat = make_category('Old')
    r = login_as('editor').put(f'/api/admin/blog/categories/{cat}', json={'name': 'New Name'})
    assert r.status_code == 200
    assert _category(get, cat).slug == 'new-name'


def test_rename_to_existing_name_refused(login_as, make_category):
    make_category('Taken')
    cat = make_category('Mine')
    assert login_as('editor').put(f'/api/admin/blog/categories/{cat}', json={'name': 'Taken'}).status_code == 400


def test_rename_keeping_own_name_is_fine(login_as, make_category, get):
    cat = make_category('Same')
    assert login_as('editor').put(f'/api/admin/blog/categories/{cat}', json={'name': 'Same'}).status_code == 200
    assert _category(get, cat).slug == 'same'


def test_reorder(login_as, make_category, get):
    a, b = make_category('A', order=1), make_category('B', order=2)
    r = login_as('editor').put('/api/admin/blog/categories/reorder', json=[{'id': a, 'order': 2}, {'id': b, 'order': 1}, {'id': 9999, 'order': 0}])
    assert r.status_code == 200
    assert (_category(get, a).order, _category(get, b).order) == (2, 1)


@pytest.mark.parametrize('body', [{'id': 1, 'order': 2}, 'text', [1, 2], [{'id': 'x', 'order': 1}], [{'id': 1, 'order': 'first'}]])
def test_reorder_rejects_malformed_bodies(login_as, make_category, body):
    make_category('A')
    assert login_as('editor').put('/api/admin/blog/categories/reorder', json=body).status_code == 400


def test_delete_detaches_posts_without_touching_their_edit_date(login_as, make_category, make_post, get):
    from models import BlogPost
    cat = make_category('Gone')
    post_id = make_post('Was In It', status='draft', category_id=cat)
    edited_before = get(BlogPost, post_id).updated_at
    assert login_as('editor').delete(f'/api/admin/blog/categories/{cat}').status_code == 200
    post = get(BlogPost, post_id)
    assert post.category_id is None
    assert post.updated_at == edited_before
    assert _category(get, cat) is None


def test_delete_bumps_fingerprint_only_if_a_published_post_used_it(login_as, make_category, make_post, config_updated_at, old_content):
    c = login_as('editor')
    drafts_only = make_category('Drafts Only')
    make_post('Draft', status='draft', category_id=drafts_only)
    before = config_updated_at()
    c.delete(f'/api/admin/blog/categories/{drafts_only}')
    assert config_updated_at() == before
    live = make_category('Live')
    make_post('Live Post', status='published', category_id=live)
    c.delete(f'/api/admin/blog/categories/{live}')
    assert config_updated_at() > before


def test_unknown_category_is_404(login_as):
    c = login_as('editor')
    assert c.put('/api/admin/blog/categories/9999', json={'name': 'X'}).status_code == 404
    assert c.delete('/api/admin/blog/categories/9999').status_code == 404
