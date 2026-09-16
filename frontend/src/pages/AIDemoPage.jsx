import { useRef } from 'react'
import { Link } from 'react-router'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { useTrackPageView } from '../hooks/useTrackPageView'
import { fetchSiteConfig } from '../lib/apiFetch'
import { buildMeta, siteFallbackImage, notFoundMeta, isNavEnabled } from '../utils/meta'
import { AI_DEMO_LIST } from '../lib/aiDemos'
import ScrollableHeaderNav from '../components/ScrollableHeaderNav'
import CodeBlockCopyToast from '../components/CodeBlockCopyToast'
import GalleryLightboxController from '../components/GalleryLightboxController'
import HeaderImageLqip from '../components/HeaderImageLqip'
import ContentLqip from '../components/ContentLqip'
import FullscreenHeaderNav from '../components/FullscreenHeaderNav'
import NotFoundPage from './NotFoundPage'

const DEMO_DESCRIPTIONS = {
  'conversation': 'Basic back-and-forth conversation with an AI assistant. Set a system prompt for curated responses.',
  'tool-use': 'Conversation with added tools that the AI assistant will use when necessary.',
  'web-search': "The AI assistant will search the web for current information when needed.",
  'mcp': "Expanding the AI assistant's access to data and capabilities through an external system integration.",
  'data-evaluations': 'Quantifying qualitative results with an AI judge and scoring system for easy comparisons.',
  'prompt-refinement': 'Compare a simple prompt against a refined one, side by side, scored by the same judge.',
  'rag': 'Search a sample document using vector, keyword, and hybrid retrieval.',
  'image-processing': 'Upload an image and see the AI assistant analyze it in detail.',
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
  if (!isNavEnabled(data, 'ai_demo')) return notFoundMeta(data)
  return buildMeta({
    title: data?.site_title ? `${data.ai_demo_page_name ?? 'AI'} - ${data.site_title}` : undefined,
    description: data?.ai_demo_meta_description,
    image: siteFallbackImage(data),
  })
}

export default function AIDemoPage() {
  const { config } = useSiteConfig()
  const contentRef = useRef(null)
  const enabled = isNavEnabled(config, 'ai_demo')
  useTrackPageView('page', enabled ? 'ai_demo' : null)

  if (!enabled) return <NotFoundPage />

  return (
    <main className={`mx-auto px-6 pt-10 pb-16 ${config?.ai_demo_page_width === 'narrow' ? 'max-w-[524px]' : 'max-w-4xl'}`}>
      {config?.ai_demo_text && (
        <>
          <div
            ref={contentRef}
            className={`prose prose-gray max-w-none blog-content page-header-content ${config?.ai_demo_font_family === 'sans' ? 'font-sans' : 'font-serif'} mb-8`}
            data-page-width={config?.ai_demo_page_width === 'narrow' ? 'narrow' : 'regular'}
            data-font-family={config?.ai_demo_font_family || 'default'}
            dangerouslySetInnerHTML={{ __html: config.ai_demo_text }}
          />
          {config.ai_demo_scrollable_nav_enabled && (
            <ScrollableHeaderNav containerRef={contentRef} contentKey={config.ai_demo_text} />
          )}
          <CodeBlockCopyToast containerRef={contentRef} contentKey={config.ai_demo_text} />
          <GalleryLightboxController containerRef={contentRef} contentKey={config.ai_demo_text} />
          <HeaderImageLqip containerRef={contentRef} contentKey={config.ai_demo_text} />
          <ContentLqip containerRef={contentRef} contentKey={config.ai_demo_text} />
          <FullscreenHeaderNav containerRef={contentRef} contentKey={config.ai_demo_text} />
        </>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {DEMOS.map(demo => (
          demo.available ? (
            <Link
              key={demo.key}
              to={`/${config?.slugs?.ai_demo ?? 'demo'}/${demo.key}`}
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
