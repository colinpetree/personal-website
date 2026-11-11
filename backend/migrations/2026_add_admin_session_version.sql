-- Part of the id Flask-Login stores in admin session and remember cookies
-- (see AdminAccount.get_id in models.py). Bumping it logs that account out of
-- every browser: password changes and resets, and "Log out everywhere".
-- The new tables from the same change (auth_email_attempt, pending_sign_in,
-- admin_login_record) need no migration: db.create_all() creates missing
-- tables on startup.

ALTER TABLE admin_account ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
