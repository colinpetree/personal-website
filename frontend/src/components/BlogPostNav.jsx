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
            <><span className="translate-y-px">Next</span><Chevron size={13} strokeWidth={2} className="shrink-0" /></>
          ) : (
            <><Chevron size={13} strokeWidth={2} className="shrink-0" /><span className="translate-y-px">Previous</span></>
          )}
        </p>
        <h3 className="text-xl lg:text-2xl font-bold text-gray-900 group-hover:text-gray-600 transition-colors mb-2 line-clamp-2 leading-[24px] lg:leading-[30px]">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="text-gray-500 text-base leading-[20px] mb-2 line-clamp-2">{post.excerpt}</p>
        )}
        <p className="text-xs text-gray-600">{formatDate(post.publish_date || post.created_at)}</p>
      </div>
      {post.list_thumbnail_filename && (
        <img
          src={`/api/uploads/${post.list_thumbnail_filename}`}
          alt={post.title}
          className="w-28 sm:w-36 aspect-square sm:aspect-[7/5] object-cover rounded shrink-0 thumb-shadow"
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
