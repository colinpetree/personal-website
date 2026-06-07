import { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, X, Search } from 'lucide-react'
import { PageShell } from '../../components/admin/AdminPage'

function CommentCard({ c, isReply, onDelete }) {
  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className={`border rounded-lg p-4 ${c.is_deleted ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-800">{c.author_name}</span>
            {c.author_email && <span className="text-xs text-gray-400">{c.author_email}</span>}
            {c.is_deleted && <span className="text-xs text-red-400 font-medium">Deleted</span>}
            {isReply && <span className="text-xs text-gray-400 italic">Reply</span>}
          </div>
          <p className="text-sm text-gray-700 mb-2 whitespace-pre-wrap">{c.content}</p>
          <span className="text-xs text-gray-400">{formatDate(c.created_at)}</span>
        </div>
        {!c.is_deleted && (
          <button
            onClick={() => onDelete(c)}
            className="shrink-0 text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

export default function AdminBlogCommentsPage() {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmComment, setConfirmComment] = useState(null)
  const [postSearch, setPostSearch] = useState('')
  const [selectedPostId, setSelectedPostId] = useState(null)
  const [postDropdownOpen, setPostDropdownOpen] = useState(false)
  const [commentSearch, setCommentSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const postDropdownRef = useRef(null)

  async function fetchComments() {
    const res = await fetch('/api/admin/blog/comments', { credentials: 'include' })
    const data = await res.json()
    setComments(data)
    setLoading(false)
  }

  useEffect(() => { fetchComments() }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (postDropdownRef.current && !postDropdownRef.current.contains(e.target)) {
        setPostDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleDelete() {
    await fetch(`/api/admin/blog/comments/${confirmComment.id}`, { method: 'DELETE', credentials: 'include' })
    setConfirmComment(null)
    fetchComments()
  }

  const allPosts = useMemo(() => {
    const map = {}
    comments.forEach(c => {
      if (c.post_id && !map[c.post_id]) {
        map[c.post_id] = { id: c.post_id, title: c.post_title || c.post_slug || `Post ${c.post_id}` }
      }
    })
    return Object.values(map).sort((a, b) => a.title.localeCompare(b.title))
  }, [comments])

  const filteredPostOptions = useMemo(() => {
    if (!postSearch) return allPosts
    return allPosts.filter(p => p.title.toLowerCase().includes(postSearch.toLowerCase()))
  }, [allPosts, postSearch])

  const selectedPostLabel = useMemo(
    () => allPosts.find(p => p.id === selectedPostId)?.title || '',
    [allPosts, selectedPostId]
  )

  function getAllDescendants(id, repliesByParent) {
    const direct = repliesByParent[id] || []
    const all = []
    for (const r of direct) {
      all.push(r)
      all.push(...getAllDescendants(r.id, repliesByParent))
    }
    return all
  }

  const grouped = useMemo(() => {
    let filtered = comments

    if (selectedPostId) {
      filtered = filtered.filter(c => c.post_id === selectedPostId)
    }

    if (!showDeleted) {
      filtered = filtered.filter(c => !c.is_deleted)
    }

    const repliesByParent = {}
    filtered.filter(c => c.parent_id).forEach(r => {
      if (!repliesByParent[r.parent_id]) repliesByParent[r.parent_id] = []
      repliesByParent[r.parent_id].push(r)
    })

    const postMap = {}
    filtered.filter(c => !c.parent_id).forEach(c => {
      if (!postMap[c.post_id]) {
        postMap[c.post_id] = {
          post_id: c.post_id,
          post_title: c.post_title,
          post_slug: c.post_slug,
          comments: [],
        }
      }
      postMap[c.post_id].comments.push({ ...c, replies: getAllDescendants(c.id, repliesByParent) })
    })

    let result = Object.values(postMap)

    if (commentSearch.trim()) {
      const q = commentSearch.toLowerCase()
      result = result
        .map(post => ({
          ...post,
          comments: post.comments
            .map(c => {
              const parentMatches = c.content.toLowerCase().includes(q)
              const matchingReplies = c.replies.filter(r => r.content.toLowerCase().includes(q))
              if (!parentMatches && matchingReplies.length === 0) return null
              return { ...c, replies: parentMatches ? c.replies : matchingReplies }
            })
            .filter(Boolean),
        }))
        .filter(post => post.comments.length > 0)
    }

    return result
  }, [comments, selectedPostId, showDeleted, commentSearch])

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

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-6">
        {/* Comment search — full width */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search comments…"
            value={commentSearch}
            onChange={e => setCommentSearch(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-7 py-2 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
          {commentSearch && (
            <button
              onClick={() => setCommentSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Post selector + show deleted toggle */}
        <div className="flex items-center gap-3">
          <div ref={postDropdownRef} className="relative">
            <input
              type="text"
              placeholder={selectedPostId ? selectedPostLabel : 'Filter by post…'}
              value={postSearch}
              onFocus={() => {
                if (selectedPostId) {
                  setSelectedPostId(null)
                  setPostSearch('')
                }
                setPostDropdownOpen(true)
              }}
              onChange={e => {
                setPostSearch(e.target.value)
                setSelectedPostId(null)
                setPostDropdownOpen(true)
              }}
              className={`w-56 text-sm border border-gray-200 rounded-lg px-3 py-2 pr-7 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 ${selectedPostId ? 'placeholder-blue-600 font-medium' : 'placeholder-gray-400'}`}
            />
            {selectedPostId && (
              <button
                onClick={() => { setSelectedPostId(null); setPostSearch('') }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
            {postDropdownOpen && filteredPostOptions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm">
                {filteredPostOptions.map(p => (
                  <li
                    key={p.id}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setSelectedPostId(p.id); setPostSearch(''); setPostDropdownOpen(false) }}
                    className={`px-3 py-2 cursor-pointer hover:bg-gray-50 ${selectedPostId === p.id ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
                  >
                    {p.title}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Show deleted toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-600 whitespace-nowrap">Show deleted comments</span>
            <div
              onClick={() => setShowDeleted(v => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${showDeleted ? 'bg-blue-500' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${showDeleted ? 'translate-x-[19px]' : 'translate-x-[3px]'}`} />
            </div>
          </label>
        </div>
      </div>

      {/* Comments grouped by post */}
      {grouped.length === 0 ? (
        <p className="text-gray-500 text-sm">No comments found.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {grouped.map(post => {
            const totalCount = post.comments.reduce((sum, c) => sum + 1 + c.replies.length, 0)
            return (
              <div key={post.post_id}>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {post.post_slug ? (
                      <Link to={`/blog/${post.post_slug}`} className="hover:text-blue-600 hover:underline">
                        {post.post_title || post.post_slug}
                      </Link>
                    ) : (
                      post.post_title || `Post ${post.post_id}`
                    )}
                  </h3>
                  <span className="text-xs text-gray-400">
                    {totalCount} {totalCount === 1 ? 'comment' : 'comments'}
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {post.comments.map(c => (
                    <div key={c.id}>
                      <CommentCard c={c} isReply={false} onDelete={setConfirmComment} />
                      {c.replies.length > 0 && (
                        <div className="flex flex-col gap-2 mt-2 pl-6 border-l-2 border-gray-100">
                          {c.replies.map(r => (
                            <CommentCard key={r.id} c={r} isReply={true} onDelete={setConfirmComment} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
