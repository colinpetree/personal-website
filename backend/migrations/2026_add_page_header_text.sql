-- Adds admin-editable header content + meta description for the Blog,
-- Contact, AI Demo, and Payment pages, matching the existing convention
-- used by home_text/projects_text/about_text.
--
-- The page title (previously a hardcoded <h1> reading contact_page_name /
-- ai_demo_page_name / payment_page_name) now lives inside this rich-text
-- content, same as Home/About. The plain *_page_name column still drives
-- the nav link label and browser tab title, unchanged.
--
-- Seeded from each row's own current page name (and any existing blurb) so
-- every site's public pages render unchanged until an admin edits the
-- content. Page names are HTML-escaped (&, <, >) before being embedded,
-- since they become raw HTML rendered via dangerouslySetInnerHTML.

ALTER TABLE site_config ADD COLUMN IF NOT EXISTS blog_text TEXT;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS blog_meta_description TEXT;

ALTER TABLE site_config ADD COLUMN IF NOT EXISTS contact_text TEXT;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS contact_meta_description TEXT;

ALTER TABLE site_config ADD COLUMN IF NOT EXISTS ai_demo_text TEXT;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS ai_demo_meta_description TEXT;

ALTER TABLE site_config ADD COLUMN IF NOT EXISTS payment_text TEXT;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS payment_meta_description TEXT;

UPDATE site_config
SET blog_text = '<h1>' || replace(replace(replace(COALESCE(blog_page_name, 'Blog'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</h1>'
WHERE blog_text IS NULL;

UPDATE site_config
SET contact_text = '<h1>' || replace(replace(replace(COALESCE(contact_page_name, 'Contact'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</h1>'
WHERE contact_text IS NULL;

UPDATE site_config
SET ai_demo_text = '<h1>' || replace(replace(replace(COALESCE(ai_demo_page_name, 'AI Implementations'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</h1>'
    || '<p>A grid of small, focused demos showing off different Claude API capabilities.</p>'
WHERE ai_demo_text IS NULL;

UPDATE site_config
SET payment_text = '<h1>☕ ' || replace(replace(replace(COALESCE(payment_page_name, 'Payment'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</h1>'
    || '<p>Enjoying the site? Chip in a one-time or monthly amount to help keep it running.</p>'
WHERE payment_text IS NULL;
