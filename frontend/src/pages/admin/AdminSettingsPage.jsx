import { useState } from 'react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, Card, EditableCard, Field, Input, Textarea, Toggle } from '../../components/admin/AdminPage'
import FileDropzone from '../../components/admin/FileDropzone'

function DisplayValue({ value, fallback = '—' }) {
  return (
    <p className="text-sm text-gray-900">{value || <span className="text-gray-400">{fallback}</span>}</p>
  )
}

export default function AdminSettingsPage() {
  const { config, loading, save } = useAdminConfig()
  const [faviconFile, setFaviconFile] = useState(null)
  const [faviconUploading, setFaviconUploading] = useState(false)
  const [faviconSaved, setFaviconSaved] = useState(false)
  const [faviconError, setFaviconError] = useState('')

  async function handleFaviconSave() {
    if (!faviconFile) return
    setFaviconUploading(true)
    setFaviconError('')
    try {
      const fd = new FormData()
      fd.append('file', faviconFile)
      const res = await fetch('/api/admin/upload', { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      const { filename } = await res.json()
      await save({ favicon_filename: filename })
      setFaviconFile(null)
      setFaviconSaved(true)
      setTimeout(() => setFaviconSaved(false), 2500)
    } catch (err) {
      setFaviconError(err.message || 'Upload failed')
    } finally {
      setFaviconUploading(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Site Settings">
      <div className="flex flex-col gap-6">

        {/* Title & description card */}
        <EditableCard
          title="Title & description"
          description="The details used to identify your site around the web"
          savedValues={{ site_title: config?.site_title || '', site_description: config?.site_description || '' }}
          onSave={values => save({ site_title: values.site_title, site_description: values.site_description })}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Field label="Site Title" hint="Shown in the browser tab and navbar.">
                <Input value={local.site_title} onChange={e => set('site_title', e.target.value)} />
              </Field>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Site Description</label>
                <Textarea
                  rows={3}
                  value={local.site_description}
                  onChange={e => set('site_description', e.target.value)}
                  placeholder="Describe your site in a sentence or two…"
                />
                <p className="text-xs text-gray-400">A short description, used in your theme, meta data and search results</p>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Site Title</p>
                <DisplayValue value={local.site_title} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Site Description</p>
                <DisplayValue value={local.site_description} fallback="No description set" />
              </div>
            </>
          )}
        </EditableCard>

        {/* Favicon card */}
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Site icon</h2>
              <p className="text-xs text-gray-400 mt-0.5">A square, social icon, at least 60x60px that shows up in search results and browser tabs</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {faviconSaved && <span className="text-xs text-gray-400">Saved</span>}
              {!faviconSaved && (
                <button
                  onClick={handleFaviconSave}
                  disabled={!faviconFile || faviconUploading}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    faviconUploading
                      ? 'bg-white text-gray-500 cursor-default'
                      : faviconFile
                        ? 'bg-[#30cf43] text-white hover:brightness-95'
                        : 'bg-gray-100 text-gray-400 cursor-default'
                  }`}
                >
                  {faviconUploading ? 'Uploading...' : 'Upload'}
                </button>
              )}
            </div>
          </div>
          <FileDropzone
            accept={{ 'image/png': [], 'image/jpeg': [], 'image/gif': [], 'image/webp': [] }}
            onFile={f => { setFaviconFile(f); setFaviconSaved(false) }}
            file={faviconFile}
            currentUrl={config?.favicon_filename ? `/api/uploads/${config.favicon_filename}` : null}
          />
          {faviconError && <p className="text-xs text-red-500">{faviconError}</p>}
        </Card>

        {/* Domain card */}
        <EditableCard
          title="Custom Domain"
          description="Used for SSL certificate issuance."
          savedValues={{ domain: config?.domain || '' }}
          onSave={values => save({ domain: values.domain })}
        >
          {({ editing, local, set }) => editing ? (
            <Field label="Domain" hint="e.g. example.com">
              <Input value={local.domain} onChange={e => set('domain', e.target.value)} placeholder="example.com" />
            </Field>
          ) : (
            <DisplayValue value={local.domain} fallback="No domain set" />
          )}
        </EditableCard>

        {/* User accounts card */}
        <EditableCard
          title="User accounts"
          description="Allow users to sign up to leave comments on posts"
          savedValues={{
            users_enabled: config?.users_enabled || false,
            google_oauth_client_id: config?.google_oauth_client_id || '',
            google_oauth_client_secret: '',
          }}
          onSave={values => {
            const payload = { users_enabled: values.users_enabled, google_oauth_client_id: values.google_oauth_client_id }
            if (values.google_oauth_client_secret) payload.google_oauth_client_secret = values.google_oauth_client_secret
            return save(payload)
          }}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Toggle label="Enable user accounts" checked={local.users_enabled} onChange={v => set('users_enabled', v)} />
              {local.users_enabled && (
                <>
                  <Field label="Google OAuth Client ID">
                    <Input value={local.google_oauth_client_id} onChange={e => set('google_oauth_client_id', e.target.value)} />
                  </Field>
                  <Field
                    label="Google OAuth Client Secret"
                    hint={config?.google_oauth_client_secret_set ? 'Currently set — enter a new value to replace it.' : ''}
                  >
                    <Input
                      type="password"
                      value={local.google_oauth_client_secret}
                      onChange={e => set('google_oauth_client_secret', e.target.value)}
                      placeholder={config?.google_oauth_client_secret_set ? '••••••••' : ''}
                    />
                  </Field>
                </>
              )}
            </>
          ) : (
            <p className="text-sm">
              {local.users_enabled
                ? <span className="text-[#30cf43] font-medium">Enabled</span>
                : <span className="text-gray-400">Disabled</span>
              }
            </p>
          )}
        </EditableCard>

      </div>
    </PageShell>
  )
}
