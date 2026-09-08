import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Mail, X } from 'lucide-react'
import { useUserAuth } from '../context/UserAuthContext'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { isValidEmail } from '../utils/isValidEmail'

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function BarOption({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
    >
      {children}
    </button>
  )
}

export default function SignInRequiredModal({ onClose, title = 'Sign in required', message = 'Please sign in to access this demo.' }) {
  const { loginWithGoogle, requestMagicLink } = useUserAuth()
  const { config } = useSiteConfig()
  const [mode, setMode] = useState('choice') // 'choice' | 'email' | 'sent'
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [emailInvalid, setEmailInvalid] = useState(false)

  function handleEmailChange(e) {
    setEmail(e.target.value)
    // Same rule as ContactPage: the invalid-email error and its red border
    // clear together, only when the email field itself is edited.
    setEmailInvalid(false)
    setError('')
  }

  if (!config?.users_enabled) {
    return createPortal(
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div
          className="relative bg-white rounded-xl shadow-lg w-full max-w-sm px-6 pt-10 pb-6 text-center"
          onClick={e => e.stopPropagation()}
        >
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Sign-in unavailable</h2>
          <p className="text-sm text-gray-500">Sign-in is currently disabled on this site.</p>
        </div>
      </div>,
      document.body
    )
  }

  async function handleSendLink(e) {
    e.preventDefault()
    if (!email.trim() || sending) return

    if (!isValidEmail(email.trim())) {
      setEmailInvalid(true)
      setError('Please enter a valid email address.')
      return
    }

    setSending(true)
    setError('')
    try {
      await requestMagicLink(email.trim(), window.location.pathname)
      setMode('sent')
    } catch (err) {
      setError(err.message || 'Failed to send sign-in link')
    } finally {
      setSending(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-lg w-full max-w-sm px-6 pt-10 pb-6 text-center"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>

        {mode === 'choice' && (
          <>
            <h2 className={`text-lg font-semibold text-gray-900 ${message ? 'mb-2' : 'mb-5'}`}>{title}</h2>
            {message && <p className="text-sm text-gray-500 mb-5">{message}</p>}
            <div className="flex flex-col gap-3">
              <BarOption onClick={() => loginWithGoogle(window.location.pathname)}>
                <GoogleIcon />
                Sign in with Google
              </BarOption>
              <BarOption onClick={() => { setMode('email'); setError('') }}>
                <Mail className="w-4 h-4" />
                Sign in with email
              </BarOption>
            </div>
          </>
        )}

        {mode === 'email' && (
          <form onSubmit={handleSendLink} noValidate>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sign in with email</h2>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={handleEmailChange}
              placeholder="you@example.com"
              className={`w-full rounded-md border px-3 py-2 text-sm mb-3 focus:outline-none ${
                emailInvalid ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-gray-400'
              }`}
            />
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <button
              type="submit"
              disabled={sending || !email.trim()}
              className={`w-full rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 mb-3 ${
                email.trim()
                  ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                  : 'bg-white border-gray-300 text-gray-400'
              }`}
            >
              {sending ? 'Sending…' : 'Send sign-in link'}
            </button>
            <button type="button" onClick={() => { setMode('choice'); setError(''); setEmailInvalid(false) }} className="text-sm text-gray-500 hover:text-gray-700">
              Back
            </button>
          </form>
        )}

        {mode === 'sent' && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h2>
            <p className="text-sm text-gray-500">
              Click the magic link in your email to sign in.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
