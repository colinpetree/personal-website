import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, EditableCard, Field, Input, InputWithPrefix, Toggle } from '../../components/admin/AdminPage'
import RoleGuard from '../../components/admin/RoleGuard'
import { useToast } from '../../context/ToastContext'
import { AI_DEMO_LIST } from '../../lib/aiDemos'

function DisplayValue({ value, fallback = '—' }) {
  return <p className="text-sm text-gray-900">{value || <span className="text-gray-400">{fallback}</span>}</p>
}

// One row per demo in AI_DEMO_LIST — each independently editable/removable, unlike
// EditableCard which is built for saving one object as a whole. `link` is
// {url, text} or undefined if nothing is set for this demo yet.
function AccessLinkRow({ demo, link, urlPlaceholder, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState(link?.url || '')
  const [text, setText] = useState(link?.text || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) {
      setUrl(link?.url || '')
      setText(link?.text || '')
    }
  }, [link, editing])

  async function handleSave() {
    setSaving(true)
    const ok = await onSave(demo.key, { url: url.trim(), text: text.trim() })
    setSaving(false)
    if (ok) setEditing(false)
  }

  async function handleRemove() {
    setSaving(true)
    const ok = await onDelete(demo.key)
    setSaving(false)
    if (ok) setEditing(false)
  }

  return (
    <div className="py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-gray-900">{demo.title}</p>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-gray-500 hover:text-gray-900"
          >
            {link ? 'Edit' : 'Add link'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <Field label="Link URL">
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder={urlPlaceholder} />
          </Field>
          <Field label="Display text">
            <Input value={text} onChange={e => setText(e.target.value)} placeholder="Watch a recorded demo instead" />
          </Field>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !url.trim() || !text.trim()}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              Save
            </button>
            {link && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={saving}
                className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                Remove
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : link ? (
        <p className="text-sm text-gray-600 truncate">
          <span className="text-gray-900">{link.text}</span> — {link.url}
        </p>
      ) : (
        <p className="text-sm text-gray-400">No link set</p>
      )}
    </div>
  )
}

function AccessLinksCard({ domain }) {
  const { addToast } = useToast()
  const [links, setLinks] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/ai-demo/access-links', { credentials: 'include' })
      .then(res => res.json())
      .then(data => { if (!cancelled) setLinks(data) })
      .catch(() => { if (!cancelled) setLinks({}) })
    return () => { cancelled = true }
  }, [])

  async function handleSave(demoKey, values) {
    try {
      const res = await fetch(`/api/admin/ai-demo/access-links/${demoKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setLinks(l => ({ ...l, [demoKey]: data }))
      return true
    } catch (err) {
      addToast({ message: err.message })
      return false
    }
  }

  async function handleDelete(demoKey) {
    try {
      const res = await fetch(`/api/admin/ai-demo/access-links/${demoKey}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Delete failed')
      setLinks(l => {
        const next = { ...l }
        delete next[demoKey]
        return next
      })
      return true
    } catch (err) {
      addToast({ message: err.message })
      return false
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-900">Demo access-request links</h2>
      <p className="text-xs text-gray-400 mt-0.5">
        Shown to signed-in users who request access but aren't yet allowed to use a given demo — e.g. a link to a blog post showing it in action.
      </p>
      {links === null ? (
        <p className="text-sm text-gray-400 mt-4">Loading…</p>
      ) : (
        <div className="mt-2 divide-y divide-gray-100">
          {AI_DEMO_LIST.map(demo => (
            <AccessLinkRow
              key={demo.key}
              demo={demo}
              link={links[demo.key]}
              urlPlaceholder={`https://${domain || 'example.com'}/demo-video`}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminAIDemoPage() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminAIDemoPageContent />
    </RoleGuard>
  )
}

function AdminAIDemoPageContent() {
  const { config, loading, save } = useAdminConfig()

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="AI Implementations Page">
      <div className="flex flex-col gap-6">
        <EditableCard
          title="Page settings"
          description="Configure AI demo page visibility and navigation"
          savedValues={{
            ai_demo_enabled: config?.ai_demo_enabled ?? false,
            ai_demo_page_name: config?.ai_demo_page_name || 'AI Implementations',
            ai_demo_slug: config?.ai_demo_slug || 'demo',
          }}
          onSave={values => save(values)}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <p className="text-sm text-gray-500">
                The AI demo page uses <code className="bg-gray-100 px-1 rounded">ANTHROPIC_API_KEY</code> and <code className="bg-gray-100 px-1 rounded">VOYAGE_API_KEY</code> set in the server environment.
              </p>
              <Toggle label="Enable AI demo page" checked={local.ai_demo_enabled} onChange={v => set('ai_demo_enabled', v)} />
              <Field label="Link label">
                <Input value={local.ai_demo_page_name} onChange={e => set('ai_demo_page_name', e.target.value)} />
              </Field>
              <Field label="Page URL address" hint="Letters, numbers, and hyphens only. A page reload is needed for URL changes to take effect.">
                <InputWithPrefix prefix={`https://${config?.domain || 'example.com'}/`} value={local.ai_demo_slug} onChange={e => set('ai_demo_slug', e.target.value.replace(/^\/+/, ''))} placeholder="demo" />
              </Field>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Status</p>
                <p className="text-sm">
                  {local.ai_demo_enabled
                    ? <span className="text-[#30cf43] font-medium">Enabled</span>
                    : <span className="text-gray-400">Disabled</span>
                  }
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Link label</p>
                <DisplayValue value={local.ai_demo_page_name} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">URL</p>
                <DisplayValue value={local.ai_demo_slug ? `/${local.ai_demo_slug}` : ''} fallback="/demo" />
              </div>
              <p className="text-sm text-gray-500">
                The AI demo page uses <code className="bg-gray-100 px-1 rounded">ANTHROPIC_API_KEY</code> and <code className="bg-gray-100 px-1 rounded">VOYAGE_API_KEY</code> set in the server environment.
              </p>
            </>
          )}
        </EditableCard>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Page content</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {config?.ai_demo_text ? 'Content set' : 'No content set'}
            </p>
          </div>
          <Link
            to="/admin/demo/edit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors shrink-0"
          >
            Edit content
          </Link>
        </div>

        <AccessLinksCard domain={config?.domain} />
      </div>
    </PageShell>
  )
}
