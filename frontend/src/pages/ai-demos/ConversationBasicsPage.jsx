import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowUp, ArrowDown, ChevronLeft, RotateCcw, PanelLeft } from 'lucide-react'
import { useSiteConfig } from '../../hooks/useSiteConfig'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useRequireSignIn } from '../../hooks/useRequireSignIn'
import { useRequireAiDemoAccess } from '../../hooks/useRequireAiDemoAccess'
import { useAiDemoAccessLinks } from '../../hooks/useAiDemoAccessLinks'
import { Tooltip } from '../../components/ui/Tooltip'
import SignInRequiredModal from '../../components/SignInRequiredModal'
import AccessRequiredModal from '../../components/AccessRequiredModal'
import NotFoundPage from '../NotFoundPage'
import { isNavEnabled, setRobotsNoindex, setNotFoundDocumentHead } from '../../utils/meta'

const DEMO_KEY = 'conversation-basics'
const DEMO_TITLE = 'Conversation basics'

const SYSTEM_PROMPT_PRESETS = [
  {
    label: 'Default',
    prompt: '',
  },
  {
    label: 'Scientist',
    prompt: 'You are a scientist. Answer questions very concisely and directly, using scientific language and assuming the user can understand it. Every claim you make must include a reference to a scholarly article.',
  },
  {
    label: 'Customer service',
    prompt: 'You are a warm and polite customer service agent for a product. Use simple, concise language, present options clearly, and if you need more information to help, ask the user for it. At the end, ask an intuitive question that gets the user to engage again.',
  },
]

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
    // While streaming, a block-prefix character (#, -, 1.) can arrive on its own,
    // one tick before the space that completes it. Rendering it as literal text in
    // that instant just to replace it a moment later reads as a flash — skip it and
    // wait for it to resolve into a real heading/list item (or plain text, if the
    // marker is never followed by a space at all).
    const isPendingBlockPrefix = /^(#{1,3}|[-*]|\d+\.)$/.test(trimmed)

    if (trimmed === '' || isPendingBlockPrefix) {
      // Don't flush an in-progress list here - a blank line between list items
      // (common when Claude writes multi-sentence items) would otherwise end the
      // list and restart numbering at 1 for every item. The list only closes once
      // something that isn't a continuation of it actually appears (a paragraph,
      // heading, or a differently-typed list item), or at end of input.
      flushPara()
    } else if (headingMatch) {
      flushPara()
      flushList()
      blocks.push({ type: 'h', level: headingMatch[1].length, text: headingMatch[2] })
    } else if (indented && list) {
      // A nested sub-line under the current list item (e.g. a "- detail" bullet
      // indented under a numbered entry). This renderer has no nested-list support,
      // so fold it into the parent item's text instead of flushing the list -
      // otherwise each top-level item becomes its own single-item list and the
      // browser's <ol> auto-numbering restarts at "1." for every entry.
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

export default function ConversationBasicsPage() {
  const { config } = useSiteConfig()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { user, signInAvailable, showSignInModal, setShowSignInModal, requireSignIn } = useRequireSignIn()
  const { hasAccess, showAccessModal, setShowAccessModal, requireAccess } = useRequireAiDemoAccess()
  const accessLinks = useAiDemoAccessLinks()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [temperature, setTemperature] = useState(1.0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [scrollbarWidth, setScrollbarWidth] = useState(0)
  const bottomRef = useRef(null)
  const scrollContainerRef = useRef(null)
  // Whether the reveal timer should keep following the bottom as text streams in.
  // A real user scroll (wheel/touch, caught below) turns this off immediately. The
  // generic 'scroll' event fires for our own programmatic scrolls too, so it's only
  // allowed to turn autoFollow back *on* (when the user scrolls back near the bottom
  // themselves) — never used to detect "scrolled away," which is why the wheel/touch
  // listeners exist separately.
  const autoFollowRef = useRef(true)
  const programmaticScrollRef = useRef(false)
  const scrollEndTimerRef = useRef(null)
  const revealTimerRef = useRef(null)
  const abortControllerRef = useRef(null)

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
      document.title = `Conversation basics - ${config.site_title}`
    }
  }, [config])

  // The bottom fade/input bar is an absolutely-positioned overlay that sits on top of
  // the scrollable messages column, including its native scrollbar. Measure the
  // scrollbar's actual width so the fade background can stop short of it instead of
  // painting over (and visually fading) the scrollbar itself.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const measure = () => setScrollbarWidth(el.offsetWidth - el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const disableFollow = () => { autoFollowRef.current = false }
    el.addEventListener('wheel', disableFollow, { passive: true })
    el.addEventListener('touchmove', disableFollow, { passive: true })
    return () => {
      el.removeEventListener('wheel', disableFollow)
      el.removeEventListener('touchmove', disableFollow)
    }
  }, [])

  // If the user navigates away mid-reply, stop the reveal timer/settle timer and
  // abort the in-flight request rather than letting them run against an unmounted page.
  useEffect(() => {
    return () => {
      clearInterval(revealTimerRef.current)
      clearTimeout(scrollEndTimerRef.current)
      abortControllerRef.current?.abort()
    }
  }, [])

  function handleScroll() {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight

    if (programmaticScrollRef.current) {
      programmaticScrollRef.current = false
    } else {
      // A real user scroll is in progress. During a slow/gradual scroll, every
      // intermediate tick can briefly read as "close to the bottom" — so don't decide
      // off any single event. Wait for the gesture to settle, then judge only the
      // final resting position.
      clearTimeout(scrollEndTimerRef.current)
      scrollEndTimerRef.current = setTimeout(() => {
        const settledEl = scrollContainerRef.current
        if (!settledEl) return
        const settledDistance = settledEl.scrollHeight - settledEl.scrollTop - settledEl.clientHeight
        if (settledDistance < 4) autoFollowRef.current = true
      }, 150)
    }

    setShowScrollButton(distanceFromBottom > 150)
  }

  function scrollToBottom(behavior = 'smooth') {
    autoFollowRef.current = true
    programmaticScrollRef.current = true
    bottomRef.current?.scrollIntoView({ behavior })
  }

  function handleNewConversation() {
    abortControllerRef.current?.abort()
    clearInterval(revealTimerRef.current)
    clearTimeout(scrollEndTimerRef.current)
    autoFollowRef.current = true
    setMessages([])
    setInput('')
    setError('')
    setSending(false)
    setShowScrollButton(false)
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!requireSignIn()) return
    if (!requireAccess()) return

    const text = input.trim()
    if (!text || sending) return

    setError('')
    const history = [...messages, { role: 'user', content: text }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setSending(true)
    requestAnimationFrame(() => scrollToBottom())

    // The network delivers text in whatever chunk sizes the server/browser happen to
    // buffer — sometimes the whole reply arrives in one piece. To make the streaming
    // visible regardless of chunking, the full text is accumulated in `fullText` and
    // revealed to the UI a few characters at a time on a fixed timer, independent of
    // when the underlying chunks actually arrive.
    let fullText = ''
    let revealedLength = 0
    let doneReading = false

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
        setMessages([...history, { role: 'assistant', content: fullText.slice(0, revealedLength) }])
        if (autoFollowRef.current) {
          requestAnimationFrame(() => {
            programmaticScrollRef.current = true
            bottomRef.current?.scrollIntoView({ behavior: 'auto' })
          })
        }
      }, 15)
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch('/api/ai-demo/conversation-basics/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages: history, system: systemPrompt, temperature }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        if (data.error === 'access_required') {
          setShowAccessModal(true)
        } else {
          setError(data.error || 'Something went wrong. Please try again.')
        }
        setMessages(history)
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
      setMessages(history)
    }
  }

  if (!isNavEnabled(config, 'ai_demo')) return <NotFoundPage />

  // 4rem matches Navbar's h-16 content height, +1px for its border-b (the header
  // itself has no explicit height, so that border sits outside the 4rem).
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

      {/* Chat column */}
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
        {messages.length > 0 && (
          <Tooltip content="New conversation">
            <button
              type="button"
              onClick={handleNewConversation}
              aria-label="New conversation"
              className="absolute top-4 right-4 lg:right-auto lg:left-4 z-10 w-8 h-8 rounded-full border border-gray-200 bg-white shadow-sm flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <RotateCcw size={15} />
            </button>
          </Tooltip>
        )}
        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-6 pt-8 pb-36">
          <div className="max-w-2xl mx-auto min-h-full flex flex-col gap-6">
            {messages.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-center px-4">
                <p className="text-sm text-gray-400 max-w-sm">Say something to start the conversation.</p>
              </div>
            )}
            {messages.map((m, i) => (
              m.role === 'user' ? (
                <div key={i} className="self-end max-w-[85%] rounded-3xl bg-gray-100 text-gray-900 px-4 py-2.5 text-[15px] whitespace-pre-wrap">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="text-[15px] leading-7 text-gray-800">
                  {m.content ? (
                    <MarkdownText text={m.content} />
                  ) : sending && i === messages.length - 1 ? (
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-900 animate-dot-pulse" />
                  ) : null}
                </div>
              )
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 px-6 pb-6 pt-10 pointer-events-none">
          {/* Stops short of the scrollbar (measured above) so the fade doesn't paint
              over — and visually wash out — the messages column's own scrollbar. */}
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-t from-white via-white/85 to-transparent"
            style={{ right: scrollbarWidth }}
          />
          {showScrollButton && (
            <button
              onClick={() => scrollToBottom()}
              aria-label="Scroll to bottom"
              className="pointer-events-auto absolute left-1/2 -translate-x-1/2 top-0 w-8 h-8 rounded-full border border-gray-200 bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <ArrowDown size={15} className="text-gray-500" />
            </button>
          )}
          <div className="max-w-2xl mx-auto pointer-events-auto relative">
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
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            <form
              onSubmit={handleSend}
              className="flex items-center gap-2 rounded-3xl border border-gray-200 bg-white shadow-md px-4 py-2.5"
            >
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask anything"
                className="flex-1 bg-transparent text-[15px] text-gray-900 placeholder-gray-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={user && (sending || !input.trim())}
                aria-label="Send message"
                className="w-8 h-8 flex-shrink-0 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-30 transition-colors"
              >
                <ArrowUp size={16} />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Settings panel */}
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
          Back to AI Implementations
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-2">Conversation basics</h1>
        <p className="text-gray-500 text-sm mb-6">
          Streaming chat with a custom system prompt and temperature control.
        </p>

        <div className="flex flex-col gap-5 relative">
          {!user && signInAvailable && (
            <button
              type="button"
              aria-label="Sign in required"
              onClick={() => setShowSignInModal(true)}
              className="absolute inset-0 z-10 cursor-pointer"
            />
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700" htmlFor="system-prompt">System prompt</label>
            <textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="e.g. You are a helpful assistant. Keep answers concise and cite sources where relevant."
              rows={5}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            <div className="flex flex-wrap gap-1.5">
              {SYSTEM_PROMPT_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setSystemPrompt(preset.prompt)}
                  className="inline-flex items-center leading-none rounded-full border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors"
                >
                  <span className="translate-y-px">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Tooltip content="Higher values make responses more random and creative; lower values make them more focused and deterministic.">
              <label className="text-sm font-medium text-gray-700" htmlFor="temperature">Temperature</label>
            </Tooltip>
            <div className="flex items-center gap-3">
              <input
                id="temperature"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={e => setTemperature(parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm text-gray-500 w-8">{temperature.toFixed(1)}</span>
            </div>
            <p className="text-xs text-gray-400">
              Higher values make responses more random and creative. Lower values make them more focused and deterministic.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
