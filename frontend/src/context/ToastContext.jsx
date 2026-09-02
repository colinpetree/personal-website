import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const TOAST_TRANSITION_MS = 100
const TOAST_DURATION_MS = 3500

const ToastContext = createContext(null)

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 0

// Single toast system for the whole app (public site + admin panel). Mount
// one <ToastProvider> per top-level layout — App.jsx (public) and
// AdminLayout.jsx (admin) each have their own, since neither is nested
// inside the other's route tree.
//
// addToast accepts either a plain string ("Link copied") or an object
// ({ message, subtext, subtextHref }) for a message with a secondary line
// (optionally a link, e.g. "View on site").
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((input) => {
    const toast = typeof input === 'string' ? { message: input } : input
    const id = ++nextId
    setToasts(prev => [...prev, { id, ...toast }])
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-[100] pointer-events-none">
          {toasts.map(toast => (
            <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onRemove }) {
  const timerRef = useRef(null)
  const [entered, setEntered] = useState(false)
  const [leaving, setLeaving] = useState(false)

  function startLeaving() {
    setLeaving(true)
    setTimeout(() => onRemove(toast.id), TOAST_TRANSITION_MS)
  }

  function startTimer() {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(startLeaving, TOAST_DURATION_MS)
  }

  function clearTimer() {
    clearTimeout(timerRef.current)
  }

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    startTimer()
    return () => { cancelAnimationFrame(raf); clearTimer() }
  }, [])

  return (
    <div
      onMouseEnter={clearTimer}
      onMouseLeave={startTimer}
      onMouseDown={e => e.stopPropagation()}
      className={`pointer-events-auto flex items-start gap-3 bg-gray-900 text-white rounded-xl px-4 py-3 shadow-lg min-w-[240px] max-w-xs transition-all duration-100 ease-out ${
        entered && !leaving ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{toast.message}</p>
        {toast.subtext && (
          toast.subtextHref ? (
            <a
              href={toast.subtextHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-gray-200 underline mt-0.5 block"
            >
              {toast.subtext}
            </a>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5">{toast.subtext}</p>
          )
        )}
      </div>
      <button
        onClick={startLeaving}
        className="shrink-0 text-gray-400 hover:text-gray-200 mt-0.5"
      >
        <X size={14} />
      </button>
    </div>
  )
}
