import { useEffect, useRef, useState } from 'react'
import { CalendarArrowDown, CalendarArrowUp, Check, History, Search, SlidersHorizontal, X } from 'lucide-react'
import Select from '../ui/Select'
import { DOCS_FILTER_NONE, EMPTY_LIST_FILTER, STATUS_LABELS, isListFilterActive } from '../../lib/adminListFilter'

function sortIcon(value) {
  if (value.startsWith('updated-')) return History
  return value.endsWith('-asc') ? CalendarArrowUp : CalendarArrowDown
}

const withIcons = options => options.map(o => ({ ...o, icon: sortIcon(o.value) }))

// One labeled group of single-choice options inside the Filters popover.
function FilterGroup({ label, choices, value, onSelect, className = '' }) {
  return (
    <div className={className}>
      <span className="mb-1 block text-sm text-gray-700">{label}</span>
      <div role="menu" aria-label={label} className="flex max-h-60 flex-col overflow-y-auto">
        {choices.map(opt => {
          const selected = value === opt.value
          return (
            <button
              key={opt.value || 'all'}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              onClick={() => onSelect(opt.value)}
              className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm text-left transition-colors ${
                selected ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="min-w-0 break-words">{opt.label}</span>
              {selected && <Check size={14} className="shrink-0 text-gray-500" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Search box (title and URL, filters on every keystroke), a Filters popover
// with a status picker (and optionally a Docs section picker), and a sort
// picker. Modeled on lit-review's ListFilterBar. `statuses` lists the status
// values to offer. `docsSections` ({id, name} list) adds the Docs section
// picker; leave it out on lists that have no Docs sections. With neither, the
// Filters button is hidden. shown/total feed the "Showing X of Y" line while a
// filter is active.
export default function AdminListFilterBar({
  filter,
  onChange,
  sort,
  onSortChange,
  sortOptions,
  statuses,
  docsSections,
  placeholder,
  noun,
  shown,
  total,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = e => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = isListFilterActive(filter)
  // The search box is its own indicator, so the dot only tracks the popover.
  const popoverActive = Boolean(filter.status || filter.docs)
  const statusChoices = [{ value: '', label: 'All' }, ...statuses.map(s => ({ value: s, label: STATUS_LABELS[s] }))]
  const docsChoices = docsSections
    ? [
        { value: '', label: 'All' },
        { value: DOCS_FILTER_NONE, label: 'Not in a Docs section' },
        ...docsSections.map(s => ({ value: String(s.id), label: s.name })),
      ]
    : null
  const hasFilters = statuses.length > 0 || Boolean(docsChoices)

  return (
    <div className="mb-4">
      {/* On a phone the search box gets its own row and the controls share the next one. */}
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={filter.query}
            onChange={e => onChange({ ...filter, query: e.target.value })}
            placeholder={placeholder}
            className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-8 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
          {filter.query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChange({ ...filter, query: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        {hasFilters && (
          <div ref={ref} className="relative shrink-0">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen(o => !o)}
              className={`relative flex items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                popoverActive ? 'border-blue-300 text-blue-700' : 'border-gray-300 text-gray-600'
              }`}
            >
              <SlidersHorizontal size={14} />
              Filters
              {popoverActive ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-blue-600" /> : null}
            </button>
            {open ? (
              // Opens to the right on a phone, where the button starts the second row, and to the left
              // beside the search box on wider screens.
              <div className="absolute left-0 z-10 mt-1 w-56 rounded-md border border-gray-200 bg-white p-3 shadow-lg sm:left-auto sm:right-0">
                {statuses.length > 0 && (
                  <FilterGroup
                    label="Status"
                    choices={statusChoices}
                    value={filter.status}
                    onSelect={status => onChange({ ...filter, status })}
                  />
                )}
                {docsChoices && (
                  <FilterGroup
                    label="Docs Section"
                    choices={docsChoices}
                    value={filter.docs}
                    onSelect={docs => onChange({ ...filter, docs })}
                    className={statuses.length > 0 ? 'mt-3 border-t border-gray-100 pt-3' : ''}
                  />
                )}
              </div>
            ) : null}
          </div>
        )}

        <Select
          options={withIcons(sortOptions)}
          value={sort}
          onChange={onSortChange}
          placeholder="Sort by"
          className="min-w-0 flex-1 sm:w-48 sm:flex-none"
        />
      </div>

      {active ? (
        <p className="mt-2 text-sm text-gray-500">
          Showing {shown} of {total} {noun} ·{' '}
          <button
            type="button"
            onClick={() => onChange(EMPTY_LIST_FILTER)}
            className="text-blue-600 underline-offset-2 transition-colors hover:text-blue-800 hover:underline"
          >
            Clear filters
          </button>
        </p>
      ) : null}
    </div>
  )
}
