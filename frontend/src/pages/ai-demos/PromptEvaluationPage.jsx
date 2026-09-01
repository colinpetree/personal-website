import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Check, ChevronDown, ChevronLeft, Play, PanelLeft } from 'lucide-react'
import { useSiteConfig } from '../../hooks/useSiteConfig'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useRequireSignIn } from '../../hooks/useRequireSignIn'
import { useRequireAiDemoAccess } from '../../hooks/useRequireAiDemoAccess'
import { useAiDemoAccessLinks } from '../../hooks/useAiDemoAccessLinks'
import SignInRequiredModal from '../../components/SignInRequiredModal'
import AccessRequiredModal from '../../components/AccessRequiredModal'
import NotFoundPage from '../NotFoundPage'
import { isNavEnabled, setRobotsNoindex, setNotFoundDocumentHead } from '../../utils/meta'

const DEMO_KEY = 'prompt-evaluation'
const DEMO_TITLE = 'Prompt evaluation'

const FORMAT_LABELS = { json: 'JSON', python: 'Python', regex: 'Regex' }

const VARIANT_OPTIONS = [
  { value: 'live', label: 'Live (Claude generates)' },
  { value: 'good', label: 'Good sample' },
  { value: 'medium', label: 'Medium sample' },
  { value: 'bad', label: 'Bad sample' },
]

