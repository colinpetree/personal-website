import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import RoleGuard, { adminOnlyFallback } from '../../components/admin/RoleGuard'
import { PageShell, Card } from '../../components/admin/AdminPage'
import AnalyticsChart from '../../components/admin/AnalyticsChart'
import AnalyticsRangeSelector, { RANGE_LABELS } from '../../components/admin/AnalyticsRangeSelector'
import { formatAdminDate, formatShortDate, formatAdminDateTimeInTimezone } from '../../utils/formatDate'
import { useAdminAuth, isAtLeast } from '../../context/AdminAuthContext'
import { useAdminConfig } from '../../hooks/useAdminConfig'

const PLATFORM_LABELS = {
  copy_link: 'Copy link',
  email: 'Email',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X',
  bluesky: 'Bluesky',
}

const LOG_PAGE_SIZE = 20

function Stat({ label, value }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  )
}

export default function AdminAnalyticsDetail() {
  return (
    <RoleGuard minRole="editor" fallback={adminOnlyFallback}>
      <AdminAnalyticsDetailContent />
    </RoleGuard>
  )
}

function AdminAnalyticsDetailContent() {
  const { type, key } = useParams()
  const { admin } = useAdminAuth()
  const isAdmin = isAtLeast(admin, 'administrator')
  const [range, setRange] = useState('7d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Clears stale data the moment we're viewing a genuinely different entity
  // (not just a new range for the same one) — otherwise, since the route is
  // shared (`metrics/:type/:key`), React Router can reuse this component
  // instance across two different entities without remounting it (e.g.
  // browser back/forward between two previously-viewed detail pages), and
  // the previous entity's title/chart/stats would stay on screen under the
  // guard below until the new fetch resolves.
  useEffect(() => {
    setData(null)
  }, [type, key])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/admin/analytics/detail?type=${type}&key=${encodeURIComponent(key)}&range=${range}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(result => { if (!cancelled) { setData(result); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [type, key, range])

  if (loading && !data) return <div className="p-8 text-gray-400">Loading…</div>
  if (!data) return <div className="p-8 text-gray-400">Not found.</div>

  const isPost = type === 'post'
  const metric = isPost ? 'views' : 'unique_visitors'
  const metricLabel = isPost ? 'Views' : 'Unique visitors'
  const rangeText = `${RANGE_LABELS[range]} · ${formatShortDate(data.start)} - ${formatShortDate(data.end)}`
  const backTo = isPost ? '/admin/metrics/blog' : '/admin'
  const backLabel = isPost ? 'Back to Blog Metrics' : 'Back to Site Metrics'

  return (
    <PageShell title={data.label} wide>
      <div className="flex flex-col gap-8">
        <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 -mt-4 w-fit">
          <ArrowLeft size={14} /> {backLabel}
        </Link>

        <div>
          <AnalyticsRangeSelector title={metricLabel} value={range} onChange={setRange} />
          <Card>
            <AnalyticsChart series={data.series} metric={metric} label={metricLabel} />
          </Card>
        </div>

        <div>
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900">Totals</h2>
            <p className="text-xs text-gray-500">{rangeText}</p>
          </div>
          <Card>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              <Stat label="Views" value={data.views.toLocaleString()} />
              <Stat label="Unique visitors" value={data.unique_visitors.toLocaleString()} />
              {isPost && <Stat label="Comments" value={data.comments.toLocaleString()} />}
              {isPost && <Stat label="Shares" value={data.shares.toLocaleString()} />}
            </div>
            {isPost && data.shares > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Shares by platform</p>
                <div className="flex flex-col gap-1.5">
                  {Object.entries(data.shares_by_platform)
                    .sort((a, b) => b[1] - a[1])
                    .map(([platform, count]) => (
                      <div key={platform} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{PLATFORM_LABELS[platform] || platform}</span>
                        <span className="text-gray-900 font-medium">{count}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            {isPost && data.publish_date && (
              <p className="text-xs text-gray-400 pt-1">
                Published {formatAdminDate(data.publish_date.slice(0, 10))}
              </p>
            )}
          </Card>
        </div>

        {type === 'page' && key === 'projects' && <ProjectClicksLog projectClicks={data.project_clicks} />}
        {type === 'page' && key === 'contact' && isAdmin && <ContactSubmissionsLog />}
        {type === 'page' && key === 'ai_demo' && isAdmin && <AiDemoRequestsLog />}
      </div>
    </PageShell>
  )
}

// Just a click count per project, not a chart — see ProjectClick's model
// comment for why unique visitors don't apply here.
function ProjectClicksLog({ projectClicks }) {
  const projects = projectClicks || []
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-3">Project clicks</h2>
      {projects.length === 0 ? (
        <p className="text-sm text-gray-400">No projects yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden bg-white">
          {projects.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm text-gray-900 truncate">{p.title}</p>
              <p className="text-sm font-medium text-gray-900 flex-shrink-0">{p.clicks.toLocaleString()} clicks</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Contact submissions aren't an engagement metric to chart — this is a
// follow-up queue, so just the raw log.
function ContactSubmissionsLog() {
  const { config } = useAdminConfig()
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/admin/contact/submissions?limit=${LOG_PAGE_SIZE}&offset=0`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(result => {
        if (cancelled) return
        setSubmissions(result.submissions)
        setHasMore(result.has_more)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) { setError('Could not load submissions.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  function loadMore() {
    setLoadingMore(true)
    setError('')
    fetch(`/api/admin/contact/submissions?limit=${LOG_PAGE_SIZE}&offset=${submissions.length}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(result => {
        if (!mountedRef.current) return
        setSubmissions(prev => [...prev, ...result.submissions])
        setHasMore(result.has_more)
      })
      .catch(() => { if (mountedRef.current) setError('Could not load more submissions.') })
      .finally(() => { if (mountedRef.current) setLoadingMore(false) })
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-3">Submissions</h2>
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : error && submissions.length === 0 ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : submissions.length === 0 ? (
        <p className="text-sm text-gray-400">No submissions yet.</p>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden bg-white">
            {submissions.map(s => (
              <div key={s.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">{s.name} <span className="text-gray-400">&lt;{s.email}&gt;</span></p>
                    {s.subject && <p className="text-xs text-gray-500 mt-0.5">Subject: {s.subject}</p>}
                  </div>
                  <p className="text-xs text-gray-400 flex-shrink-0">{formatAdminDateTimeInTimezone(s.created_at, config?.timezone)}</p>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{s.message}</p>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="flex flex-col items-center gap-2 mt-4">
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Same idea as ContactSubmissionsLog — a follow-up queue, not a chart.
function AiDemoRequestsLog() {
  const { config } = useAdminConfig()
  const [requests, setRequests] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [grantingId, setGrantingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/admin/ai-demo/access-requests?page=${page}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(result => {
        if (cancelled) return
        setRequests(result.requests)
        setPages(result.pages || 1)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) { setError('Could not load access requests.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [page])

  function grantAccess(userId, grant) {
    setGrantingId(userId)
    fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ai_demo_access: grant }),
    })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(() => {
        setRequests(prev => prev.map(r => r.id === userId ? { ...r, access_granted: grant } : r))
      })
      .catch(() => setError('Could not update access. Please try again.'))
      .finally(() => setGrantingId(null))
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-3">Access requests</h2>
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : error && requests.length === 0 ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-gray-400">No access requests yet.</p>
      ) : (
        <>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <div className="flex flex-col divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden bg-white">
            {requests.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{r.name} <span className="text-gray-400">&lt;{r.email}&gt;</span></p>
                  <p className="text-xs text-gray-400 mt-0.5">Requested {formatAdminDateTimeInTimezone(r.requested_at, config?.timezone)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => grantAccess(r.id, !r.access_granted)}
                  disabled={grantingId === r.id}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors flex-shrink-0 ${
                    r.access_granted
                      ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      : 'bg-gray-900 text-white hover:bg-gray-700'
                  }`}
                >
                  {grantingId === r.id ? 'Saving…' : r.access_granted ? 'Revoke access' : 'Grant access'}
                </button>
              </div>
            ))}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <button
                type="button"
                onClick={() => setPage(p => p - 1)}
                disabled={page === 1}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft size={15} strokeWidth={1.5} />Previous
              </button>
              <span className="text-sm text-gray-500">Page {page} of {pages}</span>
              <button
                type="button"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= pages}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Next<ChevronRight size={15} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
