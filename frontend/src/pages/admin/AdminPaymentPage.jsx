import { Link } from 'react-router'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, EditableCard, Field, Input, InputWithPrefix, Toggle } from '../../components/admin/AdminPage'
import { useAdminAuth, isAtLeast } from '../../context/AdminAuthContext'
import RoleGuard from '../../components/admin/RoleGuard'

function DisplayValue({ value, fallback = '—' }) {
  return <p className="text-sm text-gray-900 truncate">{value || <span className="text-gray-400">{fallback}</span>}</p>
}

export default function AdminPaymentPage() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminPaymentPageContent />
    </RoleGuard>
  )
}

function AdminPaymentPageContent() {
  const { admin } = useAdminAuth()
  const { config, loading, save } = useAdminConfig()
  const isAdmin = isAtLeast(admin, 'administrator')

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Payment Page">
      <div className="flex flex-col gap-6">

        <EditableCard
          title="Page settings"
          description="Configure payment page visibility and navigation"
          savedValues={{
            payment_enabled: config?.payment_enabled ?? false,
            payment_page_name: config?.payment_page_name || 'Payment',
            payment_slug: config?.payment_slug || 'payment',
            payment_comments_enabled: config?.payment_comments_enabled ?? true,
          }}
          onSave={values => save(values)}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Toggle label="Enable payment page" checked={local.payment_enabled} onChange={v => set('payment_enabled', v)} />
              <Field label="Page title" hint="Used for the browser tab title (e.g. Payment - Site Name).">
                <Input value={local.payment_page_name} onChange={e => set('payment_page_name', e.target.value)} />
              </Field>
              <Field label="Page URL address" hint="Letters, numbers, and hyphens only. A page reload is needed for URL changes to take effect.">
                <InputWithPrefix prefix={`https://${config?.domain || 'example.com'}/`} value={local.payment_slug} onChange={e => set('payment_slug', e.target.value.replace(/^\/+/, ''))} placeholder="payment" />
              </Field>
              <Toggle label="Show supporter comments publicly" checked={local.payment_comments_enabled} onChange={v => set('payment_comments_enabled', v)} />
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Status</p>
                <p className="text-sm">
                  {local.payment_enabled
                    ? <span className="text-[#30cf43] font-medium">Enabled</span>
                    : <span className="text-gray-400">Disabled</span>
                  }
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Page title</p>
                <DisplayValue value={local.payment_page_name} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">URL</p>
                <DisplayValue value={local.payment_slug ? `/${local.payment_slug}` : ''} fallback="/payment" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Supporter comments</p>
                <p className="text-sm">
                  {local.payment_comments_enabled
                    ? <span className="text-[#30cf43] font-medium">Shown publicly</span>
                    : <span className="text-gray-400">Hidden</span>
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
              {config?.payment_text ? 'Content set' : 'No content set'}
            </p>
          </div>
          <Link
            to="/admin/payment/edit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors shrink-0"
          >
            Edit content
          </Link>
        </div>

        {isAdmin && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Payment metrics</h2>
              <p className="text-xs text-gray-400 mt-0.5">Revenue chart and full transaction log</p>
            </div>
            <Link
              to="/admin/metrics/payments"
              className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors shrink-0"
            >
              View metrics
            </Link>
          </div>
        )}

      </div>
    </PageShell>
  )
}
