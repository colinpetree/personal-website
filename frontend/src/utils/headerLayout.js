// Which HeaderNode layout (if any) a page's content starts with.
//
// HeaderNode.exportDOM (components/admin/editor/nodes.jsx) writes every header
// as <header class="header-{layout}" ...>, and every Lexical editor in the
// admin (the Home/Blog/Projects/Contact/Payment/AI Demo content editor, the
// Pages editor and the blog post editor) saves its content through that same
// exportDOM, so this one check covers all of them.
//
// Two ways in, sharing one layout list:
// - leadingHeaderLayout(html) reads the stored HTML string. It works with no
//   DOM at all, so Navbar can decide its overlay state during render, which
//   means the prerendered HTML already has the navbar in its final position
//   (fixed, transparent) and the page doesn't shift when it hydrates.
// - headerLayoutOfElement(el) reads an element that's already in the page,
//   for code that runs after mount (useFullscreenHeaderNav's scroll hint).

const LAYOUTS = ['regular', 'wide', 'full', 'split', 'fullscreen', 'linear', 'linear-split']

// Layouts that own the top of the viewport: Navbar overlays these
// transparently (white text, no background) until the user scrolls.
// Regular and wide headers sit flush under a normal solid navbar instead.
export const OVERLAY_HEADER_LAYOUTS = ['full', 'split', 'fullscreen', 'linear', 'linear-split']

function layoutFromClassList(tokens) {
  for (const layout of LAYOUTS) {
    if (tokens.includes(`header-${layout}`)) return layout
  }
  return null
}

export function headerLayoutOfElement(el) {
  if (!el || el.tagName !== 'HEADER') return null
  return layoutFromClassList(Array.from(el.classList))
}

// The first opening tag in the string is the container's firstElementChild,
// matching what headerLayoutOfElement sees once the HTML is in the DOM:
// leading whitespace, text and comments are skipped, and no element can
// come before it. Attribute values are matched as quoted strings, so a ">"
// inside one (e.g. a header's data-button-text) can't end the tag early,
// and the class attribute is found in any position, since the contributor
// sanitizer (backend/sanitize_html.py) re-serializes the HTML.
//
// Only that one first tag is ever examined: the start is found with plain
// indexOf scans and the tag is matched once, anchored there (sticky `y`
// flag). This runs on every Navbar render and in the prerender build, so it
// must stay linear even for malformed input; a search that retried at every
// later "<" went quadratic (seconds) on content like "<a<a<a...".
const TAG_AT = /<([a-zA-Z][^\s/>]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/y
const CLASS_ATTR = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i
const LETTER = /[a-zA-Z]/

// Index of the first start tag ("<" + letter), skipping comments, or -1.
function firstTagStart(html) {
  let i = 0
  for (;;) {
    i = html.indexOf('<', i)
    if (i === -1) return -1
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4)
      if (end === -1) return -1
      i = end + 3
      continue
    }
    if (LETTER.test(html.charAt(i + 1))) return i
    i += 1
  }
}

export function leadingHeaderLayout(html) {
  if (typeof html !== 'string' || !html) return null
  const start = firstTagStart(html)
  if (start === -1) return null
  TAG_AT.lastIndex = start
  const match = TAG_AT.exec(html)
  if (!match || match[1].toLowerCase() !== 'header') return null
  const cls = CLASS_ATTR.exec(match[2] || '')
  if (!cls) return null
  const value = cls[1] ?? cls[2] ?? cls[3] ?? ''
  return layoutFromClassList(value.split(/\s+/).filter(Boolean))
}

export function startsWithOverlayHeader(html) {
  return OVERLAY_HEADER_LAYOUTS.includes(leadingHeaderLayout(html))
}
