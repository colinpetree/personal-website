import { useLoaderData } from 'react-router'
import { buildMeta, absoluteUploadUrl, siteFallbackImage, notFoundMeta, isNavEnabled, domFallbackTitle, domFallbackMetaContent } from '../utils/meta'
import { apiUrl, fetchSiteConfig } from '../lib/apiFetch'
import BlogPostView from './BlogPostView'
import PageView from './PageView'
import NotFoundPage from './NotFoundPage'

// The public ':slug' catch-all route — resolves a URL against
// /api/resolve/<slug> (see backend/routes/public_resolve.py) and renders
// either a Page or a BlogPost through the matching presentational view.
// Pages and blog posts share one top-level slug namespace, so this replaced
// the old BlogPostPage.jsx-only ':slug' route once Pages became a real,
// admin-creatable thing (see the Pages feature plan, wave 3).

// Slug-keyed cache of the last fetchResolvedData() result, read
// synchronously by meta() below — same reason BlogPostPage.jsx's
// _resolvedPostData existed: this route's component also calls
// useLoaderData(), and that combination makes meta()'s own `data` param
// come back undefined at prerender time (confirmed empirically, same issue
// as BlogPage/ProjectsPage/the old BlogPostPage). Bounded like the old
// cache was, for the same reason (a long browser session clicking through
// many posts/pages shouldn't accumulate an ever-growing cache).
const _resolvedData = new Map()
const MAX_CACHED = 20

function cacheKey(slug, categorySlug) {
  return `${slug}:${categorySlug || ''}`
}

function cacheResolvedData(key, result) {
  _resolvedData.delete(key)
  _resolvedData.set(key, result)
  if (_resolvedData.size > MAX_CACHED) {
    _resolvedData.delete(_resolvedData.keys().next().value)
  }
}

// Shared by loader (build-time prerender) and clientLoader (runtime, for any
// slug not in the prerendered set — see clientLoader below for why both are
// needed). config is fetched alongside purely to populate apiFetch.js's
// getCachedSiteConfig() cache in time for meta().
//
// Deliberately does NOT fetch a post's comments — see the equivalent note
// that used to live on BlogPostPage.jsx's fetchPostData: comments are always
// loaded client-side by BlogPostView's own effect, never baked into a
// prerendered snapshot, since moderating/deleting a comment doesn't bump its
// parent BlogPost's updated_at and so wouldn't reliably trigger a rebuild.
async function fetchResolvedData(slug, categorySlug) {
  const key = cacheKey(slug, categorySlug)
  const [resolveRes, config] = await Promise.all([
    fetch(apiUrl(`/api/resolve/${slug}`)),
    fetchSiteConfig(),
  ])
  if (resolveRes.status === 404) {
    const result = { notFound: true, kind: null, config }
    cacheResolvedData(key, result)
    return result
  }
  if (!resolveRes.ok) throw new Error(`Failed to resolve slug ${slug}: HTTP ${resolveRes.status}`)
  const resolved = await resolveRes.json()

  if (resolved.kind === 'page') {
    const result = { notFound: false, kind: 'page', page: resolved, config }
    cacheResolvedData(key, result)
    return result
  }

  // kind === 'post'
  const adjacentUrl = `/api/blog/${slug}/adjacent${categorySlug ? `?category=${categorySlug}` : ''}`
  const [authorRes, adjacentRes] = await Promise.all([
    fetch(apiUrl('/api/blog/author')),
    fetch(apiUrl(adjacentUrl)),
  ])
  const blogAuthor = authorRes.ok ? await authorRes.json() : null
  const adjacent = adjacentRes.ok ? await adjacentRes.json() : { next: null, previous: null }

  const result = {
    notFound: false, kind: 'post', post: resolved,
    blogAuthor, next: adjacent.next, previous: adjacent.previous, config,
  }
  cacheResolvedData(key, result)
  return result
}

// Runs in Node at prerender time, ONLY for slugs react-router.config.ts's
// prerender() returned.
export async function loader({ params, request }) {
  const categorySlug = new URL(request.url).searchParams.get('category')
  return fetchResolvedData(params.slug, categorySlug)
}

