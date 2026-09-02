import { useCodeBlockCopy } from '../hooks/useCodeBlockCopy'

// Drop this alongside any container that renders editor HTML (blog posts,
// admin-editable page-text fields) to wire up '.code-block-copy' buttons
// and show a "Code copied" toast (via the shared ToastProvider — stacks
// correctly with any other toast showing on the same page, e.g. ShareButton's
// "Link copied").
export default function CodeBlockCopyToast({ containerRef, contentKey }) {
  useCodeBlockCopy(containerRef, contentKey)
  return null
}
