import hashlib
import hmac
import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from flask import current_app, request
from flask_login import current_user
from extensions import db
from models import AnalyticsAttempt

# Known crawler/bot substrings, checked case-insensitively against the
# request's User-Agent — a plain denylist is enough for a personal site;
# nothing here needs to catch every bot, just the common, well-behaved ones
# that would otherwise inflate view counts.
BOT_UA_SUBSTRINGS = (
    'bot', 'spider', 'crawler', 'googlebot', 'bingbot', 'ahrefsbot',
    'semrushbot', 'mj12bot', 'yandexbot', 'duckduckbot', 'facebookexternalhit',
    'twitterbot', 'slackbot', 'discordbot', 'applebot', 'gptbot', 'claudebot',
    'ccbot',
)

# Two-tier limit: primarily per-visitor (each real visitor gets their own
# budget, so one heavy user on a shared IP — office network, CGNAT, campus
# wifi — doesn't cap everyone else on that IP), backstopped by a much higher
# per-IP ceiling that still catches a script dodging the per-visitor limit by
# spoofing a different User-Agent (and therefore a different visitor_key) on
# every request. A rotating-IP attacker defeats any IP-based limiter — that's
# an inherent limit of being reachable on the public internet, not something
# worth engineering around here.
PER_VISITOR_RATE_LIMIT_MAX = 30
PER_IP_RATE_LIMIT_MAX = 600
RATE_LIMIT_WINDOW = timedelta(minutes=1)

# Sweeping stale rows on every single request duplicates the same cleanup
# work across concurrent requests for no benefit — instead run it on a random
# sample of requests (same lazy-expiration idea Redis/memcached use), which
# keeps the table bounded over time without paying the cost every time.
RATE_LIMIT_CLEANUP_SAMPLE_RATE = 0.1


def is_bot_request():
    ua = (request.headers.get('User-Agent') or '').lower()
    return any(needle in ua for needle in BOT_UA_SUBSTRINGS)


def is_admin_session():
    return bool(current_user and current_user.is_authenticated)


def local_today(config):
    """Today's date in the site's configured timezone (SiteConfig.timezone),
    not naive UTC — otherwise a visitor near midnight gets bucketed onto the
    wrong calendar day."""
    tz_name = (config.timezone if config else None) or 'Etc/UTC'
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo('Etc/UTC')
    return datetime.now(tz).date()


def local_date(dt, config):
    """Convert a naive UTC datetime (as stored via datetime.utcnow()) to a
    calendar date in the site's configured timezone."""
    tz_name = (config.timezone if config else None) or 'Etc/UTC'
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo('Etc/UTC')
    return dt.replace(tzinfo=ZoneInfo('UTC')).astimezone(tz).date()


def compute_visitor_key(config):
    """HMAC-SHA256 of today's local date + the request's IP/User-Agent, keyed
    with the app's existing SECRET_KEY (with a fixed context prefix for
    domain separation) — no new secret, no cookie, no persisted identity.
    Rotates daily by construction, which is why share-button dedup is a
    same-day window rather than a lifetime one."""
    secret = current_app.config['SECRET_KEY'].encode()
    message = f"analytics|{local_today(config)}|{request.remote_addr or ''}|{request.headers.get('User-Agent') or ''}"
    return hmac.new(secret, message.encode(), hashlib.sha256).hexdigest()


def check_rate_limit(visitor_key):
    """Two-tier windowed request cap (per-visitor primary, per-IP backstop —
    see the constants above), shared by both tracking endpoints, same sliding-
    window pattern as ContactAttempt/LoginAttempt. Returns True if the
    request should be rejected (429)."""
    ip = request.remote_addr or 'unknown'
    window_start = datetime.utcnow() - RATE_LIMIT_WINDOW

    if random.random() < RATE_LIMIT_CLEANUP_SAMPLE_RATE:
        AnalyticsAttempt.query.filter(AnalyticsAttempt.created_at < window_start).delete()

    recent_by_visitor = AnalyticsAttempt.query.filter(
        AnalyticsAttempt.visitor_key == visitor_key,
        AnalyticsAttempt.created_at >= window_start,
    ).count()
    recent_by_ip = AnalyticsAttempt.query.filter(
        AnalyticsAttempt.ip_address == ip,
        AnalyticsAttempt.created_at >= window_start,
    ).count()

    if recent_by_visitor >= PER_VISITOR_RATE_LIMIT_MAX or recent_by_ip >= PER_IP_RATE_LIMIT_MAX:
        db.session.commit()
        return True
    db.session.add(AnalyticsAttempt(ip_address=ip, visitor_key=visitor_key))
    db.session.commit()
    return False
