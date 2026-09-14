"""Sanitizes blog `content_html` for lower-trust authors before it's persisted.

Only applied to contributor-authored posts (see admin_blog.py) — administrator/
owner accounts already have equivalent trust to editing site config directly.
"""
import bleach
import tinycss2
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
    'video': ['src', 'controls', 'autoplay', 'muted', 'loop', 'playsinline', 'poster', 'disablepictureinpicture'],
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

# bleach's CSSSanitizer matches property names exactly as tinycss2 parses them
# out of the style string — longhand properties (margin-top, background-image)
# are distinct tokens from their shorthand (margin, background) and need their
# own entries. This list has to cover everything HeaderNode.exportDOM()
# (nodes.jsx) emits inline — background/position/inset/opacity/pointer-events/
# overflow/line-height/box-sizing/margin-top/margin-left/margin-right/
# background-image/background-repeat/background-position/text-decoration —
# or a contributor-authored header block (shadow overlay, background image,
# split-layout media) silently loses that styling once sanitized, with no
# error surfaced anywhere.
# Two of the properties above need their *value* restricted too, not just
# their name — bleach's CSSSanitizer only filters by property name, and
# allowing these unconditionally would let a contributor's content_html (sent
# directly to the API, not necessarily through the editor UI) build a
# tracking pixel or an invisible click-hijacking overlay inside their own
# post/page:
#   - background/background-image: nodes.jsx's exportDOM() only ever points
#     these at our own /api/uploads/<file>, so any url() pointing elsewhere
#     is dropped — otherwise an external url() fires an unconditional request
#     to that host (with referrer) every time the content is viewed,
#     including by the admin/editor who opens the draft to review it.
#   - pointer-events: exportDOM() only ever sets this to 'none' (the shadow
#     overlay is always decorative), so any other value is dropped —
#     otherwise `position:absolute` + `opacity` (both needed for that same
#     overlay) + `pointer-events:auto` builds a near-invisible clickable
#     layer over other content.
_SAFE_POINTER_EVENTS_VALUES = {'none'}
_UPLOADS_URL_PREFIX = '/api/uploads/'


def _iter_url_tokens(tokens):
    """Yields every 'url' token anywhere in the tree, including ones nested
    inside a function's arguments (e.g. image-set(url(...)), cross-fade(...))
    — a flat scan of the top-level tokens alone misses those, which would
    otherwise let an external url() back in through a wrapping function.
    Iterative (an explicit stack, not recursion) so a request built directly
    against the API with pathologically deep function nesting can't blow
    Python's call stack and crash with an unhandled RecursionError instead of
    a clean sanitize result."""
    stack = list(tokens)
    while stack:
        t = stack.pop()
        if t.type == 'url':
            yield t
        elif t.type == 'function':
            stack.extend(t.arguments)


def _declaration_value_is_safe(prop, value_tokens):
    if prop == 'pointer-events':
        idents = [t.lower_value for t in value_tokens if t.type == 'ident']
        return all(v in _SAFE_POINTER_EVENTS_VALUES for v in idents)
    if prop in ('background', 'background-image'):
        return all(t.value.startswith(_UPLOADS_URL_PREFIX) for t in _iter_url_tokens(value_tokens))
    return True


class _RestrictedCSSSanitizer(CSSSanitizer):
    """Same property-name allowlist as bleach's CSSSanitizer, plus a
    value-level check (_declaration_value_is_safe) for the handful of
    properties where the value matters as much as the property name."""

    def sanitize_css(self, style):
        parsed = tinycss2.parse_declaration_list(style)
        if not parsed:
            return ''
        new_tokens = []
        for token in parsed:
            if token.type == 'declaration':
                allowed_name = (
                    token.lower_name in self.allowed_css_properties
                    or token.lower_name in self.allowed_svg_properties
                )
                if not allowed_name or not _declaration_value_is_safe(token.lower_name, token.value):
                    continue
                new_tokens.append(token)
            elif token.type in ('comment', 'whitespace'):
                if new_tokens and new_tokens[-1].type != token.type:
                    new_tokens.append(token)
        if not new_tokens:
            return ''
        return tinycss2.serialize(new_tokens).strip()


_CSS_SANITIZER = _RestrictedCSSSanitizer(allowed_css_properties=[
    'color', 'background-color', 'background', 'background-image', 'background-repeat',
    'background-position', 'text-align', 'text-decoration', 'font-size', 'font-weight',
    'line-height', 'width', 'height', 'min-height', 'max-width', 'max-height',
    'border', 'border-radius', 'box-sizing', 'padding', 'margin',
    'margin-top', 'margin-left', 'margin-right', 'display', 'flex-direction',
    'align-items', 'justify-content', 'position', 'inset', 'overflow',
    'opacity', 'pointer-events',
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
