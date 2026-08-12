import os
import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)

# These 4 files describe how Colin's own pre-existing dev database evolved
# to today's schema (e.g. renaming the donation table/columns to payment) —
# they only make sense against an ALREADY-EXISTING database that predates
# those changes. A fresh production install's db.create_all() already
# creates the current, already-renamed schema directly from models.py, so
# running these against it would fail outright (e.g. "relation donation
# does not exist"). install.sh seeds these as already-applied on first
# install specifically to skip them — see seed_known_migrations() below.
LEGACY_MIGRATIONS = (
    '2026_add_page_header_text.sql',
    '2026_donate_overhaul.sql',
    '2026_donate_to_payment_rename.sql',
    '2026_remove_about_headshot.sql',
)


def seed_known_migrations(engine, filenames):
    """Marks the given filenames as already-applied without running them —
    used once on a fresh install to skip LEGACY_MIGRATIONS, which only apply
    to upgrading a pre-existing database, never a freshly created one."""
    with engine.begin() as conn:
        conn.execute(text(
            'CREATE TABLE IF NOT EXISTS schema_migrations ('
            'filename VARCHAR(255) PRIMARY KEY, '
            'applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)'
        ))
        for filename in filenames:
            conn.execute(
                text(
                    'INSERT INTO schema_migrations (filename) VALUES (:filename) '
                    'ON CONFLICT (filename) DO NOTHING'
                ),
                {'filename': filename},
            )


def run_pending_migrations(engine, migrations_dir):
    """Runs any *.sql file in migrations_dir that hasn't already been applied,
    tracked in a schema_migrations table. Files are applied in filename order
    (the existing "YYYY_description.sql" convention already sorts correctly).
    Each file runs in its own transaction; a failure aborts before recording
    that file as applied, so a rerun retries it."""
    with engine.begin() as conn:
        conn.execute(text(
            'CREATE TABLE IF NOT EXISTS schema_migrations ('
            'filename VARCHAR(255) PRIMARY KEY, '
            'applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)'
        ))
        applied = {row[0] for row in conn.execute(text('SELECT filename FROM schema_migrations'))}

    if not os.path.isdir(migrations_dir):
        return

    pending = sorted(
        f for f in os.listdir(migrations_dir)
        if f.endswith('.sql') and f not in applied
    )
    for filename in pending:
        path = os.path.join(migrations_dir, filename)
        with open(path, 'r') as f:
            sql = f.read()
        logger.info('Applying migration %s', filename)
        with engine.begin() as conn:
            conn.execute(text(sql))
            conn.execute(
                text('INSERT INTO schema_migrations (filename) VALUES (:filename)'),
                {'filename': filename},
            )
