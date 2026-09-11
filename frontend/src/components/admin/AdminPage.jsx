import { useState, useEffect } from 'react'

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm p-6 flex flex-col gap-5 ${className}`}>
      {children}
    </div>
  )
}

export function EditableCard({ title, description, savedValues, onSave, children }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(savedValues)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const savedKey = JSON.stringify(savedValues)
  useEffect(() => {
    if (!editing) setLocal(savedValues)
  }, [savedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = JSON.stringify(local) !== savedKey

  function set(field, value) {
    setLocal(l => ({ ...l, [field]: value }))
  }

  function cancel() {
    setLocal(savedValues)
    setEditing(false)
    setError('')
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await onSave(local)
      await new Promise(r => setTimeout(r, 700))
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!editing && (
            <button
              onClick={() => !saved && setEditing(true)}
              disabled={saved}
              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-default text-gray-400 enabled:text-gray-700 enabled:hover:bg-gray-50"
            >
              {saved ? 'Saved' : 'Edit'}
            </button>
          )}
          {editing && (
            <>
              {!saving && (
                <button
                  onClick={cancel}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!isDirty || saving}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  saving
                    ? 'bg-white text-gray-500 cursor-default'
                    : isDirty
                      ? 'bg-[#30cf43] text-white hover:brightness-95'
                      : 'bg-gray-100 text-gray-400 cursor-default'
                }`}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>
      {children({ editing, local, set })}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </Card>
  )
}

export function PageShell({ title, children, wide = false }) {
  return (
    <div className={`mx-auto px-8 py-10 ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">{title}</h1>
      {children}
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

export function Input({ ...props }) {
  return (
    <input
      {...props}
      className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 w-full"
    />
  )
}

export function InputWithPrefix({ prefix, className, ...props }) {
  return (
    <div className="flex rounded-md border border-gray-300 focus-within:border-gray-400 overflow-hidden">
      <span className="flex items-center px-3 py-2 text-sm text-gray-500 bg-gray-50 border-r border-gray-300 whitespace-nowrap select-none">
        {prefix}
      </span>
      <input
        {...props}
        className={`flex-1 px-3 py-2 text-sm text-gray-900 focus:outline-none min-w-0 ${className || ''}`}
      />
    </div>
  )
}

export function Textarea({ ...props }) {
  return (
    <textarea
      {...props}
      className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 w-full resize-y"
    />
  )
}

export function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-gray-900' : 'bg-gray-300'}`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </div>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </label>
  )
}

export function SaveBar({ saving, saved, error, onSave }) {
  return (
    <div className="flex items-center gap-4 pt-4 border-t border-gray-200 mt-8">
      <button
        onClick={onSave}
        disabled={saving}
        className="rounded-md bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
      {saved && <span className="text-sm text-green-600">Saved</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  )
}

export function useSaveState() {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function wrap(fn) {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      await fn()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return { saving, saved, error, wrap }
}
