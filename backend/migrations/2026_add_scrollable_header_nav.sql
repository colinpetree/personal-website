-- Adds an opt-in "scrollable header navigation" (floating table of contents)
-- toggle to blog posts and every generic content page. Off by default —
-- must be explicitly enabled per post/page.

ALTER TABLE blog_post ADD COLUMN IF NOT EXISTS scrollable_nav_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE site_config ADD COLUMN IF NOT EXISTS home_scrollable_nav_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS about_scrollable_nav_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS contact_scrollable_nav_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS projects_scrollable_nav_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS ai_demo_scrollable_nav_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS payment_scrollable_nav_enabled BOOLEAN NOT NULL DEFAULT false;
