from collections import defaultdict
from datetime import datetime, time, timedelta
from flask import Blueprint, current_app, jsonify, request
from extensions import db
from models import BlogPost, Comment, PageView, ShareEvent, SiteConfig
from routes.admin_auth import role_at_least
from routes.analytics_tracking import KNOWN_PAGE_KEYS
from analytics_utils import local_date, local_today

admin_analytics_bp = Blueprint('admin_analytics', __name__)

RANGE_DAYS = {'7d': 7, '30d': 30, '3mo': 90, '6mo': 182, '1yr': 365}

# key -> (enabled column, display-name column) on SiteConfig
PAGE_CONFIG_FIELDS = {
    'home': ('home_enabled', 'home_page_name'),
    'about': ('about_enabled', 'about_page_name'),
    'projects': ('projects_enabled', 'projects_page_name'),
    'contact': ('contact_enabled', 'contact_page_name'),
    'ai_demo': ('ai_demo_enabled', 'ai_demo_page_name'),
    'payment': ('payment_enabled', 'payment_page_name'),
}


def _date_range(range_param, config):
    today = local_today(config)
    days = RANGE_DAYS.get(range_param)
    start = today - timedelta(days=days - 1) if days else None  # None => 'all'
    floor = config.analytics_start_date if (config and config.analytics_start_date) else today
    start = max(start, floor) if start else floor
    return start, today


def _bucket_page_views(page_type, page_key, start, end, config):
    """Zero-fillable per-day {views, unique_visitors} for a single page_key,
    bucketed into the site's configured timezone rather than naive UTC. Used
    by the detail endpoint, which only ever needs one entity — the overview
    endpoint uses _bucket_all_page_views below instead, to avoid one query
    per page/post."""
    q = PageView.query
    if page_type is not None:
        q = q.filter(PageView.page_type == page_type)
    if page_key is not None:
        q = q.filter(PageView.page_key == page_key)
    # Pad the UTC query bounds by a day on each side so no row that could
    # localize into [start, end] under any timezone offset is missed by the
    # initial DB-level filter — the per-row local_date() check below then
    # does the exact bucketing.
    utc_start = datetime.combine(start - timedelta(days=1), time.min)
    utc_end = datetime.combine(end + timedelta(days=1), time.max)
    q = q.filter(PageView.created_at >= utc_start, PageView.created_at <= utc_end)

    daily_views = defaultdict(int)
    daily_visitors = defaultdict(set)
    for row in q.with_entities(PageView.created_at, PageView.visitor_key).all():
        d = local_date(row.created_at, config)
        if d < start or d > end:
            continue
        daily_views[d] += 1
        daily_visitors[d].add(row.visitor_key)
    return daily_views, daily_visitors


def _bucket_all_page_views(page_type, start, end, config):
    """Same per-day bucketing as _bucket_page_views, but for every page_key
    under page_type at once (one query instead of one per page/post) —
    returns {page_key: daily_views}, {page_key: daily_visitors}. Used by the
    overview endpoint, which needs every enabled page's and every published
    post's numbers on a single request; looping _bucket_page_views per
    entity there would run one full query per page/post."""
    utc_start = datetime.combine(start - timedelta(days=1), time.min)
    utc_end = datetime.combine(end + timedelta(days=1), time.max)
    rows = (
        PageView.query
        .filter(PageView.page_type == page_type)
        .filter(PageView.created_at >= utc_start, PageView.created_at <= utc_end)
        .with_entities(PageView.page_key, PageView.created_at, PageView.visitor_key)
        .all()
    )
    views_by_key = defaultdict(lambda: defaultdict(int))
    visitors_by_key = defaultdict(lambda: defaultdict(set))
    for page_key, created_at, visitor_key in rows:
        d = local_date(created_at, config)
        if d < start or d > end:
            continue
        views_by_key[page_key][d] += 1
        visitors_by_key[page_key][d].add(visitor_key)
    return views_by_key, visitors_by_key


def _merge_daily(*key_bucket_pairs):
    """Combine one or more {page_key: {date: count}} / {page_key: {date: set}}
    pairs (as returned by _bucket_all_page_views) into one overall per-day
    views/visitor-set, for a site-wide total across every page_key and type."""
    combined_views = defaultdict(int)
    combined_visitors = defaultdict(set)
    for views_by_key, visitors_by_key in key_bucket_pairs:
        for day_counts in views_by_key.values():
            for d, c in day_counts.items():
                combined_views[d] += c
        for day_sets in visitors_by_key.values():
            for d, s in day_sets.items():
                combined_visitors[d] |= s
    return combined_views, combined_visitors


def _series_and_totals(daily_views, daily_visitors, start, end):
    series = []
    all_visitors = set()
    total_views = 0
    d = start
    while d <= end:
        views = daily_views.get(d, 0)
        visitors = daily_visitors.get(d, set())
        series.append({'date': d.isoformat(), 'views': views, 'unique_visitors': len(visitors)})
        total_views += views
        all_visitors |= visitors
        d += timedelta(days=1)
    return series, total_views, len(all_visitors)


def _range_bounds_utc(start, end):
    """Loose UTC bounds for a simple COUNT(*) (comments/shares totals) —
    these aren't charted day-by-day, so exact per-row timezone bucketing
    isn't needed, just the same generous padding used for page views."""
    return datetime.combine(start, time.min), datetime.combine(end, time.max)


