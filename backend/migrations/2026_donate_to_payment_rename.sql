-- Rename pass: "donate"/"donation" -> "payment" throughout the app.
-- Renames the table/columns shipped by 2026_donate_overhaul.sql. Postgres
-- RENAME preserves data, constraints, and indexes automatically.
--
-- Preserves any admin-customized label/slug: only rows still holding the
-- OLD DEFAULT values ('Donate' / 'donate') are updated to the new defaults
-- ('Payment' / 'payment'); custom text an admin already entered is left as-is.

ALTER TABLE donation RENAME TO payment;

ALTER TABLE site_config RENAME COLUMN donate_enabled TO payment_enabled;
ALTER TABLE site_config RENAME COLUMN donate_page_name TO payment_page_name;
ALTER TABLE site_config RENAME COLUMN donate_slug TO payment_slug;
ALTER TABLE site_config RENAME COLUMN donation_comments_enabled TO payment_comments_enabled;

UPDATE site_config SET payment_page_name = 'Payment' WHERE payment_page_name = 'Donate';
UPDATE site_config SET payment_slug = 'payment' WHERE payment_slug = 'donate';

ALTER TABLE site_config ALTER COLUMN payment_page_name SET DEFAULT 'Payment';
ALTER TABLE site_config ALTER COLUMN payment_slug SET DEFAULT 'payment';
