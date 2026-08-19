-- Adds updated_at to Profile, SiteConfig, and Project — BlogPost already has
-- one. Powers /api/content-version (backend/routes/site_config.py), a public
-- fingerprint endpoint the auto-publish content-watcher polls to detect
-- edits that should trigger a prerendered-page rebuild.
--
-- Not a real per-row backfill: unlike blog_post, none of these three tables
-- have any existing timestamp column to backfill from, so every pre-existing
-- row just gets "now" (the moment this migration runs) as its updated_at.
-- Harmless — it's a one-time blip the next content-watch.sh poll picks up
-- and republishes once, not an ongoing correctness issue.

ALTER TABLE profile ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now() NOT NULL;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now() NOT NULL;
ALTER TABLE project ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now() NOT NULL;