@admin_analytics_bp.route('/api/admin/analytics/overview')
@role_at_least('editor')
def overview():
    config = SiteConfig.query.first()
    range_param = request.args.get('range', '7d')
    if range_param not in RANGE_DAYS and range_param != 'all':
        return jsonify({'error': 'Invalid range'}), 400
    start, end = _date_range(range_param, config)
    range_start_utc, range_end_utc = _range_bounds_utc(start, end)

    # Two PageView queries total (one per page_type), not one per page/post —
    # see _bucket_all_page_views' docstring.
    page_views_by_key, page_visitors_by_key = _bucket_all_page_views('page', start, end, config)
    post_views_by_key, post_visitors_by_key = _bucket_all_page_views('blog_post', start, end, config)

    site_views, site_visitors = _merge_daily(
        (page_views_by_key, page_visitors_by_key),
        (post_views_by_key, post_visitors_by_key),
    )
    series, _, _ = _series_and_totals(site_views, site_visitors, start, end)

    pages = []
    for key, (enabled_field, name_field) in PAGE_CONFIG_FIELDS.items():
        if key == 'ai_demo' and not current_app.config['ENABLE_AI_DEMOS']:
            continue
        if not config:
            continue
        # 'home' is tracked unconditionally regardless of home_enabled (see
        # HomePage.jsx / site_config.py's get_site_config — home_enabled
        # only ever meant "show in nav", never "block the page"), so it
        # must always appear here too, or real recorded traffic would be
        # silently missing from the dashboard whenever nav is off. Every
        # other key still respects its own enabled flag.
        if key != 'home' and not getattr(config, enabled_field):
            continue
        _, total_views, total_unique = _series_and_totals(
            page_views_by_key.get(key, {}), page_visitors_by_key.get(key, {}), start, end
        )
        pages.append({
            'key': key,
            'label': getattr(config, name_field),
            'views': total_views,
            'unique_visitors': total_unique,
        })
    pages.sort(key=lambda p: p['unique_visitors'], reverse=True)

    published_posts = BlogPost.query.filter_by(status='published').all()

    # One grouped query each for comments/shares across every post, instead
    # of one COUNT per post.
    comment_counts = dict(
        db.session.query(Comment.post_id, db.func.count(Comment.id))
        .filter(
            Comment.is_deleted == False,
            Comment.created_at >= range_start_utc, Comment.created_at <= range_end_utc,
        )
        .group_by(Comment.post_id)
        .all()
    )
    share_counts = dict(
        db.session.query(ShareEvent.post_id, db.func.count(ShareEvent.id))
        .filter(ShareEvent.created_at >= range_start_utc, ShareEvent.created_at <= range_end_utc)
        .group_by(ShareEvent.post_id)
        .all()
    )

    posts = []
    for post in published_posts:
        _, total_views, total_unique = _series_and_totals(
            post_views_by_key.get(post.slug, {}), post_visitors_by_key.get(post.slug, {}), start, end
        )
        posts.append({
            'id': post.id,
            'title': post.title,
            'slug': post.slug,
            'views': total_views,
            'unique_visitors': total_unique,
            'comments': comment_counts.get(post.id, 0),
            'shares': share_counts.get(post.id, 0),
            'publish_date': (post.publish_date or post.created_at).isoformat() + 'Z',
        })
    posts.sort(key=lambda p: p['views'], reverse=True)

    return jsonify({
        'range': range_param,
        'start': start.isoformat(),
        'end': end.isoformat(),
        'series': series,
        'pages': pages,
        'posts': posts,
    })


@admin_analytics_bp.route('/api/admin/analytics/detail')
@role_at_least('editor')
def detail():
    config = SiteConfig.query.first()
    entity_type = request.args.get('type')
    key = request.args.get('key', '')
    range_param = request.args.get('range', '7d')
    if range_param not in RANGE_DAYS and range_param != 'all':
        return jsonify({'error': 'Invalid range'}), 400

    if entity_type == 'page':
        if key not in KNOWN_PAGE_KEYS:
            return jsonify({'error': 'Unknown page key'}), 404
        page_type, page_key = 'page', key
        label = getattr(config, PAGE_CONFIG_FIELDS[key][1]) if config else key
        post = None
    elif entity_type == 'post':
        try:
            post_id = int(key)
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid post id'}), 400
        post = BlogPost.query.get(post_id)
        if not post:
            return jsonify({'error': 'Post not found'}), 404
        page_type, page_key = 'blog_post', post.slug
        label = post.title
    else:
        return jsonify({'error': 'Invalid type'}), 400

    start, end = _date_range(range_param, config)
    daily_views, daily_visitors = _bucket_page_views(page_type, page_key, start, end, config)
    series, total_views, total_unique = _series_and_totals(daily_views, daily_visitors, start, end)

    result = {
        'type': entity_type,
        'key': key,
        'label': label,
        'range': range_param,
        'start': start.isoformat(),
        'end': end.isoformat(),
        'series': series,
        'views': total_views,
        'unique_visitors': total_unique,
    }

    if post:
        range_start_utc, range_end_utc = _range_bounds_utc(start, end)
        result['publish_date'] = (post.publish_date or post.created_at).isoformat() + 'Z'
        result['comments'] = Comment.query.filter(
            Comment.post_id == post.id, Comment.is_deleted == False,
            Comment.created_at >= range_start_utc, Comment.created_at <= range_end_utc,
        ).count()
        share_rows = (
            db.session.query(ShareEvent.platform, db.func.count(ShareEvent.id))
            .filter(
                ShareEvent.post_id == post.id,
                ShareEvent.created_at >= range_start_utc, ShareEvent.created_at <= range_end_utc,
            )
            .group_by(ShareEvent.platform)
            .all()
        )
        result['shares_by_platform'] = {platform: count for platform, count in share_rows}
        result['shares'] = sum(result['shares_by_platform'].values())

    return jsonify(result)
