import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { PageShell } from '../../components/admin/AdminPage'

export default function AdminBlogCommentsPage() {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmComment, setConfirmComment] = useState(null)

  async function fetchComments() {
    const res = await fetch('/api/admin/blog/comments', { credentials: 'include' })
    const data = await res.json()
    setComments(data)
    setLoading(false)
  }

  useEffect(() => { fetchComments() }, [])

  async function handleDelete() {
    await fetch(`/api/admin/blog/comments/${confirmComment.id}`, { method: 'DELETE', credentials: 'include' })
    setConfirmComment(null)
    fetchComments()
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Comments">
      {confirmComment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setConfirmComment(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <button onClick={() => setConfirmComment(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Delete this comment?</h2>
            <p className="text-sm text-gray-500 mb-3">by {confirmComment.author_name}</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 mb-6 whitespace-pre-wrap line-clamp-4">{confirmComment.content}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
              <button onClick={() => setConfirmComment(null)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mb-6 -mt-2">
        <Link to="/admin/blog" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} strokeWidth={1.5} />Blog settings
        </Link>
      </div>

      {comments.length === 0 ? (
        <p className="text-gray-500 text-sm">No comments yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map(c => (
            <div
              key={c.id}
              className={`border rounded-lg p-4 ${c.is_deleted ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-200 bg-white'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-800">{c.author_name}</span>
                    {c.author_email && (
                      <span className="text-xs text-gray-400">{c.author_email}</span>
                    )}
                    {c.is_user && (
                      <span className="text-xs text-blue-400 font-medium">User</span>
                    )}
                    {c.is_deleted && (
                      <span className="text-xs text-red-400 font-medium">Deleted</span>
                    )}
                    {c.parent_id && (
                      <span className="text-xs text-gray-400 italic">Reply</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mb-2 whitespace-pre-wrap">{c.content}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{formatDate(c.created_at)}</span>
                    {c.post_slug && (
                      <Link
                        to={`/blog/${c.post_slug}`}
                        className="hover:text-gray-600 hover:underline"
                      >
                        {c.post_title || c.post_slug}
                      </Link>
                    )}
                  </div>
                </div>
                {!c.is_deleted && (
                  <button
                    onClick={() => setConfirmComment(c)}
                    className="shrink-0 text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}
