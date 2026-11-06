import { Link } from 'react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'

function NavCard({ page, direction }) {
  const isNext = direction === 'next'
  return (
    <Link
      to={`/${page.slug}`}
      className={`group flex items-center gap-4 rounded-lg border border-gray-200 px-4 py-3.5 transition-colors hover:border-blue-300 ${
        isNext ? 'sm:col-start-2' : 'flex-row-reverse sm:col-start-1'
      }`}
    >
      <div className={`min-w-0 flex-1 ${isNext ? 'text-left' : 'text-right'}`}>
        <p className="text-xs text-gray-500">{isNext ? 'Next' : 'Previous'}</p>
        <p className="truncate text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{page.title}</p>
      </div>
      {isNext
        ? <ArrowRight size={18} strokeWidth={1.75} className="shrink-0 text-gray-500 group-hover:text-blue-600 transition-colors" />
        : <ArrowLeft size={18} strokeWidth={1.75} className="shrink-0 text-gray-500 group-hover:text-blue-600 transition-colors" />}
    </Link>
  )
}

// Previous/next cards at the bottom of a docs page. Each card is left out
// at the start/end of the section; Next stays in the right column even
// when there's no Previous.
export default function DocsPageNav({ previous, next }) {
  if (!previous && !next) return null
  return (
    <nav aria-label="Documentation pages" className="mt-16 grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans not-prose">
      {previous && <NavCard page={previous} direction="previous" />}
      {next && <NavCard page={next} direction="next" />}
    </nav>
  )
}
