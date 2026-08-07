import { useEffect, useState } from 'react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, Card, EditableCard, Field, Input, InputWithPrefix, Toggle } from '../../components/admin/AdminPage'
import { useAdminAuth, isAtLeast } from '../../context/AdminAuthContext'

function DisplayValue({ value, fallback = '—' }) {
  return <p className="text-sm text-gray-900">{value || <span className="text-gray-400">{fallback}</span>}</p>
}

function formatCurrency(value) {
  return `$${(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function PaymentsSummaryCard() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/payment/summary', { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(setSummary)
      .catch(() => setError('Could not load payment summary.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card>
      <div>
        <h3 className="text-base font-semibold text-gray-900">Payments</h3>
        <p className="text-sm text-gray-500">Payments received through the payment page</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-gray-500">Total received</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(summary.total)}</p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-gray-500">This month</p>
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(summary.this_month)}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Recent transactions</p>
            {summary.recent.length === 0 ? (
              <p className="text-sm text-gray-400">No payments yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-gray-100">
                {summary.recent.map(d => (
                  <div key={d.id} className="flex items-start justify-between py-2 text-sm gap-3">
                    <div className="min-w-0">
                      <p className="text-gray-900">{d.donor_name}</p>
                      <p className="text-xs text-gray-400">{new Date(d.created_at).toLocaleDateString()} · {d.mode === 'subscription' ? 'Monthly' : 'One-time'}</p>
                      {d.message && (
                        <p className="text-xs text-gray-500 mt-1 italic truncate">
                          "{d.message}"{d.comment_visible === false && ' (hidden)'}
                        </p>
                      )}
                    </div>
                    <p className="font-medium text-gray-900 flex-shrink-0">{formatCurrency(d.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

export default function AdminPaymentPage() {
  const { admin } = useAdminAuth()
  const { config, loading, save } = useAdminConfig()
  const isAdmin = isAtLeast(admin, 'administrator')

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Payment Page">
      <div className="flex flex-col gap-6">

        <EditableCard
          title="Page settings"
          description="Configure payment page visibility and navigation"
          savedValues={{
            payment_enabled: config?.payment_enabled ?? false,
            payment_page_name: config?.payment_page_name || 'Payment',
            payment_slug: config?.payment_slug || 'payment',
            payment_comments_enabled: config?.payment_comments_enabled ?? true,
          }}
          onSave={values => save(values)}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Toggle label="Enable payment page" checked={local.payment_enabled} onChange={v => set('payment_enabled', v)} />
              <Field label="Link label">
                <Input value={local.payment_page_name} onChange={e => set('payment_page_name', e.target.value)} />
              </Field>
              <Field label="Page URL address" hint="Letters, numbers, and hyphens only. A page reload is needed for URL changes to take effect.">
                <InputWithPrefix prefix={`https://${config?.domain || 'example.com'}/`} value={local.payment_slug} onChange={e => set('payment_slug', e.target.value.replace(/^\/+/, ''))} placeholder="payment" />
              </Field>
              <Toggle label="Show supporter comments publicly" checked={local.payment_comments_enabled} onChange={v => set('payment_comments_enabled', v)} />
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Status</p>
                <p className="text-sm">
                  {local.payment_enabled
                    ? <span className="text-[#30cf43] font-medium">Enabled</span>
                    : <span className="text-gray-400">Disabled</span>
                  }
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Link label</p>
                <DisplayValue value={local.payment_page_name} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">URL</p>
                <DisplayValue value={local.payment_slug ? `/${local.payment_slug}` : ''} fallback="/payment" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Supporter comments</p>
                <p className="text-sm">
                  {local.payment_comments_enabled
                    ? <span className="text-[#30cf43] font-medium">Shown publicly</span>
                    : <span className="text-gray-400">Hidden</span>
                  }
                </p>
              </div>
            </>
          )}
        </EditableCard>

        {isAdmin && <EditableCard
          title="Stripe keys"
          description="Payment page is only shown in the navbar once a Stripe publishable key is set."
          savedValues={{
            stripe_publishable_key: config?.stripe_publishable_key || '',
            stripe_secret_key: '',
            stripe_webhook_secret: '',
          }}
          onSave={values => {
            const payload = { ...values }
            if (!payload.stripe_secret_key) delete payload.stripe_secret_key
            if (!payload.stripe_webhook_secret) delete payload.stripe_webhook_secret
            return save(payload)
          }}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Field label="Stripe Publishable Key" hint="Starts with pk_test_ or pk_live_">
                <Input value={local.stripe_publishable_key} onChange={e => set('stripe_publishable_key', e.target.value)} placeholder="pk_live_…" />
              </Field>
              <Field label="Stripe Secret Key" hint={config?.stripe_secret_key_set ? 'Currently set — enter a new value to replace it.' : 'Starts with sk_test_ or sk_live_'}>
                <Input type="password" value={local.stripe_secret_key} onChange={e => set('stripe_secret_key', e.target.value)} placeholder={config?.stripe_secret_key_set ? '••••••••' : 'sk_live_…'} />
              </Field>
              <Field
                label="Stripe Webhook Signing Secret"
                hint={
                  config?.stripe_webhook_secret_set
                    ? 'Currently set — enter a new value to replace it.'
                    : `Create a webhook in your Stripe dashboard pointing to https://${config?.domain || 'your-domain.com'}/api/payment/webhook, listening for checkout.session.completed, then paste its signing secret here.`
                }
              >
                <Input type="password" value={local.stripe_webhook_secret} onChange={e => set('stripe_webhook_secret', e.target.value)} placeholder={config?.stripe_webhook_secret_set ? '••••••••' : 'whsec_…'} />
              </Field>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Publishable Key</p>
                <DisplayValue value={local.stripe_publishable_key} fallback="Not set" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Secret Key</p>
                <p className="text-sm">
                  {config?.stripe_secret_key_set
                    ? <span className="text-gray-900">••••••••</span>
                    : <span className="text-gray-400">Not set</span>
                  }
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Webhook Signing Secret</p>
                <p className="text-sm">
                  {config?.stripe_webhook_secret_set
                    ? <span className="text-gray-900">••••••••</span>
                    : <span className="text-gray-400">Not set</span>
                  }
                </p>
              </div>
            </>
          )}
        </EditableCard>}

        {isAdmin && <PaymentsSummaryCard />}

      </div>
    </PageShell>
  )
}
