"""Drops whichever of a HeaderNode's image/video references is no longer the
active background, at the one moment that actually means something: a
post/page being published or scheduled.

nodes.jsx's HeaderNode.exportDOM() deliberately writes BOTH data-header-image
and data-header-video whenever either is set, even the one left over from
switching image<->video without deleting it — a draft needs that reference to
survive so orphan_cleanup.py doesn't see it as unreferenced before the admin
has actually committed to discarding it. This module is where that
commitment gets enforced: called from admin_blog.py/admin_pages.py exactly
when a save results in the post/page going live (published) or scheduled to,
it strips whichever media attribute doesn't match data-background-type, so
the abandoned file becomes genuinely unreferenced and eligible for cleanup.
"""
import re

# A bare '>' is never escaped inside a double-quoted attribute value per the
# HTML serialization spec (only '&' and '"' are) — data-button-text/
# data-button-url can legitimately contain one (e.g. a CTA reading
# "Shop now >"), and that attribute is written before data-header-image/
# data-header-video/data-background-type on the same tag. A naive `[^>]*`
# would stop at that '>' and never reach the attributes this module cares
# about, silently no-op-ing the strip. Matching quoted spans as a whole unit
# (letting '>' through inside them) keeps the tag boundary at the real
# closing '>' instead.
_HEADER_TAG_RE = re.compile(r'<header\b(?:[^\'"<>]|"[^"]*"|\'[^\']*\')*>', re.IGNORECASE)


def _strip_attr(tag_html, attr_name):
    return re.sub(r'\s*' + re.escape(attr_name) + r'\s*=\s*"[^"]*"', '', tag_html)


def _strip_tag(tag_html):
    bg_type_match = re.search(r'data-background-type\s*=\s*"([^"]*)"', tag_html)
    bg_type = bg_type_match.group(1) if bg_type_match else 'color'
    if bg_type != 'image':
        tag_html = _strip_attr(tag_html, 'data-header-image-lqip')
        tag_html = _strip_attr(tag_html, 'data-header-image')
    if bg_type != 'video':
        tag_html = _strip_attr(tag_html, 'data-header-video')
    return tag_html


def strip_inactive_header_media(html_text):
    """Returns html_text with every <header> tag's inactive media attribute
    (whichever of data-header-image/data-header-video doesn't match that same
    tag's data-background-type) removed. A no-op on content with no header
    blocks, or none needing a change."""
    if not html_text:
        return html_text
    return _HEADER_TAG_RE.sub(lambda m: _strip_tag(m.group(0)), html_text)
