import { useState } from 'react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, EditableCard, Field, Input, InputWithPrefix, Toggle } from '../../components/admin/AdminPage'

function DisplayValue({ value, fallback = '—' }) {
  return (
    <p className="text-sm text-gray-900">{value || <span className="text-gray-400">{fallback}</span>}</p>
  )
}

export default function AdminContactPage() {
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
    <PageShell title="Contact Page">
      <div className="flex flex-col gap-6">

        <EditableCard
          title="Contact page"
          description="Configure the contact page visibility and navigation"
          savedValues={{
            contact_enabled: config?.contact_enabled ?? false,
            contact_page_name: config?.contact_page_name || 'Contact',
            contact_slug: config?.contact_slug || 'contact',
          }}
          onSave={values => save({ contact_enabled: values.contact_enabled, contact_page_name: values.contact_page_name, contact_slug: values.contact_slug })}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Toggle label="Enable contact page" checked={local.contact_enabled} onChange={v => set('contact_enabled', v)} />
              <Field label="Link label">
                <Input value={local.contact_page_name} onChange={e => set('contact_page_name', e.target.value)} />
              </Field>
              <Field label="Page URL address" hint="Letters, numbers, and hyphens only. A page reload is needed for URL changes to take effect.">
                <InputWithPrefix prefix={`https://${config?.domain || 'example.com'}/`} value={local.contact_slug} onChange={e => set('contact_slug', e.target.value.replace(/^\/+/, ''))} placeholder="contact" />
              </Field>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Status</p>
                <p className="text-sm">
                  {local.contact_enabled
                    ? <span className="text-[#30cf43] font-medium">Enabled</span>
                    : <span className="text-gray-400">Disabled</span>
                  }
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Link label</p>
                <DisplayValue value={local.contact_page_name} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">URL</p>
                <DisplayValue value={local.contact_slug ? `/${local.contact_slug}` : ''} fallback="/contact" />
              </div>
            </>
          )}
        </EditableCard>

        <EditableCard
          title="SMTP Settings"
          description="Allow this site to send emails for Contact form submissions and password resets."
          savedValues={{
            smtp_host: config?.smtp_host || '',
            smtp_port: config?.smtp_port || 587,
            smtp_user: config?.smtp_user || '',
            smtp_password: '',
            smtp_from_email: config?.smtp_from_email || '',
            smtp_sender_name: config?.smtp_sender_name || '',
            forward_email: config?.forward_email || '',
          }}
          onSave={values => {
            const payload = { ...values }
            if (!payload.smtp_password) delete payload.smtp_password
            return save(payload)
          }}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="SMTP Host">
                  <Input value={local.smtp_host} onChange={e => set('smtp_host', e.target.value)} placeholder="smtp.example.com" />
                </Field>
                <Field label="Port">
                  <select
                    value={local.smtp_port}
                    onChange={e => set('smtp_port', Number(e.target.value))}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
                  >
                    <option value={587}>587 (STARTTLS)</option>
                    <option value={465}>465 (SSL)</option>
                    <option value={25}>25</option>
                  </select>
                </Field>
              </div>
              <Field label="SMTP Username">
                <Input value={local.smtp_user} onChange={e => set('smtp_user', e.target.value)} />
              </Field>
              <Field label="SMTP Password" hint={config?.smtp_password_set ? 'Currently set — enter a new value to replace it.' : ''}>
                <Input type="password" value={local.smtp_password} onChange={e => set('smtp_password', e.target.value)} placeholder={config?.smtp_password_set ? '••••••••' : ''} />
              </Field>
              <Field label="From Email Address">
                <Input type="email" value={local.smtp_from_email} onChange={e => set('smtp_from_email', e.target.value)} />
              </Field>
              <Field label="Sender Name">
                <Input value={local.smtp_sender_name} onChange={e => set('smtp_sender_name', e.target.value)} />
              </Field>
              <Field label="Forward Submissions To" hint="Contact form messages will be sent to this address.">
                <Input type="email" value={local.forward_email} onChange={e => set('forward_email', e.target.value)} placeholder="you@example.com" />
              </Field>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-gray-500">SMTP Host</p>
                  <DisplayValue value={local.smtp_host} />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-gray-500">Port</p>
                  <DisplayValue value={local.smtp_port ? String(local.smtp_port) : ''} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">SMTP Username</p>
                <DisplayValue value={local.smtp_user} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Password</p>
                <p className="text-sm">
                  {config?.smtp_password_set
                    ? <span className="text-gray-900">••••••••</span>
                    : <span className="text-gray-400">—</span>
                  }
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">From Email</p>
                <DisplayValue value={local.smtp_from_email} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Sender Name</p>
                <DisplayValue value={local.smtp_sender_name} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Forward To</p>
                <DisplayValue value={local.forward_email} />
              </div>
              {config?.smtp_password_set && (
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
