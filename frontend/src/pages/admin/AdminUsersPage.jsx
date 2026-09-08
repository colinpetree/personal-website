import { useState, useEffect } from 'react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { EditableCard, Field, Input, Toggle } from '../../components/admin/AdminPage'
import UserProfileModal from '../../components/admin/UserProfileModal'
import RoleGuard, { adminOnlyFallback } from '../../components/admin/RoleGuard'

function RedirectUriBox({ uri }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(uri).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-gray-700">Authorized redirect URI</p>
      <p className="text-xs text-gray-400">Add this URL to your Google OAuth app under "Authorized redirect URIs".</p>
      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
        <span className="flex-1 text-sm text-gray-700 font-mono break-all">{uri}</span>
        <button
          type="button"
          onClick={copy}
          className="flex-shrink-0 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

export default function AdminUsersPage() {
  return (
    <RoleGuard minRole="administrator" fallback={adminOnlyFallback}>
      <AdminUsersPageContent />
    </RoleGuard>
  )
}

function AdminUsersPageContent() {
  const { config, save } = useAdminConfig()
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState(null)

  useEffect(() => { fetchUsers(page) }, [page])

  async function fetchUsers(p) {
    setLoading(true)
    const res = await fetch(`/api/admin/users?page=${p}&per_page=20`, { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users)
      setTotal(data.total)
      setPages(data.pages)
    }
    setLoading(false)
  }

  function handleExport() {
    window.location.href = '/api/admin/users/export.csv'
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">

      {/* User accounts settings */}
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Users</h1>
      <div className="mb-10">
        <EditableCard
          title="User accounts"
          description="Allow visitors to sign in with Google to leave comments on posts"
          savedValues={{
            users_enabled: config?.users_enabled || false,
            google_oauth_client_id: config?.google_oauth_client_id || '',
            google_oauth_client_secret: '',
          }}
          onSave={values => {
            const payload = { users_enabled: values.users_enabled, google_oauth_client_id: values.google_oauth_client_id }
            if (values.google_oauth_client_secret) payload.google_oauth_client_secret = values.google_oauth_client_secret
            return save(payload)
          }}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Toggle label="Enable user accounts" checked={local.users_enabled} onChange={v => set('users_enabled', v)} />
              {local.users_enabled && (
                <>
                  <RedirectUriBox uri={config?.google_oauth_redirect_uri || ''} />
                  <Field label="Google OAuth Client ID">
                    <Input value={local.google_oauth_client_id} onChange={e => set('google_oauth_client_id', e.target.value)} />
                  </Field>
                  <Field
                    label="Google OAuth Client Secret"
                    hint={config?.google_oauth_client_secret_set ? 'Currently set — enter a new value to replace it.' : ''}
                  >
                    <Input
                      type="password"
                      value={local.google_oauth_client_secret}
                      onChange={e => set('google_oauth_client_secret', e.target.value)}
                      placeholder={config?.google_oauth_client_secret_set ? '••••••••' : ''}
                    />
                  </Field>
                </>
              )}
            </>
          ) : (
            <p className="text-sm">
              {local.users_enabled
                ? <span className="text-[#30cf43] font-medium">Enabled</span>
                : <span className="text-gray-400">Disabled</span>
              }
            </p>
          )}
        </EditableCard>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Registered users</h2>
          {!loading && <p className="text-sm text-gray-400 mt-0.5">{total} registered</p>}
        </div>
        <button
          onClick={handleExport}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-gray-400 text-sm">No users have signed up yet.</p>
      ) : (
        <>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {users.map((user, i) => (
              <div
                key={user.id}
                onClick={() => setEditingUser(user)}
                className={`flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors ${i > 0 ? 'border-t border-gray-200' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.name}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center leading-none text-base font-semibold text-gray-600 flex-shrink-0">
                      <span className="translate-y-px">{user.name.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user.name}
                      {user.title && <span className="ml-1 font-normal text-gray-400">· {user.title}</span>}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6 flex-shrink-0 ml-4">
                  <span className="text-xs text-gray-400 hidden sm:block">
                    {user.comment_count} comment{user.comment_count !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-gray-400 hidden sm:block">
                    Joined {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  {!user.can_comment && (
                    <span className="inline-flex items-center leading-none text-xs font-medium px-2.5 py-1.5 rounded-full bg-red-50 text-red-600">
                      <span className="translate-y-px">Blocked</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-sm text-gray-500 hover:text-gray-900 disabled:opacity-30"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">{page} / {pages}</span>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="text-sm text-gray-500 hover:text-gray-900 disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {editingUser && (
        <UserProfileModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onUpdated={updated => {
            setUsers(u => u.map(x => x.id === updated.id ? { ...x, ...updated } : x))
            setEditingUser(null)
          }}
        />
      )}
    </div>
  )
}
