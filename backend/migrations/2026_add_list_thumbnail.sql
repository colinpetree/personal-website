-- Adds a dedicated, cropped "list thumbnail" for blog post previews
-- (blog list cards, prev/next post nav), separate from the existing
-- uncropped thumbnail_filename hero/feature image. Auto-managed by
-- default (derived from the feature image or the first body image/video
-- poster) until a manual crop-upload flips list_thumbnail_auto off.

ALTER TABLE blog_post ADD COLUMN IF NOT EXISTS list_thumbnail_filename VARCHAR(255);
ALTER TABLE blog_post ADD COLUMN IF NOT EXISTS list_thumbnail_auto BOOLEAN NOT NULL DEFAULT TRUE;
