import { Link } from 'react-router'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, EditableCard, Field, Input, InputWithPrefix, Toggle } from '../../components/admin/AdminPage'
import RoleGuard from '../../components/admin/RoleGuard'

function DisplayValue({ value, fallback = '—' }) {
  return <p className="text-sm text-gray-900">{value || <span className="text-gray-400">{fallback}</span>}</p>
}

export default function AdminAboutPage() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminAboutPageContent />
    </RoleGuard>
  )
}

function AdminAboutPageContent() {
  const { config, loading, save } = useAdminConfig()

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
            about_slug: config?.about_slug || 'about',
          }}
          onSave={values => save({ about_enabled: values.about_enabled, about_page_name: values.about_page_name, about_slug: values.about_slug })}
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
            </>
          )}
        </EditableCard>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Page content</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {config?.about_text ? 'Content set' : 'No content set'}
            </p>
          </div>
          <Link
            to="/admin/about/edit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors shrink-0"
          >
            Edit content
          </Link>
        </div>

      </div>
    </PageShell>
  )
}
