import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, PanelRight } from 'lucide-react'
import RichTextEditor from '../../components/admin/editor'
import { Field, Textarea } from '../../components/admin/AdminPage'
import { Tooltip } from '../../components/ui/Tooltip'
import { useToast } from '../../components/admin/Toast'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { extractExcerpt } from '../../utils/extractExcerpt'

function countWords(html) {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent || ''
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length
}

export default function AdminPageContentEditor({ pageTitle, backTo, contentField, metaField }) {
  const { config, loading, save } = useAdminConfig()
  const { addToast } = useToast()

  const [contentHtml, setContentHtml] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [loaded, setLoaded] = useState(false)

  const editorRef = useRef(null)
  // Same pattern as AdminBlogEditorPage.jsx's excerptEdited: once the admin
  // types their own meta description, stop overwriting it on every content
  // edit. Starts true when the saved value already looks hand-written (i.e.
  // doesn't match what auto-extraction would currently produce) so an
  // existing manual description isn't clobbered the moment the page loads.
  const metaEdited = useRef(false)

  useEffect(() => {
    if (loading || loaded || !config) return
    const html = config[contentField] || ''
    const savedMeta = config[metaField] || ''
    setContentHtml(html)
    setMetaDescription(savedMeta)
    metaEdited.current = !!(savedMeta && savedMeta !== extractExcerpt(html))
    setLoaded(true)
  }, [loading, loaded, config, contentField, metaField])

  function handleContentChange(html) {
    setContentHtml(html)
    if (!metaEdited.current) {
      setMetaDescription(extractExcerpt(html))
    }
    setIsDirty(true)
  }

  function handleMetaChange(e) {
    metaEdited.current = true
    setMetaDescription(e.target.value)
    setIsDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await save({ [contentField]: contentHtml, [metaField]: metaDescription })
      setIsDirty(false)
      addToast({ message: `${pageTitle} content saved` })
    } catch (err) {
      addToast({ message: err.message || 'Failed to save content' })
    } finally {
      setSaving(false)
    }
  }

  if (loading || !loaded) return <div className="p-8 text-gray-400">Loading…</div>

  const wordCount = countWords(contentHtml)

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="sticky top-0 z-[10000] flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-200 shrink-0">
        <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 shrink-0">
          <ArrowLeft size={14} strokeWidth={1.5} />{pageTitle}
        </Link>
        <span className="text-sm font-medium text-gray-700">Edit content</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="rounded-md bg-white px-4 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <Tooltip content={panelOpen ? 'Hide settings' : 'Show settings'}>
            <button
              onClick={() => setPanelOpen(v => !v)}
              className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <PanelRight size={16} strokeWidth={1.5} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Editor area */}
        <div className="flex-1 overflow-y-auto bg-white relative editor-scroll-area pt-10">
          <RichTextEditor
            ref={editorRef}
            initialHtml={contentHtml}
            onChange={handleContentChange}
            placeholder=""
          />
          <div style={{ height: '33vh' }} onClick={() => editorRef.current?.focusAtEnd()} />
        </div>

        {/* Backdrop — mobile only, dismisses the overlay sidebar */}
        {panelOpen && (
          <div
            className="lg:hidden absolute inset-0 z-40 bg-black/20"
            onClick={() => setPanelOpen(false)}
          />
        )}

        {/* Settings sidebar — overlay on mobile, push on md+ */}
        <div className={`absolute lg:static inset-y-0 right-0 z-50 lg:z-auto shrink-0 overflow-hidden transition-all duration-200 ${panelOpen ? 'w-80' : 'w-0'}`}>
          <div className="w-80 h-full border-l border-gray-200 bg-gray-50 overflow-y-auto p-4 flex flex-col gap-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Page settings</h3>

            <Field label="Meta description">
              <Textarea
                value={metaDescription}
                onChange={handleMetaChange}
                rows={3}
                placeholder="SEO description…"
              />
            </Field>
          </div>
        </div>
      </div>

      {/* Word count */}
      <div className="fixed bottom-4 pointer-events-none transition-all duration-200" style={{ right: panelOpen ? '320px' : '16px' }}>
        <span className="text-xs text-gray-300 pr-4">
          {wordCount === 1 ? '1 word' : `${wordCount} words`}
        </span>
      </div>
    </div>
  )
}
