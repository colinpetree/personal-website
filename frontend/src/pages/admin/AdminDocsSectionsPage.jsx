import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { BookOpen, X } from 'lucide-react'
import { PageShell } from '../../components/admin/AdminPage'
import RoleGuard from '../../components/admin/RoleGuard'
import { useToast } from '../../context/ToastContext'

export default function AdminDocsSectionsPage() {
  return (
    <RoleGuard minRole="editor" fallback="/admin">
      <AdminDocsSectionsPageContent />
    </RoleGuard>
  )
}

function pageCountLabel(section) {
  const total = section.page_count
  const published = section.published_page_count
  const base = `${total} ${total === 1 ? 'page' : 'pages'}`
  return published < total ? `${base} (${published} published)` : base
}

function NewSectionModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: trimmed }),
      })
      // A crashed backend can answer with an HTML error page, not JSON.
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to create docs section. Please try again.')
        setSaving(false)
        return
      }
      onCreated(data)
    } catch {
      setError('Could not reach the server. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <form
        onSubmit={handleSubmit}
        className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600" aria-label="Close">
          <X size={18} />
        </button>
        <h2 className="text-lg font-bold text-gray-900">New docs section</h2>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-gray-500">Name</span>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
            placeholder="e.g. Site features"
            maxLength={200}
            className="text-sm border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-gray-400"
          />
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function AdminDocsSectionsPageContent() {
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { addToast } = useToast()

  // Same StrictMode double-invoke guard as AdminPagesListPage.jsx's
  // processedNavState, for the "deleted" toast handed over by the editor.
  const processedNavState = useRef(false)
  useEffect(() => {
    if (processedNavState.current) return
    processedNavState.current = true
    if (location.state?.deleted) {
      addToast({ message: 'Docs section deleted' })
      window.history.replaceState({}, '')
    }
  }, [])

  useEffect(() => {
    fetch('/api/admin/docs', { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setSections)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>
  if (loadError) {
    return (
      <PageShell title="Docs">
        <p className="text-sm text-red-500">Couldn't load docs sections. Try reloading the page.</p>
      </PageShell>
    )
  }

  return (
    <PageShell title="Docs">
      <div className="mb-6 -mt-2 flex flex-col gap-3">
        <p className="text-sm text-gray-500">
          A docs section links pages together in order, with a sidebar and next/previous buttons on the public site.
        </p>
        <div>
          <button
            onClick={() => setShowNew(true)}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            + New docs section
          </button>
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="text-gray-500 text-sm">No docs sections yet. Create your first one above.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => navigate(`/admin/docs/${section.id}`)}
              className="text-left flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-4 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <BookOpen size={18} strokeWidth={1.75} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{section.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{pageCountLabel(section)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {showNew && (
        <NewSectionModal
          onClose={() => setShowNew(false)}
          onCreated={section => { setSections(s => [...s, section]); setShowNew(false) }}
        />
      )}
    </PageShell>
  )
}
