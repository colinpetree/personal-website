import { forwardRef, useEffect, useRef, useState } from 'react'

const LIMIT = 10
const SCROLLBAR_IDLE_MS = 800

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatAmount(amount) {
  return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

const PaymentComments = forwardRef(function PaymentComments({ enabled }, ref) {
  const [comments, setComments] = useState([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [isScrolling, setIsScrolling] = useState(false)
  const idleTimerRef = useRef(null)

  function handleScroll() {
    setIsScrolling(true)
    clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => setIsScrolling(false), SCROLLBAR_IDLE_MS)
  }

  useEffect(() => () => clearTimeout(idleTimerRef.current), [])

  function loadPage(nextOffset, append) {
    const setBusy = append ? setLoadingMore : setLoading
    setBusy(true)
    fetch(`/api/payment/comments?limit=${LIMIT}&offset=${nextOffset}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data?.enabled) return
        const rows = data.comments || []
        setComments(prev => append ? [...prev, ...rows] : rows)
        setHasMore(!!data.has_more)
        setOffset(nextOffset + rows.length)
      })
      .catch(() => {})
      .finally(() => setBusy(false))
  }

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    loadPage(0, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  if (!enabled) return null

  return (
    <section
      ref={ref}
      tabIndex={0}
      onScroll={handleScroll}
      className={`payment-comments-scroll mt-10 pt-6 border-t border-gray-200 lg:mt-0 lg:pt-0 lg:border-t-0 lg:h-full lg:overflow-y-auto lg:pr-2 ${isScrolling ? 'is-scrolling' : ''}`}
    >
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent supporters</h2>

      {loading ? (
        <p className="text-base text-gray-400">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-base text-gray-400">Be the first to leave a message!</p>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-gray-100">
            {comments.map(c => (
              <div key={c.id} className="flex gap-3 py-4">
                {c.avatar_url ? (
                  <img
                    src={c.avatar_url}
                    alt={c.display_name}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-base font-semibold text-amber-700 flex-shrink-0">
                    {(c.display_name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-base">
                    <span className="font-medium text-gray-900">{c.display_name}</span>
                    <span className="text-gray-400"> {formatAmount(c.amount)} · {formatDate(c.created_at)}</span>
                  </p>
                  <p className="text-gray-700 text-base leading-relaxed whitespace-pre-wrap mt-1">{c.message}</p>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <button
              onClick={() => loadPage(offset, true)}
              disabled={loadingMore}
              className="mt-4 text-base font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </section>
  )
})

export default PaymentComments
