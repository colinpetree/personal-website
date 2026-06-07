import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, EditableCard, Field, Input, Textarea, Toggle } from '../../components/admin/AdminPage'

function DisplayValue({ value, fallback = '—' }) {
  return <p className="text-sm text-gray-900">{value || <span className="text-gray-400">{fallback}</span>}</p>
}

export default function AdminHomePage() {
  const { config, loading, save } = useAdminConfig()

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Home Page">
      <div className="flex flex-col gap-6">
        <EditableCard
          title="Page settings"
          description="Configure home page visibility and content"
          savedValues={{
            home_enabled: config?.home_enabled ?? true,
            home_page_name: config?.home_page_name || 'Home',
            home_text: config?.home_text || '',
          }}
          onSave={values => save(values)}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Toggle label="Show in navigation" checked={local.home_enabled} onChange={v => set('home_enabled', v)} />
              <Field label="Nav link name">
                <Input value={local.home_page_name} onChange={e => set('home_page_name', e.target.value)} />
              </Field>
              <Field label="Page content" hint="HTML is supported.">
                <Textarea rows={12} value={local.home_text} onChange={e => set('home_text', e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Status</p>
                <p className="text-sm">
                  {local.home_enabled
                    ? <span className="text-[#30cf43] font-medium">Visible in navigation</span>
                    : <span className="text-gray-400">Hidden from navigation</span>
                  }
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Nav link name</p>
                <DisplayValue value={local.home_page_name} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Page content</p>
                <DisplayValue value={local.home_text} fallback="No content set" />
              </div>
            </>
          )}
        </EditableCard>
      </div>
    </PageShell>
  )
}
