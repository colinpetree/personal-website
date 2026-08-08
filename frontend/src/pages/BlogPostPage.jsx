import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Heart, Reply, MoreHorizontal, ChevronDown, X } from 'lucide-react'
import { useUserAuth } from '../context/UserAuthContext'
import { useSiteConfig } from '../hooks/useSiteConfig'
import GalleryLightbox from '../components/GalleryLightbox'
import SignInRequiredModal from '../components/SignInRequiredModal'
import { setupSegmentLoopVideo } from '../utils/segmentLoopVideo'
import { setMetaDescription } from '../utils/meta'

// ── Skeletons ─────────────────────────────────────────────────────────────

function BlogPostSkeleton() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 animate-pulse">
      <div className="h-10 bg-gray-100 rounded w-5/6 mb-3" />
      <div className="h-10 bg-gray-100 rounded w-2/3 mb-6" />
      <div className="flex items-center gap-2 mb-8">
        <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
        <div className="flex flex-col gap-1.5">
          <div className="h-3 bg-gray-100 rounded w-24" />
          <div className="h-3 bg-gray-100 rounded w-20" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`h-4 bg-gray-100 rounded ${i % 5 === 4 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </div>
    </main>
  )
}

// ── Utilities ──────────────────────────────────────────────────────────────

function countAllComments(comments) {
  return comments.reduce((n, c) => n + 1 + countAllComments(c.replies || []), 0)
}

function sortComments(comments, sort) {
  const sorted = [...comments]
  if (sort === 'Newest') sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  else if (sort === 'Oldest') sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  else sorted.sort((a, b) => {
    const d = (b.like_count || 0) - (a.like_count || 0)
    return d !== 0 ? d : new Date(a.created_at) - new Date(b.created_at)
  })
  return sorted
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Report Modal ───────────────────────────────────────────────────────────

function ReportModal({ comment, slug, onClose }) {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleReport() {
    setSubmitting(true)
    try {
      await fetch(`/api/blog/${slug}/comments/${comment.id}/report`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {}
    setDone(true)
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
        {done ? (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Report sent</h2>
            <p className="text-sm text-gray-600 mb-6">Thank you. The site owner has been notified.</p>
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Report this comment?</h2>
            <p className="text-sm text-gray-700 mb-6">Your request will be sent to the owner of this site.</p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReport}
                disabled={submitting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Reporting…' : 'Report'}
              </button>
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Sort Dropdown ──────────────────────────────────────────────────────────

function SortDropdown({ sort, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-sm font-bold text-gray-700 hover:text-gray-900"
      >
        Sort by: {sort} <ChevronDown size={13} strokeWidth={2.5} />
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[110px]">
          {['Best', 'Newest', 'Oldest'].map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${sort === opt ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Comment Forms ──────────────────────────────────────────────────────────

function UserCommentForm({ slug, parentId, parentComment, onSuccess, onCancel, isReply = false }) {
  const { user } = useUserAuth()
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showSignInModal, setShowSignInModal] = useState(false)

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
        <button
          onClick={() => setShowSignInModal(true)}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
        >
          Sign-in to comment
        </button>
        {showSignInModal && (
          <SignInRequiredModal
            onClose={() => setShowSignInModal(false)}
            message="Sign in to leave a comment."
          />
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt={user.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 flex-shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <span className="text-sm font-medium text-gray-900">
            {user.name}
            {user.title && <span className="font-normal text-gray-400"> · {user.title}</span>}
          </span>
          {isReply && parentComment && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              Reply to: <span className="font-semibold">{parentComment.content}</span>
            </p>
          )}
        </div>
      </div>
      <div className="rounded-md border border-gray-300 focus-within:ring-2 focus-within:ring-gray-400">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          required
          rows={4}
          placeholder={isReply ? 'Reply to comment…' : 'Write a comment…'}
          className="w-full rounded-t-md px-3 py-2 text-sm focus:outline-none resize-none"
          autoFocus={isReply}
        />
        <div className="flex items-center justify-end gap-1 px-2 py-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1">
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${content.trim() ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-400'}`}
          >
            {submitting ? 'Posting…' : isReply ? 'Add reply' : 'Add comment'}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  )
}

