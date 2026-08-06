import requests


def send_email(config, to_address, subject, body_text, sender_label):
    """Send an email using the SiteConfig Mailgun settings. Raises on failure."""
    from_name = f'{config.site_title} {sender_label}'
    resp = requests.post(
        f'https://api.mailgun.net/v3/{config.mailgun_domain}/messages',
        auth=('api', config.mailgun_api_key),
        data={
            'from': f'{from_name} <{config.smtp_from_email}>',
            'to': [to_address],
            'subject': subject,
            'text': body_text,
        },
    )
    resp.raise_for_status()


def mail_configured(config):
    return bool(
        config
        and config.mailgun_api_key
        and config.mailgun_domain
        and config.smtp_from_email
    )
