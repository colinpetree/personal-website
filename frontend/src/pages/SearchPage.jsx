import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Search } from 'lucide-react'
import { apiUrl } from '../lib/apiFetch'

function SearchResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-5">
          <div className="h-4 w-14 bg-gray-100 rounded-full mb-3" />
          <div className="h-5 bg-gray-100 rounded w-1/2 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-full mb-1.5" />
          <div className="h-3 bg-gray-100 rounded w-5/6" />
        </div>
      ))}
    </div>
  )
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') || ''
  const [inputValue, setInputValue] = useState(urlQuery)
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef(null)
  const loadMoreControllerRef = useRef(null)

  // New query: reset everything and fetch page 1. Aborts the in-flight
  // request on cleanup so a stale response from an abandoned query can't
  // land after a newer one and overwrite its results.
  useEffect(() => {
    setInputValue(urlQuery)
    if (!urlQuery) {
      setResults([])
      setTotal(0)
      setPage(1)
      setPages(1)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    fetch(apiUrl(`/api/search?q=${encodeURIComponent(urlQuery)}&page=1&per_page=10`), { signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        setResults(d.results)
        setTotal(d.total)
        setPage(d.page)
        setPages(d.pages)
        setLoading(false)
      })
      .catch(err => { if (err.name !== 'AbortError') setLoading(false) })
    return () => controller.abort()
  }, [urlQuery])

  // Abort any in-flight "load more" request when the query changes, so a
  // stale response for an abandoned search can't land after the fact and
  // get appended onto the new query's results. Scoped to its own effect
  // (deps: [urlQuery] only) rather than living in the observer effect below,
  // since that effect intentionally re-runs on every loadingMore toggle —
  // aborting there would cancel the very fetch it just started.
  useEffect(() => {
    return () => loadMoreControllerRef.current?.abort()
  }, [urlQuery])

  // Infinite scroll: fetch the next page once the sentinel comes into view.
  useEffect(() => {
    if (!urlQuery || loading) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore && page < pages) {
        const nextPage = page + 1
        const controller = new AbortController()
        loadMoreControllerRef.current = controller
        setLoadingMore(true)
        fetch(apiUrl(`/api/search?q=${encodeURIComponent(urlQuery)}&page=${nextPage}&per_page=10`), { signal: controller.signal })
          .then(r => r.json())
          .then(d => {
            setResults(prev => [...prev, ...d.results])
            setPage(d.page)
            setPages(d.pages)
            setLoadingMore(false)
          })
          .catch(err => { if (err.name !== 'AbortError') setLoadingMore(false) })
      }
    }, { rootMargin: '400px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [urlQuery, loading, loadingMore, page, pages])

  function handleSubmit(e) {
    e.preventDefault()
    const query = inputValue.trim()
    if (!query) return
    setSearchParams({ q: query })
  }

  return (
    <main className="max-w-3xl mx-auto px-6 pt-10 pb-16">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Search</h1>
      <form onSubmit={handleSubmit} className="flex rounded-lg shadow-md mb-10">
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder="Search this site"
          className="flex-1 rounded-l-lg border border-r-0 border-gray-300 px-4 py-2.5 text-sm focus:outline-none"
        />
        <button
          type="submit"
          disabled={!inputValue.trim()}
          aria-label="Search"
          className={`inline-flex items-center justify-center rounded-r-lg border border-l-0 border-gray-300 px-4 py-2.5 transition-colors ${
            inputValue.trim() ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700' : 'bg-white text-gray-300'
          }`}
        >
          <Search size={16} />
        </button>
      </form>

      {!urlQuery && (
        <p className="text-gray-500">Type something to search the site.</p>
      )}

      {urlQuery && !loading && (
        <p className="text-sm text-gray-400 mb-6">
          {total} result{total === 1 ? '' : 's'} for "{urlQuery}"
        </p>
      )}

      {urlQuery && loading && <SearchResultsSkeleton />}

      {urlQuery && !loading && total === 0 && (
        <p className="text-gray-500">No results for "{urlQuery}"</p>
      )}

      {urlQuery && !loading && results.length > 0 && (
        <>
          <div className="flex flex-col gap-4">
            {results.map((result, i) => (
              <Link
                key={i}
                to={result.url}
                className="block rounded-lg border border-gray-200 p-5 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-1">{result.title}</h2>
                {result.snippet && (
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 mb-2">{result.snippet}</p>
                )}
                <span
                  className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    result.type === 'post' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {result.type === 'post' ? 'Post' : 'Page'}
                </span>
              </Link>
            ))}
          </div>

          {/* Infinite scroll sentinel — fetches the next page when it enters the viewport. */}
          {page < pages && <div ref={sentinelRef} className="h-1" />}

          {loadingMore && (
            <div className="flex flex-col gap-4 mt-4">
              <div className="rounded-lg border border-gray-200 p-5 animate-pulse">
                <div className="h-4 w-14 bg-gray-100 rounded-full mb-3" />
                <div className="h-5 bg-gray-100 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-full" />
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
