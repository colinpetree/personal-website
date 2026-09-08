import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, ImagePlus, RotateCcw, Sparkles, PanelLeft } from 'lucide-react'
import { useSiteConfig } from '../../hooks/useSiteConfig'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useRequireSignIn } from '../../hooks/useRequireSignIn'
import { useRequireAiDemoAccess } from '../../hooks/useRequireAiDemoAccess'
import { useAiDemoAccessLinks } from '../../hooks/useAiDemoAccessLinks'
import SignInRequiredModal from '../../components/SignInRequiredModal'
import AccessRequiredModal from '../../components/AccessRequiredModal'
import NotFoundPage from '../NotFoundPage'
import { isNavEnabled, setRobotsNoindex, setNotFoundDocumentHead } from '../../utils/meta'

const DEMO_KEY = 'image-processing'
const DEMO_TITLE = 'Image processing'

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// Minimal markdown -> React renderer (headings, bold/italic/inline code, lists,
// paragraphs) — enough to render Claude's typical formatting without a new dependency.
function renderInline(text) {
  const parts = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let lastIndex = 0
  let match
  let i = 0
  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    const token = match[0]
    if (token.startsWith('**')) {
      parts.push(<strong key={i++}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      parts.push(<code key={i++} className="bg-gray-100 rounded px-1 py-0.5 text-[0.85em]">{token.slice(1, -1)}</code>)
    } else {
      parts.push(<em key={i++}>{token.slice(1, -1)}</em>)
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function parseMarkdownBlocks(text) {
  const lines = text.split('\n')
  const blocks = []
  let para = []
  let list = null

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'p', text: para.join(' ') })
      para = []
    }
  }
  const flushList = () => {
    if (list) {
      blocks.push(list)
      list = null
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()
    const indented = /^\s/.test(rawLine) && trimmed !== ''
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/)
    const ulMatch = trimmed.match(/^[-*]\s+(.*)/)
    const olMatch = trimmed.match(/^\d+\.\s+(.*)/)
    const isPendingBlockPrefix = /^(#{1,3}|[-*]|\d+\.)$/.test(trimmed)

    if (trimmed === '' || isPendingBlockPrefix) {
      flushPara()
    } else if (headingMatch) {
      flushPara()
      flushList()
      blocks.push({ type: 'h', level: headingMatch[1].length, text: headingMatch[2] })
    } else if (indented && list) {
      const content = (ulMatch || olMatch)?.[1] ?? trimmed
      list.items[list.items.length - 1] += `\n${content}`
    } else if (ulMatch) {
      flushPara()
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] } }
      list.items.push(ulMatch[1])
    } else if (olMatch) {
      flushPara()
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] } }
      list.items.push(olMatch[1])
    } else {
      flushList()
      para.push(trimmed)
    }
  }
  flushPara()
  flushList()
  return blocks
}

