import { useState, useEffect } from 'react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, Field, Input, Toggle, SaveBar, useSaveState } from '../../components/admin/AdminPage'

export default function AdminAIDemoPage() {
  const { config, loading, save } = useAdminConfig()
  const { saving, saved, error, wrap } = useSaveState()
  const [form, setForm] = useState({})

  useEffect(() => {
    if (config) setForm({
      ai_demo_enabled: config.ai_demo_enabled ?? false,
      ai_demo_page_name: config.ai_demo_page_name || 'AI Implementations',
    })
  }, [config])

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="AI Implementations Page">
      <div className="flex flex-col gap-6">
        <p className="text-sm text-gray-500">
          The AI demo page uses <code className="bg-gray-100 px-1 rounded">ANTHROPIC_API_KEY</code> and <code className="bg-gray-100 px-1 rounded">VOYAGE_API_KEY</code> set in the server environment.
        </p>
        <Toggle label="Enable AI demo page" checked={form.ai_demo_enabled ?? false} onChange={v => set('ai_demo_enabled', v)} />
        <Field label="Nav link name">
          <Input value={form.ai_demo_page_name || ''} onChange={e => set('ai_demo_page_name', e.target.value)} />
        </Field>
        <SaveBar saving={saving} saved={saved} error={error} onSave={() => wrap(() => save(form))} />
      </div>
    </PageShell>
  )
}
