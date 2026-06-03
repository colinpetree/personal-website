import { useState, useEffect } from 'react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, Field, Input, Toggle, SaveBar, useSaveState } from '../../components/admin/AdminPage'

export default function AdminContactPage() {
  const { config, loading, save } = useAdminConfig()
  const { saving, saved, error, wrap } = useSaveState()
  const [form, setForm] = useState({})
  const [testEmail, setTestEmail] = useState('')
  const [testStatus, setTestStatus] = useState(null) // null | 'sending' | 'sent' | 'error'
  const [testMsg, setTestMsg] = useState('')
  const [showTestDialog, setShowTestDialog] = useState(false)

  useEffect(() => {
    if (config) setForm({
      contact_enabled: config.contact_enabled ?? false,
      contact_page_name: config.contact_page_name || 'Contact',
      smtp_host: config.smtp_host || '',
      smtp_port: config.smtp_port || 587,
      smtp_user: config.smtp_user || '',
      smtp_password: '',
      smtp_from_email: config.smtp_from_email || '',
      smtp_sender_name: config.smtp_sender_name || '',
      forward_email: config.forward_email || '',
    })
  }, [config])

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSave() {
    await wrap(async () => {
      const payload = { ...form }
      if (!payload.smtp_password) delete payload.smtp_password
      await save(payload)
    })
  }

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
        <Toggle label="Enable contact page" checked={form.contact_enabled ?? false} onChange={v => set('contact_enabled', v)} />
        <Field label="Nav link name">
          <Input value={form.contact_page_name || ''} onChange={e => set('contact_page_name', e.target.value)} />
        </Field>

        <hr className="border-gray-200" />
        <h2 className="text-base font-semibold text-gray-800">SMTP Settings</h2>
        <p className="text-sm text-gray-500 -mt-4">Contact page is only shown in the navbar once SMTP is configured.</p>

        <div className="grid grid-cols-2 gap-4">
          <Field label="SMTP Host">
            <Input value={form.smtp_host || ''} onChange={e => set('smtp_host', e.target.value)} placeholder="smtp.example.com" />
          </Field>
          <Field label="Port">
            <select
              value={form.smtp_port || 587}
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
          <Input value={form.smtp_user || ''} onChange={e => set('smtp_user', e.target.value)} />
        </Field>
        <Field label="SMTP Password" hint={config?.smtp_password_set ? 'Currently set — enter a new value to replace it.' : ''}>
          <Input type="password" value={form.smtp_password || ''} onChange={e => set('smtp_password', e.target.value)} placeholder={config?.smtp_password_set ? '••••••••' : ''} />
        </Field>
        <Field label="From Email Address">
          <Input type="email" value={form.smtp_from_email || ''} onChange={e => set('smtp_from_email', e.target.value)} />
        </Field>
        <Field label="Sender Name">
          <Input value={form.smtp_sender_name || ''} onChange={e => set('smtp_sender_name', e.target.value)} />
        </Field>
        <Field label="Forward Submissions To" hint="Contact form messages will be sent to this address.">
          <Input type="email" value={form.forward_email || ''} onChange={e => set('forward_email', e.target.value)} placeholder="you@example.com" />
        </Field>

        <div className="flex items-center gap-4">
          <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
          {config?.smtp_password_set && (
            <button
              onClick={() => { setShowTestDialog(true); setTestStatus(null); setTestMsg('') }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Send test email
            </button>
          )}
        </div>

        {/* Test email dialog */}
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
      </div>
    </PageShell>
  )
}
