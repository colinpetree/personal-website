import { useEffect } from 'react'
import { useToast } from '../context/ToastContext'

// Mirrors CodeBlockNode.exportDOM()'s COPY_ICON/CHECK_ICON in
// components/admin/editor/nodes.jsx — kept in sync manually since the two
// live in different bundles (editor vs. public site).
const CODE_COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
const CODE_COPY_CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`

// Delegated click handler for code-block copy buttons — the editor's
// exportDOM() deliberately emits no inline onclick (blocked by the site's
// CSP script-src), so this is the only thing that makes '.code-block-copy'
// buttons functional in any rendered editor content (blog posts, and every
// admin-editable page-text field: home/about/contact/projects/etc).
// `contentKey` should be the HTML string (or other value) that changes
// whenever the rendered content changes, so the listener re-binds against
// the new DOM.
export function useCodeBlockCopy(containerRef, contentKey) {
  const { addToast } = useToast()

  useEffect(() => {
    const container = containerRef.current
    if (!container || !contentKey) return

    function onClick(e) {
      const btn = e.target.closest('.code-block-copy')
      if (!btn || !container.contains(btn)) return
      const codeEl = btn.closest('.code-block-wrapper')?.querySelector('.code-block')
      if (!codeEl || !navigator.clipboard) return
      navigator.clipboard.writeText(codeEl.textContent).then(() => {
        btn.innerHTML = CODE_COPY_CHECK_ICON
        addToast('Code copied')
        setTimeout(() => { btn.innerHTML = CODE_COPY_ICON }, 1500)
      }).catch(() => {})
    }

    container.addEventListener('click', onClick)
    return () => container.removeEventListener('click', onClick)
  }, [containerRef, contentKey, addToast])
}
