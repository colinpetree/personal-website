import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { ExternalLink, Pencil, X } from 'lucide-react'
import { PageShell } from '../../components/admin/AdminPage'
import { useToast } from '../../context/ToastContext'
import { useAdminAuth } from '../../context/AdminAuthContext'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusLabel({ page }) {
  if (page.status === 'published') {
    return <span className="text-xs font-medium" style={{ color: '#99a3ad' }}>Published</span>
  }
  return <span className="text-xs font-medium" style={{ color: '#fb2d8d' }}>Draft</span>
}

function PublishConfirmModal({ pageTitle, slug, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Page published</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-sm text-gray-800 font-medium">{pageTitle}</p>
          <p className="text-sm text-gray-500">Your page is now live on your site.</p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={`/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
          >
            View page <ExternalLink size={13} />
          </a>
          <button
            onClick={onClose}
            className="ml-auto rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminPagesListPage() {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [publishConfirm, setPublishConfirm] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { addToast } = useToast()
  const { admin } = useAdminAuth()

  // Ref guard, not just an empty dep array — React StrictMode double-invokes
  // effects once in dev (mount, cleanup, mount again) against this same
  // component instance, so without this the toast/modal below fires twice
  // for a single delete/publish (the ref persists across that double-invoke,
  // this flag doesn't).
  const processedNavState = useRef(false)

  useEffect(() => {
    if (processedNavState.current) return
    processedNavState.current = true
    if (location.state?.publishConfirm) {
      setPublishConfirm(location.state.publishConfirm)
      window.history.replaceState({}, '')
    }
    if (location.state?.deleted) {
      addToast({ message: 'Page deleted' })
      window.history.replaceState({}, '')
    }
  }, [])

  async function fetchPages() {
    const res = await fetch('/api/admin/pages', { credentials: 'include' })
    const data = await res.json()
    setPages(data)
    setLoading(false)
  }

  useEffect(() => { fetchPages() }, [])

  async function handleNew() {
    setCreating(true)
    const res = await fetch('/api/admin/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: 'Untitled' }),
    })
    const page = await res.json()
    navigate(`/admin/pages/${page.id}`)
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  const isContributor = admin?.role === 'contributor'
  // Contributors can't do anything with a published page once it's live —
  // can't edit, can't delete (see admin_pages.py) — so it's hidden here
  // rather than shown as a dead-end row that just bounces them back out of
  // the editor (see AdminPageEditorPage.jsx's redirect-away-if-not-draft).
  const visiblePages = isContributor ? pages.filter(p => p.author_id === admin.id && p.status === 'draft') : pages

  return (
    <PageShell title="Pages">
      <div className="flex justify-between items-center mb-6 -mt-2">
        <div />
        <button
          onClick={handleNew}
          disabled={creating}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {creating ? 'Creating…' : '+ New page'}
        </button>
      </div>

      {visiblePages.length === 0 ? (
        <p className="text-gray-500 text-sm">No pages yet. Create your first page above.</p>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {visiblePages.map(page => (
            <div
              key={page.id}
              onClick={() => navigate(`/admin/pages/${page.id}`)}
              className="flex items-center gap-4 px-4 py-3 bg-white hover:bg-gray-50 cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">{page.title}</p>
                  <p className="text-xs text-gray-400 shrink-0">/{page.slug}</p>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">Updated {formatDate(page.updated_at)}</p>
                <div className="mt-0.5">
                  <StatusLabel page={page} />
                </div>
              </div>
              <Pencil size={14} className="shrink-0 text-gray-400" />
            </div>
          ))}
        </div>
      )}

      {publishConfirm && (
        <PublishConfirmModal
          pageTitle={publishConfirm.title}
          slug={publishConfirm.slug}
          onClose={() => setPublishConfirm(null)}
        />
      )}
    </PageShell>
  )
}
