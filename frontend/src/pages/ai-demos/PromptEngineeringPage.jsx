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

const DEMO_KEY = 'prompt-engineering'
const DEMO_TITLE = 'Prompt engineering'

// Fixed, read-only passages - the point of this demo is comparing prompts, not passages, so these
// aren't editable. Keep in sync with PROMPT_ENGINEERING_PASSAGES in backend/routes/ai_demo.py.
const PASSAGES = [
  {
    id: 'coral-reefs',
    label: 'Coral reef bleaching',
    text: (
      'Rising sea surface temperatures have accelerated the bleaching of coral reefs across the ' +
      'Pacific, as thermal stress causes corals to expel the symbiotic algae responsible for both ' +
      'their color and much of their energy supply. Without these zooxanthellae, coral tissue turns ' +
      "pale and the reef's ability to produce calcium carbonate skeleton slows sharply, leaving " +
      'structures more vulnerable to erosion from storms and grazing fish. Compounding this stress, ' +
      'absorption of atmospheric carbon dioxide by seawater has lowered ocean pH, a process known as ' +
      'ocean acidification, which further reduces the availability of carbonate ions corals need to ' +
      'build their skeletons. Reef ecosystems that collapse under these combined pressures also lose ' +
      'their role as nursery habitat for reef fish, undermining coastal fisheries that millions of ' +
      'people depend on for protein and income.'
    ),
  },
  {
    id: 'congestion-pricing',
    label: 'Urban congestion pricing',
    text: (
      'Several major cities have introduced congestion pricing zones that charge drivers a fee to ' +
      'enter downtown cores during peak hours, aiming to reduce gridlock and redirect commuters ' +
      'toward public transit. Early results from these programs show meaningful drops in average ' +
      'vehicle miles traveled within the priced zone, alongside improved bus travel times because ' +
      'buses no longer sit in the same traffic as private cars. Revenue collected from the tolls is ' +
      'often earmarked for transit agency budgets, funding subway signal upgrades and new electric ' +
      'bus fleets. Critics argue the fees disproportionately burden lower-income commuters who cannot ' +
      'easily shift to transit or afford to live closer to job centers, and some worry that traffic ' +
      'simply migrates to untolled streets just outside the pricing boundary, a phenomenon known as ' +
      'traffic diversion.'
    ),
  },
  {
    id: 'sleep-memory',
    label: 'Sleep and memory consolidation',
    text: (
      'During slow-wave sleep, the brain replays patterns of neural activity that were first recorded ' +
      'while an animal navigated a maze earlier in the day, a process researchers call hippocampal ' +
      'replay. This replay appears to strengthen connections between the hippocampus and neocortex, ' +
      'gradually transferring detailed episodic memories into more stable, generalized long-term ' +
      'storage - a theory known as systems consolidation. Sleep spindles, brief bursts of oscillatory ' +
      'activity generated in the thalamus, tend to cluster around these replay events and are ' +
      'associated with better performance on memory tests the following day. Sleep deprivation ' +
      'studies show that blocking slow-wave sleep specifically, rather than just reducing total sleep ' +
      'time, impairs this consolidation process even when subjects are allowed to make up lost sleep ' +
      'later, suggesting the timing and structure of sleep stages matters as much as total sleep ' +
      'duration.'
    ),
  },
]

