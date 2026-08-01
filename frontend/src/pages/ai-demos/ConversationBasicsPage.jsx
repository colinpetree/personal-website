import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, ArrowDown, ChevronLeft } from 'lucide-react'
import { useSiteConfig } from '../../hooks/useSiteConfig'
import { useUserAuth } from '../../context/UserAuthContext'
import { Tooltip } from '../../components/ui/Tooltip'

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
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/)
    const ulMatch = line.match(/^[-*]\s+(.*)/)
    const olMatch = line.match(/^\d+\.\s+(.*)/)

    if (line.trim() === '') {
      flushPara()
      flushList()
    } else if (headingMatch) {
      flushPara()
      flushList()
      blocks.push({ type: 'h', level: headingMatch[1].length, text: headingMatch[2] })
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
      para.push(line.trim())
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
              {block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
            </ul>
          )
        }
        if (block.type === 'ol') {
          return (
            <ol key={i} className="list-decimal pl-5 flex flex-col gap-1.5">
              {block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
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
  const { user, loginWithGoogle } = useUserAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [temperature, setTemperature] = useState(1.0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showScrollButton, setShowScrollButton] = useState(false)
  const bottomRef = useRef(null)
  const scrollContainerRef = useRef(null)

  useEffect(() => {
    if (config?.site_title) {
      document.title = `Conversation basics - ${config.site_title}`
    }
  }, [config])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleScroll() {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScrollButton(distanceFromBottom > 150)
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return

    setError('')
    const history = [...messages, { role: 'user', content: text }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setSending(true)

    try {
      const res = await fetch('/api/ai-demo/conversation-basics/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages: history, system: systemPrompt, temperature }),
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Something went wrong. Please try again.')
        setMessages(history)
        setSending(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        assistantText += decoder.decode(value, { stream: true })
        setMessages([...history, { role: 'assistant', content: assistantText }])
      }
    } catch {
      setError('Network error. Please try again.')
      setMessages(history)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col lg:flex-row overflow-hidden">
      {/* Chat column */}
      <div className="order-2 flex-1 min-w-0 flex flex-col relative">
        {!user ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-6 text-center">
              <p className="text-sm text-gray-600 mb-3">Sign in to try this demo</p>
              <button
                onClick={() => loginWithGoogle(window.location.pathname)}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
              >
                Sign in with Google
              </button>
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-6 pt-8 pb-36">
              <div className="max-w-2xl mx-auto flex flex-col gap-6">
                {messages.length === 0 && (
                  <p className="text-sm text-gray-400">Say something to start the conversation.</p>
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
                        <span className="text-gray-400">…</span>
                      ) : null}
                    </div>
                  )
                ))}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 px-6 pb-6 pt-10 bg-gradient-to-t from-white via-white/85 to-transparent pointer-events-none">
              {showScrollButton && (
                <button
                  onClick={scrollToBottom}
                  aria-label="Scroll to bottom"
                  className="pointer-events-auto absolute left-1/2 -translate-x-1/2 top-0 w-8 h-8 rounded-full border border-gray-200 bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                  <ArrowDown size={15} className="text-gray-500" />
                </button>
              )}
              <div className="max-w-2xl mx-auto pointer-events-auto">
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
                    disabled={sending || !input.trim()}
                    aria-label="Send message"
                    className="w-8 h-8 flex-shrink-0 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-30 transition-colors"
                  >
                    <ArrowUp size={16} />
                  </button>
                </form>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Settings panel */}
      <div className="order-1 w-full lg:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 overflow-y-auto px-6 py-6">
        <Link to={`/${config?.ai_demo_slug ?? 'demo'}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft size={16} />
          Back to AI Implementations
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-2">Conversation basics</h1>
        <p className="text-gray-500 text-sm mb-6">
          Streaming chat with a custom system prompt and temperature control.
        </p>

        {user && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="system-prompt">System prompt</label>
              <textarea
                id="system-prompt"
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="e.g. You are a pirate. Answer every question in pirate speak."
                rows={5}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
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
        )}
      </div>
    </div>
  )
}
