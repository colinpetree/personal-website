import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import RoleGuard, { adminOnlyFallback } from '../../components/admin/RoleGuard'
import { PageShell, Card } from '../../components/admin/AdminPage'
import AnalyticsChart from '../../components/admin/AnalyticsChart'
import AnalyticsRangeSelector, { RANGE_LABELS } from '../../components/admin/AnalyticsRangeSelector'
import { formatShortDate, formatAdminDateTime } from '../../utils/formatDate'

const POST_SORTS = [
  { value: 'views', label: 'Views' },
  { value: 'comments', label: 'Comments' },
  { value: 'shares', label: 'Shares' },
  { value: 'date_newest', label: 'Newest' },
  { value: 'date_oldest', label: 'Oldest' },
]

function sortPosts(posts, sort) {
  const sorted = [...posts]
  if (sort === 'date_newest') sorted.sort((a, b) => new Date(b.publish_date) - new Date(a.publish_date))
  else if (sort === 'date_oldest') sorted.sort((a, b) => new Date(a.publish_date) - new Date(b.publish_date))
  else sorted.sort((a, b) => (b[sort] || 0) - (a[sort] || 0))
  return sorted
}

function SortBadge({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

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
  const [postSort, setPostSort] = useState('views')

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
  const posts = sortPosts(data?.posts || [], postSort)
  const rangeText = data ? `${RANGE_LABELS[range]} · ${formatShortDate(data.start)} - ${formatShortDate(data.end)}` : ''

  return (
    <PageShell title="Analytics" wide>
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
                  key={page.key}
                  to={`/admin/analytics/page/${page.key}`}
                  className="flex items-center gap-6 px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
                >
                  <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">{page.label}</p>
                  <Stat value={page.views} label="Views" />
                  <Stat value={page.unique_visitors} label="Unique visitors" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-base font-semibold text-gray-900">Blog posts</h2>
              <div className="flex flex-wrap gap-1.5">
                {POST_SORTS.map(opt => (
                  <SortBadge key={opt.value} active={postSort === opt.value} onClick={() => setPostSort(opt.value)}>
                    {opt.label}
                  </SortBadge>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-500">{rangeText}</p>
          </div>
          {posts.length === 0 ? (
            <p className="text-sm text-gray-400">No published posts to show.</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
              {posts.map(post => (
                <Link
                  key={post.id}
                  to={`/admin/analytics/post/${post.id}`}
                  className="flex items-center gap-6 px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{post.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatAdminDateTime(post.publish_date)}</p>
                  </div>
                  <Stat value={post.views} label="Views" />
                  <Stat value={post.unique_visitors} label="Unique visitors" />
                  <Stat value={post.comments} label="Comments" />
                  <Stat value={post.shares} label="Shares" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
