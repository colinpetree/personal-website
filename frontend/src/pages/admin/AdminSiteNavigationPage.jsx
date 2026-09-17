import { useState } from 'react'
import { GripVertical, Trash2, Plus } from 'lucide-react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { useInternalLinks } from '../../hooks/useInternalLinks'
import { PageShell, EditableCard, Field, Input } from '../../components/admin/AdminPage'
import NavLinkAutocomplete from '../../components/admin/NavLinkAutocomplete'
import RoleGuard from '../../components/admin/RoleGuard'

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
  // Drag state lives outside EditableCard's local/set — it's transient
  // interaction state, not a saved field, and only ever matters while
  // editing.
  const [dragIndex, setDragIndex] = useState(null)
  // Index in the list where the drop-position line renders — 0..length,
  // where length means "after the last row".
  const [dropIndex, setDropIndex] = useState(null)
  // Set (with a `resolve` callback) while the "some links are incomplete"
  // warning modal is open — onSave awaits this promise before deciding
  // whether to actually save (see handleEditableSave below).
  const [pendingIncomplete, setPendingIncomplete] = useState(null)

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  async function handleEditableSave(values) {
    // Fully blank rows (no label AND no URL — e.g. an unfinished "+ Add
    // link" click) are dropped silently below, same as always. A PARTIAL
    // row (only one of the two filled in) is different: it's easy to not
    // notice you left a URL blank, and a label-only or URL-only entry
    // won't render as a link at all once saved — so that case blocks the
    // save behind a confirmation instead of silently discarding it.
    const partial = values.primary_navigation.some(item => {
      const label = (item.label || '').trim()
      const url = (item.url || '').trim()
      return (label && !url) || (!label && url)
    })
    if (partial) {
      const proceed = await new Promise(resolve => setPendingIncomplete({ resolve }))
      setPendingIncomplete(null)
      if (!proceed) {
        throw new Error('Add the missing label or URL, or confirm to discard those entries.')
      }
    }
    const cleaned = values.primary_navigation
      .map(item => ({ label: (item.label || '').trim(), url: (item.url || '').trim() }))
      .filter(item => item.label && item.url)
    return save({ primary_navigation: cleaned, site_title_link: (values.site_title_link || '').trim() || '/' })
  }

  function handleDragStart(e, items, index) {
    setDragIndex(index)
    setDropIndex(index)
    // Without these, browsers show a "not allowed" cursor over valid drop
    // targets — dropEffect has to be set on every dragover too, not just here.
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', items[index].label)
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

  function handleDrop(items, set) {
    if (dragIndex !== null && dropIndex !== null && dropIndex !== dragIndex && dropIndex !== dragIndex + 1) {
      set('primary_navigation', reorder(items, dragIndex, dropIndex))
    }
    setDragIndex(null)
    setDropIndex(null)
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDropIndex(null)
  }

  return (
    <PageShell title="Site Navigation">
      <EditableCard
        title="Primary navigation"
        description="Shown in the site header, plus the site title link"
        savedValues={{
          primary_navigation: config?.primary_navigation ?? [],
          site_title_link: config?.site_title_link || '/',
        }}
        onSave={handleEditableSave}
      >
        {({ editing, local, set }) => editing ? (
          <>
            {local.primary_navigation.length === 0 ? (
              <p className="text-sm text-gray-400">No links yet. Add your first one below.</p>
            ) : (
              <div className="flex flex-col gap-1" onDragOver={handleContainerDragOver} onDrop={() => handleDrop(local.primary_navigation, set)}>
                {local.primary_navigation.map((item, index) => (
                  <div key={index} className="flex flex-col gap-1">
                    {dragIndex !== null && dropIndex === index && (
                      <div className="h-0.5 rounded-full bg-gray-900 mx-1" />
                    )}
                    <div
                      onDragOver={e => handleRowDragOver(e, index)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 bg-white ${
                        dragIndex === index ? 'opacity-40' : ''
                      }`}
                    >
                      {/* draggable/onDragStart/onDragEnd live only on the
                          handle, not the whole row — otherwise starting a
                          text selection drag inside the label/URL inputs
                          gets hijacked into a row-reorder drag instead. */}
                      <span
                        draggable
                        onDragStart={e => handleDragStart(e, local.primary_navigation, index)}
                        onDragEnd={handleDragEnd}
                        className="flex-shrink-0 cursor-grab active:cursor-grabbing"
                      >
                        <GripVertical size={16} className="text-gray-300" />
                      </span>
                      <input
                        value={item.label}
                        onChange={e => set('primary_navigation', local.primary_navigation.map((it, i) => i === index ? { ...it, label: e.target.value } : it))}
                        placeholder="Label"
                        className="flex-1 min-w-0 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-400"
                      />
                      <NavLinkAutocomplete
                        value={item.url}
                        onChange={val => set('primary_navigation', local.primary_navigation.map((it, i) => i === index ? { ...it, url: val } : it))}
                        links={links}
                        placeholder="/page or https://…"
                      />
                      <button
                        onClick={() => set('primary_navigation', local.primary_navigation.filter((_, i) => i !== index))}
                        className="flex-shrink-0 text-gray-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"
                        aria-label="Remove link"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {dragIndex !== null && dropIndex === local.primary_navigation.length && (
                  <div className="h-0.5 rounded-full bg-gray-900 mx-1" />
                )}
              </div>
            )}

            <button
              onClick={() => set('primary_navigation', [...local.primary_navigation, { label: '', url: '' }])}
              className="self-start inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Plus size={15} /> Add link
            </button>

            <Field label="Site title link" hint="Where clicking the site title/logo in the header goes. Defaults to /.">
              <Input value={local.site_title_link} onChange={e => set('site_title_link', e.target.value)} placeholder="/" />
            </Field>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-gray-500">Links</p>
              {local.primary_navigation.length === 0 ? (
                <p className="text-sm text-gray-400">No links added</p>
              ) : (
                <div className="flex flex-col gap-1 mt-1">
                  {local.primary_navigation.map((item, index) => (
                    <p key={index} className="text-sm text-gray-900">
                      {item.label} <span className="text-gray-400">{item.url}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-gray-500">Site title link</p>
              <p className="text-sm text-gray-400">{local.site_title_link || '/'}</p>
            </div>
          </>
        )}
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
              One or more links are missing a label or a URL. They won't show up in the site navigation unless completed.
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
