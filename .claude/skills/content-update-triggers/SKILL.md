---
name: content-update-triggers
description: Inventory of every admin action that bumps updated_at on SiteConfig, Profile, Project, a published BlogPost, a published Page, or a DocsSection, the six tables /api/content-version fingerprints to decide whether to rebuild the prerendered pages (production's content-dispatch.sh and the dist repo's build-instance.yml) (see the auto-publish-system skill for how that pipeline works end to end). Invoke whenever adding or modifying an admin route/model that writes to one of these six tables, when asked "does X trigger a rebuild", or when reviewing whether a new admin feature/page needs to be added to this list.
---

# What triggers a content-version change (and therefore a prerender rebuild)

`GET /api/content-version` (`backend/routes/site_config.py`) returns a
`Last-Modified` header equal to:

```python
max(
    SiteConfig.updated_at,
    Profile.updated_at,
    Project.updated_at,
    BlogPost.updated_at,        # WHERE status == 'published' only
    Page.updated_at,            # WHERE status == 'published' only
    DocsSection.updated_at,
)
```

All six columns are `db.Column(..., onupdate=datetime.utcnow)` (`backend/models.py`)
- any ORM-level write to a row in one of these tables bumps its `updated_at`
automatically, with no explicit code needed at the call site. Production's
`content-dispatch.sh` (a 5-minute timer) reads this header from the local app
and, about 7 minutes after it last changed, asks the private dist repo to
rebuild; the dist repo's `build-instance.yml` reads it again (through the
public site) and compares it with the `content-fingerprint:` line in its latest
release's notes to decide whether a content release is needed. A rebuild takes
about a minute on GitHub Actions. See the `auto-publish-system` skill for that
pipeline itself - this skill is just the
"what actually flips the fingerprint" reference, kept current as new admin
features land.

**This list needs to be reviewed whenever a new admin-editable model or route
is added.** If a new feature writes to one of the tables above, it
already triggers a rebuild automatically (no wiring needed) - just add it to
the relevant section below. If a new feature introduces a **new** table that
should also affect public prerendered content, it needs to be added to the
`candidates` list in `get_content_version()` itself, with a status/visibility
filter if the model has a draft/hidden concept (see BlogPost's `status`
filter and Project's *missing* `visible` filter below for the two ends of
that spectrum).

## SiteConfig - triggers on every save, no exceptions

- `PUT /api/admin/site-config` (`admin_config.py:122-199`) - the single
  Settings-page save handler for all sections (site title, per-page
  text/meta fields, nav order, favicon, SMTP/Mailgun, Stripe, timezone,
  domain, `users_enabled`, `blog_comments_enabled`, etc.). One row, one
  commit - **any field changing bumps `updated_at`, including fields that
  render on no public page** (Mailgun/Stripe secrets, `forward_email`,
  `domain`). There's no way to save "just" an operational setting without
  also triggering a rebuild.

## BlogPost - only matters while `status == 'published'`

- `PUT /api/admin/blog/posts/<id>` (`admin_blog.py:130-180`) - the post
  editor's save handler. Line 176 sets `post.updated_at = datetime.utcnow()`
  **unconditionally**, even if the request body changed nothing. Covers
  title/slug/content/excerpt/meta/thumbnail/category edits, and status
  transitions (draft ↔ scheduled ↔ published) since those go through the
  same `if 'status' in data` branch.
- `DELETE /api/admin/blog/posts/<id>` (`admin_blog.py:183-191`) - deleting a
  currently-published post changes the fingerprint's candidate set (the row
  disappears from the `MAX()`), no explicit `updated_at` write needed.
- **Non-obvious - scheduled→published promotion happens on GET, not just a
  save button.** `_promote_scheduled()` (`admin_blog.py:86-92`) runs at the
  top of `list_posts` and `get_post` (both plain `GET` routes) and
  bulk-promotes any due `scheduled` post via `BlogPost.query.filter(...).update(...)`.
  Just an admin *loading* the blog list or a post editor can flip a
  scheduled post live and bump its `updated_at` - no explicit publish click.