// ── Comment Item ───────────────────────────────────────────────────────────

function CommentItem({ comment, slug, currentUserId, likedIds, likeDeltas, onLike, onReport, onReplySuccess, depth = 0 }) {
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [repliesVisible, setRepliesVisible] = useState(true)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreRef = useRef(null)

  const liked = likedIds.has(comment.id)
  const likeCount = (comment.like_count || 0) + (likeDeltas[comment.id] || 0)
  const isOwnComment = currentUserId && comment.user_id === currentUserId
  const hasReplies = comment.replies?.length > 0
  const replyParentComment = depth > 0 ? comment : null

  useEffect(() => {
    if (!showMoreMenu) return
    function handle(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) setShowMoreMenu(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showMoreMenu])

  function handleReplySuccess() {
    setShowReplyForm(false)
    onReplySuccess()
  }

  return (
    <div id={`comment-${comment.id}`} className="flex gap-3 py-4">
      {/* Left: avatar + thread line */}
      <div className="flex flex-col items-center flex-shrink-0 w-6">
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
        {hasReplies && (
          <div
            className={`w-0.5 flex-1 mt-1.5 rounded-full cursor-pointer transition-colors ${repliesVisible ? 'bg-gray-200 hover:bg-gray-400' : 'bg-gray-100 hover:bg-gray-300'}`}
            onClick={() => setRepliesVisible(v => !v)}
          />
        )}
      </div>

      {/* Right: content */}
      <div className="flex-1 min-w-0">
        {/* Name + date */}
        <span className="font-medium text-gray-900 text-sm">
          {comment.author_name || 'Anonymous'}
          {comment.is_owner_author && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700 font-medium align-middle">Author</span>
          )}
          {comment.is_staff && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded bg-gray-200 text-gray-700 font-medium align-middle">Staff</span>
          )}
          <span className="font-normal text-gray-400">
            {comment.author_title ? ` · ${comment.author_title} · ` : ' · '}
            {formatDate(comment.created_at)}
          </span>
        </span>

        {/* Content */}
        <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap mt-1">{comment.content}</p>

        {/* Action row */}
        <div className="flex items-center gap-4 mt-2">
          <button
            onClick={() => !isOwnComment && onLike(comment.id, liked)}
            disabled={isOwnComment}
            className={`flex items-center gap-1 text-xs transition-colors ${isOwnComment ? 'text-gray-300' : 'text-gray-400 hover:text-red-500'}`}
          >
            <Heart
              size={13}
              className="transition-colors"
              fill={liked ? 'currentColor' : 'none'}
              style={liked && !isOwnComment ? { color: '#ef4444' } : {}}
            />
            {likeCount > 0 && (
              <span className={liked && !isOwnComment ? 'text-red-500' : ''}>{likeCount}</span>
            )}
          </button>

          <button
            onClick={() => setShowReplyForm(v => !v)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Reply size={13} />
            Reply
          </button>

          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <MoreHorizontal size={14} />
            </button>
            {showMoreMenu && (
              <div className="absolute left-0 top-5 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
                <button
                  onClick={() => { onReport(comment); setShowMoreMenu(false) }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Report comment
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Inline reply form */}
        {showReplyForm && (
          <div className="mt-3">
            <UserCommentForm
              slug={slug}
              parentId={comment.id}
              parentComment={replyParentComment}
              onSuccess={handleReplySuccess}
              onCancel={() => setShowReplyForm(false)}
              isReply={true}
            />
          </div>
        )}

        {/* Replies */}
        {hasReplies && repliesVisible && (
          <div className="mt-1">
            {comment.replies.map(r => (
              <CommentItem
                key={r.id}
                comment={r}
                slug={slug}
                currentUserId={currentUserId}
                likedIds={likedIds}
                likeDeltas={likeDeltas}
                onLike={onLike}
                onReport={onReport}
                onReplySuccess={onReplySuccess}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
        {hasReplies && !repliesVisible && (
          <button
            onClick={() => setRepliesVisible(true)}
            className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Show {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Blog Post Page ─────────────────────────────────────────────────────────

export default function BlogPostPage() {
  const { slug } = useParams()
  const { user: currentUser } = useUserAuth()
  const { config: siteConfig } = useSiteConfig()
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [sort, setSort] = useState('Best')
  const [reportingComment, setReportingComment] = useState(null)
  const [likeDeltas, setLikeDeltas] = useState({})
  const [blogAuthor, setBlogAuthor] = useState(null)
  const [likedIds, setLikedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('liked_comments') || '[]')) }
    catch { return new Set() }
  })
  const [lightboxImages, setLightboxImages] = useState([])
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const articleRef = useRef(null)

  async function fetchPost() {
    const res = await fetch(`/api/blog/${slug}`)
    if (res.status === 404) { setNotFound(true); setLoading(false); return }
    setPost(await res.json())
    setLoading(false)
  }

  async function fetchComments() {
    const res = await fetch(`/api/blog/${slug}/comments`)
    if (res.ok) {
      const data = await res.json()
      setComments(data.comments || [])
      setLikeDeltas({})
    }
  }

  useEffect(() => {
    fetchPost()
    fetchComments()
    fetch('/api/blog/author').then(r => r.ok ? r.json() : null).then(d => { if (d?.name) setBlogAuthor(d) })
  }, [slug])

  useEffect(() => {
    if (post?.title) {
      document.title = post.title
    }
    setMetaDescription(post?.meta_description || post?.excerpt)
  }, [post])

  function handleLike(commentId, currentlyLiked) {
    const delta = currentlyLiked ? -1 : 1
    const newLikedIds = new Set(likedIds)
    if (currentlyLiked) newLikedIds.delete(commentId)
    else newLikedIds.add(commentId)

    setLikedIds(newLikedIds)
    setLikeDeltas(prev => ({ ...prev, [commentId]: (prev[commentId] || 0) + delta }))
    localStorage.setItem('liked_comments', JSON.stringify([...newLikedIds]))

    fetch(`/api/blog/${slug}/comments/${commentId}/like`, {
      method: currentlyLiked ? 'DELETE' : 'POST',
      credentials: 'include',
    }).catch(() => {
      setLikedIds(likedIds)
      setLikeDeltas(prev => ({ ...prev, [commentId]: (prev[commentId] || 0) - delta }))
      localStorage.setItem('liked_comments', JSON.stringify([...likedIds]))
    })
  }

  const handleArticleClick = useCallback((e) => {
    if (e.target.tagName !== 'IMG') return
    const gallery = e.target.closest('figure.gallery')
    if (!gallery) return
    const allImgs = [...gallery.querySelectorAll('img')]
    const clickedIndex = allImgs.indexOf(e.target)
    setLightboxImages(allImgs.map(i => ({ src: i.getAttribute('src') || i.src, alt: i.alt || '' })))
    setLightboxIndex(clickedIndex)
  }, [])

  useEffect(() => {
    if (!articleRef.current || !post?.content_html) return
    const figures = articleRef.current.querySelectorAll('figure[data-lqip]')
    figures.forEach(figure => {
      const img = figure.querySelector('img')
      const lqipSrc = figure.getAttribute('data-lqip')
      if (!img || !lqipSrc) return

      const placeholder = document.createElement('img')
      placeholder.src = lqipSrc
      placeholder.setAttribute('aria-hidden', 'true')
      placeholder.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(20px);transform:scale(1.05);pointer-events:none'
      figure.style.position = 'relative'
      figure.insertBefore(placeholder, img)

      img.style.transition = 'opacity 0.4s'
      img.style.opacity = '0'

      function onLoad() {
        img.style.opacity = '1'
        placeholder.style.transition = 'opacity 0.4s'
        placeholder.style.opacity = '0'
        setTimeout(() => placeholder.remove(), 400)
      }

      if (img.complete && img.naturalWidth) {
        onLoad()
      } else {
        img.addEventListener('load', onLoad, { once: true })
      }
    })
  }, [post?.content_html])

  useEffect(() => {
    if (!articleRef.current || !post?.content_html) return
    const figures = articleRef.current.querySelectorAll('figure[data-segment-loop="true"]')
    const cleanups = Array.from(figures).map(setupSegmentLoopVideo).filter(Boolean)
    return () => cleanups.forEach(fn => fn())
  }, [post?.content_html])

  if (loading) return <BlogPostSkeleton />

  if (notFound) return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Post not found</h1>
      <Link to={`/${siteConfig?.nav?.find(p => p.key === 'blog')?.path ?? 'blog'}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline">
        <ArrowLeft size={14} strokeWidth={1.5} />Back to blog
      </Link>
    </main>
  )

  const commentsVisible = !!(siteConfig?.users_enabled && siteConfig?.blog_comments_enabled)
  const sortedComments = sortComments(comments, sort)
  const totalComments = countAllComments(comments)

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      {reportingComment && (
        <ReportModal
          comment={reportingComment}
          slug={slug}
          onClose={() => setReportingComment(null)}
        />
      )}

      {post.thumbnail_filename && (
        <div className="max-w-[740px] mx-auto mb-8">
          <div className="rounded-lg overflow-hidden">
            <img
              src={`/api/uploads/${post.thumbnail_filename}`}
              alt={post.title}
              width={post.thumbnail_width || undefined}
              height={post.thumbnail_height || undefined}
              className="max-w-full max-h-[600px] w-auto h-auto block"
            />
          </div>
          {post.thumbnail_caption && (
            <p className="text-sm text-gray-500 text-center py-2 px-4">{post.thumbnail_caption}</p>
          )}
        </div>
      )}

      <h1 className="text-4xl font-bold text-gray-900 mb-3 leading-tight">{post.title}</h1>

      {/* Author + date */}
      <div className="flex items-center gap-2 mb-8">
        {blogAuthor ? (() => {
          const authorHref = siteConfig?.about_enabled ? `/${siteConfig.about_slug || 'about'}` : '/'
          const avatar = blogAuthor.avatar_filename ? (
            <img src={`/api/uploads/${blogAuthor.avatar_filename}`} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt={blogAuthor.name} />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-500 flex-shrink-0">
              {(blogAuthor.name || '?').charAt(0).toUpperCase()}
            </div>
          )
          return (
            <div className="flex items-center gap-2">
              <Link to={authorHref} className="hover:opacity-80 transition-opacity">{avatar}</Link>
              <div className="flex flex-col leading-tight">
                <Link to={authorHref} className="text-sm font-medium text-gray-700 hover:opacity-80 transition-opacity">{blogAuthor.name}</Link>
                <span className="text-xs text-gray-400">
                  {new Date(post.publish_date || post.created_at).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          )
        })() : (
          <span className="text-sm text-gray-400">
            {new Date(post.publish_date || post.created_at).toLocaleDateString('en-US', {
              month: 'long', day: 'numeric', year: 'numeric',
            })}
          </span>
        )}
      </div>

      <article
        ref={articleRef}
        className="prose prose-gray max-w-none mb-16 blog-content"
        dangerouslySetInnerHTML={{ __html: post.content_html || '' }}
        onClick={handleArticleClick}
      />

      {lightboxIndex !== null && (
        <GalleryLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}

      {commentsVisible && (
        <section>
          <div className="flex items-baseline justify-between mb-10">
            <h2 className="text-xl font-bold text-gray-900">Discussion</h2>
            {totalComments > 0 && (
              <span className="text-sm text-gray-400">
                {totalComments === 1 ? '1 comment' : `${totalComments} comments`}
              </span>
            )}
          </div>

          <div className="mb-8">
            <UserCommentForm slug={slug} onSuccess={fetchComments} />
          </div>

          {comments.length > 0 && (
            <>
              <div className="mb-4">
                <SortDropdown sort={sort} onChange={setSort} />
              </div>
              <div className="divide-y divide-gray-100">
                {sortedComments.map(c => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    slug={slug}
                    currentUserId={currentUser?.id}
                    likedIds={likedIds}
                    likeDeltas={likeDeltas}
                    onLike={handleLike}
                    onReport={setReportingComment}
                    onReplySuccess={fetchComments}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </main>
  )
}
