import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { ArrowLeft, Calendar, ChevronRight, ExternalLink, PanelRight, Plus, Trash2, Upload, X } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import RichTextEditor from '../../components/admin/editor'
import { Field, Input, InputWithPrefix, Textarea, Toggle } from '../../components/admin/AdminPage'
import { Tooltip } from '../../components/ui/Tooltip'
import FilterCombobox from '../../components/ui/FilterCombobox'
import { useToast } from '../../context/ToastContext'
import { useSiteConfig } from '../../hooks/useSiteConfig'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { extractExcerpt } from '../../utils/extractExcerpt'

const AUTOSAVE_DELAY = 2000

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function ordinal(day) {
  if ([1, 21, 31].includes(day)) return 'st'
  if ([2, 22].includes(day)) return 'nd'
  if ([3, 23].includes(day)) return 'rd'
  return 'th'
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

function formatPublishShort(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const month = MONTHS[d.getMonth()]
  const day = d.getDate()
  return `${month} ${day}${ordinal(day)}`
}

function formatDateTimeLong(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const month = MONTHS_SHORT[d.getMonth()]
  const day = d.getDate()
  const year = d.getFullYear()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${month} ${day}, ${year} at ${time}`
}

function formatScheduledHover(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const tz = Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? 'UTC'
  const month = MONTHS_SHORT[d.getMonth()]
  const day = d.getDate()
  const year = d.getFullYear()
  return `to be published at ${time} (${tz}) on ${month} ${day}, ${year}`
}

function countWords(html) {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent || ''
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length
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
    'data-[disabled]:text-gray-200 data-[disabled]:hover:bg-transparent',
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

// ── Publish Dialog ────────────────────────────────────────────────────────────

function PublishDialog({ publishChoice, onChoiceChange, datePart, timePart, onDateChange, onTimeChange, onDateBlur, onClose, onContinue }) {
  const canContinue = publishChoice === 'now' || (publishChoice === 'later' && datePart)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Publish</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-3">
          {/* Publish right now */}
          <button
            onClick={() => onChoiceChange('now')}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
              publishChoice === 'now' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${publishChoice === 'now' ? 'border-gray-900' : 'border-gray-300'}`}>
              {publishChoice === 'now' && <div className="w-2 h-2 rounded-full bg-gray-900" />}
            </div>
            <span className="text-sm font-medium text-gray-800">Publish Right Now</span>
          </button>

          {/* Schedule for later */}
          <div>
            <button
              onClick={() => onChoiceChange('later')}
              className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                publishChoice === 'later' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${publishChoice === 'later' ? 'border-gray-900' : 'border-gray-300'}`}>
                {publishChoice === 'later' && <div className="w-2 h-2 rounded-full bg-gray-900" />}
              </div>
              <span className="text-sm font-medium text-gray-800">Schedule for later</span>
            </button>
            {publishChoice === 'later' && (
              <div className="mt-3 px-1">
                <PublishDateField
                  datePart={datePart}
                  timePart={timePart}
                  onDateChange={onDateChange}
                  onTimeChange={onTimeChange}
                  onBlur={onDateBlur}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onContinue}
            disabled={!canContinue}
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            Continue <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Final Review Dialog ───────────────────────────────────────────────────────

function FinalReviewDialog({ publishChoice, publishDate, onBack, onClose, onConfirm, saving }) {
  const isNow = publishChoice === 'now'
  const bodyMessage = isNow
    ? 'Your post will be published on your site.'
    : `On ${formatPublishDateTime(publishDate)} your post will be published on your site.`
  const buttonLabel = isNow
    ? 'Publish post, right now'
    : `Publish post, on ${formatPublishShort(publishDate)}`

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Final Review</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <p className="text-sm text-gray-700">{bodyMessage}</p>

        <div className="flex items-center gap-3">
          <button
            onClick={onConfirm}
            disabled={saving}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Publishing…' : buttonLabel}
          </button>
          <button
            onClick={onBack}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Back to settings
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Unpublish / Unschedule Dialog ─────────────────────────────────────────────

function RevertDialog({ type, publishDate, onClose, onConfirm, saving }) {
  const isPublished = type === 'published'
  const title = isPublished ? 'Unpublish' : 'Unschedule'
  const largeText = isPublished ? 'This post has been published' : 'This post has been scheduled'
  const smallText = isPublished
    ? `Your post was published on your site on ${formatDateTimeLong(publishDate)}.`
    : `Your post will be published on your site on ${formatDateTimeLong(publishDate)}.`
  const btnLabel = isPublished
    ? 'Unpublish and revert to a private draft'
    : 'Unschedule and revert to a private draft'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-base font-medium text-gray-800">{largeText}</p>
          <p className="text-sm text-gray-500">{smallText}</p>
        </div>

        <button
          onClick={onConfirm}
          disabled={saving}
          className="self-start rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-green-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Reverting…' : btnLabel}
        </button>
      </div>
    </div>
  )
}

// ── Delete Confirmation Dialog ────────────────────────────────────────────────

function DeleteDialog({ onClose, onConfirm, deleting }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 flex flex-col gap-4">
        <h3 className="font-semibold text-gray-900">Delete post?</h3>
        <p className="text-sm text-gray-500">This will permanently delete the post and all its comments.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Editor ───────────────────────────────────────────────────────────────

export default function AdminBlogEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { config: siteConfig } = useSiteConfig()
  const { admin } = useAdminAuth()
  const [owner, setOwner] = useState(null)

  useEffect(() => {
    fetch('/api/admin/accounts/owner', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(setOwner)
      .catch(() => {})
  }, [])

  const [categories, setCategories] = useState([])

  useEffect(() => {
    fetch('/api/admin/blog/categories', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setCategories)
      .catch(() => {})
  }, [])

  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('draft')

  // Draft save status indicator
  const [draftStatus, setDraftStatus] = useState('new') // new | draft | saving | draft-saved

  // Published/scheduled dirty tracking
  const [isDirty, setIsDirty] = useState(false)
  const [updateSaving, setUpdateSaving] = useState(false)

  // Dialog states
  const [publishDialog, setPublishDialog] = useState(null) // null | 'options' | 'review'
  const [publishChoice, setPublishChoice] = useState('now')
  const [publishSaving, setPublishSaving] = useState(false)
  const [revertDialog, setRevertDialog] = useState(false)
  const [revertSaving, setRevertSaving] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Scheduled header hover
  const [scheduledHover, setScheduledHover] = useState(false)

  // Settings panel visibility
  const [panelOpen, setPanelOpen] = useState(true)

  // Form fields
  const [title, setTitle] = useState('')
  const [contentHtml, setContentHtml] = useState('')
  const [slug, setSlug] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [scrollableNavEnabled, setScrollableNavEnabled] = useState(false)
  // These are used by the sidebar AND the publish dialog
  const [publishDatePart, setPublishDatePart] = useState('')
  const [publishTimePart, setPublishTimePart] = useState('')
  // Dialog-local publish date (reset when dialog opens)
  const [dialogDatePart, setDialogDatePart] = useState('')
  const [dialogTimePart, setDialogTimePart] = useState('')
  const [thumbnailFilename, setThumbnailFilename] = useState('')
  const [thumbnailCaption, setThumbnailCaption] = useState('')
  const [thumbnailWidth, setThumbnailWidth] = useState(null)
  const [thumbnailHeight, setThumbnailHeight] = useState(null)
  const [categoryId, setCategoryId] = useState(null)

  const autosaveTimer = useRef(null)
  const pendingFields = useRef({})
  const slugEdited = useRef(false)
  const excerptEdited = useRef(false)
  const editorRef = useRef(null)
  const featureImageInputRef = useRef(null)
  const scrollContainerRef = useRef(null)

  useEffect(() => {
    fetch(`/api/admin/blog/posts/${id}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setPost(data)
        const isNew = (data.title === 'Untitled' || !data.title) && !data.content_html
        setTitle(isNew ? '' : data.title || '')
        setSlug(data.slug || '')
        slugEdited.current = !/^untitled(-\d+)?$/.test(data.slug || '')
        setExcerpt(data.excerpt || '')
        excerptEdited.current = !!(data.excerpt && data.excerpt !== extractExcerpt(data.content_html || ''))
        setMetaDescription(data.meta_description || '')
        setScrollableNavEnabled(!!data.scrollable_nav_enabled)
        const dtStr = data.publish_date ? data.publish_date.slice(0, 16) : ''
        setPublishDatePart(dtStr ? dtStr.slice(0, 10) : '')
        setPublishTimePart(dtStr ? dtStr.slice(11, 16) : '')
        setThumbnailFilename(data.thumbnail_filename || '')
        setThumbnailCaption(data.thumbnail_caption || '')
        setThumbnailWidth(data.thumbnail_width || null)
        setThumbnailHeight(data.thumbnail_height || null)
        setCategoryId(data.category_id || null)
        const s = data.status || 'draft'
        setStatus(s)
        setContentHtml(data.content_html || '')
        setDraftStatus(s === 'draft' ? (isNew ? 'new' : 'draft') : 'idle')
        setLoading(false)
        if (admin?.role === 'contributor' && data.author_id !== admin.id) {
          navigate('/admin/blog/posts', { replace: true })
        }
      })
  }, [id])

  function combineDate(dp = publishDatePart, tp = publishTimePart) {
    if (!dp) return null
    return tp ? `${dp}T${tp}` : dp
  }

  function combineDateFromDialog(dp = dialogDatePart, tp = dialogTimePart) {
    if (!dp) return null
    return tp ? `${dp}T${tp}` : dp
  }

  // ── Save helper ──────────────────────────────────────────────────────────────

  const save = useCallback(async (fields) => {
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
    return data
  }, [id])

  // ── Auto-save (draft only) ───────────────────────────────────────────────────

  function scheduleSave(fields) {
    if (status !== 'draft') return
    setDraftStatus('draft')
    pendingFields.current = { ...pendingFields.current, ...fields }
    clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(async () => {
      const savingIndicatorTimer = setTimeout(() => setDraftStatus('saving'), 200)
      try {
        await save(pendingFields.current)
        pendingFields.current = {}
        clearTimeout(savingIndicatorTimer)
        setDraftStatus('draft-saved')
      } catch {
        clearTimeout(savingIndicatorTimer)
        setDraftStatus('draft')
      }
    }, AUTOSAVE_DELAY)
  }

  // ── Field handlers ───────────────────────────────────────────────────────────

  function markDirty() {
    if (status !== 'draft') setIsDirty(true)
  }

  function handleTitleChange(e) {
    const newTitle = e.target.value
    setTitle(newTitle)
    markDirty()
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
    markDirty()
  }

  function handleContentChange(html) {
    setContentHtml(html)
    markDirty()
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
    markDirty()
  }

  function handleSidebarSave(overrideDatePart, overrideFields = {}) {
    if (status !== 'draft') return
    clearTimeout(autosaveTimer.current)
    const dp = typeof overrideDatePart === 'string' ? overrideDatePart : publishDatePart
    save({
      slug,
      excerpt,
      meta_description: metaDescription,
      scrollable_nav_enabled: scrollableNavEnabled,
      publish_date: combineDate(dp),
      thumbnail_filename: thumbnailFilename || null,
      thumbnail_caption: thumbnailCaption || null,
      thumbnail_width: thumbnailWidth || null,
      thumbnail_height: thumbnailHeight || null,
      category_id: categoryId || null,
      ...overrideFields,
    }).catch(() => {})
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
      const img = new Image()
      img.onload = () => {
        setThumbnailWidth(img.naturalWidth)
        setThumbnailHeight(img.naturalHeight)
      }
      img.src = `/api/uploads/${filename}`
      markDirty()
    }
    e.target.value = ''
  }

  // ── Publish flow ─────────────────────────────────────────────────────────────

  function openPublishDialog() {
    setPublishChoice('now')
    setDialogDatePart(publishDatePart)
    setDialogTimePart(publishTimePart)
    setPublishDialog('options')
  }

  async function handlePublishConfirm() {
    slugEdited.current = true
    setPublishSaving(true)
    const isScheduled = publishChoice === 'later'
    const publishDate = isScheduled ? combineDateFromDialog() : new Date().toISOString().slice(0, 16)
    try {
      const data = await save({
        status: isScheduled ? 'scheduled' : 'published',
        publish_date: publishDate,
        slug,
        excerpt,
        meta_description: metaDescription,
        scrollable_nav_enabled: scrollableNavEnabled,
        thumbnail_filename: thumbnailFilename || null,
        thumbnail_caption: thumbnailCaption || null,
        thumbnail_width: thumbnailWidth || null,
        thumbnail_height: thumbnailHeight || null,
        category_id: categoryId || null,
      })
      setPublishDialog(null)
      navigate('/admin/blog/posts', {
        state: {
          publishConfirm: {
            slug: data.slug,
            title: data.title,
            isScheduled,
            publishDate: data.publish_date,
          },
        },
      })
    } catch (err) {
      addToast({ message: err.message || 'Failed to publish post' })
      setPublishSaving(false)
    }
  }

  // ── Revert (unpublish / unschedule) ──────────────────────────────────────────

  async function handleRevertConfirm() {
    setRevertSaving(true)
    try {
      await save({ status: 'draft' })
      setStatus('draft')
      setDraftStatus('draft')
      setRevertDialog(false)
      setIsDirty(false)
      addToast({ message: 'Post reverted to a draft.' })
    } catch {
      setRevertSaving(false)
    }
  }

  // ── Update (published/scheduled) ─────────────────────────────────────────────

  async function handleUpdate() {
    const savingIndicatorTimer = setTimeout(() => setUpdateSaving(true), 200)
    try {
      const data = await save({
        slug,
        excerpt,
        meta_description: metaDescription,
        scrollable_nav_enabled: scrollableNavEnabled,
        publish_date: combineDate(),
        thumbnail_filename: thumbnailFilename || null,
        thumbnail_caption: thumbnailCaption || null,
        thumbnail_width: thumbnailWidth || null,
        thumbnail_height: thumbnailHeight || null,
        category_id: categoryId || null,
        content_html: contentHtml,
        title,
      })
      setIsDirty(false)
      if (status === 'scheduled') {
        const tz = tzAbbr()
        const d = new Date(data.publish_date)
        const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        const month = MONTHS_SHORT[d.getMonth()]
        const day = d.getDate()
        const year = d.getFullYear()
        addToast({ message: 'Post scheduled', subtext: `Will be published on ${month} ${day}, ${year} at ${time} (${tz})` })
      } else {
        addToast({
          message: 'Post updated',
          subtext: 'View on site',
          subtextHref: `/${data.slug}`,
        })
      }
    } catch (err) {
      addToast({ message: err.message || 'Failed to update post' })
    } finally {
      clearTimeout(savingIndicatorTimer)
      setUpdateSaving(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/admin/blog/posts/${id}`, { method: 'DELETE', credentials: 'include' })
    navigate('/admin/blog/posts', { state: { deleted: true } })
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  const wordCount = countWords(contentHtml)
  const publishDateIso = combineDate()

  // ── Header status indicator ──────────────────────────────────────────────────

  function HeaderStatus() {
    if (status === 'published') {
      return (
        <a
          href={`/${post?.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 hover:font-semibold transition-all"
        >
          Published <ExternalLink size={11} />
        </a>
      )
    }
    if (status === 'scheduled') {
      return (
        <span
          className="text-xs font-medium cursor-default transition-all"
          style={{ color: '#30cf43' }}
          onMouseEnter={() => setScheduledHover(true)}
          onMouseLeave={() => setScheduledHover(false)}
        >
          Scheduled
          {scheduledHover && publishDateIso && (
            <span className="text-gray-400 font-normal ml-1">{formatScheduledHover(publishDateIso)}</span>
          )}
        </span>
      )
    }
    // draft
    if (draftStatus === 'new') return <span className="text-xs text-gray-400">New</span>
    if (draftStatus === 'saving') return <span className="text-xs text-gray-400">Saving...</span>
    if (draftStatus === 'draft-saved') return <span className="text-xs text-gray-400">Draft - Saved</span>
    if (draftStatus === 'draft') return <span className="text-xs text-gray-400">Draft</span>
    return null
  }

  // ── Action buttons ───────────────────────────────────────────────────────────

  function ActionButtons() {
    const isContributor = admin?.role === 'contributor'

    if (status === 'draft') {
      return (
        <button
          onClick={isContributor ? undefined : openPublishDialog}
          disabled={isContributor}
          title={isContributor ? 'Editors must review and publish your post' : undefined}
          className={`rounded-md bg-white px-4 py-1.5 text-sm font-medium transition-colors ${
            isContributor
              ? 'text-gray-400 opacity-50 cursor-not-allowed'
              : 'text-green-600 hover:bg-gray-100'
          }`}
        >
          Publish
        </button>
      )
    }

    const revertLabel = status === 'scheduled' ? 'Unschedule' : 'Unpublish'

    return (
      <>
        <button
          onClick={handleUpdate}
          disabled={!isDirty || updateSaving}
          className="rounded-md bg-white px-4 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-40 transition-colors"
        >
          {updateSaving ? 'Updating...' : 'Update'}
        </button>
        <button
          onClick={isContributor ? undefined : () => setRevertDialog(true)}
          disabled={isContributor}
          title={isContributor ? 'Only Editors and above can unpublish posts' : undefined}
          className={`rounded-md bg-white px-4 py-1.5 text-sm font-medium transition-colors ${
            isContributor
              ? 'text-gray-400 opacity-50 cursor-not-allowed'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {revertLabel}
        </button>
      </>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="sticky top-0 z-[10000] flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-200 shrink-0">
        <Link to="/admin/blog/posts" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 shrink-0">
          <ArrowLeft size={14} strokeWidth={1.5} />Posts
        </Link>
        <HeaderStatus />
        <div className="flex-1" />
        <div className="flex items-center gap-2 shrink-0">
          <ActionButtons />
          <Tooltip content={panelOpen ? 'Hide settings' : 'Show settings'}>
            <button
              onClick={() => setPanelOpen(v => !v)}
              className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <PanelRight size={16} strokeWidth={1.5} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Editor area */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-white relative editor-scroll-area">
          <div className="max-w-3xl mx-auto px-6 pt-10">
            {/* Feature Image */}
            {thumbnailFilename ? (
              <div className="relative group mb-6">
                <div className="max-w-[740px] mx-auto rounded-lg overflow-hidden">
                  <img
                    src={`/api/uploads/${thumbnailFilename}`}
                    alt="Feature image"
                    width={thumbnailWidth || undefined}
                    height={thumbnailHeight || undefined}
                    className="max-w-full max-h-[600px] w-auto h-auto block"
                  />
                </div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white border border-gray-200 rounded-lg shadow-sm p-1">
                  <button
                    type="button"
                    onClick={() => featureImageInputRef.current?.click()}
                    className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
                    aria-label="Replace feature image"
                  >
                    <Upload size={12} className="text-gray-500" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setThumbnailFilename(null); markDirty() }}
                    className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors"
                    aria-label="Remove feature image"
                  >
                    <Trash2 size={12} className="text-red-400" />
                  </button>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={featureImageInputRef}
                  onChange={handleThumbnailUpload}
                />
                <input
                  type="text"
                  value={thumbnailCaption}
                  onChange={e => { setThumbnailCaption(e.target.value); markDirty() }}
                  placeholder="Type caption for feature image (optional)"
                  className="w-full text-sm text-gray-500 text-center bg-transparent border-0 outline-none py-2 px-4 placeholder-gray-400"
                />
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => featureImageInputRef.current?.click()}
                  className="w-full mb-6 py-3 text-sm text-gray-400 bg-white hover:bg-gray-50 transition-colors rounded-lg flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} />
                  Add feature image
                </button>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={featureImageInputRef}
                  onChange={handleThumbnailUpload}
                />
              </>
            )}
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Post title"
              className="w-full text-4xl font-bold text-gray-900 outline-none border-none bg-transparent placeholder-gray-300 leading-tight pb-4"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  editorRef.current?.focusAtStart()
                }
              }}
            />
          </div>
          <RichTextEditor
            ref={editorRef}
            key={post?.id}
            initialHtml={contentHtml}
            onChange={handleContentChange}
            placeholder=""
          />
          <div style={{ height: '33vh' }} onClick={() => {
            editorRef.current?.focusAtEnd()
            requestAnimationFrame(() => {
              scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight })
            })
          }} />
        </div>

        {/* Backdrop — mobile only, dismisses the overlay sidebar */}
        {panelOpen && (
          <div
            className="lg:hidden absolute inset-0 z-40 bg-black/20"
            onClick={() => setPanelOpen(false)}
          />
        )}

        {/* Settings sidebar — overlay on mobile, push on md+ */}
        <div className={`absolute lg:static inset-y-0 right-0 z-50 lg:z-auto shrink-0 overflow-hidden transition-all duration-200 ${panelOpen ? 'w-80' : 'w-0'}`}>
        <div className="w-80 h-full border-l border-gray-200 bg-gray-50 overflow-y-auto p-4 flex flex-col gap-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Post settings</h3>

          {/* Author (display-only, always the Owner) */}
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-gray-700">Author</p>
            {owner ? (
              <div className="flex items-center gap-2">
                {owner.avatar_filename ? (
                  <img src={`/api/uploads/${owner.avatar_filename}`} className="w-6 h-6 rounded-full object-cover" alt={owner.full_name} />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-600">
                    {(owner.full_name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-gray-900">{owner.full_name}</span>
              </div>
            ) : (
              <span className="text-sm text-gray-400">—</span>
            )}
            <p className="text-xs text-gray-400">Edit the Owner account to change the author</p>
          </div>

          <Field label="Slug">
            <InputWithPrefix
              prefix="/"
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
              onChange={e => { setMetaDescription(e.target.value); markDirty() }}
              onBlur={handleSidebarSave}
              rows={3}
              placeholder="SEO description…"
            />
          </Field>

          <Field label="Category">
            <FilterCombobox
              value={categoryId}
              onChange={v => { setCategoryId(v); markDirty(); handleSidebarSave(undefined, { category_id: v }) }}
              options={categories.map(c => ({ value: c.id, label: c.name }))}
              placeholder="No category"
              className="w-full"
            />
          </Field>

          <Toggle
            label="Scrollable header navigation"
            checked={scrollableNavEnabled}
            onChange={v => { setScrollableNavEnabled(v); markDirty(); handleSidebarSave(undefined, { scrollable_nav_enabled: v }) }}
          />

          <PublishDateField
            datePart={publishDatePart}
            timePart={publishTimePart}
            onDateChange={v => { setPublishDatePart(v); markDirty() }}
            onTimeChange={v => { setPublishTimePart(v); markDirty() }}
            onBlur={handleSidebarSave}
          />

          {post && (
            <button
              onClick={() => setDeleteDialog(true)}
              className="w-full rounded-md border border-red-400 px-3 py-2 text-xs text-center text-red-500 hover:bg-red-50 transition-colors block"
            >
              Delete post
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Dialogs */}
      {publishDialog === 'options' && (
        <PublishDialog
          publishChoice={publishChoice}
          onChoiceChange={setPublishChoice}
          datePart={dialogDatePart}
          timePart={dialogTimePart}
          onDateChange={setDialogDatePart}
          onTimeChange={setDialogTimePart}
          onDateBlur={() => {}}
          onClose={() => setPublishDialog(null)}
          onContinue={() => setPublishDialog('review')}
        />
      )}

      {publishDialog === 'review' && (
        <FinalReviewDialog
          publishChoice={publishChoice}
          publishDate={combineDateFromDialog()}
          onBack={() => setPublishDialog('options')}
          onClose={() => setPublishDialog(null)}
          onConfirm={handlePublishConfirm}
          saving={publishSaving}
        />
      )}

      {revertDialog && (
        <RevertDialog
          type={status}
          publishDate={publishDateIso}
          onClose={() => setRevertDialog(false)}
          onConfirm={handleRevertConfirm}
          saving={revertSaving}
        />
      )}

      {deleteDialog && (
        <DeleteDialog
          onClose={() => setDeleteDialog(false)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}

      {/* Word count */}
      <div className="fixed bottom-4 pointer-events-none transition-all duration-200" style={{ right: panelOpen ? '320px' : '16px' }}>
        <span className="text-xs text-gray-300 pr-4">
          {wordCount === 1 ? '1 word' : `${wordCount} words`}
        </span>
      </div>
    </div>
  )
}
