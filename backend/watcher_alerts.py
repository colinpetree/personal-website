import logging

logger = logging.getLogger(__name__)


def send_watcher_alert(source, message):
    """Emails the admin when a watcher loop can't reach gh/GitHub for an
    extended period — the one auto-publish failure mode that wouldn't
    otherwise surface (the site keeps serving its last good release, so
    nothing *looks* broken). Reuses the exact Mailgun/forward_email config
    send_deploy_report() uses, but — unlike that function — logs failures
    instead of silently swallowing them; this is new, unproven code, and a
    misconfigured Mailgun account shouldn't also mean a silent alert system.

    Returns True iff the email was actually sent, False otherwise — callers
    (the --send-watcher-alert CLI flag, the /api/watcher-alert route) use
    this to decide whether to mark the outage as "alerted" and stop
    retrying. Getting this wrong would defeat the entire point of this
    feature: a caller that always assumed success regardless of what
    actually happened could permanently mark a failed alert as sent and
    never retry, silently guaranteeing the one thing this exists to
    guarantee — that a broken gh token eventually reaches an inbox — never
    actually happens. Never raises: the caller must never itself fail
    because of this. Caller must already be inside an app context."""
    try:
        from crypto import decrypt
        from email_utils import send_email, mail_configured
        from models import SiteConfig

        config = SiteConfig.query.first()
        if not config or not config.forward_email or not mail_configured(config):
            logger.warning('send_watcher_alert(%s): no SiteConfig/forward_email/Mailgun '
                            'configured — alert NOT sent. Message was: %s', source, message)
            return False
        config.mailgun_api_key = decrypt(config.mailgun_api_key)
        subject = f'[Watcher Alert] {source}: gh/GitHub unreachable for 48h+'
        body = (f'{message}\n\nCheck `gh auth status` on {source} and '
                f're-authenticate if the token expired or was revoked.')
        send_email(config, config.forward_email, subject, body, 'Watcher Alert')
        logger.info('send_watcher_alert(%s): alert email sent to %s.', source, config.forward_email)
        return True
    except Exception:
        logger.exception('send_watcher_alert(%s) failed — no alert was sent.', source)
        return False
