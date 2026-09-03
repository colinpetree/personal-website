import { useState, useEffect, useRef } from 'react'
import { Link, useLoaderData } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { useTrackPageView } from '../hooks/useTrackPageView'
import { buildMeta, siteFallbackImage, notFoundMeta, isNavEnabled } from '../utils/meta'
import { apiUrl, fetchSiteConfig, getCachedSiteConfig } from '../lib/apiFetch'
import CategoryFilterBar from '../components/CategoryFilterBar'
import CodeBlockCopyToast from '../components/CodeBlockCopyToast'
import NotFoundPage from './NotFoundPage'

function BlogListSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-gray-200 animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col sm:flex-row gap-4 sm:gap-6 py-8 first:pt-0">
          <div className="shrink-0 w-full h-48 sm:w-28 sm:h-20 bg-gray-100 rounded-lg order-1 sm:order-2" />
          <div className="flex-1 min-w-0 flex flex-col gap-2 py-1 order-2 sm:order-1">
            <div className="h-5 bg-gray-100 rounded w-3/4" />
            <div className="h-3 bg-gray-100 rounded w-full" />
            <div className="h-3 bg-gray-100 rounded w-5/6" />
            <div className="h-3 bg-gray-100 rounded w-24 mt-1" />
          </div>
        </div>
      ))}
    </div>
  )
}

// fetchSiteConfig() runs alongside the post fetch purely to populate
// getCachedSiteConfig()'s cache in time for meta() below (see its usage
// there for why) — its resolved value isn't otherwise part of this route's
// own data (the component reads config from context, not this).
async function fetchFirstPage() {
  const [postsRes, categoriesRes] = await Promise.all([
    fetch(apiUrl('/api/blog?page=1&per_page=10')),
    fetch(apiUrl('/api/blog/categories')),
    fetchSiteConfig(),
  ])
  const posts = postsRes.ok ? await postsRes.json() : { posts: [], total: 0, page: 1, pages: 1 }
  posts.categories = categoriesRes.ok ? await categoriesRes.json() : []
  return posts
}

// Prerendered at build time, page 1 only — pagination beyond that stays a
// plain client-side fetch (see the effect below), matching the prerender
// scope in react-router.config.ts.
export async function loader() {
  return fetchFirstPage()
}

// Required in addition to loader — under ssr:false, loader only runs for
// prerendered paths (no server exists to run it otherwise, and no .data
// file exists for an unprerendered route). clientLoader.hydrate=true makes
// this run in-browser on the very first hard load too, covering both the
// generic/no-prerendering build profile and any content published after
// the last prerender build.
export async function clientLoader() {
  return fetchFirstPage()
}
clientLoader.hydrate = true

// data.config would be the natural source here, but this route's component
// also calls useLoaderData() — confirmed that combination makes meta()'s
// `data` param unreliable at prerender time (see getCachedSiteConfig in
// apiFetch.js). Read the synchronous cache instead.
export function meta() {
  const config = getCachedSiteConfig()
  if (!isNavEnabled(config, 'blog')) return notFoundMeta(config)
  return buildMeta({
    title: config?.site_title ? `${config.blog_page_name ?? 'Blog'} - ${config.site_title}` : undefined,
    description: config?.blog_meta_description,
    image: siteFallbackImage(config),
  })
}

// Shown only while clientLoader resolves on a hard load with nothing
// prerendered yet — reuses the same skeleton already used for the
// page-2+ pagination loading state below.
export function HydrateFallback() {
  return (
    <main className="max-w-3xl mx-auto px-6 pt-10 pb-16">
      <BlogListSkeleton />
    </main>
  )
}

