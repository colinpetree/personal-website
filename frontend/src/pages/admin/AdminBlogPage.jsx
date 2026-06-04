import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, Field, Input, Toggle, SaveBar, useSaveState } from '../../components/admin/AdminPage'

export default function AdminBlogPage() {
  const { config, loading, save } = useAdminConfig()
  const { saving, saved, error, wrap } = useSaveState()
  const [form, setForm] = useState({})

  useEffect(() => {
    if (config) setForm({
      blog_enabled: config.blog_enabled ?? false,
      blog_page_name: config.blog_page_name || 'Blog',
    })
  }, [config])

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Blog">
      <div className="flex flex-col gap-6">
        <Toggle label="Enable blog" checked={form.blog_enabled ?? false} onChange={v => set('blog_enabled', v)} />
        <Field label="Nav link name">
          <Input value={form.blog_page_name || ''} onChange={e => set('blog_page_name', e.target.value)} />
        </Field>
        <SaveBar saving={saving} saved={saved} error={error} onSave={() => wrap(() => save(form))} />

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
            <span className="text-gray-400">→</span>
          </Link>
          <Link
            to="/admin/blog/comments"
            className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">Manage Comments</p>
              <p className="text-xs text-gray-500 mt-0.5">Moderate reader comments</p>
            </div>
            <span className="text-gray-400">→</span>
          </Link>
        </div>
      </div>
    </PageShell>
  )
}
