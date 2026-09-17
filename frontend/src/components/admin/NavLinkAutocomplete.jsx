import { useState, useRef, useEffect } from 'react'

// Free-text URL input with a suggestion overlay — unlike FilterCombobox,
// this never locks the field to a chosen option, since external
// https://... URLs must stay typable. Suggestions are just a convenience.
export default function NavLinkAutocomplete({ value, onChange, links, placeholder, className = 'flex-1 min-w-0' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const q = value.trim().toLowerCase()
  const filtered = (q
    ? links.filter(l => l.url.toLowerCase().includes(q) || l.title.toLowerCase().includes(q))
    : links
  ).slice(0, 5)

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-400"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm">
          {filtered.map(l => (
            <li
              key={l.url}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(l.url); setOpen(false) }}
              className="px-3 py-2 cursor-pointer hover:bg-gray-50 text-gray-700"
            >
              <span className="truncate">{l.url}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
