"""Checks on the test setup itself."""
import socket

import pytest


def test_outside_network_is_blocked():
    with pytest.raises(RuntimeError, match='network connection'):
        socket.create_connection(('203.0.113.1', 443), timeout=1)


def test_uses_a_throwaway_database(app):
    from urllib.parse import urlparse
    name = urlparse(app.config['SQLALCHEMY_DATABASE_URI']).path.lstrip('/')
    assert name.endswith('_test') or name.startswith('ci_')