export default function BlogPage() {
  const { config } = useSiteConfig()
  const initialData = useLoaderData()
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [activeCategory, setActiveCategory] = useState(null)
  const isFirstRender = useRef(true)
  const contentRef = useRef(null)
  const enabled = isNavEnabled(config, 'blog')
  useTrackPageView('page', enabled ? 'blog' : null)

  // Same fix as BlogPostPage.jsx: `data` is only seeded from useLoaderData()
  // on first mount via useState(initialData) — if this route's loader ever
  // reruns while the component stays mounted (a future revalidation; this
  // route has no dynamic param so it can't happen via navigation the way
  // BlogPostPage's slug change can), the fresh page-1 data would otherwise
  // be silently ignored. Also resets to page 1, since the loader always
  // fetches page 1 only — staying on a later page after a resync would show
  // page-1 posts under a "Page 2 of N" pager.
  useEffect(() => {
    setData(initialData)
    setPage(1)
    setActiveCategory(null)
  }, [initialData])

  useEffect(() => {
    // Page 1 (with no category filter) already came from the loader — only
    // fetch client-side when the user navigates to another page or selects
    // a category, either of which lands here since both are effect deps.
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setLoading(true)
    const controller = new AbortController()
    const params = new URLSearchParams({ page, per_page: 10 })
    if (activeCategory) params.set('category', activeCategory)
    fetch(`/api/blog?${params}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => { setData(prev => ({ ...d, categories: prev.categories })); setLoading(false) })
      .catch(err => { if (err.name !== 'AbortError') setLoading(false) })
    // Aborts a still-in-flight request if page/activeCategory changes again
    // before it resolves — without this, two overlapping requests (e.g. a
    // page click immediately followed by a category click) could resolve out
    // of order and leave stale posts on screen.
    return () => controller.abort()
  }, [page, activeCategory])

  function handleCategorySelect(slug) {
    setActiveCategory(slug)
    setPage(1)
  }

  function formatDate(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  if (!enabled) return <NotFoundPage />

  return (
    <main className="max-w-3xl mx-auto px-6 pt-10 pb-16">
      {config?.blog_text && (
        <div
          ref={contentRef}
          className={`prose prose-gray max-w-none blog-content page-header-content ${config?.blog_font_family === 'sans' ? 'font-sans' : 'font-serif'} mb-10`}
          data-font-family={config?.blog_font_family || 'default'}
          dangerouslySetInnerHTML={{ __html: config.blog_text }}
        />
      )}
      <CodeBlockCopyToast containerRef={contentRef} contentKey={config?.blog_text} />

      {data?.categories?.length > 0 && (
        <CategoryFilterBar
          categories={data.categories}
          activeSlug={activeCategory}
          onSelect={handleCategorySelect}
        />
      )}

      {loading && <BlogListSkeleton />}

      {!loading && data?.posts?.length === 0 && (
        <p className="text-gray-500">
          {activeCategory ? 'No posts in this category yet.' : 'No posts published yet.'}
        </p>
      )}

      {!loading && data?.posts?.length > 0 && (
        <>
          <div className="flex flex-col divide-y divide-gray-200">
            {data.posts.map(post => (
              <article key={post.id} className="flex flex-col sm:flex-row gap-4 sm:gap-6 py-8 first:pt-0">
                {post.thumbnail_filename && (
                  <Link to={activeCategory ? `/${post.slug}?category=${activeCategory}` : `/${post.slug}`} className="shrink-0 order-1 sm:order-2">
                    <img
                      src={`/api/uploads/${post.thumbnail_filename}`}
                      alt={post.title}
                      className="w-full h-48 sm:w-28 sm:h-20 object-cover rounded-lg"
                    />
                  </Link>
                )}
                <div className="flex-1 min-w-0 order-2 sm:order-1">
                  <Link to={activeCategory ? `/${post.slug}?category=${activeCategory}` : `/${post.slug}`}>
                    <h2 className="text-xl lg:text-2xl font-bold text-gray-900 hover:text-gray-600 transition-colors mb-2 leading-[24px] lg:leading-[30px]">
                      {post.title}
                    </h2>
                  </Link>
                  {post.excerpt && (
                    <p className="text-gray-500 text-base leading-[20px] mb-2 line-clamp-2">
                      {post.excerpt}
                    </p>
                  )}
                  <p className="text-xs text-gray-600">
                    {formatDate(post.publish_date || post.created_at)}
                  </p>
                </div>
              </article>
            ))}
          </div>

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-12">
              <button
                onClick={() => setPage(p => p - 1)}
                disabled={page === 1}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft size={15} strokeWidth={1.5} />Previous
              </button>
              <span className="text-sm text-gray-500">Page {page} of {data.pages}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= data.pages}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Next<ChevronRight size={15} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </>
      )}
    </main>
  )
}