- **Non-obvious cascade - deleting a blog category touches every post that
  used it.** `DELETE /api/admin/blog/categories/<id>` (`admin_blog_categories.py:128-137`)
  bulk-clears `category_id` on every referencing `BlogPost` via
  `Query.update(...)`, including published ones. That update sets
  `updated_at` to itself so the posts keep their last-edited date (the admin
  lists' "Recently edited" sort), so it does **not** bump the posts. Instead,
  if any published post used the category, the route bumps
  `SiteConfig.updated_at` to force the rebuild.
- **Not a trigger:** creating a post starts as `status='draft'`, excluded
  from the fingerprint until published.
- **Not a trigger:** comments. Posting (`blog.py:248/260`), approving, or
  soft-deleting (`admin_blog.py:220-229`, sets `comment.is_deleted = True`)
  a comment never touches the parent `BlogPost` row at all - `Comment` isn't
  one of the four fingerprinted tables, and nothing in the comment code path
  writes back to `post`.

> The two bullets marked "non-obvious" both go through SQLAlchemy's bulk
> `Query.update()` rather than a normal per-instance `setattr`+commit. Bulk
> updates do honor the column's Python-side `onupdate` default for any column
> left out of the values dict (verified against SQLAlchemy 2.1.8 on
> 2026-11-11), and naming the column with itself (`'updated_at':
> BlogPost.updated_at`) suppresses it.

## Project - triggers on every write, and unlike BlogPost has no visibility filter

- `POST /api/admin/projects` (`admin_projects.py:29-50`) - create.
- `PUT /api/admin/projects/<id>` (`admin_projects.py:53-70`) - edit
  (title/description/url/image/order/visible), normal `setattr`+commit.
- `PUT /api/admin/projects/reorder` (`admin_projects.py:83-94`) - drag-reorder,
  loops and sets `.order` per item, single commit at the end. Bumps
  `updated_at` on every reordered row.
- `DELETE /api/admin/projects/<id>` (`admin_projects.py:73-80`) - same as
  BlogPost delete, removes the row from the `MAX()` candidate set.
- **Non-obvious - no `visible` filter in the fingerprint query.**
  `db.session.query(func.max(Project.updated_at)).scalar()`
  (`site_config.py:141`) considers **all** rows regardless of `visible`.
  Toggling a *hidden* project's visibility, or reordering a list that
  includes hidden projects, still triggers a full rebuild even though
  nothing publicly visible changed. If this is ever made consistent with
  `BlogPost`'s `status='published'` filter, update this note.

## Page - only matters while `status == 'published'`, same shape as BlogPost

- `PUT /api/admin/pages/<id>` (`admin_pages.py`) - the page editor's save
  handler. Sets `page.updated_at = datetime.utcnow()` unconditionally, same
  as `update_post`. Covers title/slug/content/meta/font/width edits and
  draft↔published transitions.
- `DELETE /api/admin/pages/<id>` (`admin_pages.py`) - deleting a currently-
  published page removes the row from the `MAX()` candidate set.
- **Critical - unpublish/delete must bump `SiteConfig.updated_at`, or the
  fingerprint can silently fail to move.** `get_content_version()` combines
  candidates with a plain `max()` across all tables, not a hash of each
  table's own max - so if the just-unpublished/deleted page's `updated_at`
  wasn't the single largest timestamp across every fingerprinted table (some
  other still-published post/page, or `SiteConfig` itself, already had an
  equal-or-later one), removing it from the `Page` filter doesn't change the
  overall `max()` at all, and the rebuild pipeline sees no change -
  leaving the now-unpublished page's stale prerendered HTML live in
  production indefinitely. `update_page`/`delete_page` both explicitly bump
  `SiteConfig.updated_at` on exactly this transition, mirroring
  `update_post`/`delete_post`'s identical trick - see those two functions'
  in-code comments for the full reasoning. This is the same mechanism, not a
  new one; if this bullet and `update_post`'s ever diverge, one of them is
  wrong.
