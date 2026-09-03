import { useEffect, useRef, useState } from 'react'
import RoleGuard, { adminOnlyFallback } from '../../components/admin/RoleGuard'
import { PageShell, Card } from '../../components/admin/AdminPage'
import AnalyticsChart from '../../components/admin/AnalyticsChart'
import AnalyticsRangeSelector, { RANGE_LABELS } from '../../components/admin/AnalyticsRangeSelector'
import { formatShortDate, formatAdminDateTimeInTimezone } from '../../utils/formatDate'
import { useAdminConfig } from '../../hooks/useAdminConfig'

const PAGE_SIZE = 20

function formatCurrency(value) {
  return `$${(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// No cents on the Y-axis ticks — keeps them short enough not to crowd/clip
// at typical chart widths; the tooltip still shows full formatCurrency.
function formatCurrencyCompact(value) {
  return `$${(value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function Stat({ value, label }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  )
}

export default function AdminPaymentAnalyticsPage() {
  return (
    <RoleGuard minRole="administrator" fallback={adminOnlyFallback}>
      <AdminPaymentAnalyticsPageContent />
    </RoleGuard>
  )
}

function AdminPaymentAnalyticsPageContent() {
  const { config } = useAdminConfig()
  const [range, setRange] = useState('7d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [transactions, setTransactions] = useState([])
  const [txLoading, setTxLoading] = useState(true)
  const [txHasMore, setTxHasMore] = useState(false)
  const [txLoadingMore, setTxLoadingMore] = useState(false)
  const [txError, setTxError] = useState('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/admin/analytics/payments?range=${range}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(result => { if (!cancelled) { setData(result); setLoading(false) } })
      .catch(() => { if (!cancelled) { setError('Could not load payment metrics.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [range])

  useEffect(() => {
    let cancelled = false
    setTxLoading(true)
    setTxError('')
    fetch(`/api/admin/payment/transactions?limit=${PAGE_SIZE}&offset=0`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(result => {
        if (cancelled) return
        setTransactions(result.transactions)
        setTxHasMore(result.has_more)
        setTxLoading(false)
      })
      .catch(() => { if (!cancelled) { setTxError('Could not load the payments log.'); setTxLoading(false) } })
    return () => { cancelled = true }
  }, [])

  function loadMore() {
    setTxLoadingMore(true)
    setTxError('')
    fetch(`/api/admin/payment/transactions?limit=${PAGE_SIZE}&offset=${transactions.length}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(result => {
        if (!mountedRef.current) return
        setTransactions(prev => [...prev, ...result.transactions])
        setTxHasMore(result.has_more)
      })
      .catch(() => { if (mountedRef.current) setTxError('Could not load more transactions.') })
      .finally(() => { if (mountedRef.current) setTxLoadingMore(false) })
  }

  if (loading && !data) return <div className="p-8 text-gray-400">Loading…</div>
  if (error) return <div className="p-8 text-red-600 text-sm">{error}</div>

  const rangeText = data ? `${RANGE_LABELS[range]} · ${formatShortDate(data.start)} - ${formatShortDate(data.end)}` : ''

  return (
    <PageShell title="Payment Metrics" wide>
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-2 gap-4 -mt-4">
          <Card>
            <Stat label="Received this month" value={formatCurrency(data?.this_month_total)} />
          </Card>
          <Card>
            <Stat label="Received all time" value={formatCurrency(data?.all_time_total)} />
          </Card>
        </div>

        <div>
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900">Amount</h2>
            <AnalyticsRangeSelector value={range} onChange={setRange} />
          </div>
          <Card>
            <AnalyticsChart
              series={data?.series}
              metric="amount"
              label="Amount"
              valueFormatter={formatCurrency}
              tickFormatter={formatCurrencyCompact}
              allowDecimals
              axisWidth={48}
            />
          </Card>
        </div>

        <div>
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900">Totals for range</h2>
            <p className="text-xs text-gray-500">{rangeText}</p>
          </div>
          <Card>
            <div className="grid grid-cols-2 gap-6">
              <Stat label="Received" value={formatCurrency(data?.total_amount)} />
              <Stat label="Transactions" value={(data?.total_count ?? 0).toLocaleString()} />
            </div>
          </Card>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Payments log</h2>
          {txLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : txError && transactions.length === 0 ? (
            <p className="text-sm text-red-600">{txError}</p>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-gray-400">No payments yet.</p>
          ) : (
            <>
              <div className="flex flex-col divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden bg-white">
                {transactions.map(tx => (
                  <div key={tx.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900">{tx.donor_name}</p>
                      <p className="text-xs text-gray-400">
                        {formatAdminDateTimeInTimezone(tx.created_at, config?.timezone)} · {tx.mode === 'subscription' ? 'Monthly' : 'One-time'}
                      </p>
                      {tx.message && (
                        <p className="text-xs text-gray-500 mt-1 italic truncate">
                          "{tx.message}"{tx.comment_visible === false && ' (hidden)'}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900 flex-shrink-0">{formatCurrency(tx.amount)}</p>
                  </div>
                ))}
              </div>
              {txHasMore && (
                <div className="flex flex-col items-center gap-2 mt-4">
                  {txError && <p className="text-xs text-red-600">{txError}</p>}
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={txLoadingMore}
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    {txLoadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PageShell>
  )
}
