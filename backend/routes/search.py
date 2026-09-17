import math

from flask import Blueprint, current_app, jsonify, request

from models import BlogPost, SiteConfig
from routes.blog import _promote_scheduled
from text_utils import make_snippet, strip_html

search_bp = Blueprint('search', __name__)

# (section key, needs full ENABLE_AI_DEMOS gate)
_STATIC_SECTIONS = ['home', 'blog', 'projects', 'about', 'contact', 'ai_demo', 'payment']

TITLE_TOKEN_SCORE = 10
TITLE_EXACT_BONUS = 5
META_TOKEN_SCORE = 3
BODY_TOKEN_SCORE = 1
BODY_TOKEN_CAP = 5


def section_enabled(config, section):
    if section == 'contact':
        return bool(config.contact_enabled and config.mailgun_api_key and config.mailgun_domain)
    if section == 'ai_demo':
        return bool(config.ai_demo_enabled and current_app.config['ENABLE_AI_DEMOS'])
    if section == 'payment':
        return bool(config.payment_enabled and config.stripe_publishable_key)
    return bool(getattr(config, f'{section}_enabled'))


def _collect_docs():
    docs = []

    now_ordered_posts = (
        BlogPost.query
        .filter_by(status='published')
        .order_by(BlogPost.publish_date.desc().nullslast(), BlogPost.created_at.desc())
        .all()
    )
    for i, post in enumerate(now_ordered_posts):
        docs.append({
            'type': 'post',
            'title': post.title,
            'plain_body': strip_html(post.content_html),
            'plain_meta': post.meta_description or '',
            'url': f'/{post.slug}',
            'sort_key': i,
        })

    config = SiteConfig.query.first()
    if config:
        for i, section in enumerate(_STATIC_SECTIONS):
            if not section_enabled(config, section):
                continue
            title = getattr(config, f'{section}_page_name')
            slug = '' if section == 'home' else getattr(config, f'{section}_slug')
            docs.append({
                'type': 'page',
                'title': title,
                'plain_body': strip_html(getattr(config, f'{section}_text')),
                'plain_meta': getattr(config, f'{section}_meta_description') or '',
                'url': f'/{slug}' if slug else '/',
                'sort_key': i,
            })

    return docs


def _score(doc, tokens, raw_query):
    title_lower = doc['title'].lower() if doc['title'] else ''
    meta_lower = doc['plain_meta'].lower()
    body_lower = doc['plain_body'].lower()

    score = 0
    for token in tokens:
        if token in title_lower:
            score += TITLE_TOKEN_SCORE
        if token in meta_lower:
            score += META_TOKEN_SCORE
        if token in body_lower:
            score += BODY_TOKEN_SCORE * min(body_lower.count(token), BODY_TOKEN_CAP)

    if raw_query and raw_query in title_lower:
        score += TITLE_EXACT_BONUS

    return score


def _build_result(doc, tokens):
    snippet = make_snippet(doc['plain_body'], tokens) or make_snippet(doc['plain_meta'], tokens)
    return {
        'type': doc['type'],
        'title': doc['title'],
        'snippet': snippet,
        'url': doc['url'],
    }


@search_bp.route('/api/search')
def search():
    q = (request.args.get('q') or '').strip()
    page = request.args.get('page', 1, type=int)
    per_page = min(max(request.args.get('per_page', 10, type=int), 1), 50)

    tokens = list(dict.fromkeys(t for t in q.lower().split() if t))
    if not tokens:
        return jsonify({'results': [], 'query': q, 'total': 0, 'page': 1, 'pages': 1})

    _promote_scheduled()

    docs = _collect_docs()
    scored = [(doc, _score(doc, tokens, q.lower())) for doc in docs]
    scored = [pair for pair in scored if pair[1] > 0]
    scored.sort(key=lambda pair: (-pair[1], pair[0]['sort_key']))

    total = len(scored)
    pages = max(1, math.ceil(total / per_page))
    page = min(max(page, 1), pages)
    window = scored[(page - 1) * per_page: page * per_page]

    return jsonify({
        'results': [_build_result(doc, tokens) for doc, _ in window],
        'query': q,
        'total': total,
        'page': page,
        'pages': pages,
    })
