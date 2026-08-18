import html
import re

_TAG_BLOCK_RE = re.compile(r'<(script|style)[^>]*>.*?</\1>', re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r'<[^>]+>')
_WHITESPACE_RE = re.compile(r'\s+')


def strip_html(value):
    """Convert HTML content to plain text: drop script/style blocks entirely,
    strip remaining tags, unescape entities, and collapse whitespace."""
    if not value:
        return ''
    text = _TAG_BLOCK_RE.sub(' ', value)
    text = _TAG_RE.sub(' ', text)
    text = html.unescape(text)
    return _WHITESPACE_RE.sub(' ', text).strip()


def make_snippet(plain_text, tokens, radius=100, max_len=220):
    """Build a display snippet around the first matching token in plain_text,
    falling back to a leading excerpt if no token appears in it."""
    if not plain_text:
        return ''
    lower = plain_text.lower()
    match_index = -1
    for token in tokens:
        idx = lower.find(token)
        if idx != -1 and (match_index == -1 or idx < match_index):
            match_index = idx
    if match_index == -1:
        snippet = plain_text[:max_len]
        return snippet + ('…' if len(plain_text) > max_len else '')

    start = max(0, match_index - radius)
    end = min(len(plain_text), match_index + radius)
    snippet = plain_text[start:end]
    if start > 0:
        snippet = '…' + snippet
    if end < len(plain_text):
        snippet = snippet + '…'
    return snippet
