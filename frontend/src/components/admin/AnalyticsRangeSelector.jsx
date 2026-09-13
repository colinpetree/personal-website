import { Calendar } from 'lucide-react'
import Popover from '../ui/Popover'

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

function RangePillGroup({ value, onChange }) {
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

// Right-justified calendar icon that opens a popover of the date-range
// options — used in place of the pill group on small screens, where the
// full pill row doesn't fit.
function RangeCalendarPopover({ value, onChange }) {
  return (
    <Popover
      align="end"
      trigger={
        <button
          type="button"
          className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Change date range"
        >
          <Calendar size={16} strokeWidth={1.5} />
        </button>
      }
    >
      {({ close }) => (
        <div className="py-1">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); close() }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                value === opt.value ? 'text-gray-900 font-medium bg-gray-50' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}

// Section title + date-range control, right above a chart. Desktop (sm+)
// keeps the classic title-left / pill-group-right row. Below sm the pill
// group doesn't fit, so it's replaced by the current range as short text
// (left) plus a calendar-icon popover (right), with the title on its own
// line above.
export default function AnalyticsRangeSelector({ title, value, onChange, className = '' }) {
  return (
    <div className={className}>
      <div className="hidden sm:flex items-center justify-between gap-4 mb-3 flex-wrap">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <RangePillGroup value={value} onChange={onChange} />
      </div>
      <div className="sm:hidden">
        <h2 className="text-base font-semibold text-gray-900 mb-3">{title}</h2>
        <div className="flex items-center justify-between gap-4 mb-3">
          <p className="text-sm text-gray-500">{RANGE_LABELS[value]}</p>
          <RangeCalendarPopover value={value} onChange={onChange} />
        </div>
      </div>
    </div>
  )
}
