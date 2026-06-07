import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, EditableCard, Field, Input, Toggle } from '../../components/admin/AdminPage'

function DisplayValue({ value, fallback = '—' }) {
  return <p className="text-sm text-gray-900">{value || <span className="text-gray-400">{fallback}</span>}</p>
}

export default function AdminAIDemoPage() {
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
                <Input value={local.ai_demo_slug} onChange={e => set('ai_demo_slug', e.target.value.replace(/^\/+/, ''))} placeholder="demo" />
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
      </div>
    </PageShell>
  )
}