- **Not a trigger:** creating a page starts as `status='draft'`, excluded
  from the fingerprint until published.
- **One-time migration note:** the About→Page migration in `app.py`'s
  `_seed_pages_and_nav()` creates a `Page` row directly (bypassing the admin
  route) on the first startup after this feature was deployed - that insert
  also bumps `Page.updated_at` (column default), so upgrading to this
  feature itself triggers one rebuild, which is expected (the newly-migrated
  About page needs to actually get prerendered).

## DocsSection: triggers on every section save or delete

The docs sidebar (section name, labels, page titles/slugs, order) and the
next/previous links are part of each member page's `/api/resolve` payload,
so they are baked into that page's prerendered HTML (`public_resolve.py`'s
`_docs_dict`). See `backend/routes/admin_docs.py`.

- `POST /api/admin/docs`: create. Inserts a row, so it moves the
  fingerprint even though a new empty section changes no public page (one
  harmless extra rebuild).
- `PUT /api/admin/docs/<id>`: rename and/or replace the item list. Sets
  `section.updated_at` unconditionally, even when only draft pages changed
  (no visible change, harmless rebuild).
- `DELETE /api/admin/docs/<id>`: removes the row from the `MAX()`, so it
  explicitly bumps `SiteConfig.updated_at`, the same trick as `delete_page`.
- **Page-side changes are already covered by the Page section above:**
  publishing a draft that is in a section bumps its `Page.updated_at`;
  unpublishing or deleting a published page bumps `SiteConfig`. Renaming or
  re-slugging a published member page bumps `Page.updated_at`, which
  rebuilds every sibling page's sidebar too (full-site rebuild).
- `DELETE /api/admin/pages/<id>` on a page in a section also deletes its
  `DocsItem` and bumps that section's `updated_at`.

## Profile - currently dead weight in the fingerprint

No admin route in this codebase writes to `Profile` at all (only
`GET /api/profile` exists, plus the one-time `seed.py` write).
`Profile.updated_at` is effectively static after seeding - it can never
change the fingerprint via any admin action today. If an admin-editable
profile feature is ever added, it needs an entry here.

## Fragile, currently inert - worth knowing about

`POST /api/admin/contact/test-email` (`admin_config.py:293-312`) decrypts
`config.mailgun_api_key` into the in-memory `SiteConfig` ORM instance
(`config.mailgun_api_key = decrypt(...)`) but **never calls
`db.session.commit()`** - so today this does not persist and does not bump
`updated_at`. Flagged here only because it's fragile: if a future edit to
this handler (or something else touching `config` later in the same
request) ever adds a commit downstream, this line would silently write the
**decrypted** key back into the database.

## Verifying a new trigger (or a bulk-update one you're unsure about)

Use the local test-client pattern from the `auto-publish-system` skill's
"Testing locally" section - it exercises real route code and real
SQLAlchemy `onupdate` behavior, not mocks:

```bash
cd backend
FERNET_KEY=$(.venv/Scripts/python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
DATABASE_URL="sqlite:////tmp/test.db" SECRET_KEY=test ENCRYPTION_KEY="$FERNET_KEY" \
  .venv/Scripts/python.exe -c "
from app import create_app, _migrate_schema, _seed_pages_and_nav
from extensions import db
from server import seed_initial_data
app = create_app()
with app.app_context():
    db.create_all(); _migrate_schema(); seed_initial_data(app); _seed_pages_and_nav()
    client = app.test_client()
    before = client.head('/api/content-version').headers.get('Last-Modified')
    # ... perform the action under test directly against the DB/route here ...
    after = client.head('/api/content-version').headers.get('Last-Modified')
    print('changed:', before != after, before, '->', after)
"
```
