import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Play } from 'lucide-react'
import { useSiteConfig } from '../../hooks/useSiteConfig'
import { useUserAuth } from '../../context/UserAuthContext'
import SignInRequiredModal from '../../components/SignInRequiredModal'

const DEFAULT_PASSAGE = (
  'Mitochondrial dysfunction has emerged as a central pathological mechanism in neurodegenerative ' +
  'diseases. When mitochondria fail to maintain adequate ATP production, neurons experience energy ' +
  'depletion that triggers apoptotic cascades and accumulation of reactive oxygen species. This ' +
  'impaired oxidative phosphorylation compromises the electron transport chain, leading to reduced ' +
  'NADH oxidation and diminished proton gradient maintenance. Consequently, calcium homeostasis ' +
  'becomes dysregulated, exacerbating excitotoxicity and promoting neuroinflammatory responses ' +
  'through activation of microglia and astrocytes.'
)

const VARIANT_LABELS = { naive: 'Naive prompt', refined: 'Refined prompt' }

function scoreClasses(score) {
  if (score >= 8) return 'border-green-200 bg-green-50 text-green-700'
  if (score >= 5) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-red-200 bg-red-50 text-red-700'
}

function ScoreBadge({ score }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium border rounded-full px-2 py-0.5 ${scoreClasses(score)}`}>
      Judge {score}/10
    </span>
  )
}

function OutputColumn({ variant, output, grade }) {
  return (
    <div className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col">
      <div className="px-3.5 py-3 border-b border-gray-100">
        <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
          {VARIANT_LABELS[variant] ?? variant}
        </span>
      </div>

      <div className="px-3.5 py-3 border-b border-gray-100 flex-1 min-h-[96px]">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Output</p>
        {output ? (
          <pre className="text-[11px] font-mono text-gray-700 whitespace-pre-wrap break-words">{output}</pre>
        ) : (
          <span className="inline-block w-2 h-2 rounded-full bg-gray-900 animate-dot-pulse" />
        )}
      </div>

      <div className="px-3.5 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Grading</p>
        {grade ? (
          <div className="flex flex-col gap-2">
            <ScoreBadge score={grade.score} />
            {(() => {
              const reasoning = typeof grade.reasoning === 'string' ? grade.reasoning : ''
              const strengths = Array.isArray(grade.strengths) ? grade.strengths : []
              const weaknesses = Array.isArray(grade.weaknesses) ? grade.weaknesses : []
              if (!reasoning && strengths.length === 0 && weaknesses.length === 0) return null
              return (
                <div className="text-xs text-gray-500">
                  <p className="text-gray-400">Judge reasoning</p>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {reasoning && <p>{reasoning}</p>}
                    {strengths.length > 0 && (
                      <ul className="list-disc pl-4 text-green-700">
                        {strengths.map((s, i) => <li key={i}>{String(s)}</li>)}
                      </ul>
                    )}
                    {weaknesses.length > 0 && (
                      <ul className="list-disc pl-4 text-red-700">
                        {weaknesses.map((s, i) => <li key={i}>{String(s)}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        ) : output ? (
          <span className="inline-block w-2 h-2 rounded-full bg-gray-900 animate-dot-pulse" />
        ) : (
          <span className="text-xs text-gray-300">Waiting on output</span>
        )}
      </div>
    </div>
  )
}

export default function PromptEngineeringPage() {
  const { config } = useSiteConfig()
  const { user } = useUserAuth()
  const [passage, setPassage] = useState(DEFAULT_PASSAGE)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [prompts, setPrompts] = useState(null)
  const [outputs, setOutputs] = useState({})
  const [grades, setGrades] = useState({})
  const [summary, setSummary] = useState(null)
  const [showSignInModal, setShowSignInModal] = useState(false)
  const abortControllerRef = useRef(null)

  useEffect(() => {
    if (config?.site_title) {
      document.title = `Prompt engineering - ${config.site_title}`
    }
  }, [config])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  async function handleRun() {
    if (!user) {
      setShowSignInModal(true)
      return
    }
    if (running) return

    setError('')
    setPrompts(null)
    setOutputs({})
    setGrades({})
    setSummary(null)
    setRunning(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch('/api/ai-demo/prompt-engineering/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ passage }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Something went wrong. Please try again.')
        setRunning(false)
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
          if (event.type === 'prompts') {
            setPrompts({ naive: event.naive_prompt, refined: event.refined_prompt })
          } else if (event.type === 'output') {
            setOutputs(prev => ({ ...prev, [event.variant]: event.text }))
          } else if (event.type === 'graded') {
            setGrades(prev => ({
              ...prev,
              [event.variant]: {
                score: event.score,
                strengths: event.strengths,
                weaknesses: event.weaknesses,
                reasoning: event.reasoning,
              },
            }))
          } else if (event.type === 'summary') {
            setSummary({ naive_score: event.naive_score, refined_score: event.refined_score })
          } else if (event.type === 'error') {
            setError(event.message)
          }
        }
      }
      setRunning(false)
    } catch (err) {
      if (err.name === 'AbortError') return
      setError('Network error. Please try again.')
      setRunning(false)
    }
  }

  const delta = summary ? summary.refined_score - summary.naive_score : null

  return (
    <div className="h-[calc(100vh-4rem-1px)] flex flex-col lg:flex-row overflow-hidden">
      {showSignInModal && <SignInRequiredModal onClose={() => setShowSignInModal(false)} />}

      {/* Results column */}
      <div className="order-2 flex-1 min-w-0 min-h-0 flex flex-col overflow-y-auto px-6 py-8">
        <div className="max-w-4xl mx-auto w-full flex flex-col gap-6">
          <div className="relative flex flex-col gap-3">
            {!user && (
              <button
                type="button"
                aria-label="Sign in required"
                onClick={() => setShowSignInModal(true)}
                className="absolute inset-0 z-10 cursor-pointer"
              />
            )}
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400" htmlFor="passage-input">
              Passage to extract topics from
            </label>
            <textarea
              id="passage-input"
              value={passage}
              onChange={e => setPassage(e.target.value)}
              disabled={running}
              rows={6}
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-60"
            />
            <div>
              <button
                type="button"
                onClick={handleRun}
                disabled={user && running}
                className="inline-flex items-center gap-2 rounded-full bg-gray-900 text-white text-sm font-medium px-4 py-2 hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                <Play size={14} />
                {running ? 'Running...' : summary ? 'Run again' : 'Run comparison'}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {!prompts && !running && !error && (
            <p className="text-sm text-gray-400">
              Trigger a run to see the same passage go through a naive prompt and a refined prompt, each graded by an LLM judge.
            </p>
          )}

          {summary && (
            <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${scoreClasses(summary.refined_score)}`}>
              <span className="text-sm font-medium">
                Naive {summary.naive_score}/10 &middot; Refined {summary.refined_score}/10
              </span>
              <span className="text-sm font-semibold">
                {delta > 0 ? `Refined scored ${delta} point${delta === 1 ? '' : 's'} higher` : delta < 0 ? `Naive scored ${-delta} point${-delta === 1 ? '' : 's'} higher` : 'Tied score'}
              </span>
            </div>
          )}

          {prompts && (
            <div className="flex flex-col sm:flex-row gap-4">
              {['naive', 'refined'].map(variant => (
                <OutputColumn key={variant} variant={variant} output={outputs[variant]} grade={grades[variant]} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Info panel */}
      <div className="order-1 w-full lg:w-80 flex-shrink-0 min-h-0 border-b lg:border-b-0 lg:border-r border-gray-200 overflow-y-auto px-6 py-6">
        <Link to={`/${config?.ai_demo_slug ?? 'demo'}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft size={16} />
          Back to AI Implementations
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-2">Prompt engineering</h1>
        <p className="text-gray-500 text-sm mb-6">
          The same task, run through two different prompts, graded by the same judge.
        </p>

        <div className="flex flex-col gap-3 text-sm text-gray-600">
          <p>
            Both prompts ask Claude to extract topics from the passage into a JSON array of strings. The
            <strong className="text-gray-800"> naive prompt</strong> gives a short instruction and one example, but
            leaves judgment calls (how specific to be, whether to infer unstated concepts, avoiding duplicates)
            implicit. The <strong className="text-gray-800">refined prompt</strong> spells out explicit steps instead.
          </p>
          <p>
            This mirrors the <Link to={`/${config?.ai_demo_slug ?? 'demo'}/prompt-evaluation`} className="underline hover:text-gray-800">Prompt evaluation</Link> demo's
            grading pipeline &mdash; an LLM judge scores output 1-10 against a fixed rubric, after listing strengths
            and weaknesses. Here the test case is held fixed and the prompt is what changes, instead of the other
            way around.
          </p>
          {prompts && (
            <div className="flex flex-col gap-3 pt-2 border-t border-gray-100">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Naive prompt</p>
                <pre className="text-[11px] font-mono text-gray-600 whitespace-pre-wrap break-words bg-gray-50 border border-gray-100 rounded-lg p-2.5 max-h-48 overflow-y-auto">{prompts.naive}</pre>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Refined prompt</p>
                <pre className="text-[11px] font-mono text-gray-600 whitespace-pre-wrap break-words bg-gray-50 border border-gray-100 rounded-lg p-2.5 max-h-48 overflow-y-auto">{prompts.refined}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
