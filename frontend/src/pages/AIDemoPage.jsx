import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { useUserAuth } from '../context/UserAuthContext'

const DEMOS = [
  {
    key: 'conversation-basics',
    title: 'Conversation basics',
    description: 'Chat with Claude — streaming responses, a custom system prompt, and temperature control.',
    available: true,
  },
  {
    key: 'tool-use',
    title: 'Tool use',
    description: 'Watch Claude call a defined tool mid-conversation and use its result.',
    available: false,
  },
  {
    key: 'rag',
    title: 'RAG / hybrid search',
    description: 'Search a sample document set with vector, keyword, and hybrid retrieval.',
    available: false,
  },
  {
    key: 'mcp',
    title: 'MCP',
    description: 'Tool discovery and invocation via the Model Context Protocol.',
    available: false,
  },
  {
    key: 'prompt-evaluation',
    title: 'Prompt evaluation',
    description: 'Run a prompt against a test-case dataset and watch it get scored.',
    available: false,
  },
  {
    key: 'prompt-engineering',
    title: 'Prompt engineering',
    description: 'Compare a naive prompt against a refined one, side by side.',
    available: false,
  },
  {
    key: 'web-search',
    title: 'Web search',
    description: 'Ask a question and see Claude search the web for an answer.',
    available: false,
  },
  {
    key: 'vision',
    title: 'Vision',
    description: 'Upload an image and see Claude analyze it.',
    available: false,
  },
]

export default function AIDemoPage() {
  const { config } = useSiteConfig()
  const { user, loginWithGoogle } = useUserAuth()

  useEffect(() => {
    if (config?.site_title) {
      document.title = `${config.ai_demo_page_name ?? 'AI'} - ${config.site_title}`
    }
  }, [config])

  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        {config?.ai_demo_page_name ?? 'AI Implementations'}
      </h1>
      <p className="text-gray-500 mb-8">
        A grid of small, focused demos showing off different Claude API capabilities.
      </p>

      {!user ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-6 text-center">
          <p className="text-sm text-gray-600 mb-3">Sign in to try the demos</p>
          <button
            onClick={() => loginWithGoogle(window.location.pathname)}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {DEMOS.map(demo => (
            demo.available ? (
              <Link
                key={demo.key}
                to={`/${config?.ai_demo_slug ?? 'demo'}/${demo.key}`}
                className="border border-gray-200 rounded-lg p-5 hover:border-gray-400 transition-colors"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-2">{demo.title}</h2>
                <p className="text-gray-600 text-sm">{demo.description}</p>
              </Link>
            ) : (
              <div key={demo.key} className="border border-gray-200 rounded-lg p-5 opacity-50">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h2 className="text-lg font-semibold text-gray-900">{demo.title}</h2>
                  <span className="text-xs font-medium text-gray-400 border border-gray-200 rounded px-2 py-0.5">
                    Coming soon
                  </span>
                </div>
                <p className="text-gray-600 text-sm">{demo.description}</p>
              </div>
            )
          ))}
        </div>
      )}
    </main>
  )
}
