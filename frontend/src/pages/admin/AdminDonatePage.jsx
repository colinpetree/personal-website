import { useState, useEffect } from 'react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, Field, Input, Toggle, SaveBar, useSaveState } from '../../components/admin/AdminPage'

export default function AdminDonatePage() {
  const { config, loading, save } = useAdminConfig()
  const { saving, saved, error, wrap } = useSaveState()
  const [form, setForm] = useState({})

  useEffect(() => {
    if (config) setForm({
      donate_enabled: config.donate_enabled ?? false,
      donate_page_name: config.donate_page_name || 'Donate',
      stripe_publishable_key: config.stripe_publishable_key || '',
      stripe_secret_key: '',
    })
  }, [config])

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSave() {
    await wrap(async () => {
      const payload = { ...form }
      if (!payload.stripe_secret_key) delete payload.stripe_secret_key
      await save(payload)
    })
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Donate Page">
      <div className="flex flex-col gap-6">
        <Toggle label="Enable donate page" checked={form.donate_enabled ?? false} onChange={v => set('donate_enabled', v)} />
        <Field label="Nav link name">
          <Input value={form.donate_page_name || ''} onChange={e => set('donate_page_name', e.target.value)} />
        </Field>
        <p className="text-sm text-gray-500">Donate page is only shown in the navbar once a Stripe publishable key is set.</p>
        <Field label="Stripe Publishable Key" hint="Starts with pk_test_ or pk_live_">
          <Input value={form.stripe_publishable_key || ''} onChange={e => set('stripe_publishable_key', e.target.value)} placeholder="pk_live_…" />
        </Field>
        <Field label="Stripe Secret Key" hint={config?.stripe_secret_key_set ? 'Currently set — enter a new value to replace it.' : 'Starts with sk_test_ or sk_live_'}>
          <Input type="password" value={form.stripe_secret_key || ''} onChange={e => set('stripe_secret_key', e.target.value)} placeholder={config?.stripe_secret_key_set ? '••••••••' : 'sk_live_…'} />
        </Field>
        <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
      </div>
    </PageShell>
  )
}
