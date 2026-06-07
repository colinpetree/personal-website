import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, EditableCard, Field, Input, Toggle } from '../../components/admin/AdminPage'

function DisplayValue({ value, fallback = '—' }) {
  return <p className="text-sm text-gray-900">{value || <span className="text-gray-400">{fallback}</span>}</p>
}

export default function AdminDonatePage() {
  const { config, loading, save } = useAdminConfig()

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Donate Page">
      <div className="flex flex-col gap-6">

        <EditableCard
          title="Page settings"
          description="Configure donate page visibility and navigation"
          savedValues={{
            donate_enabled: config?.donate_enabled ?? false,
            donate_page_name: config?.donate_page_name || 'Donate',
          }}
          onSave={values => save(values)}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Toggle label="Enable donate page" checked={local.donate_enabled} onChange={v => set('donate_enabled', v)} />
              <Field label="Nav link name">
                <Input value={local.donate_page_name} onChange={e => set('donate_page_name', e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Status</p>
                <p className="text-sm">
                  {local.donate_enabled
                    ? <span className="text-[#30cf43] font-medium">Enabled</span>
                    : <span className="text-gray-400">Disabled</span>
                  }
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Nav link name</p>
                <DisplayValue value={local.donate_page_name} />
              </div>
            </>
          )}
        </EditableCard>

        <EditableCard
          title="Stripe keys"
          description="Donate page is only shown in the navbar once a Stripe publishable key is set."
          savedValues={{
            stripe_publishable_key: config?.stripe_publishable_key || '',
            stripe_secret_key: '',
          }}
          onSave={values => {
            const payload = { ...values }
            if (!payload.stripe_secret_key) delete payload.stripe_secret_key
            return save(payload)
          }}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Field label="Stripe Publishable Key" hint="Starts with pk_test_ or pk_live_">
                <Input value={local.stripe_publishable_key} onChange={e => set('stripe_publishable_key', e.target.value)} placeholder="pk_live_…" />
              </Field>
              <Field label="Stripe Secret Key" hint={config?.stripe_secret_key_set ? 'Currently set — enter a new value to replace it.' : 'Starts with sk_test_ or sk_live_'}>
                <Input type="password" value={local.stripe_secret_key} onChange={e => set('stripe_secret_key', e.target.value)} placeholder={config?.stripe_secret_key_set ? '••••••••' : 'sk_live_…'} />
              </Field>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Publishable Key</p>
                <DisplayValue value={local.stripe_publishable_key} fallback="Not set" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Secret Key</p>
                <p className="text-sm">
                  {config?.stripe_secret_key_set
                    ? <span className="text-gray-900">••••••••</span>
                    : <span className="text-gray-400">Not set</span>
                  }
                </p>
              </div>
            </>
          )}
        </EditableCard>

      </div>
    </PageShell>
  )
}
