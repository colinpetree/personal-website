import { useState, useEffect, useRef } from 'react'
import { X, MoreHorizontal, Eye, EyeOff, Upload } from 'lucide-react'
import { useAdminAuth, isAtLeast } from '../../context/AdminAuthContext'
import { useToast } from '../../context/ToastContext'
import AvatarCropperModal from '../AvatarCropperModal'

export const ROLE_LABELS = {
  contributor: 'Contributor',
  editor: 'Editor',
  administrator: 'Administrator',
  owner: 'Owner',
}

export const ROLE_DESCRIPTIONS = {
  contributor: 'Can create and edit their own posts. An Editor must approve and publish.',
  editor: 'Can invite Contributors and publish any post on the site.',
  administrator: 'Full access to all content, users, and site settings.',
}

export const ROLE_BADGE = {
  owner: 'bg-amber-100 text-amber-800',
  administrator: 'bg-purple-100 text-purple-700',
  editor: 'bg-blue-100 text-blue-700',
  contributor: 'bg-gray-100 text-gray-600',
}

export function getInitials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0]?.[0] || '?').toUpperCase()
}

export function AvatarCircle({ name, avatarFilename, size = 'md' }) {
  const sz = size === 'lg' ? 'w-16 h-16 text-xl' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  if (avatarFilename) {
    return <img src={`/api/uploads/${avatarFilename}`} className={`${sz} rounded-full object-cover`} alt={name} />
  }
  return (
    <div className={`${sz} rounded-full bg-gray-200 flex items-center justify-center font-semibold text-gray-600`}>
      {getInitials(name)}
    </div>
  )
}

