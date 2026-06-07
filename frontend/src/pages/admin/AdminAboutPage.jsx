import { useState } from 'react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, Card, EditableCard, Field, Input, InputWithPrefix, Textarea, Toggle } from '../../components/admin/AdminPage'
import FileDropzone from '../../components/admin/FileDropzone'

function DisplayValue({ value, fallback = '—' }) {
  return <p className="text-sm text-gray-900">{value || <span className="text-gray-400">{fallback}</span>}</p>
}

export default function AdminAboutPage() {
  const { config, loading, save } = useAdminConfig()
  const [headshotFile, setHeadshotFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [headshotSaved, setHeadshotSaved] = useState(false)
  const [headshotError, setHeadshotError] = useState('')

  async function handleHeadshotSave() {
    if (!headshotFile) return
    setUploading(true)
    setHeadshotError('')
    try {
      const fd = new FormData()
      fd.append('file', headshotFile)
      const res = await fetch('/api/admin/upload', { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      const { filename } = await res.json()
      await save({ headshot_filename: filename })
      setHeadshotFile(null)
      setHeadshotSaved(true)
      setTimeout(() => setHeadshotSaved(false), 2500)
    } catch (err) {
      setHeadshotError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="About Page">
      <div className="flex flex-col gap-6">

        <EditableCard
          title="Page settings"
          description="Configure about page visibility and content"
          savedValues={{
            about_enabled: config?.about_enabled ?? false,
            about_page_name: config?.about_page_name || 'About',
            about_text: config?.about_text || '',
            about_slug: config?.about_slug || 'about',
          }}
          onSave={values => save({ about_enabled: values.about_enabled, about_page_name: values.about_page_name, about_text: values.about_text, about_slug: values.about_slug })}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Toggle label="Enable about page" checked={local.about_enabled} onChange={v => set('about_enabled', v)} />
              <Field label="Link label">
                <Input value={local.about_page_name} onChange={e => set('about_page_name', e.target.value)} />
              </Field>
              <Field label="Page URL address" hint="Letters, numbers, and hyphens only. A page reload is needed for URL changes to take effect.">
                <InputWithPrefix prefix={`https://${config?.domain || 'example.com'}/`} value={local.about_slug} onChange={e => set('about_slug', e.target.value.replace(/^\/+/, ''))} placeholder="about" />
              </Field>
              <Field label="About text" hint="HTML is supported.">
                <Textarea rows={10} value={local.about_text} onChange={e => set('about_text', e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Status</p>
                <p className="text-sm">
                  {local.about_enabled
                    ? <span className="text-[#30cf43] font-medium">Enabled</span>
                    : <span className="text-gray-400">Disabled</span>
                  }
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Link label</p>
                <DisplayValue value={local.about_page_name} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">URL</p>
                <DisplayValue value={local.about_slug ? `/${local.about_slug}` : ''} fallback="/about" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">About text</p>
                <DisplayValue value={local.about_text} fallback="No content set" />
              </div>
            </>
          )}
        </EditableCard>

        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Headshot</h2>
              <p className="text-xs text-gray-400 mt-0.5">Your profile photo shown on the about page</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {headshotSaved && <span className="text-xs text-gray-400">Saved</span>}
              {!headshotSaved && (
                <button
                  onClick={handleHeadshotSave}
                  disabled={!headshotFile || uploading}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    uploading
                      ? 'bg-white text-gray-500 cursor-default'
                      : headshotFile
                        ? 'bg-[#30cf43] text-white hover:brightness-95'
                        : 'bg-gray-100 text-gray-400 cursor-default'
                  }`}
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              )}
            </div>
          </div>
          <FileDropzone
            accept={{ 'image/png': [], 'image/jpeg': [], 'image/gif': [], 'image/webp': [] }}
            onFile={f => { setHeadshotFile(f); setHeadshotSaved(false) }}
            file={headshotFile}
            currentUrl={config?.headshot_filename ? `/api/uploads/${config.headshot_filename}` : null}
          />
          {headshotError && <p className="text-xs text-red-500">{headshotError}</p>}
        </Card>

      </div>
    </PageShell>
  )
}
