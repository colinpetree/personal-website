import { useState } from 'react'
import { X } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { Toggle } from './AdminPage'

// Deployment-time flag — matches the one AdminLayout.jsx uses to hide the AI
// Demo nav item; keeps this toggle from appearing for a feature that isn't built.
const AI_DEMOS_ENABLED = import.meta.env.VITE_ENABLE_AI_DEMOS !== 'false'

export default function UserProfileModal({ user, onClose, onUpdated }) {
  const { addToast } = useToast()

  const [local, setLocal] = useState({ ...user })
  const [saving, setSaving] = useState(false)
  const [savedIndicator, setSavedIndicator] = useState(false)

  function set(field, value) {
    setLocal(l => ({ ...l, [field]: value }))
  }

  const isDirty = JSON.stringify(local) !== JSON.stringify(user)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: local.name, email: local.email, title: local.title, can_comment: local.can_comment, ai_demo_access: local.ai_demo_access }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      onUpdated(data)
      setSavedIndicator(true)
      setTimeout(() => setSavedIndicator(false), 2500)
    } catch (err) {
      addToast({ message: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Avatar + identity */}
        <div className="flex flex-col items-center gap-2 pt-5 pb-4 px-6">
          {local.avatar_url ? (
            <img
              src={local.avatar_url}
              alt={local.name}
              className="w-16 h-16 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center leading-none text-2xl font-semibold text-gray-600">
              <span className="translate-y-px">{local.name.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <p className="text-base font-semibold text-gray-900">{local.name}</p>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={local.name || ''}
              onChange={e => set('name', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={local.email || ''}
              onChange={e => set('email', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={local.title || ''}
              onChange={e => set('title', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          <Toggle
            label="Block user from commenting"
            checked={!local.can_comment}
            onChange={v => set('can_comment', !v)}
          />

          {AI_DEMOS_ENABLED && (
            <Toggle
              label="Allow AI demo access"
              checked={!!local.ai_demo_access}
              onChange={v => set('ai_demo_access', v)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              saving
                ? 'bg-white text-gray-500 border border-gray-200'
                : savedIndicator
                  ? 'bg-gray-100 text-gray-500'
                  : isDirty
                    ? 'bg-[#30cf43] text-white hover:brightness-95'
                    : 'bg-gray-100 text-gray-400'
            }`}
          >
            {saving ? 'Saving…' : savedIndicator ? 'Saved' : 'Save'}
          </button>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
        </div>
      </div>
    </div>
  )
}
