import { Fragment, useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, GripVertical, Pencil, Check, Trash2, Plus, X, ExternalLink, EyeOff, MoreHorizontal } from 'lucide-react'
import { PageShell, EditableCard } from '../../components/admin/AdminPage'
import DocsPagePicker from '../../components/admin/DocsPagePicker'
import RoleGuard from '../../components/admin/RoleGuard'
import Popover from '../../components/ui/Popover'
import { Tooltip } from '../../components/ui/Tooltip'

// Same helper as AdminSiteNavigationPage.jsx/AdminBlogCategoriesPage.jsx:
// moves the item at `from` so it lands just before what is currently index
// `to` (0..length, where `length` means "at the very end").
function reorder(list, from, to) {
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(from < to ? to - 1 : to, 0, moved)
  return next
}

let newRowCounter = 0
function newRowKey() {
  newRowCounter += 1
  return `new-${newRowCounter}`
}

// `keyById` maps a saved item id to the client row key it was saved from.
// EditableCard only re-syncs its local copy from savedValues while it's out
// of edit mode, and a save swaps in fresh item ids while it's still in edit
// mode. Reusing the row keys keeps savedValues identical to the local copy,
// so the form doesn't look dirty right after a save.
function toRows(items, keyById) {
  return items.map(item => {
    const _key = keyById.get(item.id) ?? `i${item.id}`
    return item.kind === 'label'
      ? { _key, kind: 'label', label: item.label }
      : { _key, kind: 'page', page_id: item.page_id }
  })
}

const LABEL_HIDDEN = 'Hidden on site: no published pages below'

// Mirrors public_resolve.py's _docs_dict(): draft pages are hidden on the
// public site, and so is a label with no published page under it before
// the next label. Returns a Map of row index -> reason it's hidden.
function hiddenReasons(rows, pagesById) {
  const reasons = new Map()
  let labelIndex = null
  let labelHasPublished = false
  function closeLabel() {
    if (labelIndex !== null && !labelHasPublished) {
      reasons.set(labelIndex, LABEL_HIDDEN)
    }
  }
  rows.forEach((row, index) => {
    if (row.kind === 'label') {
      closeLabel()
      labelIndex = index
      labelHasPublished = false
      return
    }
    const page = pagesById.get(row.page_id)
    if (page && page.status === 'published') {
      labelHasPublished = true
    } else if (page) {
      reasons.set(index, 'Draft, hidden on site')
    }
  })
  closeLabel()
  return reasons
}

// For each row: whether it sits under a label (shown indented as that
// label's child), and whether it's the last row of a label's group (where
// that label's "Add page" button goes).
function groupInfo(rows) {
  let seenLabel = false
  return rows.map((row, index) => {
    if (row.kind === 'label') seenLabel = true
    const next = rows[index + 1]
    return {
      child: row.kind === 'page' && seenLabel,
      groupEnd: seenLabel && (!next || next.kind === 'label'),
    }
  })
}

function HiddenIcon({ reason, compact = false }) {
  if (!reason) return null
  return (
    <Tooltip content={reason}>
      <span className={`shrink-0 inline-flex self-center text-gray-400 ${compact ? 'p-0.5' : 'p-1.5'}`} aria-label={reason}>
        <EyeOff size={14} />
      </span>
    </Tooltip>
  )
}

export default function AdminDocsSectionEditorPage() {
  return (
    <RoleGuard minRole="editor" fallback="/admin">
      <AdminDocsSectionEditorPageContent />
    </RoleGuard>
  )
}

