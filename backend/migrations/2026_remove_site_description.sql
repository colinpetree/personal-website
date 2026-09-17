-- site_description was a general site-wide meta description field that was
-- never actually wired into any public meta tag (each page has its own
-- dedicated *_meta_description field instead, e.g. home_meta_description).
-- Its content has been moved into home_meta_description; safe to drop.

ALTER TABLE site_config DROP COLUMN IF EXISTS site_description;
