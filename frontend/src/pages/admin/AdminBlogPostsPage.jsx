import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { PageShell } from '../../components/admin/AdminPage'

export default function AdminBlogPostsPage() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const navigate = useNavigate()

  async function fetchPosts() {
    const res = await fetch('/api/admin/blog/posts', { credentials: 'include' })
    const data = await res.json()
    setPosts(data)
    setLoading(false)
  }

  useEffect(() => { fetchPosts() }, [])

  async function handleNew() {
    setCreating(true)
    const res = await fetch('/api/admin/blog/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: 'Untitled' }),
    })
    const post = await res.json()
    navigate(`/admin/blog/posts/${post.id}`)
  }

  async function handleDelete(id) {
    await fetch(`/api/admin/blog/posts/${id}`, { method: 'DELETE', credentials: 'include' })
    setDeleteId(null)
    fetchPosts()
  }

  function formatDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Blog Posts">
      <div className="flex justify-between items-center mb-6 -mt-2">
        <Link to="/admin/blog" className="text-sm text-gray-500 hover:text-gray-700">← Blog settings</Link>
        <button
          onClick={handleNew}
          disabled={creating}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {creating ? 'Creating…' : '+ New post'}
        </button>
      </div>

      {posts.length === 0 ? (
        <p className="text-gray-500 text-sm">No posts yet. Create your first post above.</p>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {posts.map(post => (
            <div key={post.id} className="flex items-center gap-4 px-4 py-3 bg-white hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <Link
                  to={`/admin/blog/posts/${post.id}`}
                  className="text-sm font-medium text-gray-900 hover:underline truncate block"
                >
                  {post.title}
                </Link>
                <p className="text-xs text-gray-400 mt-0.5">
                  Updated {formatDate(post.updated_at)}
                  {post.publish_date ? ` · Published ${formatDate(post.publish_date)}` : ''}
                </p>
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                post.status === 'published'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {post.status}
              </span>
              <div className="flex gap-2 shrink-0">
                <Link
                  to={`/admin/blog/posts/${post.id}`}
                  className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100"
                >
                  Edit
                </Link>
                <button
                  onClick={() => setDeleteId(post.id)}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-gray-900">Delete post?</h3>
            <p className="text-sm text-gray-500">This will permanently delete the post and all its comments.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
