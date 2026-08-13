import { Link } from 'react-router'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, EditableCard, Field, Input, Toggle } from '../../components/admin/AdminPage'
import RoleGuard from '../../components/admin/RoleGuard'

function DisplayValue({ value, fallback = '—' }) {
  return <p className="text-sm text-gray-900">{value || <span className="text-gray-400">{fallback}</span>}</p>
}

export default function AdminHomePage() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminHomePageContent />
    </RoleGuard>
  )
}

function AdminHomePageContent() {
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
          }}
          onSave={values => save(values)}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Toggle label="Show in navigation" checked={local.home_enabled} onChange={v => set('home_enabled', v)} />
              <Field label="Link label">
                <Input value={local.home_page_name} onChange={e => set('home_page_name', e.target.value)} />
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
                <p className="text-xs font-medium text-gray-500">Link label</p>
                <DisplayValue value={local.home_page_name} />
              </div>
            </>
          )}
        </EditableCard>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Page content</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {config?.home_text ? 'Content set' : 'No content set'}
            </p>
          </div>
          <Link
            to="/admin/home/edit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors shrink-0"
          >
            Edit content
          </Link>
        </div>
      </div>
    </PageShell>
  )
}
