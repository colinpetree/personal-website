import re

# Shared between admin_blog.py and admin_pages.py so BlogPost and Page —
# which now share the same top-level public slug namespace via the :slug
# catch-all / /api/resolve/<slug> — can never collide with each other, a
# reserved word, or a fixed SiteConfig page's slug.

_STATIC_RESERVED = {'', 'admin', 'api', 'profile', 'search'}


def get_reserved_slugs(config):
    """Reserved slugs = static app routes plus the still-fixed SiteConfig
    pages' slugs. 'about' is deliberately NOT included — About is a regular
    Page now (see the about_migrated migration in app.py), protected by
    Page.slug's own unique constraint like any other page, not a reserved
    word. Home has no slug column (always '/', covered by the empty-string
    entry above), so there's no literal "home" to reserve either."""
    if config:
        return _STATIC_RESERVED | {
            config.blog_slug, config.projects_slug,
            config.contact_slug, config.ai_demo_slug, config.payment_slug,
        }
    return _STATIC_RESERVED | {'blog', 'projects', 'contact', 'demo', 'payment'}


def slugify(text):
    text = (text or '').lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text


def unique_slug(models, base, reserved, exclude=None, fallback_suffix='post'):
    """Find a slug that doesn't collide with a reserved word or an existing
    row in any of `models` (a list of model classes, each with a `.slug`
    column and `.query`). `exclude`, if given, is (model_class, id) — the
    row being edited is allowed to keep its own slug during an update.
    """
    slug = base or 'untitled'
    if slug in reserved:
        slug = f'{slug}-{fallback_suffix}'
    counter = 1
    while True:
        conflict = False
        for model in models:
            q = model.query.filter_by(slug=slug)
            if exclude and exclude[0] is model:
                q = q.filter(model.id != exclude[1])
            if q.first():
                conflict = True
                break
        if not conflict:
            return slug
        slug = f'{base}-{counter}'
        counter += 1
