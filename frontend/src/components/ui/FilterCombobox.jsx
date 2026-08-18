import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'

// Type-and-filter selector: a text input that filters `options` as you type,
// and shows the selected option's label as the placeholder once chosen.
export default function FilterCombobox({
  value,
  onChange,
  options,
  placeholder = 'Search…',
  renderOption,
  className = 'w-56',
  menuClassName = '',
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = options.find(o => o.value === value)
  const filtered = !search ? options : options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input
        type="text"
        placeholder={selected ? selected.label : placeholder}
        value={search}
        onFocus={() => {
          // Deliberately doesn't clear `value` here — some consumers (e.g. the
          // blog post editor's category field) treat onChange as an immediate
          // persist, so merely focusing to look at options must not clear the
          // current selection. Clearing only happens on an actual edit: typing
          // (below) or the explicit X button.
          setOpen(true)
        }}
        onChange={e => {
          setSearch(e.target.value)
          if (selected) onChange(null)
          setOpen(true)
        }}
        className={`w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 pr-7 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-100 ${selected ? 'placeholder-gray-900 font-medium' : 'placeholder-gray-400'}`}
      />
      {selected && (
        <button
          type="button"
          onClick={() => { onChange(null); setSearch('') }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      )}
      {open && filtered.length > 0 && (
        <ul className={`absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm ${menuClassName}`}>
          {filtered.map(opt => (
            <li
              key={opt.value}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(opt.value); setSearch(''); setOpen(false) }}
              className={`px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${opt.value === value ? 'text-gray-900 font-medium' : 'text-gray-700'}`}
            >
              {renderOption ? renderOption(opt) : <span className="truncate">{opt.label}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
