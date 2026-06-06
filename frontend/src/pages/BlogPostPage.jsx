import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useUserAuth } from '../context/UserAuthContext'

function CommentItem({ comment }) {
  return (
    <div className="py-4">
      <div className="flex items-center gap-2 mb-1">
        {comment.author_avatar ? (
          <img
            src={comment.author_avatar}
            alt={comment.author_name}
            className="w-6 h-6 rounded-full object-cover flex-shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-500 flex-shrink-0">
            {(comment.author_name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <span className="font-medium text-gray-900 text-sm">{comment.author_name || 'Anonymous'}</span>
        <span className="text-xs text-gray-400">
          {new Date(comment.created_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </span>
      </div>
      <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap ml-8">{comment.content}</p>
      {comment.replies?.length > 0 && (
        <div className="ml-8 mt-3 border-l-2 border-gray-100 pl-4 flex flex-col gap-3">
          {comment.replies.map(r => (
            <CommentItem key={r.id} comment={r} />
          ))}
        </div>
      )}
    </div>
  )
}

function UserCommentForm({ slug, parentId, onSuccess, onCancel }) {
  const { user, loginWithGoogle } = useUserAuth()
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/blog/${slug}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content, parent_id: parentId || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to post comment')
      setContent('')
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-6 text-center">
        <p className="text-sm text-gray-600 mb-3">Sign in to leave a comment</p>
        <button
          onClick={() => loginWithGoogle(window.location.pathname)}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt={user.name} className="w-7 h-7 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium text-gray-900">{user.name}</span>
      </div>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        required
        rows={4}
        placeholder="Write a comment…"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-y"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Posting…' : 'Post comment'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

function GuestCommentForm({ slug, parentId, onSuccess, onCancel }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/blog/${slug}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, content, parent_id: parentId || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to post comment')
      setName('')
      setEmail('')
      setContent('')
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Email (optional)</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Comment *</label>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          required
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-y"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Posting…' : 'Post comment'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

export default function BlogPostPage() {
  const { slug } = useParams()
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [siteConfig, setSiteConfig] = useState(null)

  async function fetchPost() {
    const res = await fetch(`/api/blog/${slug}`)
    if (res.status === 404) { setNotFound(true); setLoading(false); return }
    setPost(await res.json())
    setLoading(false)
  }

  async function fetchComments() {
    const res = await fetch(`/api/blog/${slug}/comments`)
    if (res.ok) setComments(await res.json())
  }

  useEffect(() => {
    fetchPost()
    fetchComments()
    fetch('/api/site-config').then(r => r.ok ? r.json() : null).then(d => { if (d) setSiteConfig(d) })
  }, [slug])

  if (loading) return <main className="max-w-3xl mx-auto px-6 py-16"><p className="text-gray-400">Loading…</p></main>

  if (notFound) return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Post not found</h1>
      <Link to="/blog" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
        <ArrowLeft size={14} strokeWidth={1.5} />Back to blog
      </Link>
    </main>
  )

  const usersEnabled = siteConfig?.users_enabled ?? false
  const CommentForm = usersEnabled ? UserCommentForm : GuestCommentForm

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-3 leading-tight">{post.title}</h1>
      <p className="text-sm text-gray-400 mb-8">
        {new Date(post.publish_date || post.created_at).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
        })}
      </p>

      {post.thumbnail_filename && (
        <img
          src={`/api/uploads/${post.thumbnail_filename}`}
          alt={post.title}
          className="w-full h-64 object-cover rounded-xl mb-8"
        />
      )}

      <article
        className="prose prose-gray max-w-none mb-16"
        dangerouslySetInnerHTML={{ __html: post.content_html || '' }}
      />

      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          Comments{comments.length > 0 ? ` (${comments.length})` : ''}
        </h2>

        {comments.length > 0 && (
          <div className="divide-y divide-gray-100 mb-8">
            {comments.map(c => <CommentItem key={c.id} comment={c} />)}
          </div>
        )}

        <div className="border-t border-gray-200 pt-8">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Leave a comment</h3>
          <CommentForm slug={slug} onSuccess={fetchComments} />
        </div>
      </section>
    </main>
  )
}
