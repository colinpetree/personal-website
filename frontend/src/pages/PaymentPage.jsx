import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { useUserAuth } from '../context/UserAuthContext'

const PRESET_AMOUNTS = [5, 10, 25, 50]

export default function PaymentPage() {
  const { config } = useSiteConfig()
  const { user, loginWithGoogle } = useUserAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [frequency, setFrequency] = useState('once') // 'once' | 'monthly'
  const [amount, setAmount] = useState(10)
  const [customAmount, setCustomAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [manageLoading, setManageLoading] = useState(false)
  const [manageError, setManageError] = useState('')

  const status = searchParams.get('status')

  useEffect(() => {
    if (config?.site_title) {
      document.title = `${config.payment_page_name ?? 'Payment'} - ${config.site_title}`
    }
  }, [config])

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

  function dismissStatus() {
    searchParams.delete('status')
    setSearchParams(searchParams, { replace: true })
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
        }),
      })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
      } else {
        setError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        {config?.payment_page_name ?? 'Payment'}
      </h1>
      <p className="text-gray-500 mb-8">
        Support the site with a one-time or monthly contribution.
      </p>

      {status === 'success' && (
        <div className="mb-6 rounded-lg bg-green-50 border border-green-200 px-6 py-5 flex items-start justify-between gap-4">
          <p className="text-green-800 font-medium">Thank you for your support!</p>
          <button onClick={dismissStatus} className="text-green-700 hover:text-green-900 text-sm">Dismiss</button>
        </div>
      )}
      {status === 'cancelled' && (
        <div className="mb-6 rounded-lg bg-gray-50 border border-gray-200 px-6 py-5 flex items-start justify-between gap-4">
          <p className="text-gray-700">Checkout was cancelled — no charge was made.</p>
          <button onClick={dismissStatus} className="text-gray-500 hover:text-gray-700 text-sm">Dismiss</button>
        </div>
      )}

      {!user ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-6 text-center">
          <p className="text-sm text-gray-600 mb-3">Sign in to make a payment</p>
          <button
            onClick={() => loginWithGoogle(window.location.pathname)}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
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
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    frequency === opt.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-3">
              {PRESET_AMOUNTS.map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectPreset(value)}
                  className={`rounded-md border px-4 py-3 text-sm font-medium transition-colors ${
                    !customAmount && amount === value
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  ${value}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700" htmlFor="custom-amount">Custom amount (USD)</label>
              <div className="relative w-40">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  id="custom-amount"
                  type="number"
                  min="1"
                  step="0.01"
                  value={customAmount}
                  onChange={handleCustomChange}
                  placeholder="0.00"
                  className="w-full rounded-md border border-gray-300 pl-6 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="self-start rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Redirecting…' : frequency === 'monthly' ? `Pay $${amount || 0}/month` : `Pay $${amount || 0}`}
            </button>
            <p className="text-xs text-gray-400">
              You'll be redirected to Stripe to securely enter your payment details.
            </p>
          </form>

          <div className="mt-10 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-2">Already have a monthly payment set up?</p>
            <button
              onClick={handleManageSubscription}
              disabled={manageLoading}
              className="text-sm font-medium text-gray-700 hover:text-gray-900 underline disabled:opacity-50"
            >
              {manageLoading ? 'Loading…' : 'Manage your subscription'}
            </button>
            {manageError && <p className="text-sm text-red-600 mt-2">{manageError}</p>}
          </div>
        </>
      )}
    </main>
  )
}
