import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { ArrowLeft, ExternalLink, PanelRight, X, Type, BookA, BookType, RectangleHorizontal, RectangleVertical } from 'lucide-react'
import RichTextEditor from '../../components/admin/editor'
import { Field, Textarea, Toggle } from '../../components/admin/AdminPage'
import SlugUrlField from '../../components/admin/SlugUrlField'
import { Tooltip } from '../../components/ui/Tooltip'
import { useToast } from '../../context/ToastContext'
import { useSiteConfig } from '../../hooks/useSiteConfig'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { getInitials } from '../../utils/getInitials'
import { extractExcerpt } from '../../utils/extractExcerpt'

const AUTOSAVE_DELAY = 2000

const toggleGroup = 'flex self-start gap-0.5 bg-gray-100 rounded-lg p-0.5'
const toggleButton = (active) => `p-1.5 rounded-md transition-colors ${active ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function countWords(html) {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent || ''
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length
}

// ── Publish Dialog ────────────────────────────────────────────────────────────

function PublishDialog({ onClose, onConfirm, saving }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Publish page?</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <p className="text-sm text-gray-500">Your page will be published on your site.</p>
        <div className="flex items-center gap-3">
          <button
            onClick={onConfirm}
            disabled={saving}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Publishing…' : 'Publish page'}
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Unpublish Dialog ──────────────────────────────────────────────────────────

function RevertDialog({ onClose, onConfirm, saving }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Unpublish</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-base font-medium text-gray-800">This page has been published</p>
          <p className="text-sm text-gray-500">Unpublishing reverts it to a private draft. It will no longer be reachable on your site.</p>
        </div>
        <button
          onClick={onConfirm}
          disabled={saving}
          className="self-start rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-green-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Reverting…' : 'Unpublish and revert to a private draft'}
        </button>
      </div>
    </div>
  )
}

// ── Delete Confirmation Dialog ────────────────────────────────────────────────

function DeleteDialog({ onClose, onConfirm, deleting }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 flex flex-col gap-4">
        <h3 className="font-semibold text-gray-900">Delete page?</h3>
        <p className="text-sm text-gray-500">This will permanently delete the page.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Editor ───────────────────────────────────────────────────────────────

export default function AdminPageEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { config: siteConfig } = useSiteConfig()
  const { admin } = useAdminAuth()
  const [owner, setOwner] = useState(null)

  useEffect(() => {
    fetch('/api/admin/accounts/owner', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(setOwner)
      .catch(() => {})
  }, [])

  const [page, setPage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('draft')

  const [draftStatus, setDraftStatus] = useState('new') // new | draft | saving | draft-saved
  const [isDirty, setIsDirty] = useState(false)
  const [updateSaving, setUpdateSaving] = useState(false)

  const [publishDialog, setPublishDialog] = useState(false)
  const [publishSaving, setPublishSaving] = useState(false)
  const [revertDialog, setRevertDialog] = useState(false)
  const [revertSaving, setRevertSaving] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [panelOpen, setPanelOpen] = useState(true)

  const [title, setTitle] = useState('')
  const [contentHtml, setContentHtml] = useState('')
  const [slug, setSlug] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [scrollableNavEnabled, setScrollableNavEnabled] = useState(false)
  const [pageWidth, setPageWidth] = useState('regular')
  const [fontFamily, setFontFamily] = useState('default')

  const autosaveTimer = useRef(null)
  const pendingFields = useRef({})
  const slugEdited = useRef(false)
  // Same pattern as AdminPageContentEditor.jsx's metaEdited: auto-fill meta
  // description from content until the admin types their own — starts true
  // when the saved value already looks hand-written (doesn't match what
  // auto-extraction would currently produce) so an existing manual
  // description isn't clobbered the moment the page loads.
  const metaEdited = useRef(false)
  // Suppresses repeat toasts for the same ongoing failure — scheduleSave
  // retries every AUTOSAVE_DELAY regardless of whether the last attempt
  // failed, so without this a persistent failure (e.g. the page got
  // published elsewhere mid-edit, now permanently 403ing) would pop a new
  // toast every ~2s for as long as the admin keeps typing. Reset to false
  // the moment any save succeeds again.
  const saveErrorShown = useRef(false)
  const editorRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const titleRef = useRef(null)

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  useEffect(() => {
    fetch(`/api/admin/pages/${id}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setPage(data)
        const isNew = (data.title === 'Untitled' || !data.title) && !data.content_html
        setTitle(isNew ? '' : data.title || '')
        setSlug(data.slug || '')
        slugEdited.current = !/^untitled(-\d+)?$/.test(data.slug || '')
        setMetaDescription(data.meta_description || '')
        metaEdited.current = !!(data.meta_description && data.meta_description !== extractExcerpt(data.content_html || ''))
        setScrollableNavEnabled(!!data.scrollable_nav_enabled)
        setPageWidth(data.page_width || 'regular')
        setFontFamily(data.font_family || 'default')
        const s = data.status || 'draft'
        setStatus(s)
        setContentHtml(data.content_html || '')
        setDraftStatus(s === 'draft' ? (isNew ? 'new' : 'draft') : 'idle')
        setLoading(false)
        // Contributors can't save changes to a page once it's published
        // (see update_page), and it's already live on the public site
        // regardless — sitting in the editor at that point is just a dead
        // end, so redirect away entirely rather than showing a read-only
        // view nobody asked for.
        if (admin?.role === 'contributor' && (data.author_id !== admin.id || (data.status || 'draft') !== 'draft')) {
          navigate('/admin/pages', { replace: true })
        }
      })
  }, [id])

  // ── Save helper ──────────────────────────────────────────────────────────────

  const save = useCallback(async (fields) => {
    const res = await fetch(`/api/admin/pages/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(fields),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Save failed')
    saveErrorShown.current = false
    setPage(data)
    setSlug(data.slug)
    return data
  }, [id])

  // ── Auto-save (draft only) ───────────────────────────────────────────────────

  function scheduleSave(fields) {
    if (status !== 'draft') return
    setDraftStatus('draft')
    pendingFields.current = { ...pendingFields.current, ...fields }
    clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(async () => {
      const savingIndicatorTimer = setTimeout(() => setDraftStatus('saving'), 200)
      try {
        await save(pendingFields.current)
        pendingFields.current = {}
        clearTimeout(savingIndicatorTimer)
        setDraftStatus('draft-saved')
      } catch (err) {
        clearTimeout(savingIndicatorTimer)
        setDraftStatus('draft')
        if (!saveErrorShown.current) {
          saveErrorShown.current = true
          addToast({ message: err.message || 'Failed to save' })
        }
      }
    }, AUTOSAVE_DELAY)
  }

  // ── Field handlers ───────────────────────────────────────────────────────────

  function markDirty() {
    if (status !== 'draft') setIsDirty(true)
  }

  function handleTitleChange(e) {
    const newTitle = e.target.value
    setTitle(newTitle)
    markDirty()
    if (!slugEdited.current) {
      const autoSlug = slugify(newTitle)
      setSlug(autoSlug)
      scheduleSave({ title: newTitle, slug: autoSlug })
    } else {
      scheduleSave({ title: newTitle })
    }
  }

  function handleSlugChange(e) {
    slugEdited.current = true
    setSlug(e.target.value)
    markDirty()
  }

  function handleContentChange(html) {
    setContentHtml(html)
    markDirty()
    if (!metaEdited.current) {
      const autoMeta = extractExcerpt(html)
      setMetaDescription(autoMeta)
      scheduleSave({ content_html: html, meta_description: autoMeta })
    } else {
      scheduleSave({ content_html: html })
    }
  }

  function handleMetaChange(e) {
    metaEdited.current = true
    setMetaDescription(e.target.value)
    markDirty()
  }

  function handleSidebarSave(overrideFields = {}) {
    if (status !== 'draft') return
    clearTimeout(autosaveTimer.current)
    save({
      slug,
      meta_description: metaDescription,
      scrollable_nav_enabled: scrollableNavEnabled,
      page_width: pageWidth,
      font_family: fontFamily,
      ...overrideFields,
    }).catch(err => {
      if (!saveErrorShown.current) {
        saveErrorShown.current = true
        addToast({ message: err.message || 'Failed to save' })
      }
    })
  }

  // ── Publish flow ─────────────────────────────────────────────────────────────

  async function handlePublishConfirm() {
    slugEdited.current = true
    setPublishSaving(true)
    try {
      const data = await save({
        status: 'published',
        title,
        slug,
        content_html: contentHtml,
        meta_description: metaDescription,
        scrollable_nav_enabled: scrollableNavEnabled,
        page_width: pageWidth,
        font_family: fontFamily,
      })
      setPublishDialog(false)
      navigate('/admin/pages', {
        state: {
          publishConfirm: { slug: data.slug, title: data.title },
        },
      })
    } catch (err) {
      addToast({ message: err.message || 'Failed to publish page' })
      setPublishSaving(false)
    }
  }

  // ── Revert (unpublish) ────────────────────────────────────────────────────────

  async function handleRevertConfirm() {
    setRevertSaving(true)
    try {
      await save({ status: 'draft' })
      setStatus('draft')
      setDraftStatus('draft')
      setRevertDialog(false)
      setIsDirty(false)
      addToast({ message: 'Page reverted to a draft.' })
    } catch {
      setRevertSaving(false)
    }
  }

  // ── Update (published) ────────────────────────────────────────────────────────

  async function handleUpdate() {
    const savingIndicatorTimer = setTimeout(() => setUpdateSaving(true), 200)
    try {
      const data = await save({
        title,
        slug,
        content_html: contentHtml,
        meta_description: metaDescription,
        scrollable_nav_enabled: scrollableNavEnabled,
        page_width: pageWidth,
        font_family: fontFamily,
      })
      setIsDirty(false)
      addToast({
        message: 'Page updated',
        subtext: 'View on site',
        subtextHref: `/${data.slug}`,
      })
    } catch (err) {
      addToast({ message: err.message || 'Failed to update page' })
    } finally {
      clearTimeout(savingIndicatorTimer)
      setUpdateSaving(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/admin/pages/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      addToast({ message: data.error || 'Failed to delete page' })
      setDeleting(false)
      return
    }
    navigate('/admin/pages', { state: { deleted: true } })
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  const wordCount = countWords(contentHtml)

  // ── Header status indicator ──────────────────────────────────────────────────

  function HeaderStatus() {
    if (status === 'published') {
      return (
        <a
          href={`/${page?.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 hover:font-semibold transition-all"
        >
          <span className="translate-y-[2px]">Published</span>
          <ExternalLink size={12} className="shrink-0" />
        </a>
      )
    }
    if (draftStatus === 'new') return <span className="text-xs leading-none text-gray-400 translate-y-[2px]">New</span>
    if (draftStatus === 'saving') return <span className="text-xs leading-none text-gray-400 translate-y-[2px]">Saving...</span>
    if (draftStatus === 'draft-saved') return <span className="text-xs leading-none text-gray-400 translate-y-[2px]">Draft - Saved</span>
    if (draftStatus === 'draft') return <span className="text-xs leading-none text-gray-400 translate-y-[2px]">Draft</span>
    return null
  }

  // ── Action buttons ───────────────────────────────────────────────────────────

  function ActionButtons() {
    const isContributor = admin?.role === 'contributor'

    if (status === 'draft') {
      return (
        <button
          onClick={isContributor ? undefined : () => setPublishDialog(true)}
          disabled={isContributor}
          title={isContributor ? 'Editors must review and publish your page' : undefined}
          className={`rounded-md bg-white px-4 py-1.5 text-sm font-medium transition-colors ${
            isContributor
              ? 'text-gray-400 opacity-50'
              : 'text-green-600 hover:bg-gray-100'
          }`}
        >
          Publish
        </button>
      )
    }

    return (
      <>
        <button
          onClick={handleUpdate}
          disabled={!isDirty || updateSaving}
          className="rounded-md bg-white px-4 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-40 transition-colors"
        >
          {updateSaving ? 'Updating...' : 'Update'}
        </button>
        <button
          onClick={isContributor ? undefined : () => setRevertDialog(true)}
          disabled={isContributor}
          title={isContributor ? 'Only Editors and above can unpublish pages' : undefined}
          className={`rounded-md bg-white px-4 py-1.5 text-sm font-medium transition-colors ${
            isContributor
              ? 'text-gray-400 opacity-50'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Unpublish
        </button>
      </>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="sticky top-0 z-[10000] flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-200 shrink-0">
        <Link to="/admin/pages" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 shrink-0">
          <ArrowLeft size={14} strokeWidth={1.5} />Pages
        </Link>
        <HeaderStatus />
        <div className="flex-1" />
        <div className="flex items-center gap-2 shrink-0">
          <ActionButtons />
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
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-white relative editor-scroll-area">
          <div className="max-w-3xl mx-auto px-6 pt-10">
            <textarea
              ref={titleRef}
              rows={1}
              value={title}
              onChange={handleTitleChange}
              placeholder="Page title"
              className="w-full resize-none overflow-hidden text-[34px] lg:text-[42px] font-bold text-gray-900 outline-none border-none bg-transparent placeholder-gray-300 leading-[42.5px] lg:leading-[52.5px] pb-4"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  editorRef.current?.focusAtStart()
                }
              }}
            />
          </div>
          <RichTextEditor
            ref={editorRef}
            key={page?.id}
            initialHtml={contentHtml}
            onChange={handleContentChange}
            placeholder=""
            fontFamily={fontFamily}
          />
          <div style={{ height: '33vh' }} onClick={() => {
            editorRef.current?.focusAtEnd()
            requestAnimationFrame(() => {
              scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight })
            })
          }} />
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

          {/* Author (display-only, always the Owner) */}
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-gray-700">Author</p>
            {owner ? (
              <div className="flex items-center gap-2">
                {owner.avatar_filename ? (
                  <img src={`/api/uploads/${owner.avatar_filename}`} className="w-6 h-6 rounded-full object-cover" alt={owner.full_name} />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center leading-none text-[10px] font-semibold text-gray-600">
                    <span className="scale-125">{getInitials(owner.full_name)}</span>
                  </div>
                )}
                <span className="text-sm text-gray-900">{owner.full_name}</span>
              </div>
            ) : (
              <span className="text-sm text-gray-400">—</span>
            )}
          </div>

          <Field label="Page URL">
            <SlugUrlField
              value={slug}
              onChange={handleSlugChange}
              onBlur={() => handleSidebarSave()}
              domain={siteConfig?.domain}
              className="text-xs"
            />
          </Field>

          <Field label="Meta description">
            <Textarea
              value={metaDescription}
              onChange={handleMetaChange}
              onBlur={() => handleSidebarSave()}
              rows={3}
              placeholder="SEO description…"
            />
          </Field>

          <Field label="Page width">
            <div className={toggleGroup}>
              <Tooltip content="Regular width">
                <button
                  type="button"
                  className={toggleButton(pageWidth === 'regular')}
                  onClick={() => { setPageWidth('regular'); markDirty(); handleSidebarSave({ page_width: 'regular' }) }}
                >
                  <RectangleHorizontal size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Narrow width">
                <button
                  type="button"
                  className={toggleButton(pageWidth === 'narrow')}
                  onClick={() => { setPageWidth('narrow'); markDirty(); handleSidebarSave({ page_width: 'narrow' }) }}
                >
                  <RectangleVertical size={15} />
                </button>
              </Tooltip>
            </div>
          </Field>

          <Field label="Font family">
            <div className={toggleGroup}>
              <Tooltip content="Default">
                <button
                  type="button"
                  className={toggleButton(fontFamily === 'default')}
                  onClick={() => { setFontFamily('default'); markDirty(); handleSidebarSave({ font_family: 'default' }) }}
                >
                  <Type size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Sans-serif">
                <button
                  type="button"
                  className={toggleButton(fontFamily === 'sans')}
                  onClick={() => { setFontFamily('sans'); markDirty(); handleSidebarSave({ font_family: 'sans' }) }}
                >
                  <BookA size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Serif">
                <button
                  type="button"
                  className={toggleButton(fontFamily === 'serif')}
                  onClick={() => { setFontFamily('serif'); markDirty(); handleSidebarSave({ font_family: 'serif' }) }}
                >
                  <BookType size={15} />
                </button>
              </Tooltip>
            </div>
          </Field>

          <Toggle
            label="Scrollable header navigation"
            checked={scrollableNavEnabled}
            onChange={v => { setScrollableNavEnabled(v); markDirty(); handleSidebarSave({ scrollable_nav_enabled: v }) }}
          />

          {page && (
            <button
              onClick={() => setDeleteDialog(true)}
              className="w-full rounded-md border border-red-400 px-3 py-2 text-xs text-center text-red-500 hover:bg-red-50 transition-colors block"
            >
              Delete page
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Dialogs */}
      {publishDialog && (
        <PublishDialog
          onClose={() => setPublishDialog(false)}
          onConfirm={handlePublishConfirm}
          saving={publishSaving}
        />
      )}

      {revertDialog && (
        <RevertDialog
          onClose={() => setRevertDialog(false)}
          onConfirm={handleRevertConfirm}
          saving={revertSaving}
        />
      )}

      {deleteDialog && (
        <DeleteDialog
          onClose={() => setDeleteDialog(false)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}

      {/* Word count */}
      <div className="fixed bottom-4 pointer-events-none transition-all duration-200" style={{ right: panelOpen ? '320px' : '16px' }}>
        <span className="text-xs text-gray-300 pr-4">
          {wordCount === 1 ? '1 word' : `${wordCount} words`}
        </span>
      </div>
    </div>
  )
}
