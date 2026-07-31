import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSiteConfig } from '../hooks/useSiteConfig'

const PRESET_AMOUNTS = [5, 10, 25, 50]

export default function DonatePage() {
  const { config } = useSiteConfig()
  const [searchParams, setSearchParams] = useSearchParams()
  const [frequency, setFrequency] = useState('once') // 'once' | 'monthly'
  const [amount, setAmount] = useState(10)
  const [customAmount, setCustomAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const status = searchParams.get('status')

  useEffect(() => {
    if (config?.site_title) {
      document.title = `${config.donate_page_name ?? 'Donate'} - ${config.site_title}`
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

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!amount || amount < 1) {
      setError('Please enter an amount of at least $1.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/donate/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        {config?.donate_page_name ?? 'Donate'}
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
          {submitting ? 'Redirecting…' : frequency === 'monthly' ? `Donate $${amount || 0}/month` : `Donate $${amount || 0}`}
        </button>
        <p className="text-xs text-gray-400">
          You'll be redirected to Stripe to securely enter your payment details.
        </p>
      </form>
    </main>
  )
}
