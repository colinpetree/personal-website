import { useState } from 'react'
import { GripVertical, Trash2, Plus, ListPlus } from 'lucide-react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { useInternalLinks } from '../../hooks/useInternalLinks'
import { PageShell, EditableCard, Field, Input } from '../../components/admin/AdminPage'
import NavLinkAutocomplete from '../../components/admin/NavLinkAutocomplete'
import RoleGuard from '../../components/admin/RoleGuard'
import { Tooltip } from '../../components/ui/Tooltip'

// Moves the item at `from` so it lands just before what is currently index
// `to` (0..length, where `length` means "at the very end"). Same helper as
// ReorderNavModal.jsx/AdminBlogCategoriesPage.jsx used for their own
// drag-reorder lists.
function reorder(list, from, to) {
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(from < to ? to - 1 : to, 0, moved)
  return next
}

// Exactly one of label/URL filled in: easy to miss, and it won't render.
function isPartial(label, url) {
  return (label && !url) || (!label && url)
}

const inputClass = 'flex-1 min-w-0 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-400'

export default function AdminSiteNavigationPage() {
  return (
    <RoleGuard minRole="editor" fallback="/admin">
      <AdminSiteNavigationPageContent />
    </RoleGuard>
  )
}

function AdminSiteNavigationPageContent() {
  const { config, loading, save } = useAdminConfig()
  const { links } = useInternalLinks()
  // Drag state lives outside EditableCard's local/set: it's transient
  // interaction state, not a saved field, and only ever matters while
  // editing. `parent` is null for a top-level link, or the index of the
  // top-level link a sub-link belongs to. Rows only reorder within their own
  // level (and own parent): dragging between levels isn't supported.
  const [dragFrom, setDragFrom] = useState(null)
  // Where the drop-position line renders: { parent, index }, index 0..length,
  // where length means "after the last row" of that level.
  const [dropAt, setDropAt] = useState(null)
  // Set (with a `resolve` callback) while the "some links are incomplete"
  // warning modal is open; onSave awaits this promise before deciding
  // whether to actually save (see handleEditableSave below).
  const [pendingIncomplete, setPendingIncomplete] = useState(null)

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  async function handleEditableSave(values) {
    // Fully blank rows (no label AND no URL, e.g. an unfinished "+ Add
    // link" click) are dropped silently below, same as always. A PARTIAL
    // row (only one of the two filled in) is different: it's easy to not
    // notice you left a URL blank, and a label-only or URL-only entry
    // won't render as a link at all once saved, so that case blocks the
    // save behind a confirmation instead of silently discarding it.
    //
    // A link with at least one complete sub-link is a menu: it only needs a
    // label, and any URL typed before it got sub-links is dropped. A link
    // whose sub-links are all blank goes back to being a plain link.
    let partial = false
    const cleaned = []
    for (const item of values.primary_navigation) {
      const label = (item.label || '').trim()
      const url = (item.url || '').trim()
      const children = (item.children || []).map(child => ({
        label: (child.label || '').trim(),
        url: (child.url || '').trim(),
      }))
      if (children.some(child => isPartial(child.label, child.url))) partial = true
      const kept = children.filter(child => child.label && child.url)
      if (kept.length) {
        if (!label) partial = true
        else cleaned.push({ label, url: '', children: kept })
      } else {
        if (isPartial(label, url)) partial = true
        else if (label && url) cleaned.push({ label, url })
      }
    }
    if (partial) {
      const proceed = await new Promise(resolve => setPendingIncomplete({ resolve }))
      setPendingIncomplete(null)
      if (!proceed) {
        throw new Error('Add the missing label or URL, or confirm to discard those entries.')
      }
    }
    return save({ primary_navigation: cleaned, site_title_link: (values.site_title_link || '').trim() || '/' })
  }

  function handleDragStart(e, parent, index, label) {
    setDragFrom({ parent, index })
    setDropAt({ parent, index })
    // Without these, browsers show a "not allowed" cursor over valid drop
    // targets; dropEffect has to be set on every dragover too, not just here.
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', label)
  }

  function handleRowDragOver(e, parent, index) {
    // A row of another level isn't a valid target for the dragged row.
    if (!dragFrom || dragFrom.parent !== parent) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const before = e.clientY < rect.top + rect.height / 2
    setDropAt({ parent, index: before ? index : index + 1 })
  }

  function handleContainerDragOver(e) {
    // Keeps the cursor as "move" (not "no-drop") over gaps between rows.
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e, items, set) {
    e.preventDefault()
    if (dragFrom && dropAt && dragFrom.parent === dropAt.parent
      && dropAt.index !== dragFrom.index && dropAt.index !== dragFrom.index + 1) {
      if (dragFrom.parent === null) {
        set('primary_navigation', reorder(items, dragFrom.index, dropAt.index))
      } else {
        const p = dragFrom.parent
        set('primary_navigation', items.map((it, i) => (
          i === p ? { ...it, children: reorder(it.children, dragFrom.index, dropAt.index) } : it
        )))
      }
    }
    handleDragEnd()
  }

  function handleDragEnd() {
    setDragFrom(null)
    setDropAt(null)
  }

  function dropLine(parent, index) {
    return dragFrom !== null && dropAt?.parent === parent && dropAt.index === index
      ? <div className="h-0.5 rounded-full bg-gray-900 mx-1" />
      : null
  }

  return (
    <PageShell title="Site Navigation">
      <EditableCard
        title="Primary navigation"
        description="Shown in the site header, plus the site title link. A link with sub-links opens a menu instead of going to a page."
        savedValues={{
          primary_navigation: config?.primary_navigation ?? [],
          site_title_link: config?.site_title_link || '/',
        }}
        onSave={handleEditableSave}
      >
        {({ editing, local, set }) => {
          const items = local.primary_navigation
          const setItem = (index, patch) =>
            set('primary_navigation', items.map((it, i) => (i === index ? { ...it, ...patch } : it)))
          const setChild = (index, childIndex, patch) =>
            setItem(index, { children: items[index].children.map((c, j) => (j === childIndex ? { ...c, ...patch } : c)) })

          return editing ? (
            <>
              {items.length === 0 ? (
                <p className="text-sm text-gray-400">No links yet. Add your first one below.</p>
              ) : (
                <div className="flex flex-col gap-1" onDragOver={handleContainerDragOver} onDrop={e => handleDrop(e, items, set)}>
                  {items.map((item, index) => {
                    const children = item.children || []
                    const isMenu = children.length > 0
                    return (
                      <div key={index} className="flex flex-col gap-1">
                        {dropLine(null, index)}
                        <div
                          onDragOver={e => handleRowDragOver(e, null, index)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 bg-white ${
                            dragFrom?.parent === null && dragFrom.index === index ? 'opacity-40' : ''
                          }`}
                        >
                          {/* draggable/onDragStart/onDragEnd live only on the
                              handle, not the whole row; otherwise starting a
                              text selection drag inside the label/URL inputs
                              gets hijacked into a row-reorder drag instead. */}
                          <span
                            draggable
                            onDragStart={e => handleDragStart(e, null, index, item.label)}
                            onDragEnd={handleDragEnd}
                            className="flex-shrink-0 cursor-grab active:cursor-grabbing"
                          >
                            <GripVertical size={16} className="text-gray-300" />
                          </span>
                          <input
                            value={item.label}
                            onChange={e => setItem(index, { label: e.target.value })}
                            placeholder="Label"
                            className={inputClass}
                          />
                          {/* A menu has no link of its own. Its URL stays in
                              local state (just hidden), so removing every
                              sub-link brings it back; save drops it. */}
                          {isMenu ? (
                            <div className="flex-1 min-w-0 rounded-md border border-dashed border-gray-200 px-2.5 py-1.5 text-sm text-gray-400 truncate">
                              Opens a menu
                            </div>
                          ) : (
                            <NavLinkAutocomplete
                              value={item.url}
                              onChange={val => setItem(index, { url: val })}
                              links={links}
                              placeholder="/page or https://…"
                            />
                          )}
                          <Tooltip content="Add sub-link">
                            <button
                              onClick={() => setItem(index, { children: [...children, { label: '', url: '' }] })}
                              className="flex-shrink-0 text-gray-400 hover:text-gray-900 p-1.5 rounded hover:bg-gray-100 transition-colors"
                              aria-label="Add sub-link"
                            >
                              <ListPlus size={14} />
                            </button>
                          </Tooltip>
                          <button
                            onClick={() => set('primary_navigation', items.filter((_, i) => i !== index))}
                            className="flex-shrink-0 text-gray-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"
                            aria-label="Remove link"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {isMenu && (
                          <div className="ml-8 flex flex-col gap-1">
                            {children.map((child, childIndex) => (
                              <div key={childIndex} className="flex flex-col gap-1">
                                {dropLine(index, childIndex)}
                                <div
                                  onDragOver={e => handleRowDragOver(e, index, childIndex)}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 bg-white ${
                                    dragFrom?.parent === index && dragFrom.index === childIndex ? 'opacity-40' : ''
                                  }`}
                                >
                                  <span
                                    draggable
                                    onDragStart={e => handleDragStart(e, index, childIndex, child.label)}
                                    onDragEnd={handleDragEnd}
                                    className="flex-shrink-0 cursor-grab active:cursor-grabbing"
                                  >
                                    <GripVertical size={16} className="text-gray-300" />
                                  </span>
                                  <input
                                    value={child.label}
                                    onChange={e => setChild(index, childIndex, { label: e.target.value })}
                                    placeholder="Sub-link label"
                                    className={inputClass}
                                  />
                                  <NavLinkAutocomplete
                                    value={child.url}
                                    onChange={val => setChild(index, childIndex, { url: val })}
                                    links={links}
                                    placeholder="/page or https://…"
                                  />
                                  <button
                                    onClick={() => setItem(index, { children: children.filter((_, j) => j !== childIndex) })}
                                    className="flex-shrink-0 text-gray-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"
                                    aria-label="Remove sub-link"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                            {dropLine(index, children.length)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {dropLine(null, items.length)}
                </div>
              )}

              <button
                onClick={() => set('primary_navigation', [...items, { label: '', url: '' }])}
                className="self-start inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <Plus size={15} /> Add link
              </button>
              <p className="text-xs text-gray-400">
                Drag to reorder within a level. To move a link between levels, delete it and add it again.
              </p>

              <Field label="Site title link" hint="Where clicking the site title/logo in the header goes. Defaults to /.">
                <Input value={local.site_title_link} onChange={e => set('site_title_link', e.target.value)} placeholder="/" />
              </Field>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Links</p>
                {items.length === 0 ? (
                  <p className="text-sm text-gray-400">No links added</p>
                ) : (
                  <div className="flex flex-col gap-1 mt-1">
                    {items.map((item, index) => (
                      <div key={index} className="flex flex-col gap-1">
                        <p className="text-sm text-gray-900">
                          {item.label}{' '}
                          <span className="text-gray-400">{item.children?.length ? 'menu' : item.url}</span>
                        </p>
                        {item.children?.map((child, childIndex) => (
                          <p key={childIndex} className="ml-6 text-sm text-gray-900">
                            {child.label} <span className="text-gray-400">{child.url}</span>
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Site title link</p>
                <p className="text-sm text-gray-400">{local.site_title_link || '/'}</p>
              </div>
            </>
          )
        }}
      </EditableCard>

      {pendingIncomplete && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => pendingIncomplete.resolve(false)}
        >
          <div
            className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold text-gray-900">Incomplete links</h3>
            <p className="text-sm text-gray-600">
              One or more links or sub-links are missing a label or a URL. They won't show up in the site navigation unless completed.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => pendingIncomplete.resolve(false)}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
              >
                Go back
              </button>
              <button
                onClick={() => pendingIncomplete.resolve(true)}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
              >
                Save anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
