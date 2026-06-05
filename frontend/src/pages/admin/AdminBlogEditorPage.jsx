import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Calendar } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import RichTextEditor from '../../components/admin/RichTextEditor'
import { Field, Input, Textarea } from '../../components/admin/AdminPage'

const AUTOSAVE_DELAY = 2000

function extractExcerpt(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const tag of ['p', 'li']) {
    const el = doc.querySelector(tag)
    if (el) {
      const text = el.textContent.trim()
      if (text) return text
    }
  }
  return ''
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function tzAbbr() {
  return (
    Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value ?? 'UTC'
  )
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

const DAY_PICKER_CLASSES = {
  months: 'relative',
  month_caption: 'flex justify-center items-center h-8 mb-2',
  caption_label: 'text-sm font-semibold text-gray-800',
  nav: 'absolute inset-x-0 top-0 flex justify-between',
  button_previous: 'h-8 w-8 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 transition-colors',
  button_next: 'h-8 w-8 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 transition-colors',
  month_grid: 'w-full',
  weekdays: 'flex',
  weekday: 'flex-1 text-center text-xs font-medium text-gray-400 pb-2',
  weeks: 'flex flex-col gap-0.5',
  week: 'flex',
  day: 'flex-1 flex justify-center',
  day_button: [
    'h-8 w-8 text-sm rounded transition-colors flex items-center justify-center cursor-pointer',
    'text-gray-700 hover:bg-gray-100',
    'data-[selected]:bg-gray-900 data-[selected]:text-white data-[selected]:hover:bg-gray-700',
    'data-[today]:font-semibold data-[today]:text-gray-900',
    'data-[outside]:text-gray-300 data-[outside]:hover:bg-transparent',
    'data-[disabled]:text-gray-200 data-[disabled]:cursor-not-allowed data-[disabled]:hover:bg-transparent',
  ].join(' '),
  selected: '',
  today: '',
  outside: '',
  disabled: '',
  hidden: 'invisible',
  chevron: 'w-3.5 h-3.5 fill-gray-500',
}

function PublishDateField({ datePart, timePart, onDateChange, onTimeChange, onBlur }) {
  const tz = useMemo(tzAbbr, [])
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [timeError, setTimeError] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!calendarOpen) return
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setCalendarOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [calendarOpen])

  const selectedDate = useMemo(() => {
    if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return undefined
    const [y, m, d] = datePart.split('-').map(Number)
    return new Date(y, m - 1, d)
  }, [datePart])

  function handleDaySelect(date) {
    if (date) {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      const newDatePart = `${y}-${m}-${d}`
      onDateChange(newDatePart)
      setCalendarOpen(false)
      onBlur(newDatePart)
    } else {
      setCalendarOpen(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">Publish date</label>
      <div className="flex gap-2">
        {/* Date field */}
        <div className="relative flex-1" ref={containerRef}>
          <input
            type="text"
            value={datePart}
            onChange={e => onDateChange(e.target.value)}
            onBlur={onBlur}
            onClick={() => setCalendarOpen(true)}
            placeholder="YYYY-MM-DD"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 w-full pr-8 focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
          <button
            type="button"
            onClick={() => setCalendarOpen(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <Calendar size={13} />
          </button>

          {calendarOpen && (
            <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-[17rem]">
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={handleDaySelect}
                classNames={DAY_PICKER_CLASSES}
              />
            </div>
          )}
        </div>

        {/* Time input */}
        <div className="relative flex-1">
          <input
            type="text"
            value={timePart}
            onChange={e => {
              onTimeChange(e.target.value)
              if (timeError && TIME_RE.test(e.target.value)) setTimeError(false)
            }}
            onBlur={() => {
              if (timePart && !TIME_RE.test(timePart)) {
                setTimeError(true)
              } else {
                setTimeError(false)
                onBlur()
              }
            }}
            placeholder="00:00"
            className={`rounded-md border px-3 py-2 text-sm text-gray-900 w-full focus:outline-none focus:ring-2 focus:ring-gray-400 ${timeError ? 'border-red-400 focus:ring-red-300' : 'border-gray-300'}`}
            style={{ paddingRight: `${tz.length * 7 + 12}px` }}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none select-none">
            {tz}
          </span>
        </div>
      </div>
      {timeError && (
        <p className="text-xs text-red-500 -mt-1">Must be in format: &ldquo;15:00&rdquo;</p>
      )}
    </div>
  )
}

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
  const [publishDatePart, setPublishDatePart] = useState('')
  const [publishTimePart, setPublishTimePart] = useState('')
  const [thumbnailFilename, setThumbnailFilename] = useState('')
  const [status, setStatus] = useState('draft')

  const autosaveTimer = useRef(null)
  const pendingFields = useRef({})
  const slugEdited = useRef(false)
  const excerptEdited = useRef(false)
  const editorRef = useRef(null)

  useEffect(() => {
    fetch(`/api/admin/blog/posts/${id}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setPost(data)
        setTitle(data.title || '')
        setSlug(data.slug || '')
        slugEdited.current = (data.slug || '') !== slugify(data.title || '')
        setExcerpt(data.excerpt || '')
        excerptEdited.current = !!(data.excerpt && data.excerpt !== extractExcerpt(data.content_html || ''))
        setMetaDescription(data.meta_description || '')
        const dtStr = data.publish_date ? data.publish_date.slice(0, 16) : ''
        setPublishDatePart(dtStr ? dtStr.slice(0, 10) : '')
        setPublishTimePart(dtStr ? dtStr.slice(11, 16) : '')
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
      setExcerpt(data.excerpt || '')
      const savedDt = data.publish_date ? data.publish_date.slice(0, 16) : ''
      setPublishDatePart(savedDt ? savedDt.slice(0, 10) : '')
      setPublishTimePart(savedDt ? savedDt.slice(11, 16) : '')
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
    const newTitle = e.target.value
    setTitle(newTitle)
    if (!slugEdited.current) {
      const autoSlug = slugify(newTitle)
      setSlug(autoSlug)
      scheduleSave({ title: newTitle, slug: autoSlug })
    } else {
      scheduleSave({ title: newTitle })
    }
  }

  function handleSlugChange(e) {
    slugEdited.current = true
    setSlug(e.target.value)
  }

  function handleContentChange(html) {
    setContentHtml(html)
    if (!excerptEdited.current) {
      const autoExcerpt = extractExcerpt(html)
      setExcerpt(autoExcerpt)
      scheduleSave({ content_html: html, excerpt: autoExcerpt })
    } else {
      scheduleSave({ content_html: html })
    }
  }

  function handleExcerptChange(e) {
    excerptEdited.current = true
    setExcerpt(e.target.value)
  }

  function combinePublishDate(datePart = publishDatePart, timePart = publishTimePart) {
    if (!datePart) return null
    return timePart ? `${datePart}T${timePart}` : datePart
  }

  function handleSidebarSave(overrideDatePart) {
    clearTimeout(autosaveTimer.current)
    const dp = typeof overrideDatePart === 'string' ? overrideDatePart : publishDatePart
    save({
      slug,
      excerpt,
      meta_description: metaDescription,
      publish_date: combinePublishDate(dp),
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
      publish_date: combinePublishDate(),
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
        <Link to="/admin/blog/posts" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 shrink-0">
          <ArrowLeft size={14} strokeWidth={1.5} />Posts
        </Link>
        <div className="flex-1" />
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
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="max-w-3xl mx-auto pt-10">
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Post title"
              className="w-full text-4xl font-bold text-gray-900 outline-none border-none bg-transparent placeholder-gray-300 leading-tight px-6 pb-4"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  editorRef.current?.focusAtStart()
                }
              }}
            />
            <RichTextEditor
              ref={editorRef}
              key={post?.id}
              initialHtml={contentHtml}
              onChange={handleContentChange}
              placeholder="Start writing your post…"
            />
          </div>
        </div>

        {/* Settings sidebar */}
        <div className="w-80 shrink-0 border-l border-gray-200 bg-gray-50 overflow-y-auto p-4 flex flex-col gap-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Post settings</h3>

          <Field label="Slug">
            <Input
              value={slug}
              onChange={handleSlugChange}
              onBlur={handleSidebarSave}
              className="text-xs"
            />
          </Field>

          <Field label="Excerpt">
            <Textarea
              value={excerpt}
              onChange={handleExcerptChange}
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

          <PublishDateField
            datePart={publishDatePart}
            timePart={publishTimePart}
            onDateChange={setPublishDatePart}
            onTimeChange={setPublishTimePart}
            onBlur={handleSidebarSave}
          />

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
