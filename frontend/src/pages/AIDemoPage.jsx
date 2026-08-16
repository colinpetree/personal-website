import { Link } from 'react-router'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { fetchSiteConfig } from '../lib/apiFetch'
import { buildMeta, siteFallbackImage } from '../utils/meta'
import { AI_DEMO_LIST } from '../lib/aiDemos'

const DEMO_DESCRIPTIONS = {
  'conversation-basics': 'Chat with Claude. Featuring a custom system prompt, temperature control, and streaming responses',
  'tool-use': 'Watch Claude call a defined tool mid-conversation and use its result.',
  'web-search': "Ask a question and watch Claude use Anthropic's own live web search tool to answer it.",
  'mcp': "Ask about this site's real GitHub history via a live external MCP server.",
  'prompt-evaluation': 'Run a prompt against a test-case dataset and watch it get scored.',
  'prompt-engineering': 'Compare a naive prompt against a refined one, side by side, scored by the same judge.',
  'rag': 'Search a sample document set with vector, keyword, and hybrid retrieval.',
  'vision': 'Upload an image and see Claude analyze it in detail.',
}

const DEMOS = AI_DEMO_LIST.map(demo => ({
  ...demo,
  description: DEMO_DESCRIPTIONS[demo.key],
  available: true,
}))

// clientLoader ONLY — no bare `loader`. Same reasoning as PaymentPage.jsx:
// this route is deliberately excluded from react-router.config.ts's
// prerender() (session-gated/write-heavy), so a `loader` export would trip
// react-router's ssr:false validation.
export async function clientLoader() {
  return fetchSiteConfig()
}
clientLoader.hydrate = true

export function HydrateFallback() {
  return <main className="min-h-screen bg-white" />
}

export function meta({ data }) {
  return buildMeta({
    title: data?.site_title ? `${data.ai_demo_page_name ?? 'AI'} - ${data.site_title}` : undefined,
    description: data?.ai_demo_meta_description,
    image: siteFallbackImage(data),
  })
}

export default function AIDemoPage() {
  const { config } = useSiteConfig()

  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      {config?.ai_demo_text && (
        <div
          className="prose prose-gray max-w-none blog-content page-header-content mb-8"
          dangerouslySetInnerHTML={{ __html: config.ai_demo_text }}
        />
      )}

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