function VariantMenu({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const selected = VARIANT_OPTIONS.find(o => o.value === value) ?? VARIANT_OPTIONS[0]

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-900 bg-white hover:bg-gray-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-gray-400"
      >
        {selected.label}
        <ChevronDown size={14} className="text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 mt-1.5 w-52 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-20">
          {VARIANT_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => { onChange(option.value); setOpen(false) }}
              className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {option.label}
              {option.value === value && <Check size={14} className="text-gray-900 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function scoreClasses(score) {
  if (score >= 8) return 'border-green-200 bg-green-50 text-green-700'
  if (score >= 5) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-red-200 bg-red-50 text-red-700'
}

function ScoreBadge({ label, score }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium border rounded-full px-2 py-0.5 ${scoreClasses(score)}`}>
      {label} {score}/10
    </span>
  )
}

function TestCaseColumn({ testCase, output, grade }) {
  return (
    <div className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col">
      <div className="px-3.5 py-3 border-b border-gray-100">
        <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 mb-1.5">
          {FORMAT_LABELS[testCase.format] ?? testCase.format}
        </span>
        <p className="text-xs text-gray-700 leading-snug">{testCase.task}</p>
      </div>

      <div className="px-3.5 py-3 border-b border-gray-100 flex-1 min-h-[72px]">
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
            <div className="flex flex-wrap gap-1.5">
              <ScoreBadge label="Syntax" score={grade.syntax_score} />
              <ScoreBadge label="Model" score={grade.model_score} />
            </div>
            <p className="text-xs text-gray-600">
              Combined score: <span className="font-semibold text-gray-900">{grade.score}/10</span>
            </p>
            {(() => {
              // Defense-in-depth: the backend now coerces the judge's JSON into these exact
              // shapes, but validate again here too so a shape change elsewhere can never crash
              // this render (a non-array strengths/weaknesses would break .map()).
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

export default function PromptEvaluationPage() {
  const { config } = useSiteConfig()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { user, signInAvailable, showSignInModal, setShowSignInModal, requireSignIn } = useRequireSignIn()
  const { hasAccess, showAccessModal, setShowAccessModal, requireAccess } = useRequireAiDemoAccess()
  const accessLinks = useAiDemoAccessLinks()
  const [running, setRunning] = useState(false)
  const [variant, setVariant] = useState('live')
  const [error, setError] = useState('')
  const [testCases, setTestCases] = useState([])
  const [outputs, setOutputs] = useState({})
  const [grades, setGrades] = useState({})
  const [summary, setSummary] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
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
      document.title = `Prompt evaluation - ${config.site_title}`
    }
  }, [config])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  async function handleRun() {
    if (!requireSignIn()) return
    if (!requireAccess()) return
    if (running) return

    setError('')
    setTestCases([])
    setOutputs({})
    setGrades({})
    setSummary(null)
    setRunning(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch('/api/ai-demo/prompt-evaluation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ variant }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        if (data.error === 'access_required') {
          setShowAccessModal(true)
        } else {
          setError(data.error || 'Something went wrong. Please try again.')
        }
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
          if (event.type === 'dataset') {
            setTestCases(event.test_cases)
          } else if (event.type === 'output') {
            setOutputs(prev => ({ ...prev, [event.index]: event.text }))
          } else if (event.type === 'graded') {
            setGrades(prev => ({
              ...prev,
              [event.index]: {
                syntax_score: event.syntax_score,
                model_score: event.model_score,
                score: event.score,
                strengths: event.strengths,
                weaknesses: event.weaknesses,
                reasoning: event.reasoning,
              },
            }))
          } else if (event.type === 'summary') {
            setSummary({ average_score: event.average_score })
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

      {/* Results column */}
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
        <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-4xl mx-auto w-full flex flex-col gap-6">
          <div className="relative flex items-center gap-2">
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
            <VariantMenu value={variant} onChange={setVariant} disabled={running} />
            <button
              type="button"
              onClick={handleRun}
              disabled={user && running}
              className="inline-flex items-center gap-2 rounded-full bg-gray-900 text-white text-sm font-medium px-4 py-2 hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              <Play size={14} />
              {running ? 'Running...' : testCases.length > 0 ? 'Run again' : 'Run evaluation'}
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {testCases.length === 0 && !running && !error && (
            <p className="text-sm text-gray-400">
              Trigger a run to see the same prompt evaluated against 3 test cases, each graded two ways.
            </p>
          )}

          {summary && (
            <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${scoreClasses(summary.average_score)}`}>
              <span className="text-sm font-medium">Average score across all test cases</span>
              <span className="text-lg font-semibold">{summary.average_score}/10</span>
            </div>
          )}

          {testCases.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-4">
              {testCases.map(tc => (
                <TestCaseColumn key={tc.id} testCase={tc} output={outputs[tc.index]} grade={grades[tc.index]} />
              ))}
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
          Back to AI Implementations
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-2">Prompt evaluation</h1>
        <p className="text-gray-500 text-sm mb-6">
          Run a fixed prompt against a dataset of test cases and watch it get scored two different ways.
        </p>

        <div className="flex flex-col gap-3 text-sm text-gray-600">
          <p>
            Each test case asks for output in a specific format (JSON, Python, or a regex). The same prompt runs
            against all 3 test cases at once.
          </p>
          <p>
            <strong className="text-gray-800">Syntax score</strong> is a deterministic check. Output is parsed 
            to check for valid JSON, Python, or a regex syntax. No model involved.
          </p>
          <p>
            <strong className="text-gray-800">Model score</strong> is an LLM judge, asked to list strengths and
            weaknesses before scoring 1-10 against a rubric. Writing reasoning first tends to produce a more
            accurate, better-differentiated score than jumping straight to a number.
          </p>
          <p>
            The two scores are averaged per test case, then averaged again across all 3 for the final result.
          </p>
          {/* <p>
            Live output from Claude tends to score well, which can make the grader look like it always says
            "great job." Pick <strong className="text-gray-800">Good/Medium/Bad sample</strong> from the dropdown
            to see the same grading pipeline run for real against fixed outputs with known flaws.
          </p> */}
          <p>
            <strong className="text-gray-800">Samples</strong>
          </p>
          <p>
            <strong className="text-gray-800">Live</strong> is generated by Claude according to the task. 
            <strong className="text-gray-800"> Good, Medium, & Bad </strong> are predetermined to produce a 
            specific score range from the evaluation judge. 
          </p>
        </div>
      </div>
    </div>
  )
}
