import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowUp, ArrowDown, ChevronLeft, Wrench, GitBranch, RotateCcw, PanelLeft } from 'lucide-react'
import { useSiteConfig } from '../../hooks/useSiteConfig'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useRequireSignIn } from '../../hooks/useRequireSignIn'
import { useRequireAiDemoAccess } from '../../hooks/useRequireAiDemoAccess'
import { useAiDemoAccessLinks } from '../../hooks/useAiDemoAccessLinks'
import { Tooltip } from '../../components/ui/Tooltip'
import SignInRequiredModal from '../../components/SignInRequiredModal'
import AccessRequiredModal from '../../components/AccessRequiredModal'

const DEMO_KEY = 'mcp'
const DEMO_TITLE = 'MCP'

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

// The backend only needs plain {role, content} turns to keep the conversation going
// across requests — tool_call/tool_result blocks are a display-only concern, replayed
// fresh by the backend's own tool loop within a single request, not sent back by the client.
function toApiMessage(m) {
  if (m.role === 'user') return { role: 'user', content: m.content }
  const text = m.blocks.filter(b => b.type === 'text').map(b => b.text).join('\n\n')
  return { role: 'assistant', content: text || '(no response)' }
}

// Raw GitHub API responses (e.g. list_commits) can be several KB of nested JSON -
// collapsed by default so one tool call doesn't dominate the transcript.
const RESULT_PREVIEW_CHARS = 400

