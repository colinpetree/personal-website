import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'

function CommentItem({ comment }) {
  return (
    <div className="py-4">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-medium text-gray-900 text-sm">{comment.guest_name || 'Anonymous'}</span>
        <span className="text-xs text-gray-400">
          {new Date(comment.created_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </span>
      </div>
      <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{comment.content}</p>
      {comment.replies?.length > 0 && (
        <div className="ml-6 mt-3 border-l-2 border-gray-100 pl-4 flex flex-col gap-3">
          {comment.replies.map(r => (
            <CommentItem key={r.id} comment={r} />
          ))}
        </div>
      )}
    </div>
  )
}

function CommentForm({ slug, parentId, onSuccess, onCancel }) {
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
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
          >
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

  async function fetchPost() {
    const res = await fetch(`/api/blog/${slug}`)
    if (res.status === 404) { setNotFound(true); setLoading(false); return }
    const data = await res.json()
    setPost(data)
    setLoading(false)
  }

  async function fetchComments() {
    const res = await fetch(`/api/blog/${slug}/comments`)
    if (res.ok) setComments(await res.json())
  }

  useEffect(() => {
    fetchPost()
    fetchComments()
  }, [slug])

  if (loading) return <main className="max-w-3xl mx-auto px-6 py-16"><p className="text-gray-400">Loading…</p></main>

  if (notFound) return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Post not found</h1>
      <Link to="/blog" className="text-blue-600 hover:underline">← Back to blog</Link>
    </main>
  )

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      {/* Title */}
      <h1 className="text-4xl font-bold text-gray-900 mb-3 leading-tight">{post.title}</h1>
      <p className="text-sm text-gray-400 mb-8">
        {new Date(post.publish_date || post.created_at).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
        })}
      </p>

      {/* Thumbnail */}
      {post.thumbnail_filename && (
        <img
          src={`/api/uploads/${post.thumbnail_filename}`}
          alt={post.title}
          className="w-full h-64 object-cover rounded-xl mb-8"
        />
      )}

      {/* Content */}
      <article
        className="prose prose-gray max-w-none mb-16"
        dangerouslySetInnerHTML={{ __html: post.content_html || '' }}
      />

      {/* Comments */}
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
