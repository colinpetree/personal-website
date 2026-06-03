import { useState, useEffect } from 'react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, Field, Input, Textarea, Toggle, SaveBar, useSaveState } from '../../components/admin/AdminPage'

export default function AdminAboutPage() {
  const { config, loading, save } = useAdminConfig()
  const { saving, saved, error, wrap } = useSaveState()
  const [form, setForm] = useState({})
  const [headshotFile, setHeadshotFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (config) setForm({
      about_enabled: config.about_enabled ?? false,
      about_page_name: config.about_page_name || 'About',
      about_text: config.about_text || '',
    })
  }, [config])

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSave() {
    await wrap(async () => {
      let headshot_filename = undefined
      if (headshotFile) {
        setUploading(true)
        const fd = new FormData()
        fd.append('file', headshotFile)
        const res = await fetch('/api/admin/upload', { method: 'POST', credentials: 'include', body: fd })
        setUploading(false)
        if (!res.ok) throw new Error('Headshot upload failed')
        headshot_filename = (await res.json()).filename
      }
      const payload = { ...form }
      if (headshot_filename) payload.headshot_filename = headshot_filename
      await save(payload)
      setHeadshotFile(null)
    })
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="About Page">
      <div className="flex flex-col gap-6">
        <Toggle label="Enable about page" checked={form.about_enabled ?? false} onChange={v => set('about_enabled', v)} />
        <Field label="Nav link name">
          <Input value={form.about_page_name || ''} onChange={e => set('about_page_name', e.target.value)} />
        </Field>
        <Field label="Headshot image">
          {config?.headshot_filename && (
            <img src={`/api/uploads/${config.headshot_filename}`} alt="Current headshot" className="w-24 h-24 rounded-full object-cover mb-2" />
          )}
          <input type="file" accept=".png,.jpg,.jpeg,.gif,.webp" onChange={e => setHeadshotFile(e.target.files[0] || null)} className="text-sm text-gray-700" />
        </Field>
        <Field label="About text" hint="HTML is supported.">
          <Textarea rows={10} value={form.about_text || ''} onChange={e => set('about_text', e.target.value)} />
        </Field>
        <SaveBar saving={saving || uploading} saved={saved} error={error} onSave={handleSave} />
      </div>
    </PageShell>
  )
}
