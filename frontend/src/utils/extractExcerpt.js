// Shared by AdminBlogEditorPage.jsx (post excerpt) and
// AdminPageContentEditor.jsx (page meta description) — both auto-derive a
// short summary from rich-text HTML the same way: first non-empty <p> or
// <li>. Extracted here rather than duplicated so the two stay identical.
export function extractExcerpt(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const tag of ['p', 'li']) {
    const el = doc.querySelector(tag)
    if (el) {
      const text = el.textContent.trim()
      if (text) return text
    }
  }
  return ''
}
