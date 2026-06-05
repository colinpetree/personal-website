import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

import { X } from 'lucide-react'

const ToastContext = createContext(null)

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback(({ message, subtext, subtextHref }) => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, message, subtext, subtextHref }])
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-[100] pointer-events-none">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onRemove }) {
  const timerRef = useRef(null)

  function startTimer() {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onRemove(toast.id), 4000)
  }

  function clearTimer() {
    clearTimeout(timerRef.current)
  }

  useEffect(() => {
    startTimer()
    return () => clearTimer()
  }, [])

  return (
    <div
      onMouseEnter={clearTimer}
      onMouseLeave={startTimer}
      className="pointer-events-auto flex items-start gap-3 bg-gray-900 text-white rounded-xl px-4 py-3 shadow-lg min-w-[240px] max-w-xs"
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
        onClick={() => onRemove(toast.id)}
        className="shrink-0 text-gray-400 hover:text-gray-200 mt-0.5"
      >
        <X size={14} />
      </button>
    </div>
  )
}
