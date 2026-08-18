-- Adds a stored nav order so the admin can drag-to-reorder site pages;
-- drives both the public navbar and the admin sidebar's page order.
-- NULL means "use the built-in default order" (see DEFAULT_NAV_ORDER in models.py).

ALTER TABLE site_config ADD COLUMN IF NOT EXISTS nav_order TEXT;
