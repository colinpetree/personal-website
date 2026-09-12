import { Link } from 'react-router'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell } from '../../components/admin/AdminPage'
import RoleGuard from '../../components/admin/RoleGuard'

export default function AdminHomePage() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminHomePageContent />
    </RoleGuard>
  )
}

function AdminHomePageContent() {
  const { config, loading } = useAdminConfig()

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Home Page">
      <div className="flex flex-col gap-6">
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
