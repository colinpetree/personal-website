import requests


def _post_mailgun(domain, api_key, from_address, to_address, subject, body_text, reply_to=None):
    data = {
        'from': from_address,
        'to': [to_address],
        'subject': subject,
        'text': body_text,
    }
    if reply_to:
        data['h:Reply-To'] = reply_to
    resp = requests.post(
        f'https://api.mailgun.net/v3/{domain}/messages',
        auth=('api', api_key),
        data=data,
        timeout=10,
    )
    resp.raise_for_status()


def send_email(config, to_address, subject, body_text, sender_label, mailgun_api_key, reply_to=None):
    """Send an email using the SiteConfig Mailgun settings. Raises on failure.

    mailgun_api_key must be the decrypted key — callers must never assign the
    decrypted value onto config.mailgun_api_key, since that field is a live
    SQLAlchemy-tracked attribute and any later db.session.commit() in the same
    session would flush the plaintext back over the encrypted column."""
    from_address = f'{config.site_title} {sender_label} <{config.smtp_from_email}>'
    _post_mailgun(config.mailgun_domain, mailgun_api_key, from_address, to_address, subject, body_text, reply_to)


def send_raw_email(domain, api_key, from_address, to_address, subject, body_text):
    """Same as send_email, but takes Mailgun settings directly instead of a
    SiteConfig row. For callers that must not depend on a database read to
    send mail — see watcher_alerts.py's env-based fallback path, used when
    the normal SiteConfig-backed path is itself unavailable (e.g. a
    crash-loop alert whose whole point is that something, possibly the
    database, is broken)."""
    _post_mailgun(domain, api_key, from_address, to_address, subject, body_text)


def mail_configured(config):
    return bool(
        config
        and config.mailgun_api_key
        and config.mailgun_domain
        and config.smtp_from_email
    )
