"""Derives a blog post's list-thumbnail filename: the feature image if one is
set, else the first image or video poster frame found in document order in
the post body."""
import html.parser

from orphan_cleanup import _normalize_reference
from upload_utils import thumbnail_variant_filename


class _FirstMediaExtractor(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.found = None

    def handle_starttag(self, tag, attrs):
        if self.found is not None:
            return
        attrs = dict(attrs)
        if tag == 'img' and attrs.get('src'):
            self.found = attrs['src']
        elif tag == 'video' and attrs.get('poster'):
            self.found = attrs['poster']


def derive_list_thumbnail(thumbnail_filename, content_html, uploads_dir):
    """Returns the filename that should populate list_thumbnail_filename, or
    None if there's nothing to derive one from. Prefers the pre-generated
    400w WebP variant of whatever base image is found, since this field is
    only ever rendered at small (list/nav) sizes."""
    base = thumbnail_filename
    if not base:
        if not content_html:
            return None
        parser = _FirstMediaExtractor()
        try:
            parser.feed(content_html)
            parser.close()
        except Exception:
            return None
        if not parser.found:
            return None
        base = _normalize_reference(parser.found)
        if not base:
            return None
    return thumbnail_variant_filename(base, uploads_dir)
