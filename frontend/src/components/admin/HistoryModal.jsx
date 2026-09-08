import { useState, useEffect, useRef } from 'react'
import { Filter } from 'lucide-react'
import { Toggle } from './AdminPage'
import FilterCombobox from '../ui/FilterCombobox'

function getInitials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0]?.[0] || '?').toUpperCase()
}

function AvatarCircle({ name, avatarFilename }) {
  if (avatarFilename) {
    return <img src={`/api/uploads/${avatarFilename}`} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt={name} />
  }
  return (
    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center leading-none text-base font-semibold text-gray-600 flex-shrink-0">
      <span className="translate-y-px">{getInitials(name)}</span>
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function EntryTitle({ entry }) {
  const subject = entry.subject_is_bold
    ? <strong>{entry.subject}</strong>
    : entry.subject
  const countSuffix = entry.count > 1 ? ` ${entry.count} times` : ''
  return (
    <span className="text-sm text-gray-900">
      {entry.area} {entry.action_type}: {subject}{entry.subject_suffix ? ` ${entry.subject_suffix}` : ''}{countSuffix} - by {entry.admin_name}
    </span>
  )
}

const FILTER_ACTIONS = [
  { key: 'added', label: 'Added' },
  { key: 'edited', label: 'Edited' },
  { key: 'deleted', label: 'Deleted' },
]

const FILTER_AREAS = [
  { key: 'Post', label: 'Posts' },
  { key: 'Page', label: 'Pages' },
  { key: 'Settings,User', label: 'Settings and staff' },
]

export default function HistoryModal({ onClose, initialAdminId = null }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState([])

  // Filters
  const [filterActions, setFilterActions] = useState({ added: false, edited: false, deleted: false })
  const [filterAreas, setFilterAreas] = useState({ Post: false, Page: false, 'Settings,User': false })
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  // Staff search
  const [selectedAdminId, setSelectedAdminId] = useState(initialAdminId)

  useEffect(() => {
    fetch('/api/admin/history/staff', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setStaff)
  }, [])

  useEffect(() => {
    loadEntries()
  }, [filterActions, filterAreas, selectedAdminId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadEntries() {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedAdminId) params.set('admin_id', selectedAdminId)

    const activeActions = Object.entries(filterActions).filter(([, v]) => v).map(([k]) => k)
    if (activeActions.length) params.set('action', activeActions.join(','))

    const activeAreas = Object.entries(filterAreas).filter(([, v]) => v).map(([k]) => k)
    if (activeAreas.length) params.set('area', activeAreas.join(','))

    const res = await fetch(`/api/admin/history?${params}`, { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      setEntries(data.entries || [])
    }
    setLoading(false)
  }

  // Outside click handler (filter popover only — FilterCombobox handles its own)
  useEffect(() => {
    function handleClick(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const hasActiveFilters = Object.values(filterActions).some(Boolean) || Object.values(filterAreas).some(Boolean)

  const staffOptions = staff.map(s => ({ value: s.id, label: s.name, avatar_filename: s.avatar_filename }))

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">History</h2>
          <div className="flex items-center gap-3">

            {/* Filter button */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterOpen(o => !o)}
                className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border transition-colors ${
                  hasActiveFilters
                    ? 'border-gray-900 text-gray-900 bg-gray-50'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                <Filter size={14} />
                Filter
                {hasActiveFilters && (
                  <span className="ml-0.5 w-4 h-4 rounded-full bg-gray-900 text-white text-[10px] flex items-center justify-center">
                    {Object.values(filterActions).filter(Boolean).length + Object.values(filterAreas).filter(Boolean).length}
                  </span>
                )}
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-9 bg-white border border-gray-200 rounded-lg shadow-lg py-3 px-4 w-52 z-10 flex flex-col gap-2">
                  {FILTER_ACTIONS.map(({ key, label }) => (
                    <Toggle
                      key={key}
                      label={label}
                      checked={filterActions[key]}
                      onChange={v => setFilterActions(f => ({ ...f, [key]: v }))}
                    />
                  ))}
                  <div className="border-t border-gray-100 my-1" />
                  {FILTER_AREAS.map(({ key, label }) => (
                    <Toggle
                      key={key}
                      label={label}
                      checked={filterAreas[key]}
                      onChange={v => setFilterAreas(f => ({ ...f, [key]: v }))}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Staff search */}
            <FilterCombobox
              value={selectedAdminId}
              onChange={setSelectedAdminId}
              options={staffOptions}
              placeholder="Search staff…"
              className="w-40"
              menuClassName="right-0"
              renderOption={opt => (
                <>
                  <AvatarCircle name={opt.label} avatarFilename={opt.avatar_filename} />
                  <span className="truncate">{opt.label}</span>
                </>
              )}
            />
          </div>
        </div>

        {/* Entry list */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {loading ? (
            <p className="px-6 py-8 text-sm text-gray-400">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-400">No history entries found.</p>
          ) : entries.map(entry => (
            <div key={entry.id} className="flex items-center gap-3 px-6 py-4">
              <AvatarCircle name={entry.admin_name} avatarFilename={entry.admin_avatar} />
              <div className="flex flex-col leading-tight">
                <EntryTitle entry={entry} />
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(entry.created_at)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex items-center">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
        </div>
      </div>
    </div>
  )
}
