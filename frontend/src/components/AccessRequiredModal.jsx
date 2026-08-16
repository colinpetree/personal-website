import { useState } from 'react'
import { X } from 'lucide-react'

export default function AccessRequiredModal({ onClose, demoKey, demoTitle, link }) {
  const [mode, setMode] = useState('prompt') // 'prompt' | 'sending' | 'sent'
  const [error, setError] = useState('')

  async function handleRequestAccess() {
    setMode('sending')
    setError('')
    try {
      const res = await fetch('/api/ai-demo/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ demo_key: demoKey }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send request')
      setMode('sent')
    } catch (err) {
      setError(err.message || 'Failed to send request')
      setMode('prompt')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-lg w-full max-w-sm px-6 pt-10 pb-6 text-center"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>

        {mode !== 'sent' ? (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Access required</h2>
            <p className="text-sm text-gray-500 mb-5">
              You need to be allowed to access {demoTitle ? `the "${demoTitle}"` : 'this'} demo.
            </p>
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleRequestAccess}
                disabled={mode === 'sending'}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {mode === 'sending' ? 'Sending…' : 'Request access'}
              </button>
              {link && (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                >
                  {link.text}
                </a>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Request sent</h2>
            <p className="text-sm text-gray-500">
              Thank you for your request, the site owner has been notified.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