function MarkdownText({ text }) {
  const blocks = parseMarkdownBlocks(text)
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, i) => {
        if (block.type === 'h') {
          const Tag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4'
          return <Tag key={i} className="font-semibold text-gray-900">{renderInline(block.text)}</Tag>
        }
        if (block.type === 'ul') {
          return (
            <ul key={i} className="list-disc pl-5 flex flex-col gap-1.5">
              {block.items.map((item, j) => <li key={j} className="whitespace-pre-line">{renderInline(item)}</li>)}
            </ul>
          )
        }
        if (block.type === 'ol') {
          return (
            <ol key={i} className="list-decimal pl-5 flex flex-col gap-1.5">
              {block.items.map((item, j) => <li key={j} className="whitespace-pre-line">{renderInline(item)}</li>)}
            </ol>
          )
        }
        return <p key={i}>{renderInline(block.text)}</p>
      })}
    </div>
  )
}

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export default function VisionPage() {
  const { config } = useSiteConfig()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { user, signInAvailable, showSignInModal, setShowSignInModal, requireSignIn } = useRequireSignIn()
  const { hasAccess, showAccessModal, setShowAccessModal, requireAccess } = useRequireAiDemoAccess()
  const accessLinks = useAiDemoAccessLinks()
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [answer, setAnswer] = useState('')
  const [dragging, setDragging] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const revealTimerRef = useRef(null)
  const abortControllerRef = useRef(null)
  const fileInputRef = useRef(null)
  // Mirrors previewUrl so the mount-only unmount-cleanup effect below can read the
  // current blob URL instead of the empty string it closed over at mount time.
  const previewUrlRef = useRef('')

  useEffect(() => {
    if (!isNavEnabled(config, 'ai_demo')) {
      setNotFoundDocumentHead(config)
      // Cleared on unmount (client-side nav away), not just on the next
      // render here — this tag is a raw DOM mutation outside React's own
      // meta rendering, so nothing else in the app knows to remove it. Left
      // in place, it would silently noindex whatever page the visitor lands
      // on next, even a fully enabled one with no robots tag of its own.
      return () => setRobotsNoindex(false)
    }
    setRobotsNoindex(false)
    if (config?.site_title) {
      document.title = `Image processing - ${config.site_title}`
    }
  }, [config])

  useEffect(() => {
    previewUrlRef.current = previewUrl
  }, [previewUrl])

  useEffect(() => {
    return () => {
      clearInterval(revealTimerRef.current)
      abortControllerRef.current?.abort()
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  function pickFile(candidate) {
    if (!candidate) return
    if (!ALLOWED_MEDIA_TYPES.includes(candidate.type)) {
      setError('Please choose a JPEG, PNG, GIF, or WebP image.')
      return
    }
    if (candidate.size > MAX_IMAGE_BYTES) {
      setError(`Images must be ${formatBytes(MAX_IMAGE_BYTES)} or smaller.`)
      return
    }
    setError('')
    setAnswer('')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(candidate))
    setFile(candidate)
  }

  function handleReset() {
    abortControllerRef.current?.abort()
    clearInterval(revealTimerRef.current)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl('')
    setAnswer('')
    setError('')
    setSending(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleAnalyze() {
    if (!requireSignIn()) return
    if (!requireAccess()) return
    if (!file || sending) return

    setError('')
    setAnswer('')
    setSending(true)

    let doneReading = false
    let fullText = ''
    let revealedLength = 0

    function stopRevealing() {
      clearInterval(revealTimerRef.current)
      revealTimerRef.current = null
      setSending(false)
    }

    function startRevealing() {
      revealTimerRef.current = setInterval(() => {
        if (revealedLength >= fullText.length) {
          if (doneReading) stopRevealing()
          return
        }
        const backlog = fullText.length - revealedLength
        const step = backlog > 60 ? Math.ceil(backlog / 30) : 1
        revealedLength = Math.min(fullText.length, revealedLength + step)
        setAnswer(fullText.slice(0, revealedLength))
      }, 15)
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      const base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1)

      const res = await fetch('/api/ai-demo/image-processing/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ image: base64Data, media_type: file.type }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        if (data.error === 'access_required') {
          setShowAccessModal(true)
        } else {
          setError(data.error || 'Something went wrong. Please try again.')
        }
        setSending(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      startRevealing()

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          doneReading = true
          break
        }
        fullText += decoder.decode(value, { stream: true })
      }
    } catch (err) {
      stopRevealing()
      if (err.name === 'AbortError') return
      setError('Network error. Please try again.')
    }
  }

  if (!isNavEnabled(config, 'ai_demo')) return <NotFoundPage />

  return (
    <div className="h-[calc(100dvh-4rem-1px)] flex flex-col lg:flex-row overflow-hidden relative">
      {showSignInModal && <SignInRequiredModal onClose={() => setShowSignInModal(false)} />}
      {showAccessModal && (
        <AccessRequiredModal
          onClose={() => setShowAccessModal(false)}
          demoKey={DEMO_KEY}
          demoTitle={DEMO_TITLE}
          link={accessLinks[DEMO_KEY]}
        />
      )}

      {panelOpen && (
        <div
          className="absolute inset-0 z-20 bg-black/30 lg:hidden"
          onClick={() => setPanelOpen(false)}
        />
      )}

      {/* Upload + result column */}
      <div className="order-2 flex-1 min-w-0 min-h-0 flex flex-col relative">
        {!panelOpen && (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            aria-label="Open info panel"
            className="lg:hidden absolute top-4 left-4 z-10 w-8 h-8 rounded-lg border border-gray-200 bg-white shadow-sm flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <PanelLeft size={15} />
          </button>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-8 relative">
        <div className="max-w-2xl mx-auto flex flex-col gap-6">
          {!user && signInAvailable && (
            <button
              type="button"
              aria-label="Sign in required"
              onClick={() => setShowSignInModal(true)}
              className="absolute inset-0 z-10 cursor-pointer"
            />
          )}
          {user && !hasAccess && (
            <button
              type="button"
              aria-label="Access required"
              onClick={() => setShowAccessModal(true)}
              className="absolute inset-0 z-10 cursor-pointer"
            />
          )}

          {!previewUrl ? (
            <label
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault()
                setDragging(false)
                pickFile(e.dataTransfer.files?.[0])
              }}
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-16 text-center cursor-pointer transition-colors ${
                dragging ? 'border-gray-400 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <ImagePlus size={28} className="text-gray-400" />
              <p className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-400">JPEG, PNG, GIF, or WebP - up to {formatBytes(MAX_IMAGE_BYTES)}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_MEDIA_TYPES.join(',')}
                className="hidden"
                onChange={e => pickFile(e.target.files?.[0])}
              />
            </label>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="relative rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                <img src={previewUrl} alt="Selected upload" className="max-h-96 w-full object-contain" />
                <button
                  type="button"
                  onClick={handleReset}
                  aria-label="New image"
                  className="absolute top-3 right-3 w-8 h-8 rounded-full border border-gray-200 bg-white shadow-sm flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  <RotateCcw size={15} />
                </button>
              </div>

              {!answer && (
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={user && sending}
                  className="self-start inline-flex items-center gap-2 rounded-full bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors"
                >
                  <Sparkles size={15} />
                  {sending ? 'Analyzing...' : 'Analyze image'}
                </button>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {(answer || (sending && file)) && (
            <div className="text-[15px] leading-7 text-gray-800">
              {answer ? <MarkdownText text={answer} /> : (
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-900 animate-dot-pulse" />
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Info panel */}
      <div
        inert={panelOpen || isDesktop ? undefined : ''}
        aria-hidden={!panelOpen && !isDesktop}
        className={`order-1 absolute lg:static inset-y-0 left-0 z-30 lg:z-auto w-72 max-w-[85%] lg:w-80 flex-shrink-0 min-h-0 border-r border-gray-200 overflow-y-auto px-6 py-6 bg-white shadow-xl lg:shadow-none transform transition-transform duration-300 ease-in-out ${panelOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        <button
          type="button"
          onClick={() => setPanelOpen(false)}
          aria-label="Close info panel"
          className="lg:hidden absolute top-4 right-4 z-10 w-8 h-8 rounded-lg border border-gray-200 bg-white shadow-sm flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <PanelLeft size={15} />
        </button>
        <Link to={`/${config?.ai_demo_slug ?? 'demo'}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft size={16} />
          Back to {config?.nav?.find(n => n.key === 'ai_demo')?.name || 'AI Demos'}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-2">Image processing</h1>
        <p className="text-gray-500 text-sm mb-6">
          Upload an image and see the AI assistant analyze it directly.
        </p>

        <div className="flex flex-col gap-3 text-sm text-gray-600">
          <p>
            The image is sent to Claude as part of a single request alongside a general-purpose analysis prompt,
            then the response is streamed back and displayed on the page.
          </p>
        </div>
      </div>
    </div>
  )
}
