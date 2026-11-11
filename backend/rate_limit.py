"""Shared helpers for the per-IP and per-email rate limits.

client_ip_key() is what every IP-based limit should key on. IPv4 addresses
are used as-is. IPv6 addresses are cut to their /64 prefix, because one
home connection or one cloud server is normally handed a whole /64 (about
18 quintillion addresses), so keying on the full address would let anyone
dodge a limit just by changing the last half of their address.
"""
import ipaddress
import re
from datetime import datetime, timedelta

from flask import request
from sqlalchemy import func

from extensions import db


# Deliberately loose: one @, something before it, a dot somewhere after it, no
# spaces. Only meant to turn away blank and obviously junk input before it
# counts against any limit, not to decide what a real address looks like.
_EMAIL_SHAPE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def looks_like_email(value):
    return bool(value) and len(value) <= 254 and bool(_EMAIL_SHAPE.match(value))


def client_ip_key(addr=None):
    addr = addr if addr is not None else request.remote_addr
    if not addr:
        return 'unknown'
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return addr[:45]
    if ip.version == 6:
        if ip.ipv4_mapped:
            return str(ip.ipv4_mapped)
        return str(ipaddress.ip_network(f'{ip}/64', strict=False))
    return str(ip)


# Sign-in link and admin password-reset emails. Allowed requests are recorded
# in AuthEmailAttempt; blocked ones are not (so a blocked flood doesn't extend
# its own lockout or eat the site-wide budget).
AUTH_EMAIL_PER_IP = 5
AUTH_EMAIL_PER_IP_WINDOW = timedelta(minutes=15)
AUTH_EMAIL_PER_ADDRESS = 3
AUTH_EMAIL_PER_ADDRESS_WINDOW = timedelta(hours=1)
# Site-wide cap on sign-in link emails, so a spread-out attack (many IPs, many
# addresses) still can't burn through the Mailgun account or its sending
# reputation. Not enforced here: going over it only pauses links to addresses
# with no account yet (see auth._send_magic_link_if_valid), so returning users
# can always sign in and an attacker can at most pause new sign-ups. It never
# produces a 429, so a flood gets no signal that it hit anything. Admin resets
# are not counted against it.
MAGIC_LINK_SITE_WIDE_PER_HOUR = 50


def magic_link_requests_last_hour():
    """Sign-in link requests that passed the per-IP and per-email limits in the
    last hour, site-wide. Includes the request being handled."""
    from models import AuthEmailAttempt
    return AuthEmailAttempt.query.filter(
        AuthEmailAttempt.kind == 'magic_link',
        AuthEmailAttempt.created_at >= datetime.utcnow() - timedelta(hours=1),
    ).count()


def check_auth_email_limits(kind, email):
    """Returns True and records the attempt if this request passes the per-IP
    and per-email limits, False if either is hit. Caller commits."""
    from models import AuthEmailAttempt

    now = datetime.utcnow()
    longest = max(AUTH_EMAIL_PER_IP_WINDOW, AUTH_EMAIL_PER_ADDRESS_WINDOW, timedelta(hours=1))
    AuthEmailAttempt.query.filter(AuthEmailAttempt.created_at < now - longest).delete()

    ip_key = client_ip_key()
    base = AuthEmailAttempt.query.filter(AuthEmailAttempt.kind == kind)

    if base.filter(
        AuthEmailAttempt.ip_address == ip_key,
        AuthEmailAttempt.created_at >= now - AUTH_EMAIL_PER_IP_WINDOW,
    ).count() >= AUTH_EMAIL_PER_IP:
        return False

    if email and base.filter(
        func.lower(AuthEmailAttempt.email) == email.lower(),
        AuthEmailAttempt.created_at >= now - AUTH_EMAIL_PER_ADDRESS_WINDOW,
    ).count() >= AUTH_EMAIL_PER_ADDRESS:
        return False

    db.session.add(AuthEmailAttempt(kind=kind, ip_address=ip_key, email=(email or '')[:255]))
    return True
