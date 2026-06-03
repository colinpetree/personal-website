import { useState, useEffect } from 'react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, Field, Input, Textarea, Toggle, SaveBar, useSaveState } from '../../components/admin/AdminPage'

export default function AdminHomePage() {
  const { config, loading, save } = useAdminConfig()
  const { saving, saved, error, wrap } = useSaveState()
  const [form, setForm] = useState({})

  useEffect(() => {
    if (config) setForm({
      home_enabled: config.home_enabled ?? true,
      home_page_name: config.home_page_name || 'Home',
      home_text: config.home_text || '',
    })
  }, [config])

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Home Page">
      <div className="flex flex-col gap-6">
        <Toggle label="Show in navigation" checked={form.home_enabled ?? true} onChange={v => set('home_enabled', v)} />
        <Field label="Nav link name">
          <Input value={form.home_page_name || ''} onChange={e => set('home_page_name', e.target.value)} />
        </Field>
        <Field label="Page content" hint="HTML is supported.">
          <Textarea rows={12} value={form.home_text || ''} onChange={e => set('home_text', e.target.value)} />
        </Field>
        <SaveBar saving={saving} saved={saved} error={error} onSave={() => wrap(() => save(form))} />
      </div>
    </PageShell>
  )
}