function AdminDocsSectionEditorPageContent() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [section, setSection] = useState(null)
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [renameError, setRenameError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const rowKeysRef = useRef(new Map())
  // Drag state lives outside EditableCard's local/set, same as
  // AdminSiteNavigationPage.jsx: transient interaction state, not a field.
  const [dragIndex, setDragIndex] = useState(null)
  const [dropIndex, setDropIndex] = useState(null)
  const renameInputRef = useRef(null)
  const cancelingRenameRef = useRef(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/docs/${id}`, { credentials: 'include' }),
      fetch('/api/admin/pages', { credentials: 'include' }),
    ]).then(async ([sectionRes, pagesRes]) => {
      if (sectionRes.status === 404) {
        setNotFound(true)
        return
      }
      // The page list is needed too: without it the picker would be empty
      // and every page row would look missing.
      if (!sectionRes.ok || !pagesRes.ok) throw new Error('load failed')
      setSection(await sectionRes.json())
      setPages(await pagesRes.json())
    })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (renaming) renameInputRef.current?.focus()
  }, [renaming])

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>
  if (loadError) {
    return (
      <PageShell title="Docs section">
        <Link to="/admin/docs" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={14} strokeWidth={1.5} />Docs
        </Link>
        <p className="text-sm text-red-500">Couldn't load this docs section. Try reloading the page.</p>
      </PageShell>
    )
  }
  if (notFound) {
    return (
      <PageShell title="Docs section not found">
        <Link to="/admin/docs" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} strokeWidth={1.5} />Docs
        </Link>
      </PageShell>
    )
  }

  const pagesById = new Map(pages.map(p => [p.id, p]))
  // Pages already in a different docs section can't be added here (a page
  // belongs to at most one section; admin_docs.py enforces it too).
  const inOtherSection = new Set(
    pages.filter(p => p.docs_section && p.docs_section.id !== section.id).map(p => p.id)
  )

  async function saveName() {
    if (cancelingRenameRef.current) {
      cancelingRenameRef.current = false
      return
    }
    const name = nameDraft.trim()
    if (!name || name === section.name) { setRenaming(false); setRenameError(''); return }
    const res = await fetch(`/api/admin/docs/${section.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    })
    const data = await res.json()
    if (!res.ok) {
      setRenameError(data.error || 'Failed to rename')
      return
    }
    setSection(data)
    setRenaming(false)
    setRenameError('')
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/admin/docs/${section.id}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) {
        navigate('/admin/docs', { state: { deleted: true } })
        return
      }
      const data = await res.json().catch(() => ({}))
      setDeleteError(data.error || 'Could not delete this docs section. Please try again.')
    } catch {
      setDeleteError('Could not reach the server. Please try again.')
    }
    setDeleting(false)
  }

  function closeDeleteModal() {
    setConfirmDelete(false)
    setDeleteError('')
  }

  async function handleSave(values) {
    const rows = values.rows
    if (rows.some(r => r.kind === 'label' && !(r.label || '').trim())) {
      throw new Error('Fill in or remove the blank section labels.')
    }
    if (rows.some(r => r.kind === 'page' && !r.page_id)) {
      throw new Error('Choose a page for every page row, or remove the empty ones.')
    }
    const items = rows.map(r => r.kind === 'label'
      ? { kind: 'label', label: r.label.trim() }
      : { kind: 'page', page_id: r.page_id }
    )
    const res = await fetch(`/api/admin/docs/${section.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ items }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Save failed')
    // The server returns items in the order they were sent.
    rowKeysRef.current = new Map(data.items.map((item, i) => [item.id, rows[i]._key]))
    setSection(data)
    // Keep each page's docs_section in sync so the picker's
    // "in another section" exclusions stay right without a reload.
    const memberIds = new Set(data.items.filter(i => i.kind === 'page').map(i => i.page_id))
    setPages(ps => ps.map(p => {
      if (memberIds.has(p.id)) return { ...p, docs_section: { id: data.id, name: data.name } }
      if (p.docs_section?.id === data.id) return { ...p, docs_section: null }
      return p
    }))
  }

  function handleDragStart(e, index) {
    setDragIndex(index)
    setDropIndex(index)
    // Without these, browsers show a "not allowed" cursor over valid drop
    // targets; dropEffect has to be set on every dragover too.
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  function handleRowDragOver(e, index) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const before = e.clientY < rect.top + rect.height / 2
    setDropIndex(before ? index : index + 1)
  }

  function handleContainerDragOver(e) {
    // Keeps the cursor as "move" (not "no-drop") over gaps between rows.
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(rows, set) {
    if (dragIndex !== null && dropIndex !== null && dropIndex !== dragIndex && dropIndex !== dragIndex + 1) {
      set('rows', reorder(rows, dragIndex, dropIndex))
    }
    setDragIndex(null)
    setDropIndex(null)
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDropIndex(null)
  }

  return (
    <PageShell title="Docs section">
      <div className="mb-6 -mt-2">
        <Link to="/admin/docs" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} strokeWidth={1.5} />Docs
        </Link>
      </div>

      <div className="mb-6 flex items-center gap-2">
        {renaming ? (
          <>
            <input
              ref={renameInputRef}
              type="text"
              value={nameDraft}
              maxLength={200}
              onChange={e => setNameDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') { cancelingRenameRef.current = true; setRenaming(false); setRenameError('') }
              }}
              onBlur={saveName}
              className="flex-1 min-w-0 text-lg font-semibold text-gray-900 border border-gray-300 rounded-md px-2.5 py-1 outline-none focus:border-gray-400"
            />
            <button onClick={saveName} className="shrink-0 text-gray-400 hover:text-gray-600 p-1.5 rounded hover:bg-gray-50 transition-colors" aria-label="Save name">
              <Check size={16} />
            </button>
          </>
        ) : (
          <>
            <h2 className="min-w-0 truncate text-lg font-semibold text-gray-900">{section.name}</h2>
            <button
              onClick={() => { setNameDraft(section.name); setRenaming(true) }}
              className="shrink-0 text-gray-400 hover:text-gray-600 p-1.5 rounded hover:bg-gray-50 transition-colors"
              aria-label="Rename docs section"
            >
              <Pencil size={14} />
            </button>
          </>
        )}
        <button
          onClick={() => setConfirmDelete(true)}
          className="ml-auto shrink-0 inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 px-2 py-1.5 rounded hover:bg-red-50 transition-colors"
        >
          <Trash2 size={14} /> Delete section
        </button>
      </div>
      {renameError && <p className="text-sm text-red-500 -mt-4 mb-4">{renameError}</p>}

      <EditableCard
        title="Pages and labels"
        description="Shown in this order in the docs sidebar. Labels group the pages below them."
        savedValues={{ rows: toRows(section.items, rowKeysRef.current) }}
        onSave={handleSave}
      >
        {({ editing, local, set }) => {
          const rows = local.rows
          const reasons = hiddenReasons(rows, pagesById)
          const groups = groupInfo(rows)
          const updateRow = (index, patch) => set('rows', rows.map((r, i) => i === index ? { ...r, ...patch } : r))
          const insertPage = at => set('rows', [
            ...rows.slice(0, at),
            { _key: newRowKey(), kind: 'page', page_id: null },
            ...rows.slice(at),
          ])

          if (!editing) {
            return rows.length === 0 ? (
              <p className="text-sm text-gray-400">No pages yet. Click Edit to add pages and section labels.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {rows.map((row, index) => {
                  if (row.kind === 'label') {
                    return (
                      <div key={row._key} className={`flex items-center gap-1 ${index > 0 ? 'mt-2' : ''}`}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{row.label}</p>
                        <HiddenIcon reason={reasons.get(index)} compact />
                      </div>
                    )
                  }
                  const page = pagesById.get(row.page_id)
                  return (
                    <div key={row._key} className={`flex items-baseline gap-2 min-w-0 ${groups[index].child ? 'pl-5' : ''}`}>
                      <p className="text-sm text-gray-900 truncate">{page?.title ?? 'Missing page'}</p>
                      {page && (
                        <a
                          href={`/${page.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 truncate"
                        >
                          /{page.slug}{page.status === 'published' && <ExternalLink size={11} />}
                        </a>
                      )}
                      <HiddenIcon reason={reasons.get(index)} compact />
                    </div>
                  )
                })}
              </div>
            )
          }

          // Pages already picked in another row of this list, so each page
          // can only be picked once.
          const usedHere = new Set(rows.filter(r => r.kind === 'page' && r.page_id).map(r => r.page_id))

          return (
            <>
              {rows.length === 0 ? (
                <p className="text-sm text-gray-400">Nothing here yet. Add a section label or a page below.</p>
              ) : (
                <div className="flex flex-col gap-1" onDragOver={handleContainerDragOver} onDrop={() => handleDrop(rows, set)}>
                  {rows.map((row, index) => {
                    const exclude = new Set(inOtherSection)
                    usedHere.forEach(pid => { if (pid !== row.page_id) exclude.add(pid) })
                    const { child, groupEnd } = groups[index]
                    const remove = () => set('rows', rows.filter((_, i) => i !== index))
                    return (
                      <Fragment key={row._key}>
                      <div className={`flex flex-col gap-1 ${child ? 'ml-8' : ''}`}>
                        {dragIndex !== null && dropIndex === index && (
                          <div className="h-0.5 rounded-full bg-gray-900 mx-1" />
                        )}
                        <div
                          onDragOver={e => handleRowDragOver(e, index)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md border ${
                            row.kind === 'label' ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'
                          } ${dragIndex === index ? 'opacity-40' : ''}`}
                        >
                          {/* Drag only from the handle, same as Site Navigation,
                              so selecting text in the inputs isn't hijacked. */}
                          <span
                            draggable
                            onDragStart={e => handleDragStart(e, index)}
                            onDragEnd={handleDragEnd}
                            className="flex-shrink-0 cursor-grab active:cursor-grabbing"
                          >
                            <GripVertical size={16} className="text-gray-300" />
                          </span>
                          <span className="hidden sm:inline w-12 shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                            {row.kind === 'label' ? 'Label' : 'Page'}
                          </span>
                          {row.kind === 'label' ? (
                            <input
                              value={row.label}
                              onChange={e => updateRow(index, { label: e.target.value })}
                              // Trimmed here (the server trims too) so the saved
                              // label matches the form; blur runs before a Save click.
                              onBlur={e => {
                                const trimmed = e.target.value.trim()
                                if (trimmed !== e.target.value) updateRow(index, { label: trimmed })
                              }}
                              placeholder="Section label"
                              maxLength={300}
                              className="flex-1 min-w-0 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-900 outline-none focus:border-gray-400"
                            />
                          ) : (
                            <DocsPagePicker
                              value={row.page_id}
                              onChange={pageId => updateRow(index, { page_id: pageId })}
                              pages={pages}
                              excludeIds={exclude}
                            />
                          )}
                          <HiddenIcon reason={reasons.get(index)} />
                          {/* Delete sits behind a menu so a stray click can't
                              remove a row; there's no confirmation step. */}
                          <Popover
                            align="end"
                            panelClassName="!min-w-[140px]"
                            trigger={
                              <button
                                type="button"
                                className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-1.5 rounded hover:bg-gray-100 transition-colors"
                                aria-label={row.kind === 'label' ? 'Label options' : 'Page options'}
                              >
                                <MoreHorizontal size={16} />
                              </button>
                            }
                          >
                            {({ close }) => (
                              <button
                                type="button"
                                onClick={() => { close(); remove() }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={14} /> Delete
                              </button>
                            )}
                          </Popover>
                        </div>
                      </div>
                      {groupEnd && (
                        <button
                          type="button"
                          onClick={() => insertPage(index + 1)}
                          className="ml-8 self-start inline-flex items-center gap-1.5 px-1 py-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
                        >
                          <Plus size={15} /> Add page
                        </button>
                      )}
                      </Fragment>
                    )
                  })}
                  {dragIndex !== null && dropIndex === rows.length && (
                    <div className="h-0.5 rounded-full bg-gray-900 mx-1" />
                  )}
                </div>
              )}

              <div className="flex items-center gap-4">
                <button
                  onClick={() => set('rows', [...rows, { _key: newRowKey(), kind: 'label', label: '' }])}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <Plus size={15} /> Add label
                </button>
                <button
                  onClick={() => insertPage(rows.length)}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <Plus size={15} /> Add page
                </button>
              </div>
            </>
          )
        }}
      </EditableCard>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeDeleteModal}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <button onClick={closeDeleteModal} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600" aria-label="Close">
              <X size={18} />
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Delete this docs section?</h2>
            <p className="text-sm text-gray-500 mb-6">
              "{section.name}" will be deleted. Its pages are not deleted; they just stop showing the docs sidebar.
            </p>
            {deleteError && <p className="text-sm text-red-500 -mt-3 mb-4">{deleteError}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={closeDeleteModal} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
