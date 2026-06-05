import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Pencil, X } from 'lucide-react'
import { PageShell } from '../../components/admin/AdminPage'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatScheduledTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `to be published at ${time} on ${date}`
}

function formatPublishDateTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const month = MONTHS[d.getMonth()]
  const day = d.getDate()
  const year = d.getFullYear()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${month} ${day}, ${year} at ${time}`
}

function StatusLabel({ post }) {
  const [hovered, setHovered] = useState(false)

  if (post.status === 'scheduled') {
    return (
      <span
        className="text-xs font-medium cursor-default"
        style={{ color: '#30cf43' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        Scheduled
        {hovered && post.publish_date && (
          <span className="text-gray-400 font-normal ml-1">{formatScheduledTime(post.publish_date)}</span>
        )}
      </span>
    )
  }
  if (post.status === 'published') {
    return <span className="text-xs font-medium" style={{ color: '#99a3ad' }}>Published</span>
  }
  return <span className="text-xs font-medium" style={{ color: '#fb2d8d' }}>Draft</span>
}

function PublishConfirmModal({ postTitle, slug, isScheduled, publishDate, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">
            {isScheduled ? 'Post scheduled' : 'Post published'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-sm text-gray-800 font-medium">{postTitle}</p>
          {isScheduled ? (
            <p className="text-sm text-gray-500">
              Will be published on your site on {formatPublishDateTime(publishDate)}.
            </p>
          ) : (
            <p className="text-sm text-gray-500">Your post is now live on your site.</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <a
            href={`/blog/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
          >
            View post <ExternalLink size={13} />
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

export default function AdminBlogPostsPage() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [publishConfirm, setPublishConfirm] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (location.state?.publishConfirm) {
      setPublishConfirm(location.state.publishConfirm)
      // Clear state so a refresh doesn't re-show the modal
      window.history.replaceState({}, '')
    }
  }, [])

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

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Blog Posts">
      <div className="flex justify-between items-center mb-6 -mt-2">
        <Link to="/admin/blog" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} strokeWidth={1.5} />Blog settings
        </Link>
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
            <div
              key={post.id}
              onClick={() => navigate(`/admin/blog/posts/${post.id}`)}
              className="flex items-center gap-4 px-4 py-3 bg-white hover:bg-gray-50 cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{post.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Updated {formatDate(post.updated_at)}
                  {post.publish_date ? ` · Published ${formatDate(post.publish_date)}` : ''}
                </p>
                <div className="mt-0.5">
                  <StatusLabel post={post} />
                </div>
              </div>
              <Pencil size={14} className="shrink-0 text-gray-400" />
            </div>
          ))}
        </div>
      )}

      {publishConfirm && (
        <PublishConfirmModal
          postTitle={publishConfirm.title}
          slug={publishConfirm.slug}
          isScheduled={publishConfirm.isScheduled}
          publishDate={publishConfirm.publishDate}
          onClose={() => setPublishConfirm(null)}
        />
      )}
    </PageShell>
  )
}
