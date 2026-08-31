import requests


def send_email(config, to_address, subject, body_text, sender_label, mailgun_api_key):
    """Send an email using the SiteConfig Mailgun settings. Raises on failure.

    mailgun_api_key must be the decrypted key — callers must never assign the
    decrypted value onto config.mailgun_api_key, since that field is a live
    SQLAlchemy-tracked attribute and any later db.session.commit() in the same
    session would flush the plaintext back over the encrypted column."""
    from_name = f'{config.site_title} {sender_label}'
    resp = requests.post(
        f'https://api.mailgun.net/v3/{config.mailgun_domain}/messages',
        auth=('api', mailgun_api_key),
        data={
            'from': f'{from_name} <{config.smtp_from_email}>',
            'to': [to_address],
            'subject': subject,
            'text': body_text,
        },
        timeout=10,
    )
    resp.raise_for_status()


def mail_configured(config):
    return bool(
        config
        and config.mailgun_api_key
        and config.mailgun_domain
        and config.smtp_from_email
    )
