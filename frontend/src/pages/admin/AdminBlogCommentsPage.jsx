import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PageShell } from '../../components/admin/AdminPage'

export default function AdminBlogCommentsPage() {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchComments() {
    const res = await fetch('/api/admin/blog/comments', { credentials: 'include' })
    const data = await res.json()
    setComments(data)
    setLoading(false)
  }

  useEffect(() => { fetchComments() }, [])

  async function handleDelete(id) {
    await fetch(`/api/admin/blog/comments/${id}`, { method: 'DELETE', credentials: 'include' })
    fetchComments()
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Comments">
      <div className="mb-6 -mt-2">
        <Link to="/admin/blog" className="text-sm text-gray-500 hover:text-gray-700">← Blog settings</Link>
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
                    <span className="text-sm font-medium text-gray-800">{c.guest_name || 'Anonymous'}</span>
                    {c.guest_email && (
                      <span className="text-xs text-gray-400">{c.guest_email}</span>
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
                    onClick={() => handleDelete(c.id)}
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
