-- Adds a "Font Family" editor setting (default/sans/serif) to blog posts and
-- every generic content page. Defaults to 'default', i.e. today's existing
-- per-element serif/sans mix, unchanged until an admin picks otherwise.

ALTER TABLE blog_post ADD COLUMN IF NOT EXISTS font_family VARCHAR(10) NOT NULL DEFAULT 'default';

ALTER TABLE site_config ADD COLUMN IF NOT EXISTS home_font_family VARCHAR(10) NOT NULL DEFAULT 'default';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS blog_font_family VARCHAR(10) NOT NULL DEFAULT 'default';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS projects_font_family VARCHAR(10) NOT NULL DEFAULT 'default';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS about_font_family VARCHAR(10) NOT NULL DEFAULT 'default';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS contact_font_family VARCHAR(10) NOT NULL DEFAULT 'default';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS ai_demo_font_family VARCHAR(10) NOT NULL DEFAULT 'default';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS payment_font_family VARCHAR(10) NOT NULL DEFAULT 'default';
