import { useState, useRef, useEffect } from 'react'

function DraftTag() {
  return <span className="shrink-0 text-[11px] font-medium text-gray-400 border border-gray-200 rounded px-1.5 py-px">Draft</span>
}

// Page chooser for a docs section row. Modeled on NavLinkAutocomplete.jsx,
// but unlike that free-text URL field this one always resolves to an actual
// Page (by id): there is no URL to type and no label, the page title is
// what shows in the docs sidebar. `pages` is the full admin page list
// (published and draft); `excludeIds` are pages that can't be picked here
// (already in another section, or already used elsewhere in this list).
export default function DocsPagePicker({ value, onChange, pages, excludeIds }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = pages.find(p => p.id === value) || null
  const q = query.trim().toLowerCase()
  const available = pages.filter(p => p.id === value || !excludeIds.has(p.id))
  const filtered = (q
    ? available.filter(p => p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
    : available
  ).slice(0, 8)

  function openSearch() {
    setQuery('')
    setOpen(true)
  }

  function choose(page) {
    onChange(page.id)
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <input
        ref={inputRef}
        value={open ? query : (selected?.title ?? '')}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={openSearch}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
          if (e.key === 'Enter' && open && filtered.length > 0) { e.preventDefault(); choose(filtered[0]) }
        }}
        placeholder={open && selected ? selected.title : 'Search pages…'}
        className={`w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-400 ${
          !open && selected ? 'pr-16 sm:pr-52' : ''
        }`}
      />
      {!open && selected && (
        <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center gap-2">
          <span className="text-xs text-gray-400 truncate max-w-[10rem] hidden sm:inline">/{selected.slug}</span>
          {selected.status !== 'published' && <DraftTag />}
        </div>
      )}
      {open && (
        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto text-sm">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">No matching pages</li>
          ) : filtered.map(p => (
            <li
              key={p.id}
              onMouseDown={e => e.preventDefault()}
              onClick={() => choose(p)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 ${p.id === value ? 'bg-gray-50' : ''}`}
            >
              <span className="truncate text-gray-700">{p.title}</span>
              <span className="truncate text-xs text-gray-400">/{p.slug}</span>
              {p.status !== 'published' && <span className="ml-auto"><DraftTag /></span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
