import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, GripVertical, Pencil, Trash2, X, Check } from 'lucide-react'
import { PageShell } from '../../components/admin/AdminPage'
import RoleGuard from '../../components/admin/RoleGuard'
import { useToast } from '../../components/admin/Toast'

// Moves the item at `from` so it lands just before what is currently index
// `to` (0..length, where `length` means "at the very end").
function reorder(list, from, to) {
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(from < to ? to - 1 : to, 0, moved)
  return next
}

export default function AdminBlogCategoriesPage() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog">
      <AdminBlogCategoriesPageContent />
    </RoleGuard>
  )
}

function AdminBlogCategoriesPageContent() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [error, setError] = useState('')
  const [dragIndex, setDragIndex] = useState(null)
  // Index in `categories` where the drop-position line renders — 0..length,
  // where `length` means "after the last row".
  const [dropIndex, setDropIndex] = useState(null)
  const { addToast } = useToast()
  const editInputRef = useRef(null)
  const cancelingRef = useRef(false)

  async function fetchCategories() {
    const res = await fetch('/api/admin/blog/categories', { credentials: 'include' })
    const data = await res.json()
    setCategories(data)
    setLoading(false)
  }

  useEffect(() => { fetchCategories() }, [])

  useEffect(() => {
    if (editingId !== null) editInputRef.current?.focus()
  }, [editingId])

  async function handleCreate(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setError('')
    const res = await fetch('/api/admin/blog/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) {
      setError(data.error || 'Failed to create category')
      return
    }
    setNewName('')
    fetchCategories()
  }

  function startEdit(category) {
    setEditingId(category.id)
    setEditingName(category.name)
    setError('')
  }

  // Removing the focused rename input on Escape fires a native blur on it
  // before it unmounts, which would otherwise trigger onBlur={saveEdit} and
  // persist the very edit Escape was meant to discard. This flag lets that
  // blur-triggered saveEdit no-op instead.
  async function saveEdit() {
    if (cancelingRef.current) {
      cancelingRef.current = false
      return
    }
    const name = editingName.trim()
    if (!name) { setEditingId(null); return }
    const res = await fetch(`/api/admin/blog/categories/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to rename category')
      return
    }
    setEditingId(null)
    fetchCategories()
  }

  async function handleDelete() {
    await fetch(`/api/admin/blog/categories/${confirmDelete.id}`, { method: 'DELETE', credentials: 'include' })
    setConfirmDelete(null)
    addToast({ message: 'Category deleted' })
    fetchCategories()
  }

  function handleDragStart(e, index) {
    setDragIndex(index)
    setDropIndex(index)
    // Without these, browsers show a "not allowed" cursor over valid drop
    // targets — dropEffect has to be set on every dragover too, not just here.
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', categories[index].id)
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

  async function handleDrop() {
    if (dragIndex !== null && dropIndex !== null && dropIndex !== dragIndex && dropIndex !== dragIndex + 1) {
      const reordered = reorder(categories, dragIndex, dropIndex).map((c, i) => ({ ...c, order: i }))
      setCategories(reordered)
      await fetch('/api/admin/blog/categories/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(reordered.map(c => ({ id: c.id, order: c.order }))),
      })
    }
    setDragIndex(null)
    setDropIndex(null)
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDropIndex(null)
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Categories">
      <div className="mb-6 -mt-2">
        <Link to="/admin/blog" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} strokeWidth={1.5} />Blog settings
        </Link>
      </div>

      <form onSubmit={handleCreate} className="flex items-center gap-2 mb-6">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New category name…"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors shrink-0"
        >
          {creating ? 'Adding…' : '+ New category'}
        </button>
      </form>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {categories.length === 0 ? (
        <p className="text-gray-500 text-sm">No categories yet. Create your first one above.</p>
      ) : (
        <div
          className="flex flex-col gap-1"
          onDragOver={handleContainerDragOver}
          onDrop={handleDrop}
        >
          {categories.map((category, index) => (
            <div key={category.id} className="flex flex-col gap-1">
              {dragIndex !== null && dropIndex === index && (
                <div className="h-0.5 rounded-full bg-gray-900 mx-1" />
              )}
              <div
                draggable
                onDragStart={e => handleDragStart(e, index)}
                onDragOver={e => handleRowDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-white select-none ${
                  dragIndex === index ? 'opacity-40' : ''
                }`}
              >
                <GripVertical size={16} className="text-gray-300 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                {editingId === category.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveEdit()
                      if (e.key === 'Escape') { cancelingRef.current = true; setEditingId(null) }
                    }}
                    onBlur={saveEdit}
                    className="flex-1 text-sm border border-gray-300 rounded-md px-2 py-1 outline-none focus:border-gray-400"
                  />
                ) : (
                  <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">{category.name}</p>
                )}
                <p className="text-xs text-gray-400 shrink-0">
                  {category.post_count} {category.post_count === 1 ? 'post' : 'posts'}
                </p>
                {editingId === category.id ? (
                  <button onClick={saveEdit} className="shrink-0 text-gray-400 hover:text-gray-600 p-1.5 rounded hover:bg-gray-50 transition-colors" aria-label="Save">
                    <Check size={15} />
                  </button>
                ) : (
                  <button onClick={() => startEdit(category)} className="shrink-0 text-gray-400 hover:text-gray-600 p-1.5 rounded hover:bg-gray-50 transition-colors" aria-label="Rename">
                    <Pencil size={14} />
                  </button>
                )}
                <button
                  onClick={() => setConfirmDelete(category)}
                  className="shrink-0 text-red-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors"
                  aria-label="Delete category"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {dragIndex !== null && dropIndex === categories.length && (
            <div className="h-0.5 rounded-full bg-gray-900 mx-1" />
          )}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <button onClick={() => setConfirmDelete(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Delete this category?</h2>
            <p className="text-sm text-gray-500 mb-6">
              {confirmDelete.post_count > 0
                ? `"${confirmDelete.name}" will be removed from ${confirmDelete.post_count} ${confirmDelete.post_count === 1 ? 'post' : 'posts'}. This can't be undone.`
                : `"${confirmDelete.name}" will be permanently deleted.`}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
              <button onClick={() => setConfirmDelete(null)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
