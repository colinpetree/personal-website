import logging
import os

logger = logging.getLogger(__name__)

# Per-source (subject label, troubleshooting hint) — keeps the email's
# subject line and closing advice specific to what actually went wrong,
# instead of a one-size-fits-all message. Any source not listed here still
# gets a sane generic email via _DEFAULT_INFO, so adding a new watcher never
# requires touching this file to get a usable (if less specific) alert.
_SOURCE_INFO = {
    'pi': ('gh/GitHub unreachable for 48h+',
           'Check `gh auth status` on the Pi and re-authenticate if the token expired or was revoked.'),
    'production': ('gh/GitHub unreachable for 48h+',
                   'Check `gh auth status` on production and re-authenticate if the token expired or was revoked.'),
    'backup': ('nightly backup failed',
               'Check `journalctl -u personal-website-backup` on the server for the exact step that failed '
               '(pg_dump, tar, or rsync), and confirm DATABASE_URL, BACKUP_REMOTE_*, and the backup SSH key '
               '(see deploy/scripts/setup-backup-ssh.sh) are all still valid.'),
    'crash-loop': ('personal-website.service is down',
                   'Check `systemctl status personal-website` and `journalctl -u personal-website -n 100` on '
                   'the server for the underlying crash reason — a recent log tail is usually included below.'),
    'disk': ('disk usage threshold exceeded',
             'Free up space or grow the disk, then run `df -h` on the server to confirm current usage.'),
    'certbot': ('TLS certificate renewal at risk',
                'Run `sudo certbot certificates` and `journalctl -u certbot.timer` on the server to see why '
                'renewal has stalled.'),
    'media-cleanup': ('orphan media cleanup needs attention',
                       'Check `journalctl -u personal-website-media-cleanup` on the server for details — this '
                       'fires either on an unexpected error, or when a single run would have touched more '
                       'files than ORPHAN_MEDIA_MAX_PER_RUN allows (a safety cap, not necessarily a real '
                       'problem — but worth a manual `--cleanup-orphan-media --dry-run` look before raising '
                       'the cap or letting it proceed).'),
}
_DEFAULT_INFO = ('issue detected', 'Check the server logs for details — see the message above.')


def send_watcher_alert(source, message):
    """Emails the site owner when something a watcher script/timer checks
    has gone wrong — gh/GitHub outages (content-watch.sh/update-watch.sh),
    nightly backup failures, service crash-loops, high disk usage, or
    Certbot renewal risk (all from health-watch.sh/backup.sh). Subject and
    body are tailored per `source` via _SOURCE_INFO above so the email
    itself says what kind of problem this is and where to start looking,
    rather than a single hardcoded story that only fit the original
    gh-outage use case this function was first written for.

    Tries the normal SiteConfig-backed Mailgun config first (same one the
    public contact form uses). If that path doesn't work for ANY reason —
    SiteConfig unset, the query itself fails (e.g. the database is down,
    plausible cause of a 'crash-loop' alert), or the send itself fails
    (expired/revoked Mailgun key, suspended account, a bad decrypt) — falls
    back to a second, deliberately DB-independent path using plain
    WATCHER_ALERT_FALLBACK_* env vars, if set. This exists specifically so a
    broken database OR a broken primary mail account doesn't also silently
    take out the one alert meant to report it.

    Returns True iff the email was actually sent, False otherwise — callers
    (the --send-watcher-alert CLI flag, the /api/watcher-alert route) use
    this to decide whether to mark the outage as "alerted" and stop
    retrying. Never raises: the caller must never itself fail because of
    this. Caller must already be inside an app context."""
    try:
        from crypto import decrypt
        from email_utils import send_email, send_raw_email, mail_configured
        from models import SiteConfig

        label, hint = _SOURCE_INFO.get(source, _DEFAULT_INFO)
        subject = f'[Watcher Alert] {source}: {label}'
        body = f'{message}\n\n{hint}'

        config = None
        try:
            config = SiteConfig.query.first()
        except Exception:
            logger.exception('send_watcher_alert(%s): could not read SiteConfig — database may be unreachable, '
                              'falling back to WATCHER_ALERT_FALLBACK_* env config if set.', source)

        if config and config.forward_email and mail_configured(config):
            # Wrapped locally (not left to the outer try/except) so a primary
            # SEND failure — expired/revoked Mailgun key, suspended account,
            # a bad decrypt() — still falls through to the fallback below,
            # not just a failure to read SiteConfig in the first place. A
            # fallback that only covered "the database is down" would miss
            # the more common real-world case of "the mail account itself is
            # broken," which defeats the point of having a fallback at all.
            try:
                send_email(config, config.forward_email, subject, body, 'Watcher Alert',
                           decrypt(config.mailgun_api_key))
                logger.info('send_watcher_alert(%s): alert email sent to %s.', source, config.forward_email)
                return True
            except Exception:
                logger.exception('send_watcher_alert(%s): primary Mailgun send failed — falling back to '
                                  'WATCHER_ALERT_FALLBACK_* env config if set.', source)

        fb_key = os.getenv('WATCHER_ALERT_FALLBACK_MAILGUN_API_KEY')
        fb_domain = os.getenv('WATCHER_ALERT_FALLBACK_MAILGUN_DOMAIN')
        fb_from = os.getenv('WATCHER_ALERT_FALLBACK_FROM_EMAIL')
        fb_to = os.getenv('WATCHER_ALERT_FALLBACK_TO_EMAIL')
        missing = [name for name, val in (
            ('WATCHER_ALERT_FALLBACK_MAILGUN_API_KEY', fb_key),
            ('WATCHER_ALERT_FALLBACK_MAILGUN_DOMAIN', fb_domain),
            ('WATCHER_ALERT_FALLBACK_FROM_EMAIL', fb_from),
            ('WATCHER_ALERT_FALLBACK_TO_EMAIL', fb_to),
        ) if not val]
        if not missing:
            send_raw_email(fb_domain, fb_key, fb_from, fb_to, subject, body)
            logger.info('send_watcher_alert(%s): primary path unavailable — sent via fallback env-based '
                        'Mailgun config to %s.', source, fb_to)
            return True

        logger.warning('send_watcher_alert(%s): no usable Mailgun config — primary path unavailable and '
                        'fallback %s. Alert NOT sent. Message was: %s',
                        source,
                        'not configured at all' if len(missing) == 4 else f'missing {", ".join(missing)}',
                        message)
        return False
    except Exception:
        logger.exception('send_watcher_alert(%s) failed — no alert was sent.', source)
        return False
