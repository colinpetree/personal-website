import { Link } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function postHref(post, categorySlug) {
  return categorySlug ? `/${post.slug}?category=${categorySlug}` : `/${post.slug}`
}

function NavCard({ post, direction, categorySlug }) {
  const isNext = direction === 'next'
  const Chevron = isNext ? ChevronRight : ChevronLeft
  return (
    <Link
      to={postHref(post, categorySlug)}
      className="group flex items-center gap-4 rounded-md border border-gray-200 p-4 hover:border-gray-300 hover:bg-gray-50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-gray-400 mb-1 leading-none">
          {isNext ? (
            <><span>Next</span><Chevron size={13} strokeWidth={2} className="shrink-0" /></>
          ) : (
            <><Chevron size={13} strokeWidth={2} className="shrink-0" /><span>Previous</span></>
          )}
        </p>
        <h3 className="text-xl lg:text-2xl font-bold text-gray-900 group-hover:text-gray-600 transition-colors mb-1 line-clamp-1">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="text-gray-500 text-base leading-relaxed mb-2 line-clamp-2">{post.excerpt}</p>
        )}
        <p className="text-xs text-gray-600">{formatDate(post.publish_date || post.created_at)}</p>
      </div>
      {post.thumbnail_filename && (
        <img
          src={`/api/uploads/${post.thumbnail_filename}`}
          alt={post.title}
          className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg shrink-0"
        />
      )}
    </Link>
  )
}

export default function BlogPostNav({ next, previous, categorySlug }) {
  if (!next && !previous) return null

  return (
    <div className="flex flex-col gap-3 mb-16">
      {next && <NavCard post={next} direction="next" categorySlug={categorySlug} />}
      {previous && <NavCard post={previous} direction="previous" categorySlug={categorySlug} />}
    </div>
  )
}
