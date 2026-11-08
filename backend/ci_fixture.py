"""Sample content for the release workflow's prerender and hydration tests
(.github/workflows/release.yml). CI only: never run this against a real
database.

Run after the frozen server's --seed-initial-data and --migrate-only, with
the same DATABASE_URL/SECRET_KEY/ENCRYPTION_KEY environment:

    python ci_fixture.py --manifest /tmp/fixture.json

It turns on the blog, projects and contact pages and adds:
  - a plain published post and a draft post (the draft must NOT be prerendered),
  - a "rich" post using the same markup the Lexical editor exports
    (image, gallery, table, emoji),
  - a published page and a draft page,
  - a docs section holding a label and a member page,
  - a visible project,
  - a primary navigation pointing at those pages.

--manifest writes the paths and titles the checks should find, so the
workflow never hard-codes them.
"""
import argparse
import json
import sys
from datetime import datetime, timedelta, timezone

# 1x1 transparent PNG. data: URLs are allowed by the site's CSP (img-src
# 'self' data: blob: https:), so the hydration test sees no failed request.
PIXEL = ('data:image/png;base64,'
         'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=')

RICH_HTML = f"""
<p>This post exercises the custom editor markup. Emoji: 🎉 🚀 ✅</p>
<figure><img src="{PIXEL}" alt="Fixture image" loading="lazy" decoding="async" width="1" height="1"><figcaption>An image</figcaption></figure>
<figure class="gallery"><div class="gallery-grid">
  <div class="gallery-row"><img src="{PIXEL}" alt="Gallery one"><img src="{PIXEL}" alt="Gallery two"></div>
  <div class="gallery-row gallery-row--single"><img src="{PIXEL}" alt="Gallery three"></div>
</div></figure>
<table><thead><tr><th>Name</th><th>Value</th></tr></thead>
<tbody><tr><td>Alpha</td><td>1</td></tr><tr><td>Beta</td><td>2</td></tr></tbody></table>
<hr>
<h2>A heading</h2><p>Closing paragraph.</p>
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True)
    args = parser.parse_args()

    from app import create_app
    from extensions import db
    from models import (AdminAccount, BlogPost, DocsItem, DocsSection, Page,
                        Profile, Project, SiteConfig)

    app = create_app()
    with app.app_context():
        config = SiteConfig.query.first()
        if config is None:
            sys.exit('ci_fixture.py: no SiteConfig row. Run server --seed-initial-data first.')
        if BlogPost.query.filter(BlogPost.slug.like('fixture-%')).first():
            sys.exit('ci_fixture.py: fixture content already exists in this database.')

        author = AdminAccount.query.first()
        author_id = author.id if author else None
        # Naive UTC, matching how the models store datetimes.
        yesterday = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)

        site_title = 'CI Fixture Site'
        config.site_title = site_title
        config.blog_enabled = True
        config.projects_enabled = True
        config.contact_enabled = True
        config.blog_slug = 'blog'
        config.projects_slug = 'projects'
        config.contact_slug = 'contact'

        profile = Profile.query.first()
        if profile:
            profile.name = site_title

        posts = [
            BlogPost(title='Fixture Published Post', slug='fixture-post',
                     content_html='<p>Plain published post body.</p>',
                     excerpt='Plain published post.', status='published',
                     publish_date=yesterday, author_id=author_id),
            BlogPost(title='Fixture Rich Post', slug='fixture-rich-post',
                     content_html=RICH_HTML, excerpt='Editor markup.',
                     status='published', publish_date=yesterday, author_id=author_id),
            BlogPost(title='Fixture Draft Post', slug='fixture-draft-post',
                     content_html='<p>Must never be prerendered.</p>',
                     status='draft', author_id=author_id),
        ]
        pages = [
            Page(title='Fixture Page', slug='fixture-page',
                 content_html='<p>A published freeform page.</p>', status='published',
                 author_id=author_id),
            Page(title='Fixture Doc Page', slug='fixture-doc-page',
                 content_html='<p>A page inside a docs section.</p>', status='published',
                 author_id=author_id),
            Page(title='Fixture Draft Page', slug='fixture-draft-page',
                 content_html='<p>Must never be prerendered.</p>', status='draft',
                 author_id=author_id),
        ]
        db.session.add_all(posts + pages)
        db.session.add(Project(title='Fixture Project', description='A visible project.',
                               url='https://example.com', order=0, visible=True))
        db.session.flush()

        section = DocsSection(name='Fixture Docs')
        db.session.add(section)
        db.session.flush()
        db.session.add_all([
            DocsItem(section_id=section.id, kind='label', label='Getting started', order=0),
            DocsItem(section_id=section.id, kind='page', page_id=pages[1].id, order=1),
        ])

        # Internal links only, so the hydration test can click one and check
        # the route changes without a full page load.
        config.primary_navigation = json.dumps([
            {'label': 'Blog', 'url': '/blog'},
            {'label': 'Projects', 'url': '/projects'},
            {'label': 'Fixture Page', 'url': '/fixture-page'},
            {'label': 'Contact', 'url': '/contact'},
        ])
        db.session.commit()

    manifest = {
        'site_title': site_title,
        # Paths the prerender must produce, each with text its HTML must contain.
        'expect': [
            {'path': '/', 'text': site_title},
            {'path': '/blog', 'text': 'Fixture Published Post'},
            {'path': '/projects', 'text': 'Fixture Project'},
            {'path': '/contact', 'text': site_title},
            {'path': '/fixture-post', 'text': 'Fixture Published Post'},
            {'path': '/fixture-rich-post', 'text': 'Fixture Rich Post'},
            {'path': '/fixture-page', 'text': 'A published freeform page.'},
            {'path': '/fixture-doc-page', 'text': 'A page inside a docs section.'},
        ],
        # Paths that must NOT be prerendered.
        'absent': ['/fixture-draft-post', '/fixture-draft-page'],
        # Internal nav link the hydration test clicks, and where it should land.
        'nav_click': {'from': '/', 'label': 'Blog', 'to': '/blog'},
    }
    with open(args.manifest, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print(f'ci_fixture.py: fixture content created; manifest written to {args.manifest}')


if __name__ == '__main__':
    main()
