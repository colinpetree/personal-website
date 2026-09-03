import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { formatAdminDate } from '../../utils/formatDate'

function formatDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AnalyticsChart({
  series,
  metric = 'unique_visitors',
  label = 'Unique visitors',
  valueFormatter = v => v,
  tickFormatter = valueFormatter,
  allowDecimals = false,
  axisWidth = 32,
}) {
  const data = (series || []).map(point => ({ ...point, label: formatDateLabel(point.date) }))

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
          <YAxis allowDecimals={allowDecimals} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={axisWidth} tickFormatter={tickFormatter} />
          <Tooltip
            labelFormatter={(_, payload) => formatAdminDate(payload?.[0]?.payload?.date)}
            formatter={value => [valueFormatter(value), label]}
            contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e5e7eb' }}
          />
          <Line type="monotone" dataKey={metric} stroke="#111827" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
