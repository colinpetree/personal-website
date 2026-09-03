import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import RoleGuard, { adminOnlyFallback } from '../../components/admin/RoleGuard'
import { PageShell, Card } from '../../components/admin/AdminPage'
import AnalyticsChart from '../../components/admin/AnalyticsChart'
import AnalyticsRangeSelector, { RANGE_LABELS } from '../../components/admin/AnalyticsRangeSelector'
import { formatAdminDate, formatShortDate } from '../../utils/formatDate'

const PLATFORM_LABELS = {
  copy_link: 'Copy link',
  email: 'Email',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X',
  bluesky: 'Bluesky',
}

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
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900">{metricLabel}</h2>
            <AnalyticsRangeSelector value={range} onChange={setRange} />
          </div>
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
      </div>
    </PageShell>
  )
}
