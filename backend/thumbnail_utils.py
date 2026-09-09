"""Derives a blog post's list-thumbnail filename: the feature image if one is
set, else the first image or video poster frame found in document order in
the post body."""
import html.parser

from orphan_cleanup import _normalize_reference


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


def derive_list_thumbnail(thumbnail_filename, content_html):
    """Returns the filename that should populate list_thumbnail_filename, or
    None if there's nothing to derive one from."""
    if thumbnail_filename:
        return thumbnail_filename
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
    return _normalize_reference(parser.found)
