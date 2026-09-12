import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import RoleGuard, { adminOnlyFallback } from '../../components/admin/RoleGuard'
import { PageShell, Card } from '../../components/admin/AdminPage'
import AnalyticsChart from '../../components/admin/AnalyticsChart'
import AnalyticsRangeSelector, { RANGE_LABELS } from '../../components/admin/AnalyticsRangeSelector'
import { formatShortDate } from '../../utils/formatDate'

function Stat({ value, label }) {
  return (
    <div className="text-right w-20 shrink-0">
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
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap -mt-4">
            <h2 className="text-base font-semibold text-gray-900">Website visitors</h2>
            <AnalyticsRangeSelector value={range} onChange={setRange} />
          </div>
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
            <div className="flex flex-col divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
              {pages.map(page => (
                <Link
                  key={`${page.type}-${page.key}`}
                  to={`/admin/metrics/${page.type}/${page.key}`}
                  className="flex items-center gap-6 px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
                >
                  <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">{page.label}</p>
                  {page.key === 'contact' && <Stat value={page.submissions} label="Submissions" />}
                  {page.key === 'ai_demo' && <Stat value={page.requests} label="Requests" />}
                  {page.key === 'projects' && <Stat value={page.clicks} label="Clicks" />}
                  <Stat value={page.views} label="Views" />
                  <Stat value={page.unique_visitors} label="Unique visitors" />
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
          <div className="flex flex-col divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
            <Link
              to="/admin/metrics/blog"
              className="flex items-center gap-6 px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
            >
              <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">All posts</p>
              <Stat value={data?.blog_summary?.views} label="Views" />
              <Stat value={data?.blog_summary?.unique_visitors} label="Unique visitors" />
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
