import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export default function Select({ value, onChange, options, placeholder = 'Select…', className = '' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  // Keyboard highlight while the menu is open. Focus stays on the trigger,
  // so the arrow keys move this instead of moving focus into the portal.
  const [activeIndex, setActiveIndex] = useState(-1)

  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const optionRefs = useRef([])

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

  useEffect(() => {
    if (open && activeIndex >= 0) optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

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
    const current = options.findIndex(o => o.value === value)
    setActiveIndex(current >= 0 ? current : 0)
    setOpen(true)
  }

  function choose(index) {
    const opt = options[index]
    if (opt) onChange(opt.value)
    setOpen(false)
  }

  function handleKeyDown(e) {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault()
        openMenu()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(i => Math.min(i + 1, options.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(i => Math.max(i - 1, 0))
        break
      case 'Home':
        e.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        e.preventDefault()
        setActiveIndex(options.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(activeIndex)
        break
      case 'Escape':
        // Only this menu closes; a surrounding modal or popover stays open.
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  const selected = options.find(o => o.value === value)

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={e => { e.preventDefault(); open ? setOpen(false) : openMenu() }}
        onKeyDown={handleKeyDown}
        className="w-full flex items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 text-left focus:outline-none focus:border-gray-500 hover:border-gray-400 transition-colors"
      >
        <span className={`flex min-w-0 items-center gap-2 ${selected ? '' : 'text-gray-400'}`}>
          {selected?.icon && <selected.icon size={14} className="shrink-0 text-gray-500" />}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
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
          role="listbox"
          className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1"
        >
          {options.map((opt, i) => (
            <button
              key={opt.value}
              ref={el => { optionRefs.current[i] = el }}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              tabIndex={-1}
              onMouseDown={e => { e.preventDefault(); choose(i) }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                opt.value === value
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : i === activeIndex ? 'bg-gray-50 text-gray-700' : 'text-gray-700'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {opt.icon && <opt.icon size={14} className="shrink-0 text-gray-500" />}
                <span className="truncate">{opt.label}</span>
              </span>
              {opt.value === value && <Check size={14} className="text-gray-500 shrink-0" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
