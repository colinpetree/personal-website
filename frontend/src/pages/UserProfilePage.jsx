import { useState } from 'react'
import { useUserAuth } from '../context/UserAuthContext'
import { useSiteConfig } from '../hooks/useSiteConfig'

export default function UserProfilePage() {
  const { user, loading, updateProfile } = useUserAuth()
  const { config } = useSiteConfig()
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  if (loading) {
    return (
      <main className="max-w-xl mx-auto px-6 py-16">
        <p className="text-gray-400">Loading…</p>
      </main>
    )
  }

  if (!config?.users_enabled) {
    return (
      <main className="max-w-xl mx-auto px-6 py-16">
        <p className="text-gray-600">User accounts are not enabled on this site.</p>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="max-w-xl mx-auto px-6 py-16">
        <p className="text-gray-600">You are not signed in.</p>
      </main>
    )
  }

  function startEdit() {
    setName(user.name)
    setTitle(user.title || '')
    setEditing(true)
    setError('')
    setSaved(false)
  }

  function cancelEdit() {
    setEditing(false)
    setError('')
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await updateProfile(name.trim(), title.trim())
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Your Profile</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-6">
        {/* Avatar + name */}
        <div className="flex items-center gap-4">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name}
              className="w-16 h-16 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-xl font-semibold text-gray-600">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold text-gray-900">{user.name}</p>
            {user.title && <p className="text-sm text-gray-500">{user.title}</p>}
            <p className="text-sm text-gray-400">{user.email}</p>
          </div>
        </div>

        {/* Edit form */}
        {editing ? (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title (optional)</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Software Engineer"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-4">
            <button
              onClick={startEdit}
              className="rounded-md bg-white border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Edit profile
            </button>
            {saved && <span className="text-sm text-green-600">Saved</span>}
          </div>
        )}
      </div>

    </main>
  )
}
