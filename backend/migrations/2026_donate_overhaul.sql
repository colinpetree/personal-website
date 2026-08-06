-- Manual migration for the donate page overhaul (Phase 1 data model changes).
-- db.create_all() in app.py only creates missing tables; it will NOT alter
-- existing `donation` / `site_config` tables in a database that predates
-- this change. Run this once against the live Postgres database.
--
-- The new `portal_link_request` table does NOT need a manual step here --
-- db.create_all() creates it automatically since it doesn't exist yet.
--
-- Wrapped in a transaction so a failure partway through rolls back cleanly
-- instead of leaving the schema half-migrated. IF NOT EXISTS makes the
-- ADD COLUMN statements safe to re-run against a database this already
-- applied to.

BEGIN;

ALTER TABLE donation ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE donation ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE donation ADD COLUMN IF NOT EXISTS display_name VARCHAR(200);
ALTER TABLE donation ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE donation ADD COLUMN IF NOT EXISTS comment_visible BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE site_config ADD COLUMN IF NOT EXISTS donation_comments_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;
