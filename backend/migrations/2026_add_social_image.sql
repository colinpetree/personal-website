-- Dedicated site-wide social share image (og:image fallback), separate from
-- favicon_filename — a small square favicon made an ugly link preview in
-- iMessage/Safari/Slack/etc., which read og:image, not the actual favicon.

ALTER TABLE site_config ADD COLUMN IF NOT EXISTS social_image_filename VARCHAR(255);
