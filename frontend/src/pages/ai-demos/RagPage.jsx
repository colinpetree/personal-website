import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowUp, ChevronLeft, Download, ExternalLink, Search, PanelLeft } from 'lucide-react'
import { useSiteConfig } from '../../hooks/useSiteConfig'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useRequireSignIn } from '../../hooks/useRequireSignIn'
import { useRequireAiDemoAccess } from '../../hooks/useRequireAiDemoAccess'
import { useAiDemoAccessLinks } from '../../hooks/useAiDemoAccessLinks'
import SignInRequiredModal from '../../components/SignInRequiredModal'
import AccessRequiredModal from '../../components/AccessRequiredModal'

const DEMO_KEY = 'rag'
const DEMO_TITLE = 'RAG / hybrid search'

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

function chunkPreview(content) {
  const flat = content.replace(/\s+/g, ' ').trim()
  return flat.length > 180 ? `${flat.slice(0, 180)}...` : flat
}

function ResultColumn({ label, description, results }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-gray-900 uppercase tracking-wide">{label}</p>
      <p className="text-[11px] text-gray-400 mb-2.5">{description}</p>
      <div className="flex flex-col gap-2">
        {results.map(r => (
          <div key={r.rank} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <span className="inline-block text-[10px] font-medium text-gray-400 border border-gray-200 rounded px-1 mb-1">#{r.rank}</span>
            <p className="text-[11px] text-gray-600 leading-snug">{chunkPreview(r.content)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatVector(vector) {
  return `[${vector.map(v => v.toFixed(4)).join(', ')}, ...]`
}

function EmbeddingPanel({ embedding }) {
  if (!embedding) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 flex flex-col gap-2.5">
      <p className="text-[11px] text-gray-500">
        {embedding.chunk_count} document chunks were embedded via Voyage (
        <code className="bg-white border border-gray-200 rounded px-1">{embedding.model}</code>, {embedding.dimensions} dimensions each).
        Here's a real sample from chunk #{embedding.document_sample.chunk_index}:
      </p>
      <p className="text-[11px] text-gray-400 italic truncate">"{embedding.document_sample.preview}..."</p>
      <p className="text-[11px] font-mono text-gray-700 break-all">{formatVector(embedding.document_sample.vector_preview)}</p>

      <div className="border-t border-gray-200 pt-2.5">
        <p className="text-[11px] text-gray-500">Your query was embedded the same way:</p>
        <p className="text-[11px] font-mono text-gray-700 break-all mt-1">{formatVector(embedding.query_sample.vector_preview)}</p>
      </div>
    </div>
  )
}

export default function RagPage() {
  const { config } = useSiteConfig()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { user, signInAvailable, showSignInModal, setShowSignInModal, requireSignIn } = useRequireSignIn()
  const { hasAccess, showAccessModal, setShowAccessModal, requireAccess } = useRequireAiDemoAccess()
  const accessLinks = useAiDemoAccessLinks()
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null) // { vector, bm25, hybrid }
  const [embedding, setEmbedding] = useState(null)
  const [answer, setAnswer] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const revealTimerRef = useRef(null)
  const abortControllerRef = useRef(null)

  useEffect(() => {
    if (config?.site_title) {
      document.title = `RAG / hybrid search - ${config.site_title}`
    }
  }, [config])

  useEffect(() => {
    return () => {
      clearInterval(revealTimerRef.current)
      abortControllerRef.current?.abort()
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!requireSignIn()) return
    if (!requireAccess()) return

    const text = query.trim()
    if (!text || sending) return

    setError('')
    setResults(null)
    setEmbedding(null)
    setAnswer('')
    setSubmittedQuery(text)
    setQuery('')
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
      const res = await fetch('/api/ai-demo/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: text }),
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
          if (event.type === 'embedding') {
            setEmbedding({
              model: event.model,
              dimensions: event.dimensions,
              chunk_count: event.chunk_count,
              document_sample: event.document_sample,
              query_sample: event.query_sample,
            })
          } else if (event.type === 'retrieval') {
            setResults({ vector: event.vector, bm25: event.bm25, hybrid: event.hybrid })
          } else if (event.type === 'text_delta') {
            if (!revealTimerRef.current) startRevealing()
            fullText += event.text
          } else if (event.type === 'error') {
            setError(event.message)
          }
        }
      }
      doneReading = true
      if (!revealTimerRef.current) setSending(false)
    } catch (err) {
      stopRevealing()
      if (err.name === 'AbortError') return
      setError('Network error. Please try again.')
    }
  }

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

      {/* Search + results column */}
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
        <div className="flex-1 overflow-y-auto px-6 pt-8 pb-36">
          <div className="max-w-3xl mx-auto min-h-full flex flex-col gap-6">
            {submittedQuery && (
              <div className="self-end max-w-[85%] rounded-3xl bg-gray-100 text-gray-900 px-4 py-2.5 text-[15px] whitespace-pre-wrap">
                {submittedQuery}
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            {!results && !sending && !error && !submittedQuery && (
              <div className="flex-1 flex items-center justify-center text-center px-4">
                <p className="text-sm text-gray-400 max-w-sm">
                  Ask a question about the sample research report to see how vector, keyword, and hybrid retrieval each rank its sections.
                </p>
              </div>
            )}

            {embedding && <EmbeddingPanel embedding={embedding} />}

            {results && (
              <div className="flex flex-col sm:flex-row gap-5 pb-2 border-b border-gray-100">
                <ResultColumn label="Vector" description="Semantic similarity" results={results.vector} />
                <ResultColumn label="Keyword (BM25)" description="Exact term matches" results={results.bm25} />
                <ResultColumn label="Hybrid" description="Reciprocal rank fusion" results={results.hybrid} />
              </div>
            )}

            {(answer || (sending && results)) && (
              <div className="text-[15px] leading-7 text-gray-800">
                {answer ? <MarkdownText text={answer} /> : (
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-900 animate-dot-pulse" />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 px-6 pb-6 pt-10 pointer-events-none">
          <div className="absolute inset-y-0 left-0 right-0 bg-gradient-to-t from-white via-white/85 to-transparent" />
          <div className="max-w-3xl mx-auto pointer-events-auto relative">
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
            <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-3xl border border-gray-200 bg-white shadow-md px-4 py-2.5">
              <Search size={16} className="text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="e.g. How does DESeq2 handle outliers?"
                className="flex-1 bg-transparent text-[15px] text-gray-900 placeholder-gray-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={user && (sending || !query.trim())}
                aria-label="Search"
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
        <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-2">RAG / hybrid search</h1>
        <p className="text-gray-500 text-sm mb-6">
          Search a fixed sample document with three retrieval methods, then see an answer grounded in the results.
        </p>

        <div className="flex flex-col gap-3 text-sm text-gray-600">
          <p>
            <strong className="text-gray-800">Vector</strong> search embeds the query and each document section, then ranks by
            semantic similarity. It matches meaning even without shared words.
          </p>
          <p>
            <strong className="text-gray-800">Keyword (BM25)</strong> search ranks by exact term overlap, weighted by how
            distinctive and dense those terms are in a section.
          </p>
          <p>
            <strong className="text-gray-800">Hybrid</strong> combines both rankings via reciprocal rank fusion. The final
            answer below is generated only from the hybrid results.
          </p>
        </div>

        <div className="mt-6 pt-5 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">Source document</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            Love MI, Huber W, Anders S. "Moderated estimation of fold change and dispersion for RNA-seq data with
            DESeq2." <em>Genome Biology</em> 15:550 (2014).
          </p>
          <div className="flex flex-col gap-1.5 mt-2.5">
            <a
              href="https://doi.org/10.1186/s13059-014-0550-8"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
            >
              <ExternalLink size={12} />
              View at the publisher
            </a>
            <a
              href="/api/ai-demo/rag/source.pdf"
              onClick={e => {
                if (!requireSignIn()) { e.preventDefault(); return }
                if (!requireAccess()) e.preventDefault()
              }}
              className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
            >
              <Download size={12} />
              Download the PDF
            </a>
          </div>
          <p className="text-[11px] text-gray-400 mt-2.5 leading-relaxed">
            Licensed under{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-600"
            >
              CC BY 4.0
            </a>
            . © 2014 Love et al.; licensee BioMed Central. Reused and re-chunked here for demonstration purposes.
          </p>
        </div>
      </div>
    </div>
  )
}
