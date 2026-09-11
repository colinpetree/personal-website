import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useAdminAuth, isAtLeast } from '../../context/AdminAuthContext'
import { useToast } from '../../context/ToastContext'
import { PageShell } from '../../components/admin/AdminPage'
import StaffProfileModal, { AvatarCircle, ROLE_BADGE, ROLE_LABELS, ROLE_DESCRIPTIONS } from '../../components/admin/StaffProfileModal'
import RoleGuard, { adminOnlyFallback } from '../../components/admin/RoleGuard'

// ─── Add Account Modal ────────────────────────────────────────────────────────

function AddAccountModal({ onClose, onCreated, currentAdminRole }) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'contributor' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const availableRoles = isAtLeast({ role: currentAdminRole }, 'administrator')
    ? ['contributor', 'editor', 'administrator']
    : ['contributor']

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create account')
      onCreated(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Add Staff Account</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {[
            { label: 'Name', key: 'full_name', type: 'text', required: true },
            { label: 'Email', key: 'email', type: 'email', required: true },
            { label: 'Password', key: 'password', type: 'password', required: true },
          ].map(({ label, key, type, required }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                required={required}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
            </div>
          ))}

          {/* Role radio */}
          <div className="mt-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
            <div className="flex flex-col gap-2">
              {availableRoles.map(role => (
                <label key={role} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    checked={form.role === role}
                    onChange={() => setForm(f => ({ ...f, role }))}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{ROLE_LABELS[role]}</p>
                    <p className="text-xs text-gray-400">{ROLE_DESCRIPTIONS[role]}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 justify-end mt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button type="submit" disabled={submitting} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'contributors', label: 'Contributors', roles: ['contributor'] },
  { key: 'editors', label: 'Editors', roles: ['editor'] },
  { key: 'administrators', label: 'Administrators', roles: ['administrator', 'owner'] },
]

export default function AdminAccountsPage() {
  return (
    <RoleGuard minRole="administrator" fallback={adminOnlyFallback}>
      <AdminAccountsPageContent />
    </RoleGuard>
  )
}

function AdminAccountsPageContent() {
  const { admin } = useAdminAuth()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('administrators')
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [historyTarget, setHistoryTarget] = useState(null)

  useEffect(() => { fetchAccounts() }, [])

  // Editors only see the Contributors tab
  useEffect(() => {
    if (admin?.role === 'editor') setTab('contributors')
  }, [admin?.role])

  async function fetchAccounts() {
    const res = await fetch('/api/admin/accounts', { credentials: 'include' })
    if (res.ok) setAccounts(await res.json())
    setLoading(false)
  }

  const canAddAccounts = isAtLeast(admin, 'editor')

  const visibleTabs = admin?.role === 'editor' ? TABS.filter(t => t.key === 'contributors') : TABS
  const currentTab = TABS.find(t => t.key === tab)
  const tabAccounts = accounts.filter(a => currentTab?.roles.includes(a.role))

  function handleUpdated(updated) {
    setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a))
    setSelectedAccount(updated)
  }

  function handleCreated(account) {
    setAccounts(prev => [...prev, account])
    setShowAddModal(false)
  }

  function handleViewHistory(account) {
    setSelectedAccount(null)
    setHistoryTarget(account)
  }

  return (
    <PageShell title="Staff Accounts">
      <div className="flex items-center justify-between mb-6">
        <div />
        {canAddAccounts && (
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            Add account
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-1">
        {visibleTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors rounded-t ${
              tab === t.key
                ? 'text-gray-900 border-b-2 border-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : tabAccounts.length === 0 ? (
        <p className="text-gray-400 text-sm">No {currentTab?.label.toLowerCase()} accounts.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {tabAccounts.map((account, i) => (
            <button
              key={account.id}
              onClick={() => setSelectedAccount(account)}
              className={`w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors ${i > 0 ? 'border-t border-gray-200' : ''}`}
            >
              <AvatarCircle name={account.full_name} avatarFilename={account.avatar_filename} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {account.full_name}
                  {account.role === 'owner' && (
                    <span className={`ml-2 inline-flex items-center leading-none px-1.5 py-1 text-xs font-medium rounded-full ${ROLE_BADGE.owner}`}><span className="translate-y-px">Owner</span></span>
                  )}
                </p>
                <p className="text-xs text-gray-500 truncate">{account.email}{account.title ? ` · ${account.title}` : ''}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedAccount && (
        <StaffProfileModal
          account={selectedAccount}
          onClose={() => setSelectedAccount(null)}
          onUpdated={handleUpdated}
          onRefetch={fetchAccounts}
          onViewHistory={handleViewHistory}
        />
      )}

      {showAddModal && (
        <AddAccountModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleCreated}
          currentAdminRole={admin?.role}
        />
      )}

      {historyTarget && (
        <HistoryModalLazy
          initialAdminId={historyTarget.id}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </PageShell>
  )
}

function HistoryModalLazy(props) {
  const [Comp, setComp] = useState(null)
  useEffect(() => {
    import('../../components/admin/HistoryModal').then(m => setComp(() => m.default))
  }, [])
  if (!Comp) return null
  return <Comp {...props} />
}
