import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export default function Select({ value, onChange, options, placeholder = 'Select…', className = '' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      setOpen(false)
    }
    function close() { setOpen(false) }
    function handleScroll(e) {
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handle)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [open])

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const menuHeight = Math.min(288, options.length * 36 + 8)
    const spaceBelow = window.innerHeight - rect.bottom
    const openAbove = spaceBelow < menuHeight && rect.top > spaceBelow
    setPos({
      top: openAbove ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      openAbove,
    })
    setOpen(true)
  }

  const selected = options.find(o => o.value === value)

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={e => { e.preventDefault(); open ? setOpen(false) : openMenu() }}
        className="w-full flex items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 text-left focus:outline-none focus:ring-2 focus:ring-gray-400 hover:border-gray-400 transition-colors"
      >
        <span className={selected ? '' : 'text-gray-400'}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={15} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.openAbove ? undefined : pos.top,
            bottom: pos.openAbove ? window.innerHeight - pos.top : undefined,
            left: pos.left,
            width: pos.width,
            zIndex: 99999,
          }}
          className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1"
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(opt.value); setOpen(false) }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                opt.value === value ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {opt.value === value && <Check size={14} className="text-gray-500 shrink-0" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
