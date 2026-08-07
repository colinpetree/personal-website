-- The About page's headshot upload is redundant now that about_text is a
-- fully editable rich-text block (an admin can just insert an image there).
-- Drops the now-unused column; any previously uploaded headshot file itself
-- is left in backend/uploads/ (not deleted) in case it's still referenced
-- elsewhere or wanted back.

ALTER TABLE site_config DROP COLUMN IF EXISTS headshot_filename;