function ToolCard({ block }) {
  const [expanded, setExpanded] = useState(false)

  if (block.type === 'tool_call') {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 flex items-start gap-2.5">
        <Wrench size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
        <div className="min-w-0">
          <p className="text-xs text-gray-500">
            Claude is calling <span className="font-mono font-medium text-gray-700">{block.name}</span> on GitHub's MCP server
          </p>
          <pre className="mt-1 text-xs font-mono text-gray-700 whitespace-pre-wrap break-words">
            {JSON.stringify(block.input, null, 2)}
          </pre>
        </div>
      </div>
    )
  }
  const isError = block.is_error
  const fullOutput = typeof block.output === 'string' ? block.output : JSON.stringify(block.output, null, 2)
  const isTruncated = fullOutput.length > RESULT_PREVIEW_CHARS
  const shownOutput = expanded || !isTruncated ? fullOutput : fullOutput.slice(0, RESULT_PREVIEW_CHARS) + '…'
  return (
    <div className={`rounded-xl border px-3 py-2.5 flex items-start gap-2.5 ${isError ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <div className="min-w-0 flex-1">
        <p className={`text-xs ${isError ? 'text-red-600' : 'text-gray-500'}`}>
          {isError ? (
            <>Error from <span className="font-mono font-medium">{block.name}</span></>
          ) : (
            <>Result from <span className="font-mono font-medium text-gray-700">{block.name}</span>, back in the conversation</>
          )}
        </p>
        <pre className={`mt-1 text-xs font-mono whitespace-pre-wrap break-words ${isError ? 'text-red-700' : 'text-gray-600'}`}>
          {shownOutput}
        </pre>
        {isTruncated && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="mt-1 text-xs text-gray-400 hover:text-gray-600 underline"
          >
            {expanded ? 'Show less' : `Show full output (${fullOutput.length.toLocaleString()} chars)`}
          </button>
        )}
      </div>
    </div>
  )
}

export default function McpPage() {
  const { config } = useSiteConfig()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { user, signInAvailable, showSignInModal, setShowSignInModal, requireSignIn } = useRequireSignIn()
  const { hasAccess, showAccessModal, setShowAccessModal, requireAccess } = useRequireAiDemoAccess()
  const accessLinks = useAiDemoAccessLinks()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [scrollbarWidth, setScrollbarWidth] = useState(0)
  const [tools, setTools] = useState(null)
  const [repo, setRepo] = useState(null)
  const bottomRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const autoFollowRef = useRef(true)
  const programmaticScrollRef = useRef(false)
  const scrollEndTimerRef = useRef(null)
  const revealTimerRef = useRef(null)
  const abortControllerRef = useRef(null)

  useEffect(() => {
    if (config?.site_title) {
      document.title = `MCP - ${config.site_title}`
    }
  }, [config])

  // Tools are fetched live from GitHub's remote MCP server (rather than hardcoded like
  // the Tool use demo) — only once signed in AND granted access, since this endpoint is
  // both @user_required and @ai_demo_access_required. Skipping the fetch entirely when
  // !hasAccess (rather than letting it 403) keeps `tools` at its initial `null` so the
  // panel can tell "access required" apart from "no tools" below.
  useEffect(() => {
    if (!user || !hasAccess) return
    fetch('/api/ai-demo/mcp/tools', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { tools: [], repo: null })
      .then(d => {
        setTools(d.tools ?? [])
        setRepo(d.repo ?? null)
      })
      .catch(() => setTools([]))
  }, [user, hasAccess])

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
    // The in-progress assistant turn is tracked as a list of blocks so that text,
    // tool calls, and tool results can each render distinctly and interleave in order.
    const assistantBlocks = []
    setMessages([...history, { role: 'assistant', blocks: assistantBlocks }])
    setInput('')
    setSending(true)
    requestAnimationFrame(() => scrollToBottom())

    let doneReading = false
    let currentTextBlock = null
    // Only text blocks stream character-by-character; tool_call/tool_result blocks
    // appear atomically the moment their NDJSON event arrives.
    let fullText = ''
    let revealedLength = 0

    function render() {
      setMessages([...history, { role: 'assistant', blocks: [...assistantBlocks] }])
    }

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
        currentTextBlock.text = fullText.slice(0, revealedLength)
        render()
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
      const res = await fetch('/api/ai-demo/mcp/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: history.map(toApiMessage),
        }),
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

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line)
          if (event.type === 'text_delta') {
            if (!currentTextBlock) {
              currentTextBlock = { type: 'text', text: '' }
              assistantBlocks.push(currentTextBlock)
            }
            fullText += event.text
          } else if (event.type === 'tool_call') {
            currentTextBlock = null
            fullText = ''
            revealedLength = 0
            assistantBlocks.push({ type: 'tool_call', id: event.id, name: event.name, input: event.input })
            render()
          } else if (event.type === 'tool_result') {
            assistantBlocks.push({ type: 'tool_result', id: event.id, name: event.name, output: event.output, is_error: event.is_error })
            render()
          } else if (event.type === 'error') {
            setError(event.message)
          }
        }
      }
      doneReading = true
    } catch (err) {
      stopRevealing()
      if (err.name === 'AbortError') return
      setError('Network error. Please try again.')
      setMessages(history)
    }
  }

  return (
    <div className="h-[calc(100vh-4rem-1px)] flex flex-col lg:flex-row overflow-hidden relative">
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
                <p className="text-sm text-gray-400 max-w-sm">Ask about this project - "What were the last few commits?" or "What are the changes since the last version?"</p>
              </div>
            )}
            {messages.map((m, i) => (
              m.role === 'user' ? (
                <div key={i} className="self-end max-w-[85%] rounded-3xl bg-gray-100 text-gray-900 px-4 py-2.5 text-[15px] whitespace-pre-wrap">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="flex flex-col gap-3">
                  {m.blocks.length === 0 && sending && i === messages.length - 1 ? (
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-900 animate-dot-pulse" />
                  ) : (
                    m.blocks.map((block, j) => (
                      block.type === 'text' ? (
                        <div key={j} className="text-[15px] leading-7 text-gray-800">
                          <MarkdownText text={block.text} />
                        </div>
                      ) : (
                        <ToolCard key={j} block={block} />
                      )
                    ))
                  )}
                </div>
              )
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 px-6 pb-6 pt-10 pointer-events-none">
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
                placeholder="e.g. What were the last few commits?"
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
          Back to AI Implementations
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-2">MCP</h1>
        <p className="text-gray-500 text-sm mb-3">
          Ask about this site's real GitHub history via a live external MCP server.
        </p>
        <p className="text-gray-500 text-sm mb-4">
          These tools aren't defined in this app's code, and they're not even hosted by this app —
          they're served by GitHub's own remote MCP server, connected to this project's real
          repository, read-only.
        </p>

        {repo && (
          <a
            href={`https://github.com/${repo}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 mb-6 hover:border-gray-400 transition-colors"
          >
            <GitBranch size={14} className="flex-shrink-0 text-gray-400" />
            <p className="text-xs font-mono text-gray-700">{repo}</p>
          </a>
        )}

        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-gray-700">Available tools</p>
          {!user ? (
            <p className="text-xs text-gray-400">Sign in to see live tools from GitHub's MCP server.</p>
          ) : !hasAccess ? (
            <p className="text-xs text-gray-400">You need access to this demo to see live tools.</p>
          ) : tools === null ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : (
            tools.map(tool => (
              <div key={tool.name} className="rounded-lg border border-gray-200 px-3 py-2">
                <p className="text-xs font-mono font-medium text-gray-900">{tool.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{tool.description}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
