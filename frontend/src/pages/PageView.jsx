import { useRef } from 'react'
import { useTrackPageView } from '../hooks/useTrackPageView'
import ScrollableHeaderNav from '../components/ScrollableHeaderNav'
import CodeBlockCopyToast from '../components/CodeBlockCopyToast'
import GalleryLightboxController from '../components/GalleryLightboxController'
import HeaderImageLqip from '../components/HeaderImageLqip'
import ContentLqip from '../components/ContentLqip'
import FullscreenHeaderNav from '../components/FullscreenHeaderNav'
import DocsLayout from '../components/docs/DocsLayout'
import DocsPageNav from '../components/docs/DocsPageNav'
// Presentational component, rendered by SlugResolverPage.jsx once
// /api/resolve/<slug> has confirmed `kind === 'page'`. Modeled directly on
// AboutPage.jsx's render body (About is a regular Page now, migrated by the
// backend's one-time _seed_pages_and_nav() step) — same content enhancers,
// same page_width/font_family conventions.
export default function PageView({ page }) {
  const contentRef = useRef(null)
  // Tracked as 'custom_page' (not the fixed-page 'page' type About and the
  // other SiteConfig-backed pages use) — see analytics_tracking.py's
  // page_type == 'custom_page' branch, which validates dynamically against
  // Page.query instead of a fixed KNOWN_PAGE_KEYS whitelist, since an
  // arbitrary admin-created page slug can never be a member of a fixed set.
  useTrackPageView('custom_page', page.slug)
  // Set by /api/resolve when this page belongs to a docs section (see
  // public_resolve.py's _docs_dict). The <main> below is identical either
  // way; DocsLayout only wraps it with the sidebar.
  const docs = page.docs || null

  const main = (
    <main className={`mx-auto px-6 pt-10 pb-16 ${page.page_width === 'narrow' ? 'max-w-[524px]' : 'max-w-3xl'}`}>
      {page.content_html ? (
        <>
          <div
            ref={contentRef}
            className={`prose prose-gray max-w-none blog-content page-header-content ${page.font_family === 'sans' ? 'font-sans' : 'font-serif'}`}
            data-page-width={page.page_width === 'narrow' ? 'narrow' : 'regular'}
            data-font-family={page.font_family || 'default'}
            dangerouslySetInnerHTML={{ __html: page.content_html }}
          />
          {page.scrollable_nav_enabled && (
            <ScrollableHeaderNav containerRef={contentRef} contentKey={page.content_html} />
          )}
          <CodeBlockCopyToast containerRef={contentRef} contentKey={page.content_html} />
          <GalleryLightboxController containerRef={contentRef} contentKey={page.content_html} />
          <HeaderImageLqip containerRef={contentRef} contentKey={page.content_html} />
          <ContentLqip containerRef={contentRef} contentKey={page.content_html} />
          <FullscreenHeaderNav containerRef={contentRef} contentKey={page.content_html} inDocs={!!docs} />
        </>
      ) : (
        <p className="text-gray-400">This page has no content yet.</p>
      )}
      {docs && <DocsPageNav previous={docs.previous} next={docs.next} />}
    </main>
  )

  if (!docs) return main
  return (
    <DocsLayout docs={docs} currentSlug={page.slug}>
      {main}
    </DocsLayout>
  )
}
