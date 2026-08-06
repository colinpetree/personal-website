-- Manual migration for the donate page overhaul (Phase 1 data model changes).
-- db.create_all() in app.py only creates missing tables; it will NOT alter
-- existing `donation` / `site_config` tables in a database that predates
-- this change. Run this once against the live Postgres database.
--
-- The new `portal_link_request` table does NOT need a manual step here --
-- db.create_all() creates it automatically since it doesn't exist yet.

ALTER TABLE donation ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE donation ADD COLUMN email VARCHAR(255);
ALTER TABLE donation ADD COLUMN display_name VARCHAR(200);
ALTER TABLE donation ADD COLUMN message TEXT;
ALTER TABLE donation ADD COLUMN comment_visible BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE site_config ADD COLUMN donation_comments_enabled BOOLEAN NOT NULL DEFAULT TRUE;
