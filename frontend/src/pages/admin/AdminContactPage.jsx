import { Link } from 'react-router-dom'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, EditableCard, Field, Input, InputWithPrefix, Toggle } from '../../components/admin/AdminPage'

function DisplayValue({ value, fallback = '—' }) {
  return (
    <p className="text-sm text-gray-900">{value || <span className="text-gray-400">{fallback}</span>}</p>
  )
}

export default function AdminContactPage() {
  const { config, loading, save } = useAdminConfig()

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Contact Page">
      <div className="flex flex-col gap-6">

        <EditableCard
          title="Contact page"
          description="Configure the contact page visibility and navigation"
          savedValues={{
            contact_enabled: config?.contact_enabled ?? false,
            contact_page_name: config?.contact_page_name || 'Contact',
            contact_slug: config?.contact_slug || 'contact',
            forward_email: config?.forward_email || '',
          }}
          onSave={values => save({ contact_enabled: values.contact_enabled, contact_page_name: values.contact_page_name, contact_slug: values.contact_slug, forward_email: values.forward_email })}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Toggle label="Enable contact page" checked={local.contact_enabled} onChange={v => set('contact_enabled', v)} />
              <Field label="Link label">
                <Input value={local.contact_page_name} onChange={e => set('contact_page_name', e.target.value)} />
              </Field>
              <Field label="Page URL address" hint="Letters, numbers, and hyphens only. A page reload is needed for URL changes to take effect.">
                <InputWithPrefix prefix={`https://${config?.domain || 'example.com'}/`} value={local.contact_slug} onChange={e => set('contact_slug', e.target.value.replace(/^\/+/, ''))} placeholder="contact" />
              </Field>
              <Field label="Forward Contact Form Emails To" hint="Contact form messages will be sent to this address.">
                <Input type="email" value={local.forward_email} onChange={e => set('forward_email', e.target.value)} placeholder="you@example.com" />
              </Field>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Status</p>
                <p className="text-sm">
                  {local.contact_enabled
                    ? <span className="text-[#30cf43] font-medium">Enabled</span>
                    : <span className="text-gray-400">Disabled</span>
                  }
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Link label</p>
                <DisplayValue value={local.contact_page_name} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">URL</p>
                <DisplayValue value={local.contact_slug ? `/${local.contact_slug}` : ''} fallback="/contact" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Forward To</p>
                <DisplayValue value={local.forward_email} />
              </div>
            </>
          )}
        </EditableCard>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Page content</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {config?.contact_text ? 'Content set' : 'No content set'}
            </p>
          </div>
          <Link
            to="/admin/contact/edit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors shrink-0"
          >
            Edit content
          </Link>
        </div>

      </div>
    </PageShell>
  )
}
