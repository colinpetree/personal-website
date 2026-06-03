import { useState, useEffect } from 'react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, Field, Input, Toggle, SaveBar, useSaveState } from '../../components/admin/AdminPage'

export default function AdminBlogPage() {
  const { config, loading, save } = useAdminConfig()
  const { saving, saved, error, wrap } = useSaveState()
  const [form, setForm] = useState({})

  useEffect(() => {
    if (config) setForm({
      blog_enabled: config.blog_enabled ?? false,
      blog_page_name: config.blog_page_name || 'Blog',
    })
  }, [config])

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Blog">
      <div className="flex flex-col gap-6">
        <Toggle label="Enable blog" checked={form.blog_enabled ?? false} onChange={v => set('blog_enabled', v)} />
        <Field label="Nav link name">
          <Input value={form.blog_page_name || ''} onChange={e => set('blog_page_name', e.target.value)} />
        </Field>
        <SaveBar saving={saving} saved={saved} error={error} onSave={() => wrap(() => save(form))} />
      </div>
    </PageShell>
  )
}
