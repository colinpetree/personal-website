import os
import logging
import requests

VARNISH_PURGE_URL = os.getenv('VARNISH_PURGE_URL')  # e.g. http://127.0.0.1:6081 — unset = no-op


def purge_url(path):
    if not VARNISH_PURGE_URL:
        return
    try:
        requests.request('PURGE', VARNISH_PURGE_URL + path, timeout=2)
    except Exception:
        logging.getLogger(__name__).warning('Varnish purge failed for %s', path, exc_info=True)


def ban_pattern(pattern):
    if not VARNISH_PURGE_URL:
        return
    try:
        requests.request('BAN', VARNISH_PURGE_URL + '/', headers={'X-Ban-Pattern': pattern}, timeout=2)
    except Exception:
        logging.getLogger(__name__).warning('Varnish ban failed for %s', pattern, exc_info=True)


def purge_all_public():
    ban_pattern('^/api/(blog|projects|site-config|payment/comments)')
