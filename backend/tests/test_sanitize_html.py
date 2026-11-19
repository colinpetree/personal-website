"""sanitize_content_html is the stored-XSS boundary for contributor-authored
posts and pages: whatever it lets through is served to every visitor and to
the staff who review the draft. These tests need no database."""
import pytest

from sanitize_html import sanitize_content_html as clean


@pytest.mark.parametrize('dirty', [
    '<script>alert(1)</script>',
    '<img src="x" onerror="alert(1)">',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<iframe src="https://evil.example/embed"></iframe>',
    '<svg onload="alert(1)"><path d="M0 0"/></svg>',
    '<div style="background-image:url(https://evil.example/pixel.gif)">x</div>',
    '<object data="https://evil.example/x.swf"></object>',
    '<form action="https://evil.example"><input name="password"></form>',
    '<style>body{display:none}</style>',
])
def test_strips_script_capable_markup(dirty):
    out = clean(dirty)
    lowered = out.lower()
    for marker in ('<script', 'onerror', 'onload', 'javascript:', 'evil.example', '<object', '<form', '<input', '<style'):
        assert marker not in lowered, f'{marker!r} survived: {out!r}'


@pytest.mark.parametrize('style', [
    # Quoted url() is parsed as a function, not a url token; it used to slip
    # past the uploads-only check.
    """background-image:url("https://evil.example/pixel.gif")""",
    """background:#000 url("https://evil.example/pixel.gif") no-repeat""",
    # image-set() accepts a bare string as an image address.
    """background-image:image-set("https://evil.example/a.png" 1x)""",
    """background-image:image-set(url(https://evil.example/a.png) 1x)""",
    """background-image:url()""",
])
def test_background_images_only_from_own_uploads(style):
    out = clean(f"<div style='{style}'>x</div>")
    assert 'evil.example' not in out
    assert 'url' not in out


@pytest.mark.parametrize('style', [
    'background-image:url(/api/uploads/a.webp)',
    """background-image:url("/api/uploads/a.webp")""",
    """background:#000 url("/api/uploads/a.webp") no-repeat""",
])
def test_keeps_own_upload_backgrounds(style):
    # The header node's background image; browsers write the quoted form.
    assert '/api/uploads/a.webp' in clean(f"<div style='{style}'>x</div>")


def test_only_decorative_pointer_events():
    assert 'pointer-events' in clean('<div style="pointer-events:none">x</div>')
    assert 'pointer-events' not in clean('<div style="pointer-events:auto;position:absolute">x</div>')


@pytest.mark.parametrize('src', [
    'https://www.youtube.com/embed/abc',
    'https://player.vimeo.com/video/1',
    'https://open.spotify.com/embed/track/1',
])
def test_keeps_allowed_embeds(src):
    assert src in clean(f'<iframe src="{src}"></iframe>')


def test_keeps_editor_markup():
    html = (
        '<header class="header-regular" data-layout="regular" data-button-url="/blog"><h1>Title</h1></header>'
        '<figure class="gallery"><div class="gallery-grid"><div class="gallery-row">'
        '<img src="/api/uploads/a.webp" alt="A" srcset="/api/uploads/a-400.webp 400w"></div></div>'
        '<figcaption>Cap</figcaption></figure>'
        '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>'
        '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a></p>'
    )
    out = clean(html)
    for kept in ('header-regular', 'data-button-url="/blog"', 'gallery-row', 'srcset=', '<table>', '<figcaption>', 'href="https://example.com"'):
        assert kept in out, kept


def test_deep_nesting_does_not_crash():
    style = 'background-image:' + 'image-set(' * 5000 + 'url(https://evil.example/x)' + ')' * 5000
    out = clean(f'<div style="{style}">x</div>')
    assert 'evil.example' not in out


def test_rejects_non_string():
    with pytest.raises(ValueError):
        clean(['<p>x</p>'])
    assert clean('') == ''
    assert clean(None) is None
