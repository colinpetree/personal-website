import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, EditableCard, Field, Input, InputWithPrefix, Toggle } from '../../components/admin/AdminPage'
import RoleGuard from '../../components/admin/RoleGuard'

function DisplayValue({ value, fallback = '—' }) {
  return <p className="text-sm text-gray-900">{value || <span className="text-gray-400">{fallback}</span>}</p>
}

export default function AdminBlogPage() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminBlogPageContent />
    </RoleGuard>
  )
}

function AdminBlogPageContent() {
  const { config, loading, save } = useAdminConfig()

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Blog">
      <div className="flex flex-col gap-6">

        <EditableCard
          title="Blog settings"
          description="Configure blog visibility and navigation"
          savedValues={{
            blog_enabled: config?.blog_enabled ?? false,
            blog_page_name: config?.blog_page_name || 'Blog',
            blog_slug: config?.blog_slug || 'blog',
            blog_comments_enabled: config?.blog_comments_enabled ?? true,
          }}
          onSave={values => save(values)}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Toggle label="Enable blog" checked={local.blog_enabled} onChange={v => set('blog_enabled', v)} />
              <Field label="Page title" hint="Used for the browser tab title (e.g. Blog - Site Name).">
                <Input value={local.blog_page_name} onChange={e => set('blog_page_name', e.target.value)} />
              </Field>
              <Field label="Page URL address" hint="Letters, numbers, and hyphens only. A page reload is needed for URL changes to take effect.">
                <InputWithPrefix prefix={`https://${config?.domain || 'example.com'}/`} value={local.blog_slug} onChange={e => set('blog_slug', e.target.value.replace(/^\/+/, ''))} placeholder="blog" />
              </Field>
              <Toggle label="Allow comments" checked={local.blog_comments_enabled} onChange={v => set('blog_comments_enabled', v)} />
              <p className="text-xs text-gray-400 -mt-2">Comments also require user accounts to be enabled — see the Users settings.</p>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Status</p>
                <p className="text-sm">
                  {local.blog_enabled
                    ? <span className="text-[#30cf43] font-medium">Enabled</span>
                    : <span className="text-gray-400">Disabled</span>
                  }
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Page title</p>
                <DisplayValue value={local.blog_page_name} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">URL</p>
                <DisplayValue value={local.blog_slug ? `/${local.blog_slug}` : ''} fallback="/blog" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Comments</p>
                <p className="text-sm">
                  {local.blog_comments_enabled
                    ? <span className="text-[#30cf43] font-medium">Allowed</span>
                    : <span className="text-gray-400">Disabled</span>
                  }
                </p>
              </div>
            </>
          )}
        </EditableCard>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Page content</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {config?.blog_text ? 'Content set' : 'No content set'}
            </p>
          </div>
          <Link
            to="/admin/blog/edit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors shrink-0"
          >
            Edit content
          </Link>
        </div>

        <hr className="border-gray-200" />

        <div className="flex flex-col gap-3">
          <Link
            to="/admin/blog/posts"
            className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">Manage Posts</p>
              <p className="text-xs text-gray-500 mt-0.5">Create, edit, and publish blog posts</p>
            </div>
            <ChevronRight size={16} strokeWidth={1.5} className="text-gray-400" />
          </Link>
          <Link
            to="/admin/blog/comments"
            className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">Manage Comments</p>
              <p className="text-xs text-gray-500 mt-0.5">Moderate reader comments</p>
            </div>
            <ChevronRight size={16} strokeWidth={1.5} className="text-gray-400" />
          </Link>
          <Link
            to="/admin/blog/categories"
            className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">Manage Categories</p>
              <p className="text-xs text-gray-500 mt-0.5">Organize posts into categories</p>
            </div>
            <ChevronRight size={16} strokeWidth={1.5} className="text-gray-400" />
          </Link>
        </div>

      </div>
    </PageShell>
  )
}
