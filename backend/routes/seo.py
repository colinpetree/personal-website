"""/robots.txt and /sitemap.xml, generated from the database on every
request so they always match what's currently published: a new page or post
shows up in the sitemap as soon as it's published, with no rebuild.

nginx proxies both paths here (deploy/nginx/personal-website.conf), the same
way it does /favicon.ico. Varnish doesn't cache them (not in its allowlist),
and both are a couple of cheap queries.

Note: if Cloudflare's "managed robots.txt" setting is on for the domain,
Cloudflare adds its own AI-crawler rules above this file's contents. That
combines cleanly: crawlers merge rule groups for the same user agent.
"""
from datetime import datetime
from urllib.parse import quote
from xml.sax.saxutils import escape
from flask import Blueprint, current_app, request
from models import SiteConfig, BlogPost, Page
from routes.site_config import fixed_pages_enabled

seo_bp = Blueprint('seo', __name__)

# Cloudflare and crawlers may keep a copy for this long. An hour keeps a
# newly published page from waiting long to appear.
CACHE_SECONDS = 3600


def _base_url(config):
    # The configured domain is the canonical one. Falls back to the request's
    # own host (correct scheme via ProxyFix) on a site where it isn't set yet.
    if config and config.domain:
        return f'https://{config.domain}'
    return request.url_root.rstrip('/')


def _text_response(body, mimetype):
    resp = current_app.response_class(body, mimetype=mimetype)
    resp.cache_control.public = True
    resp.cache_control.max_age = CACHE_SECONDS
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    return resp


@seo_bp.route('/robots.txt')
def robots_txt():
    config = SiteConfig.query.first()
    lines = [
        'User-agent: *',
        # Not useful in search results: the admin area, a signed-in
        # visitor's own profile, magic-link sign-in, and search result pages.
        'Disallow: /admin',
        'Disallow: /profile',
        'Disallow: /auth/',
        'Disallow: /search',
        # /api is deliberately NOT disallowed: images are served from
        # /api/uploads/, and blocking it would hide them from image search
        # and link-preview crawlers.
        '',
        f'Sitemap: {_base_url(config)}/sitemap.xml',
        '',
    ]
    return _text_response('\n'.join(lines), 'text/plain')


def _lastmod(dt):
    return dt.strftime('%Y-%m-%d') if dt else None


@seo_bp.route('/sitemap.xml')
def sitemap_xml():
    config = SiteConfig.query.first()
    base = _base_url(config)
    # (path, lastmod) pairs, in order.
    entries = [('/', None)]

    if config:
        enabled = fixed_pages_enabled(config)
        slugs = {
            'blog': config.blog_slug,
            'projects': config.projects_slug,
            'contact': config.contact_slug,
            'ai_demo': config.ai_demo_slug,
            'payment': config.payment_slug,
        }
        # Prerendered pages are served from a folder (dist/<slug>/index.html),
        # and nginx 301-redirects /<slug> to /<slug>/, so they're listed with
        # the trailing slash crawlers end up on. AI demo and payment aren't
        # prerendered and have no redirect, so they're listed without one.
        for key in ('blog', 'projects', 'contact'):
            if enabled[key]:
                entries.append((f'/{slugs[key]}/', None))
        for key in ('ai_demo', 'payment'):
            if enabled[key]:
                entries.append((f'/{slugs[key]}', None))

    # Same visibility rules as the public site (routes/public_resolve.py):
    # published pages always; posts only when published, past their publish
    # date, and the blog is enabled.
    seen = {path for path, _ in entries}
    for page in Page.query.filter_by(status='published').order_by(Page.id).all():
        path = f'/{quote(page.slug)}/'
        if path not in seen:
            seen.add(path)
            entries.append((path, _lastmod(page.updated_at)))

    if config and config.blog_enabled:
        now = datetime.utcnow()
        posts = (
            BlogPost.query
            .filter_by(status='published')
            .filter((BlogPost.publish_date == None) | (BlogPost.publish_date <= now))  # noqa: E711
            .order_by(BlogPost.publish_date.desc().nullslast(), BlogPost.created_at.desc())
            .all()
        )
        for post in posts:
            path = f'/{quote(post.slug)}/'
            if path not in seen:
                seen.add(path)
                entries.append((path, _lastmod(post.updated_at)))

    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, lastmod in entries:
        parts.append('  <url>')
        parts.append(f'    <loc>{escape(base + path)}</loc>')
        if lastmod:
            parts.append(f'    <lastmod>{lastmod}</lastmod>')
        parts.append('  </url>')
    parts.append('</urlset>')
    parts.append('')
    return _text_response('\n'.join(parts), 'application/xml')
