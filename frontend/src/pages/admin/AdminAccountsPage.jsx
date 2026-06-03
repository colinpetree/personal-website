import { useState, useEffect } from 'react'

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [form, setForm] = useState({ name: '', title: '', email: '', password: '' })
  const [submitting, setSubmitting] = useState(false)
  const [dialogError, setDialogError] = useState('')

  useEffect(() => { fetchAccounts() }, [])

  async function fetchAccounts() {
    const res = await fetch('/api/admin/accounts', { credentials: 'include' })
    if (res.ok) setAccounts(await res.json())
    setLoading(false)
  }

  async function handleCreate(e) {
    e.preventDefault()
    setDialogError('')
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
      setAccounts(a => [...a, data])
      setShowDialog(false)
      setForm({ name: '', title: '', email: '', password: '' })
    } catch (err) {
      setDialogError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this admin account?')) return
    const res = await fetch(`/api/admin/accounts/${id}`, { method: 'DELETE', credentials: 'include' })
    if (res.ok) setAccounts(a => a.filter(x => x.id !== id))
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Admin Accounts</h1>
        <button
          onClick={() => { setShowDialog(true); setDialogError('') }}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          Add account
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {accounts.map((account, i) => (
            <div key={account.id} className={`flex items-center justify-between px-5 py-4 ${i > 0 ? 'border-t border-gray-200' : ''}`}>
              <div>
                <p className="text-sm font-medium text-gray-900">{account.name} {account.is_primary && <span className="ml-2 text-xs text-gray-400">(primary)</span>}</p>
                <p className="text-xs text-gray-500">{account.email}{account.title ? ` · ${account.title}` : ''}</p>
              </div>
              {!account.is_primary && (
                <button onClick={() => handleDelete(account.id)} className="text-sm text-red-500 hover:text-red-700">Delete</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add account dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Add Admin Account</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              {[
                { label: 'Name', key: 'name', type: 'text', required: true },
                { label: 'Title', key: 'title', type: 'text', required: false },
                { label: 'Email', key: 'email', type: 'text', required: true },
                { label: 'Password', key: 'password', type: 'password', required: true },
              ].map(({ label, key, type, required }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type={type}
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    required={required}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
              ))}
              {dialogError && <p className="text-sm text-red-600">{dialogError}</p>}
              <div className="flex gap-3 justify-end mt-2">
                <button type="button" onClick={() => setShowDialog(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                <button type="submit" disabled={submitting} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {submitting ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