// Runs in the browser — required in addition to loader, not redundant with
// it: under ssr:false, `loader` only works for prerendered paths. A page or
// post published after the last prerender build resolves correctly this way
// instead of erroring. clientLoader.hydrate=true makes this run on the very
// first hard load too, not just subsequent client-side nav.
export async function clientLoader({ params, request }) {
  const categorySlug = new URL(request.url).searchParams.get('category')
  return fetchResolvedData(params.slug, categorySlug)
}
clientLoader.hydrate = true

// og:image needs an absolute URL, and site_title falls back to config since
// a 404'd/unloaded slug has no title of its own to show. Reads
// _resolvedData via params.slug rather than the `data` param — params come
// from route matching (reliable), not loader data (confirmed unreliable in
// meta() here, see _resolvedData's own comment above).
export function meta({ params, location }) {
  const categorySlug = new URLSearchParams(location?.search).get('category')
  const key = cacheKey(params.slug, categorySlug)
  const cached = _resolvedData.get(key)
  // Same client-hydrate race the old BlogPostPage.jsx's meta() had (see its
  // comment, preserved here): react-router calls this route's meta()
  // synchronously on the very first hydrate pass, before
  // clientLoader.hydrate's own fetchResolvedData has resolved and populated
  // this cache — an UNFETCHED slug (no entry at all) is not the same thing
  // as a CONFIRMED 404. Falling back to domFallbackTitle()/
  // domFallbackMetaContent() instead reads whatever the browser's own
  // parser already put in the DOM from the server-rendered page —
  // guaranteed to equal the server's exact value with zero network wait —
  // so the unfetched-yet case matches the server regardless of whether the
  // slug ultimately turns out to be a page, a post, or neither.
  if (cached === undefined) {
    return buildMeta({
      title: domFallbackTitle(),
      description: domFallbackMetaContent('meta[name="description"]'),
      image: domFallbackMetaContent('meta[property="og:image"]'),
      type: 'article',
    })
  }
  const config = cached.config
  if (cached.kind === 'post') {
    const post = cached.post
    if (!post || !isNavEnabled(config, 'blog')) return notFoundMeta(config)
    return buildMeta({
      title: post.title,
      description: post.meta_description || post.excerpt,
      image: post.thumbnail_filename
        ? absoluteUploadUrl(config, `/api/uploads/${post.thumbnail_filename}`)
        : post.list_thumbnail_filename
          ? absoluteUploadUrl(config, `/api/uploads/${post.list_thumbnail_filename}`)
          : siteFallbackImage(config),
      type: 'article',
    })
  }
  if (cached.kind === 'page') {
    const page = cached.page
    if (!page) return notFoundMeta(config)
    return buildMeta({
      title: page.title,
      description: page.meta_description,
      image: siteFallbackImage(config),
    })
  }
  return notFoundMeta(config)
}

// Shown only while clientLoader is resolving on a hard load of a slug that
// wasn't prerendered (a prerendered page/post's real content is already in
// the HTML and renders immediately; this never appears for those).
export function HydrateFallback() {
  return (
    <main className="max-w-3xl mx-auto px-6 pt-10 pb-16 animate-pulse">
      <div className="h-10 bg-gray-100 rounded w-5/6 mb-3" />
      <div className="h-10 bg-gray-100 rounded w-2/3 mb-6" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`h-4 bg-gray-100 rounded ${i % 5 === 4 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </div>
    </main>
  )
}

export default function SlugResolverPage() {
  const { notFound, kind, post, page, blogAuthor, next, previous } = useLoaderData()

  if (notFound || !kind) return <NotFoundPage />
  if (kind === 'post') {
    if (!post) return <NotFoundPage />
    return <BlogPostView post={post} blogAuthor={blogAuthor} next={next} previous={previous} />
  }
  if (kind === 'page') {
    if (!page) return <NotFoundPage />
    return <PageView page={page} />
  }
  return <NotFoundPage />
}
