import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { setMetaDescription } from '../utils/meta'

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

export default function BlogPage() {
  const { config } = useSiteConfig()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (config?.site_title) {
      document.title = `${config.blog_page_name ?? 'Blog'} - ${config.site_title}`
    }
    setMetaDescription(config?.blog_meta_description)
  }, [config])

  useEffect(() => {
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