function PassageMenu({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const selected = PASSAGES.find(p => p.id === value) ?? PASSAGES[0]

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
        <div className="absolute left-0 mt-1.5 w-64 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-20">
          {PASSAGES.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => { onChange(option.id); setOpen(false) }}
              className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {option.label}
              {option.id === value && <Check size={14} className="text-gray-900 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const DEFAULT_NAIVE_PROMPT = 'Generate a JSON array of strings of the topics names from the paragraph'

const DEFAULT_REFINED_PROMPT = (
  'Extract key topics mentioned from a passage of text from a scholarly journal into a JSON array of strings.\n\n' +
  '<text>\n{passage}\n</text>\n\n' +
  'Follow these steps:\n' +
  '1. Closely examine the provided text\n' +
  '2. Identify each topic mentioned\n' +
  '3. Add each topic to a JSON array\n' +
  '4. Respond with the JSON array. Do not provide any other text or commentary'
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
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { user, signInAvailable, showSignInModal, setShowSignInModal, requireSignIn } = useRequireSignIn()
  const { hasAccess, showAccessModal, setShowAccessModal, requireAccess } = useRequireAiDemoAccess()
  const accessLinks = useAiDemoAccessLinks()
  const [passageId, setPassageId] = useState(PASSAGES[0].id)
  const [naivePrompt, setNaivePrompt] = useState(DEFAULT_NAIVE_PROMPT)
  const [refinedPrompt, setRefinedPrompt] = useState(DEFAULT_REFINED_PROMPT)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [hasRun, setHasRun] = useState(false)
  const [outputs, setOutputs] = useState({})
  const [grades, setGrades] = useState({})
  const [summary, setSummary] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
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
    if (!requireSignIn()) return
    if (!requireAccess()) return
    if (running) return

    setError('')
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
        body: JSON.stringify({ passage_id: passageId, naive_prompt: naivePrompt, refined_prompt: refinedPrompt }),
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

      setHasRun(true)

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
          if (event.type === 'output') {
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
          <div className="relative flex flex-col gap-3">
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
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Passage
            </label>
            <PassageMenu value={passageId} onChange={setPassageId} disabled={running} />
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-600 leading-relaxed">
              {PASSAGES.find(p => p.id === passageId)?.text}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-400" htmlFor="naive-prompt-input">
                  Naive prompt
                </label>
                <textarea
                  id="naive-prompt-input"
                  value={naivePrompt}
                  onChange={e => setNaivePrompt(e.target.value)}
                  disabled={running}
                  rows={5}
                  className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm font-mono text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-60"
                />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-400" htmlFor="refined-prompt-input">
                  Refined prompt
                </label>
                <textarea
                  id="refined-prompt-input"
                  value={refinedPrompt}
                  onChange={e => setRefinedPrompt(e.target.value)}
                  disabled={running}
                  rows={5}
                  className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm font-mono text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-60"
                />
              </div>
            </div>
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

          {!hasRun && !running && !error && (
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

          {hasRun && (
            <div className="flex flex-col sm:flex-row gap-4">
              {['naive', 'refined'].map(variant => (
                <OutputColumn key={variant} variant={variant} output={outputs[variant]} grade={grades[variant]} />
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
        <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-2">Prompt engineering</h1>
        <p className="text-gray-500 text-sm mb-6">
          The same task, run through two different prompts, graded by the same judge.
        </p>

        <div className="flex flex-col gap-3 text-sm text-gray-600">
          <p>
            Both prompts ask Claude to extract topics from the passage into a JSON array of strings. The
            <strong className="text-gray-800"> naive prompt</strong> is deliberately bare &mdash; it leaves judgment
            calls (how specific to be, whether to infer unstated concepts, avoiding duplicates) entirely implicit.
            The <strong className="text-gray-800">refined prompt</strong> spells out explicit steps instead. Edit
            either one to see how the output and its score change.
          </p>
          <p>
            The passage is fixed and read-only &mdash; pick one of three from the dropdown &mdash; since the
            point of this demo is comparing prompts, not passages. Write <code className="text-xs bg-gray-100 rounded px-1 py-0.5">{'{passage}'}</code> anywhere
            in a prompt box to control exactly where the selected passage gets inserted (the refined prompt
            does this by default); if you leave it out, the passage is simply appended to the end.
          </p>
          <p>
            This mirrors the <Link to={`/${config?.ai_demo_slug ?? 'demo'}/prompt-evaluation`} className="underline hover:text-gray-800">Prompt evaluation</Link> demo's
            grading pipeline &mdash; an LLM judge scores output 1-10 against a fixed rubric, after listing strengths
            and weaknesses. Here the test case is held fixed and the prompt is what changes, instead of the other
            way around.
          </p>
        </div>
      </div>
    </div>
  )
}
