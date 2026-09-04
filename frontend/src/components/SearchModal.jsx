import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { Search, X } from 'lucide-react'

export default function SearchModal({ onClose }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleSubmit(e) {
    e.preventDefault()
    const query = q.trim()
    if (!query) return
    navigate(`/search?q=${encodeURIComponent(query)}`)
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 p-4 pt-24"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-lg w-full max-w-lg px-6 py-6"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Search</h2>
        <form onSubmit={handleSubmit} className="flex rounded-lg shadow-md">
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search this site"
            autoFocus
            className="flex-1 rounded-l-lg border border-r-0 border-gray-300 px-3 py-2 text-sm focus:outline-none"
          />
          <button
            type="submit"
            disabled={!q.trim()}
            aria-label="Search"
            className={`inline-flex items-center justify-center rounded-r-lg border border-l-0 border-gray-300 px-3 py-2 transition-colors ${
              q.trim() ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700' : 'bg-white text-gray-300'
            }`}
          >
            <Search size={16} />
          </button>
        </form>
      </div>
    </div>,
    document.body
  )
}
