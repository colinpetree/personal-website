import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { useUserAuth } from '../context/UserAuthContext'
import PaymentComments from '../components/PaymentComments'
import SignInRequiredModal from '../components/SignInRequiredModal'
import { setMetaDescription } from '../utils/meta'

const PRESET_AMOUNTS = [3, 9, 15, 25]
const MESSAGE_MAX_LEN = 500
const NAME_MAX_LEN = 100
const GUEST_PORTAL_GENERIC_MESSAGE = "If that email has an active subscription, we've sent a management link."

export default function PaymentPage() {
  const { config } = useSiteConfig()
  const { user } = useUserAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showSignInModal, setShowSignInModal] = useState(false)

  const [step, setStep] = useState('form') // 'form' | 'checkout'
  const [frequency, setFrequency] = useState('once') // 'once' | 'monthly'
  const [amount, setAmount] = useState(10)
  const [customAmount, setCustomAmount] = useState('')
  const [message, setMessage] = useState('')
  const [guestName, setGuestName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [clientSecret, setClientSecret] = useState(null)

  const [returnStatus, setReturnStatus] = useState(null) // 'success' | 'incomplete' | null
  const [returnLoading, setReturnLoading] = useState(false)

  const [manageLoading, setManageLoading] = useState(false)
  const [manageError, setManageError] = useState('')

  const [showGuestPortalForm, setShowGuestPortalForm] = useState(false)
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPortalMessage, setGuestPortalMessage] = useState('')
  const [guestPortalLoading, setGuestPortalLoading] = useState(false)

  const stripePromise = useMemo(() => {
    if (!config?.stripe_publishable_key) return null
    return loadStripe(config.stripe_publishable_key)
  }, [config?.stripe_publishable_key])

  useEffect(() => {
    if (config?.site_title) {
      document.title = `${config.payment_page_name ?? 'Payment'} - ${config.site_title}`
    }
    setMetaDescription(config?.payment_meta_description)
  }, [config])

  useEffect(() => {
    if (step !== 'checkout') return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [step])

  useEffect(() => {
    const status = searchParams.get('status')
    const sessionId = searchParams.get('session_id')
    if (status !== 'return' || !sessionId) return

    setReturnLoading(true)
    fetch(`/api/payment/checkout-session-status?session_id=${encodeURIComponent(sessionId)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setReturnStatus(data?.status === 'complete' ? 'success' : 'incomplete'))
      .catch(() => setReturnStatus('incomplete'))
      .finally(() => setReturnLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function dismissReturnStatus() {
    searchParams.delete('status')
    searchParams.delete('session_id')
    setSearchParams(searchParams, { replace: true })
    setReturnStatus(null)
  }

  function selectPreset(value) {
    setAmount(value)
    setCustomAmount('')
  }

  function handleCustomChange(e) {
    const value = e.target.value
    setCustomAmount(value)
    const parsed = parseFloat(value)
    if (!Number.isNaN(parsed)) setAmount(parsed)
  }

  function resetToForm() {
    setStep('form')
    setClientSecret(null)
    setSubmitting(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!amount || amount < 1) {
      setError('Please enter an amount of at least $1.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/payment/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount,
          mode: frequency === 'monthly' ? 'subscription' : 'payment',
          interval: 'month',
          message: message.trim() || undefined,
          display_name: !user ? (guestName.trim() || undefined) : undefined,
        }),
      })
      const data = await res.json()
      if (res.ok && data.client_secret) {
        setClientSecret(data.client_secret)
        setStep('checkout')
      } else {
        setError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  async function handleManageSubscription() {
    setManageError('')
    setManageLoading(true)
    try {
      const res = await fetch('/api/payment/manage-subscription', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
      } else {
        setManageError(data.error || 'Something went wrong. Please try again.')
        setManageLoading(false)
      }
    } catch {
      setManageError('Network error. Please try again.')
      setManageLoading(false)
    }
  }

  async function handleGuestPortalSubmit(e) {
    e.preventDefault()
    setGuestPortalLoading(true)
    setGuestPortalMessage('')
    try {
      const res = await fetch('/api/payment/guest-portal-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: guestEmail }),
      })
      const data = await res.json()
      setGuestPortalMessage(data.message || GUEST_PORTAL_GENERIC_MESSAGE)
    } catch {
      setGuestPortalMessage(GUEST_PORTAL_GENERIC_MESSAGE)
    } finally {
      setGuestPortalLoading(false)
    }
  }

  const commentsEnabled = !!config?.payment_comments_enabled

  const mainRef = useRef(null)
  const commentsRef = useRef(null)

  useEffect(() => {
    if (!commentsEnabled) return
    const mainEl = mainRef.current
    if (!mainEl) return

    function onWheel(e) {
      if (step === 'checkout') return
      if (e.ctrlKey) return // pinch-zoom / ctrl+wheel zoom — let the browser handle it
      if (window.innerWidth < 1024) return
      const commentsEl = commentsRef.current
      if (!commentsEl || commentsEl.contains(e.target)) return
      e.preventDefault()
      commentsEl.scrollTop += e.deltaY
    }

    mainEl.addEventListener('wheel', onWheel, { passive: false })
    return () => mainEl.removeEventListener('wheel', onWheel)
  }, [commentsEnabled, step])

  const paymentContent = (
    <>
      {showSignInModal && (
        <SignInRequiredModal
          onClose={() => setShowSignInModal(false)}
          title="Sign in"
          message="Sign in to have your name and avatar attached to your support message."
        />
      )}

      {step === 'checkout' && clientSecret ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={resetToForm}
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4">
              <button
                onClick={resetToForm}
                className="text-base text-gray-500 hover:text-gray-700"
              >
                ← Change amount
              </button>
              <button
                onClick={resetToForm}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1"
              >
                ×
              </button>
            </div>
            <div className="p-4">
              {stripePromise ? (
                <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              ) : (
                <p className="text-base text-gray-400">Loading checkout…</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="inline-flex self-start rounded-lg bg-gray-100 p-1">
              {[
                { key: 'once', label: 'One-time' },
                { key: 'monthly', label: 'Monthly' },
              ].map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setFrequency(opt.key)}
                  className={`px-4 py-1.5 rounded-md text-base font-medium transition-colors ${
                    frequency === opt.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-3">
              {PRESET_AMOUNTS.map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectPreset(value)}
                  className={`w-12 h-12 rounded-full border text-base font-semibold transition-colors flex items-center justify-center flex-shrink-0 ${
                    !customAmount && amount === value
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-gray-300 text-gray-700 hover:border-amber-400'
                  }`}
                >
                  ${value}
                </button>
              ))}

              <div className="relative w-20">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base">$</span>
                <input
                  id="custom-amount"
                  type="number"
                  min="1"
                  step="0.01"
                  value={customAmount}
                  onChange={handleCustomChange}
                  placeholder="0.00"
                  className="w-full rounded-md border border-gray-300 pl-6 pr-2 py-2.5 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>

            {!user && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-3">
                  <label className="text-base font-medium text-gray-700" htmlFor="guest-name">Name (optional)</label>
                  {config?.users_enabled && (
                    <button
                      type="button"
                      onClick={() => setShowSignInModal(true)}
                      className="text-sm text-gray-400 underline hover:text-gray-600"
                    >
                      Sign in
                    </button>
                  )}
                </div>
                <input
                  id="guest-name"
                  type="text"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value.slice(0, NAME_MAX_LEN))}
                  placeholder="Anonymous"
                  maxLength={NAME_MAX_LEN}
                  className="rounded-md border border-gray-300 px-3 py-2 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 w-full sm:w-64"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                {user && (
                  user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.name}
                      className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-500 flex-shrink-0">
                      {(user.name || '?').charAt(0).toUpperCase()}
                    </div>
                  )
                )}
                {user && <span className="text-base font-medium text-gray-700">{user.name}</span>}
                {user && <span className="text-base text-gray-400">·</span>}
                <label className="text-base font-medium text-gray-700" htmlFor="payment-message">
                  Leave a message (optional)
                </label>
              </div>
              <textarea
                id="payment-message"
                value={message}
                onChange={e => setMessage(e.target.value.slice(0, MESSAGE_MAX_LEN))}
                placeholder="Say something nice…"
                rows={3}
                maxLength={MESSAGE_MAX_LEN}
                className="rounded-md border border-gray-300 px-3 py-2 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
              <span className="text-sm text-gray-400 self-end">{message.length}/{MESSAGE_MAX_LEN}</span>
            </div>

            {error && <p className="text-base text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="self-start -mt-3 rounded-full bg-amber-500 px-6 py-2.5 text-base font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Preparing checkout…' : frequency === 'monthly' ? `Pay $${amount || 0}/month` : `Pay $${amount || 0}`}
            </button>
          </form>

          <div className="mt-10 pt-6 border-t border-gray-200">
            <p className="text-base text-gray-500 mb-2">Already have a monthly payment set up?</p>
            {user ? (
              <>
                <button
                  onClick={handleManageSubscription}
                  disabled={manageLoading}
                  className="text-base font-medium text-gray-700 hover:text-gray-900 underline disabled:opacity-50"
                >
                  {manageLoading ? 'Loading…' : 'Manage your subscription'}
                </button>
                {manageError && <p className="text-base text-red-600 mt-2">{manageError}</p>}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowGuestPortalForm(v => !v)}
                  className="text-sm text-gray-400 underline hover:text-gray-600"
                >
                  Manage subscription
                </button>
                {showGuestPortalForm && (
                  <>
                    <form onSubmit={handleGuestPortalSubmit} className="flex flex-col sm:flex-row gap-2 sm:items-center mt-3">
                      <input
                        type="email"
                        required
                        value={guestEmail}
                        onChange={e => setGuestEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="rounded-md border border-gray-300 px-3 py-2 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 w-full sm:w-64"
                      />
                      <button
                        type="submit"
                        disabled={guestPortalLoading}
                        className="rounded-md border border-gray-300 px-4 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        {guestPortalLoading ? 'Sending…' : 'Send link'}
                      </button>
                    </form>
                    {guestPortalMessage && <p className="text-base text-gray-500 mt-2">{guestPortalMessage}</p>}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  )

  return (
    <main ref={mainRef} className={`mx-auto px-6 py-16 ${commentsEnabled ? 'max-w-5xl' : 'max-w-md'} ${commentsEnabled ? 'lg:h-[calc(100vh-4rem-1px)] lg:overflow-hidden lg:flex lg:flex-col' : ''}`}>
      <div className={commentsEnabled ? 'lg:flex-shrink-0' : ''}>
        {config?.payment_text && (
          <div
            className="prose prose-gray max-w-none blog-content page-header-content mb-8"
            dangerouslySetInnerHTML={{ __html: config.payment_text }}
          />
        )}

        {returnLoading && (
          <div className="mb-6 rounded-lg bg-gray-50 border border-gray-200 px-6 py-5">
            <p className="text-gray-600 text-base">Checking your payment status…</p>
          </div>
        )}
        {returnStatus === 'success' && (
          <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 px-6 py-5 flex items-start justify-between gap-4">
            <p className="text-amber-800 font-medium">🎉 Thank you for your support!</p>
            <button onClick={dismissReturnStatus} className="text-amber-700 hover:text-amber-900 text-base">Dismiss</button>
          </div>
        )}
        {returnStatus === 'incomplete' && (
          <div className="mb-6 rounded-lg bg-gray-50 border border-gray-200 px-6 py-5 flex items-start justify-between gap-4">
            <p className="text-gray-700">Checkout wasn't completed — no charge was made.</p>
            <button onClick={dismissReturnStatus} className="text-gray-500 hover:text-gray-700 text-base">Dismiss</button>
          </div>
        )}
      </div>

      {commentsEnabled ? (
        <div className="flex flex-col lg:flex-row lg:items-start gap-x-12 lg:flex-1 lg:min-h-0">
          {/* Payment column: DOM-first so it's on top on mobile; lg:order-2 moves it to the right column on desktop */}
          <div className="lg:order-2 lg:flex-1 lg:min-w-0">
            {paymentContent}
          </div>
          {/* Comments column: DOM-second so it's below payment on mobile; lg:order-1 moves it to the left column on desktop */}
          <div className="lg:order-1 lg:flex-1 lg:min-w-0 lg:h-full">
            <PaymentComments ref={commentsRef} enabled={commentsEnabled} />
          </div>
        </div>
      ) : (
        paymentContent
      )}
    </main>
  )
}
