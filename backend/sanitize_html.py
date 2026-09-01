"""Sanitizes blog `content_html` for lower-trust authors before it's persisted.

Only applied to contributor-authored posts (see admin_blog.py) — administrator/
owner accounts already have equivalent trust to editing site config directly.
"""
import bleach
from bleach.css_sanitizer import CSSSanitizer

ALLOWED_TAGS = [
    'p', 'div', 'span', 'br', 'hr',
    'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'sub', 'sup', 'code',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre',
    'a', 'img', 'figure', 'figcaption',
    'video', 'audio', 'source', 'iframe',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'details', 'summary', 'header', 'button',
    # Inline icon markup — the editor embeds small static SVGs (code-block
    # copy icon, link-group platform badges) directly into exported HTML.
    'svg', 'path', 'rect', 'circle', 'polyline', 'polygon', 'line', 'g',
]

# 'data-*' handled separately below — bleach's ATTRIBUTES dict only takes exact names.
# No 'onclick' or other event-handler attributes here, and never will be —
# 'button' is only safe to allow because exportDOM() no longer emits one
# (see nodes.jsx's CodeBlockNode) and BlogPostPage.jsx handles the click via
# delegation instead.
_COMMON_ATTRS = ['class', 'style', 'id', 'title', 'aria-label']
_SVG_SHAPE_ATTRS = ['d', 'x', 'y', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'points']

ALLOWED_ATTRIBUTES = {
    '*': _COMMON_ATTRS,
    'a': ['href', 'target', 'rel', 'download'],
    'img': ['src', 'alt', 'srcset', 'sizes'],
    'video': ['src', 'controls', 'autoplay', 'muted', 'loop', 'playsinline', 'poster'],
    'audio': ['src', 'controls', 'controlslist'],
    'source': ['src', 'type'],
    'iframe': ['src', 'allow', 'allowfullscreen', 'loading'],
    'svg': ['xmlns', 'width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
    'path': _SVG_SHAPE_ATTRS + ['fill', 'stroke'],
    'rect': _SVG_SHAPE_ATTRS + ['width', 'height', 'fill', 'stroke'],
    'circle': _SVG_SHAPE_ATTRS + ['fill', 'stroke'],
    'polyline': _SVG_SHAPE_ATTRS + ['fill', 'stroke'],
    'polygon': _SVG_SHAPE_ATTRS + ['fill', 'stroke'],
    'line': _SVG_SHAPE_ATTRS + ['fill', 'stroke'],
}

ALLOWED_PROTOCOLS = ['http', 'https', 'mailto', 'data']

_IFRAME_ALLOWED_HOSTS = ('www.youtube.com', 'player.vimeo.com', 'open.spotify.com')

_CSS_SANITIZER = CSSSanitizer(allowed_css_properties=[
    'color', 'background-color', 'text-align', 'font-size', 'font-weight',
    'width', 'height', 'max-width', 'max-height', 'border', 'border-radius',
    'padding', 'margin', 'display', 'flex-direction', 'align-items', 'justify-content',
])


def _attribute_filter(tag, name, value):
    if name.startswith('data-'):
        return True
    if tag not in ALLOWED_ATTRIBUTES and name not in ALLOWED_ATTRIBUTES['*']:
        return False
    allowed = ALLOWED_ATTRIBUTES.get(tag, []) + ALLOWED_ATTRIBUTES['*']
    if name not in allowed:
        return False
    if tag == 'iframe' and name == 'src':
        from urllib.parse import urlparse
        host = urlparse(value).hostname or ''
        return host in _IFRAME_ALLOWED_HOSTS
    return True


def sanitize_content_html(html):
    """Strips script-capable markup (script tags, event-handler attributes,
    javascript: URLs, disallowed iframes) while preserving the structural
    HTML the blog editor emits. Disallowed tags are stripped, not escaped,
    so the result renders cleanly rather than showing literal tag text."""
    if not html:
        return html
    if not isinstance(html, str):
        raise ValueError('content_html must be a string')
    return bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=_attribute_filter,
        protocols=ALLOWED_PROTOCOLS,
        css_sanitizer=_CSS_SANITIZER,
        strip=True,
        strip_comments=True,
    )
