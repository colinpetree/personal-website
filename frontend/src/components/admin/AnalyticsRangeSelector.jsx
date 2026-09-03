const RANGE_OPTIONS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '3mo', label: '3 months' },
  { value: '6mo', label: '6 months' },
  { value: '1yr', label: '1 year' },
  { value: 'all', label: 'All time' },
]

// "Last 7 days" etc. — used next to a card/section title so a reader can
// tell which dates the numbers below it cover.
export const RANGE_LABELS = Object.fromEntries(
  RANGE_OPTIONS.map(opt => [opt.value, opt.value === 'all' ? opt.label : `Last ${opt.label}`])
)

export default function AnalyticsRangeSelector({ value, onChange }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
      {RANGE_OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            value === opt.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
