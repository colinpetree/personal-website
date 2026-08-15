import { useState, useEffect, useRef } from 'react'
import { Link, useLoaderData } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { buildMeta, siteFallbackImage } from '../utils/meta'
import { apiUrl, fetchSiteConfig, getCachedSiteConfig } from '../lib/apiFetch'

function BlogListSkeleton() {
  return (
    <div className="flex flex-col gap-10 animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-6">
          <div className="shrink-0 w-28 h-20 bg-gray-100 rounded-lg" />
          <div className="flex-1 min-w-0 flex flex-col gap-2 py-1">
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
  const [postsRes] = await Promise.all([
    fetch(apiUrl('/api/blog?page=1&per_page=10')),
    fetchSiteConfig(),
  ])
  const posts = postsRes.ok ? await postsRes.json() : { posts: [], total: 0, page: 1, pages: 1 }
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
    <main className="max-w-3xl mx-auto px-6 py-16">
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
  const isFirstRender = useRef(true)

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
  }, [initialData])

  useEffect(() => {
    // Page 1 already came from the loader — only fetch client-side when
    // the user actually navigates to another page.
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setLoading(true)
    fetch(`/api/blog?page=${page}&per_page=10`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [page])

  function formatDate(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      {config?.blog_text && (
        <div
          className="prose prose-gray max-w-none blog-content page-header-content mb-10"
          dangerouslySetInnerHTML={{ __html: config.blog_text }}
        />
      )}

      {loading && <BlogListSkeleton />}

      {!loading && data?.posts?.length === 0 && (
        <p className="text-gray-500">No posts published yet.</p>
      )}

      {!loading && data?.posts?.length > 0 && (
        <>
          <div className="flex flex-col gap-10">
            {data.posts.map(post => (
              <article key={post.id} className="flex gap-6">
                {post.thumbnail_filename && (
                  <Link to={`/${post.slug}`} className="shrink-0">
                    <img
                      src={`/api/uploads/${post.thumbnail_filename}`}
                      alt={post.title}
                      className="w-28 h-20 object-cover rounded-lg"
                    />
                  </Link>
                )}
                <div className="flex-1 min-w-0">
                  <Link to={`/${post.slug}`}>
                    <h2 className="text-xl font-semibold text-gray-900 hover:text-gray-600 transition-colors mb-1">
                      {post.title}
                    </h2>
                  </Link>
                  {post.excerpt && (
                    <p className="text-gray-600 text-sm leading-relaxed mb-2 line-clamp-3">
                      {post.excerpt}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
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
