import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import RoleGuard, { adminOnlyFallback } from '../../components/admin/RoleGuard'
import { PageShell, Card } from '../../components/admin/AdminPage'
import AnalyticsChart from '../../components/admin/AnalyticsChart'
import AnalyticsRangeSelector, { RANGE_LABELS } from '../../components/admin/AnalyticsRangeSelector'
import { formatShortDate } from '../../utils/formatDate'

function Stat({ value, label }) {
  return (
    <div className="text-left sm:text-right sm:w-20 sm:shrink-0">
      <p className="text-sm font-semibold text-gray-900">{(value || 0).toLocaleString()}</p>
      <p className="text-[11px] text-gray-400">{label}</p>
    </div>
  )
}

export default function AdminAnalyticsPage() {
  return (
    <RoleGuard minRole="editor" fallback={adminOnlyFallback}>
      <AdminAnalyticsPageContent />
    </RoleGuard>
  )
}

function AdminAnalyticsPageContent() {
  const [range, setRange] = useState('7d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/admin/analytics/overview?range=${range}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(result => { if (!cancelled) { setData(result); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range])

  if (loading && !data) return <div className="p-8 text-gray-400">Loading…</div>

  const pages = data?.pages || []
  const rangeText = data ? `${RANGE_LABELS[range]} · ${formatShortDate(data.start)} - ${formatShortDate(data.end)}` : ''

  return (
    <PageShell title="Site Metrics" wide>
      <div className="flex flex-col gap-8">
        <div>
          <AnalyticsRangeSelector className="-mt-4" title="Website visitors" value={range} onChange={setRange} />
          <Card>
            <AnalyticsChart series={data?.series} metric="unique_visitors" label="Unique visitors" />
          </Card>
        </div>

        <div>
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900">Pages</h2>
            <p className="text-xs text-gray-500">{rangeText}</p>
          </div>
          {pages.length === 0 ? (
            <p className="text-sm text-gray-400">No enabled pages to show.</p>
          ) : (
            <div className="flex flex-col gap-3 sm:gap-0 sm:divide-y sm:divide-gray-100 sm:border sm:border-gray-200 sm:rounded-lg sm:overflow-hidden">
              {pages.map(page => (
                <Link
                  key={`${page.type}-${page.key}`}
                  to={`/admin/metrics/${page.type}/${page.key}`}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 rounded-lg border border-gray-200 sm:rounded-none sm:border-0 bg-white p-4 sm:px-4 sm:py-3 hover:bg-gray-50 transition-colors"
                >
                  <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">{page.label}</p>
                  <div className="grid grid-cols-2 gap-3 sm:contents">
                    {page.key === 'contact' && <Stat value={page.submissions} label="Submissions" />}
                    {page.key === 'ai_demo' && <Stat value={page.requests} label="Requests" />}
                    {page.key === 'projects' && <Stat value={page.clicks} label="Clicks" />}
                    <Stat value={page.views} label="Views" />
                    <Stat value={page.unique_visitors} label="Unique visitors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900">Blog posts</h2>
            <p className="text-xs text-gray-500">{rangeText}</p>
          </div>
          <div className="flex flex-col gap-3 sm:gap-0 sm:divide-y sm:divide-gray-100 sm:border sm:border-gray-200 sm:rounded-lg sm:overflow-hidden">
            <Link
              to="/admin/metrics/blog"
              className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 rounded-lg border border-gray-200 sm:rounded-none sm:border-0 bg-white p-4 sm:px-4 sm:py-3 hover:bg-gray-50 transition-colors"
            >
              <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">All posts</p>
              <div className="grid grid-cols-2 gap-3 sm:contents">
                <Stat value={data?.blog_summary?.views} label="Views" />
                <Stat value={data?.blog_summary?.unique_visitors} label="Unique visitors" />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
