import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import RichTextEditor from '../../components/admin/RichTextEditor'
import { Field, Input, Textarea } from '../../components/admin/AdminPage'

const AUTOSAVE_DELAY = 2000

export default function AdminBlogEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved | error
  const [saveError, setSaveError] = useState('')

  // Form fields
  const [title, setTitle] = useState('')
  const [contentHtml, setContentHtml] = useState('')
  const [slug, setSlug] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [publishDate, setPublishDate] = useState('')
  const [thumbnailFilename, setThumbnailFilename] = useState('')
  const [status, setStatus] = useState('draft')

  const autosaveTimer = useRef(null)
  const pendingFields = useRef({})

  useEffect(() => {
    fetch(`/api/admin/blog/posts/${id}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setPost(data)
        setTitle(data.title || '')
        setSlug(data.slug || '')
        setExcerpt(data.excerpt || '')
        setMetaDescription(data.meta_description || '')
        setPublishDate(data.publish_date ? data.publish_date.slice(0, 16) : '')
        setThumbnailFilename(data.thumbnail_filename || '')
        setStatus(data.status || 'draft')
        // content set via RichTextEditor's initialHtml + key
        setContentHtml(data.content_html || '')
        setLoading(false)
      })
  }, [id])

  const save = useCallback(async (fields) => {
    setSaveStatus('saving')
    setSaveError('')
    try {
      const res = await fetch(`/api/admin/blog/posts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(fields),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setPost(data)
      setSlug(data.slug)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch (err) {
      setSaveStatus('error')
      setSaveError(err.message)
    }
  }, [id])

  function scheduleSave(fields) {
    pendingFields.current = { ...pendingFields.current, ...fields }
    clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      save(pendingFields.current)
      pendingFields.current = {}
    }, AUTOSAVE_DELAY)
  }

  function handleTitleChange(e) {
    setTitle(e.target.value)
    scheduleSave({ title: e.target.value })
  }

  function handleContentChange(html) {
    setContentHtml(html)
    scheduleSave({ content_html: html })
  }

  function handleSidebarSave() {
    clearTimeout(autosaveTimer.current)
    save({
      slug,
      excerpt,
      meta_description: metaDescription,
      publish_date: publishDate || null,
      thumbnail_filename: thumbnailFilename || null,
    })
  }

  async function handlePublish() {
    clearTimeout(autosaveTimer.current)
    const newStatus = status === 'published' ? 'draft' : 'published'
    const fields = {
      status: newStatus,
      slug,
      excerpt,
      meta_description: metaDescription,
      publish_date: publishDate || null,
      thumbnail_filename: thumbnailFilename || null,
    }
    await save(fields)
    setStatus(newStatus)
  }

  async function handleThumbnailUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/admin/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    if (res.ok) {
      const { filename } = await res.json()
      setThumbnailFilename(filename)
    }
    e.target.value = ''
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-200 shrink-0">
        <Link to="/admin/blog/posts" className="text-sm text-gray-400 hover:text-gray-700 shrink-0">
          ← Posts
        </Link>
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          placeholder="Post title"
          className="flex-1 text-lg font-semibold text-gray-900 outline-none border-none bg-transparent placeholder-gray-300"
        />
        <div className="flex items-center gap-3 shrink-0">
          {saveStatus === 'saving' && <span className="text-xs text-gray-400">Saving…</span>}
          {saveStatus === 'saved' && <span className="text-xs text-green-600">Saved</span>}
          {saveStatus === 'error' && <span className="text-xs text-red-500">{saveError}</span>}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {status}
          </span>
          <button
            onClick={handlePublish}
            className={`rounded-md px-4 py-1.5 text-sm font-medium text-white transition-colors ${
              status === 'published'
                ? 'bg-amber-500 hover:bg-amber-600'
                : 'bg-gray-900 hover:bg-gray-700'
            }`}
          >
            {status === 'published' ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor area */}
        <div className="flex-1 overflow-y-auto p-6">
          <RichTextEditor
            key={post?.id}
            initialHtml={contentHtml}
            onChange={handleContentChange}
            placeholder="Start writing your post…"
          />
        </div>

        {/* Settings sidebar */}
        <div className="w-64 shrink-0 border-l border-gray-200 bg-gray-50 overflow-y-auto p-4 flex flex-col gap-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Post settings</h3>

          <Field label="Slug">
            <Input
              value={slug}
              onChange={e => setSlug(e.target.value)}
              onBlur={handleSidebarSave}
              className="text-xs"
            />
          </Field>

          <Field label="Excerpt">
            <Textarea
              value={excerpt}
              onChange={e => setExcerpt(e.target.value)}
              onBlur={handleSidebarSave}
              rows={3}
              placeholder="Short description for post lists…"
            />
          </Field>

          <Field label="Meta description">
            <Textarea
              value={metaDescription}
              onChange={e => setMetaDescription(e.target.value)}
              onBlur={handleSidebarSave}
              rows={3}
              placeholder="SEO description…"
            />
          </Field>

          <Field label="Publish date">
            <Input
              type="datetime-local"
              value={publishDate}
              onChange={e => setPublishDate(e.target.value)}
              onBlur={handleSidebarSave}
            />
          </Field>

          <Field label="Thumbnail">
            {thumbnailFilename && (
              <img
                src={`/api/uploads/${thumbnailFilename}`}
                alt="Thumbnail"
                className="w-full h-28 object-cover rounded mb-2"
              />
            )}
            <label className="cursor-pointer rounded-md border border-gray-300 px-3 py-2 text-xs text-center text-gray-600 hover:bg-gray-100 transition-colors block">
              {thumbnailFilename ? 'Replace image' : 'Upload image'}
              <input type="file" accept="image/*" className="hidden" onChange={handleThumbnailUpload} />
            </label>
          </Field>

          {post && (
            <div className="mt-auto pt-4 border-t border-gray-200">
              <a
                href={`/blog/${post.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline block"
              >
                View post ↗
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
