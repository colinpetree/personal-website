import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSiteConfig } from '../hooks/useSiteConfig'

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
    available: true,
  },
  {
    key: 'rag',
    title: 'RAG / hybrid search',
    description: 'Search a sample document set with vector, keyword, and hybrid retrieval.',
    available: true,
  },
  {
    key: 'mcp',
    title: 'MCP',
    description: "Ask about this site's real GitHub history via a live external MCP server.",
    available: true,
  },
  {
    key: 'prompt-evaluation',
    title: 'Prompt evaluation',
    description: 'Run a prompt against a test-case dataset and watch it get scored.',
    available: true,
  },
  {
    key: 'prompt-engineering',
    title: 'Prompt engineering',
    description: 'Compare a naive prompt against a refined one, side by side, scored by the same judge.',
    available: true,
  },
  {
    key: 'web-search',
    title: 'Web search',
    description: "Ask a question and watch Claude use Anthropic's own live web search tool to answer it.",
    available: true,
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
    </main>
  )
}
