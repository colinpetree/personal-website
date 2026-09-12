import { useState } from 'react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, EditableCard, Field, Input } from '../../components/admin/AdminPage'
import RoleGuard, { adminOnlyFallback } from '../../components/admin/RoleGuard'

function DisplayValue({ value, fallback = '—' }) {
  return (
    <p className="text-sm text-gray-900 truncate">{value || <span className="text-gray-400">{fallback}</span>}</p>
  )
}

export default function AdminIntegrationsPage() {
  return (
    <RoleGuard minRole="administrator" fallback={adminOnlyFallback}>
      <AdminIntegrationsPageContent />
    </RoleGuard>
  )
}

function AdminIntegrationsPageContent() {
  const { config, loading, save } = useAdminConfig()
  const [testEmail, setTestEmail] = useState('')
  const [testStatus, setTestStatus] = useState(null) // null | 'sending' | 'sent' | 'error'
  const [testMsg, setTestMsg] = useState('')
  const [showTestDialog, setShowTestDialog] = useState(false)

  async function sendTestEmail() {
    setTestStatus('sending')
    setTestMsg('')
    try {
      const res = await fetch('/api/admin/contact/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to: testEmail }),
      })
      const data = await res.json()
      if (res.ok) { setTestStatus('sent'); setTestMsg(data.message) }
      else { setTestStatus('error'); setTestMsg(data.error) }
    } catch {
      setTestStatus('error')
      setTestMsg('Network error')
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Integrations">
      <div className="flex flex-col gap-6">

        {/* Mailgun Settings card */}
        <EditableCard
          title="Mailgun Settings"
          description="Allow this site to send emails for Contact form submissions and user sign-in links."
          savedValues={{
            mailgun_api_key: '',
            mailgun_domain: config?.mailgun_domain || '',
            smtp_from_email: config?.smtp_from_email || '',
          }}
          onSave={values => {
            const payload = { ...values }
            if (!payload.mailgun_api_key) delete payload.mailgun_api_key
            return save(payload)
          }}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Field label="Mailgun API Key" hint={config?.mailgun_api_key_set ? 'Currently set, enter a new value to replace it.' : ''}>
                <Input type="password" value={local.mailgun_api_key} onChange={e => set('mailgun_api_key', e.target.value)} placeholder={config?.mailgun_api_key_set ? '••••••••' : ''} />
              </Field>
              <Field label="Mailgun Domain" hint="The sending domain configured in your Mailgun account.">
                <Input value={local.mailgun_domain} onChange={e => set('mailgun_domain', e.target.value)} placeholder="mg.example.com" />
              </Field>
              <Field label="From Email Address">
                <Input type="email" value={local.smtp_from_email} onChange={e => set('smtp_from_email', e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">API Key</p>
                <p className="text-sm">
                  {config?.mailgun_api_key_set
                    ? <span className="text-gray-900">••••••••</span>
                    : <span className="text-gray-400">—</span>
                  }
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Mailgun Domain</p>
                <DisplayValue value={local.mailgun_domain} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">From Email</p>
                <DisplayValue value={local.smtp_from_email} />
              </div>
              {config?.mailgun_api_key_set && (
                <div className="pt-1">
                  <button
                    onClick={() => { setShowTestDialog(true); setTestStatus(null); setTestMsg('') }}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Send test email
                  </button>
                </div>
              )}
            </>
          )}
        </EditableCard>

        {/* Stripe keys card */}
        <EditableCard
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
                    : `Create a webhook in your Stripe dashboard pointing to https://${config?.domain || 'your-domain.com'}/api/payment/webhook, listening for checkout.session.completed and invoice.paid (the second is required for recording subscription renewals — one-time payments and a subscription's first charge work with just the first event, but every renewal after that needs invoice.paid to be recorded), then paste its signing secret here.`
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
        </EditableCard>

      </div>

      {showTestDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-gray-900">Send Test Email</h3>
            <Field label="Send to">
              <Input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
            {testStatus === 'sent' && <p className="text-sm text-green-600">{testMsg}</p>}
            {testStatus === 'error' && <p className="text-sm text-red-600">{testMsg}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowTestDialog(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button
                onClick={sendTestEmail}
                disabled={testStatus === 'sending' || !testEmail}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {testStatus === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

    </PageShell>
  )
}
