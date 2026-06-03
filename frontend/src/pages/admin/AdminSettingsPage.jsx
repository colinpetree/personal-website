import { useState, useEffect } from 'react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, Field, Input, Toggle, SaveBar, useSaveState } from '../../components/admin/AdminPage'

export default function AdminSettingsPage() {
  const { config, loading, save } = useAdminConfig()
  const { saving, saved, error, wrap } = useSaveState()
  const [form, setForm] = useState({})
  const [faviconFile, setFaviconFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (config) setForm({
      site_title: config.site_title || '',
      domain: config.domain || '',
      users_enabled: config.users_enabled || false,
      google_oauth_client_id: config.google_oauth_client_id || '',
      google_oauth_client_secret: '',
    })
  }, [config])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleFaviconUpload() {
    if (!faviconFile) return null
    setUploading(true)
    const fd = new FormData()
    fd.append('file', faviconFile)
    const res = await fetch('/api/admin/upload', { method: 'POST', credentials: 'include', body: fd })
    setUploading(false)
    if (!res.ok) throw new Error('Favicon upload failed')
    const data = await res.json()
    return data.filename
  }

  async function handleSave() {
    await wrap(async () => {
      const favicon_filename = await handleFaviconUpload()
      const payload = { ...form }
      if (favicon_filename) payload.favicon_filename = favicon_filename
      if (!form.google_oauth_client_secret) delete payload.google_oauth_client_secret
      await save(payload)
      setFaviconFile(null)
    })
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Site Settings">
      <div className="flex flex-col gap-6">
        <Field label="Site Title" hint="Shown in the browser tab and navbar.">
          <Input value={form.site_title || ''} onChange={e => set('site_title', e.target.value)} />
        </Field>

        <Field label="Domain" hint="Used for SSL certificate issuance (e.g. example.com).">
          <Input value={form.domain || ''} onChange={e => set('domain', e.target.value)} placeholder="example.com" />
        </Field>

        <Field label="Favicon" hint="Upload a PNG, JPG, JPEG, or GIF. Displayed in the browser tab.">
          {config?.favicon_filename && (
            <img src={`/api/uploads/${config.favicon_filename}`} alt="Current favicon" className="w-8 h-8 mb-2 rounded" />
          )}
          <input type="file" accept=".png,.jpg,.jpeg,.gif" onChange={e => setFaviconFile(e.target.files[0] || null)} className="text-sm text-gray-700" />
        </Field>

        <Toggle label="Enable user accounts" checked={form.users_enabled || false} onChange={v => set('users_enabled', v)} />

        {form.users_enabled && (
          <>
            <Field label="Google OAuth Client ID">
              <Input value={form.google_oauth_client_id || ''} onChange={e => set('google_oauth_client_id', e.target.value)} />
            </Field>
            <Field label="Google OAuth Client Secret" hint={config?.google_oauth_client_secret_set ? 'Currently set — enter a new value to replace it.' : ''}>
              <Input type="password" value={form.google_oauth_client_secret || ''} onChange={e => set('google_oauth_client_secret', e.target.value)} placeholder={config?.google_oauth_client_secret_set ? '••••••••' : ''} />
            </Field>
          </>
        )}

        <SaveBar saving={saving || uploading} saved={saved} error={error} onSave={handleSave} />
      </div>
    </PageShell>
  )
}