export default function StaffProfileModal({ account, onClose, onUpdated, onRefetch, onViewHistory = () => {} }) {
  const { admin } = useAdminAuth()
  const { addToast } = useToast()

  const [local, setLocal] = useState({ ...account })
  const [saving, setSaving] = useState(false)
  const [savedIndicator, setSavedIndicator] = useState(false)

  // Password section
  const [showPasswordSection, setShowPasswordSection] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPw, setShowNewPw] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')

  // More menu
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)

  // Make owner confirm
  const [showMakeOwnerConfirm, setShowMakeOwnerConfirm] = useState(false)
  const [makeOwnerSaving, setMakeOwnerSaving] = useState(false)

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Avatar upload
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const avatarInputRef = useRef(null)

  const isOwnAccount = admin?.id === account.id
  const canEdit = isOwnAccount || isAtLeast(admin, 'administrator')
  const isViewingOwner = account.role === 'owner'

  const canDeleteAccount =
    !isOwnAccount &&
    account.role !== 'owner' &&
    (
      (admin?.role === 'editor' && account.role === 'contributor') ||
      (admin?.role === 'administrator' && ['contributor', 'editor'].includes(account.role)) ||
      (admin?.role === 'owner')
    )

  const showMoreMenu = !isOwnAccount && (isAtLeast(admin, 'administrator') || canDeleteAccount)

  // Available roles for the dropdown (role is always read-only on own account)
  const availableRoles = (() => {
    if (isViewingOwner) return ['owner']
    if (isAtLeast(admin, 'administrator')) return ['contributor', 'editor', 'administrator']
    if (admin?.role === 'editor') return ['contributor', 'editor']
    return [account.role]
  })()

  useEffect(() => {
    function handleClick(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function set(field, value) {
    setLocal(l => ({ ...l, [field]: value }))
  }

  const isDirty = JSON.stringify(local) !== JSON.stringify(account)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/accounts/${account.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(local),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      await new Promise(r => setTimeout(r, 700))
      onUpdated(data)
      setSavedIndicator(true)
      setTimeout(() => setSavedIndicator(false), 2500)
    } catch (err) {
      addToast({ message: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePassword() {
    setPwError('')
    setPwSaving(true)
    try {
      const res = await fetch(`/api/admin/accounts/${account.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update password')
      addToast({ message: 'Password updated' })
      setShowPasswordSection(false)
      setOldPassword('')
      setNewPassword('')
    } catch (err) {
      setPwError(err.message)
    } finally {
      setPwSaving(false)
    }
  }

  async function handleMakeOwner() {
    setMakeOwnerSaving(true)
    try {
      const res = await fetch(`/api/admin/accounts/${account.id}/make-owner`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to transfer ownership')
      addToast({ message: `${account.full_name} is now the Owner` })
      onClose()
      onRefetch()
    } catch (err) {
      addToast({ message: err.message })
    } finally {
      setMakeOwnerSaving(false)
      setShowMakeOwnerConfirm(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/accounts/${account.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      addToast({ message: `${account.full_name}'s account has been deleted` })
      onClose()
      onRefetch()
    } catch (err) {
      addToast({ message: err.message })
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  function handleAvatarSelect(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCropSrc(URL.createObjectURL(file))
  }

  function closeCropper() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  async function handleAvatarCropped(blob) {
    setAvatarUploading(true)
    const formData = new FormData()
    formData.append('file', blob, 'avatar.png')
    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', credentials: 'include', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      set('avatar_filename', data.filename)
      closeCropper()
    } catch (err) {
      addToast({ message: err.message })
      closeCropper()
    } finally {
      setAvatarUploading(false)
    }
  }

  function handleRemoveAvatar() {
    set('avatar_filename', null)
  }

  const displayName = local.full_name || 'Staff User'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
          {showMoreMenu && (
            <div className="relative" ref={moreRef}>
              <button
                onClick={() => setMoreOpen(o => !o)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded"
              >
                <MoreHorizontal size={18} />
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-48 z-10">
                  {isAtLeast(admin, 'administrator') && (
                    <button
                      onClick={() => { setMoreOpen(false); onViewHistory(account) }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      View User Activity
                    </button>
                  )}
                  {admin?.role === 'owner' && account.role === 'administrator' && (
                    <button
                      onClick={() => { setMoreOpen(false); setShowMakeOwnerConfirm(true) }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Make Owner
                    </button>
                  )}
                  {canDeleteAccount && (
                    <button
                      onClick={() => { setMoreOpen(false); setShowDeleteConfirm(true) }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete account
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Avatar + identity */}
        <div className="flex flex-col items-center gap-2 pt-5 pb-4 px-6">
          <div className="relative group">
            <AvatarCircle name={displayName} avatarFilename={local.avatar_filename} size="lg" />
            {canEdit && (
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
              >
                <Upload size={16} className="text-white" />
              </button>
            )}
            <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarSelect} />
          </div>
          <p className="text-base font-semibold text-gray-900">{displayName}</p>
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${ROLE_BADGE[local.role] || 'bg-gray-100 text-gray-600'}`}>
            {ROLE_LABELS[local.role] || local.role}
          </span>
          {canEdit && local.avatar_filename && (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              className="text-xs text-gray-400 hover:text-red-600"
            >
              Remove photo
            </button>
          )}
        </div>

        {cropSrc && (
          <AvatarCropperModal
            imageSrc={cropSrc}
            onCancel={closeCropper}
            onCropped={handleAvatarCropped}
          />
        )}

        {/* Tab bar */}
        <div className="px-6 border-b border-gray-100">
          <div className="flex gap-1">
            <button className="text-sm font-medium text-gray-900 border-b-2 border-gray-900 pb-2 px-1">Profile</button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-4">

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={local.email || ''}
              onChange={e => set('email', e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            {!showPasswordSection && (
              <button
                type="button"
                onClick={() => { setShowPasswordSection(true); setPwError('') }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-left text-gray-400 bg-gray-50 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 tracking-widest"
              >
                ••••••••
              </button>
            )}
            {showPasswordSection && (
              <div className="mt-3 flex flex-col gap-3 pl-0">
                {isOwnAccount && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                    <input
                      type="password"
                      value={oldPassword}
                      onChange={e => setOldPassword(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {pwError && <p className="text-sm text-red-600">{pwError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSavePassword}
                    disabled={pwSaving || !newPassword || (isOwnAccount && !oldPassword)}
                    className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {pwSaving ? 'Saving…' : 'Save Password'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowPasswordSection(false); setOldPassword(''); setNewPassword(''); setPwError('') }}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Role — always read-only on own account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            {isOwnAccount || isViewingOwner || availableRoles.length === 1 ? (
              <p className="text-sm text-gray-900">{ROLE_LABELS[local.role]}</p>
            ) : (
              <select
                value={local.role}
                onChange={e => set('role', e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white disabled:bg-gray-50 disabled:text-gray-500"
              >
                {availableRoles.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            )}
          </div>

          {/* Full name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={local.full_name || ''}
              onChange={e => set('full_name', e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={local.title || ''}
              onChange={e => set('title', e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input
              type="text"
              value={local.location || ''}
              onChange={e => set('location', e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex items-center gap-3">
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-default ${
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
          )}
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
        </div>
      </div>

      {/* Make Owner confirmation dialog */}
      {showMakeOwnerConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-gray-900">Transfer Ownership</h3>
            <p className="text-sm text-gray-600">
              You are about to make <strong>{account.full_name}</strong> the Owner and demote your account to Administrator. This action cannot be undone from this account.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowMakeOwnerConfirm(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button
                onClick={handleMakeOwner}
                disabled={makeOwnerSaving}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {makeOwnerSaving ? 'Transferring…' : 'Transfer Ownership'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-gray-900">Delete account?</h3>
            <p className="text-sm text-gray-600">
              <strong>{account.full_name}</strong>'s account will be deactivated. They will no longer be able to sign in, but their activity history will be preserved.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
