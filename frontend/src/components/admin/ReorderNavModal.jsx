import { useState } from 'react'
import { GripVertical } from 'lucide-react'

const PAGE_KEYS = ['home', 'blog', 'projects', 'about', 'contact', 'ai_demo', 'payment']

// Same deployment-time flag AdminLayout.jsx uses to hide the AI demo nav link
// when this fork doesn't have the feature built in.
const AI_DEMOS_ENABLED = import.meta.env.VITE_ENABLE_AI_DEMOS !== 'false'

// Moves the item at `from` so it lands just before what is currently index
// `to` (0..length, where `length` means "at the very end").
function reorder(list, from, to) {
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(from < to ? to - 1 : to, 0, moved)
  return next
}

export default function ReorderNavModal({ config, save, onClose }) {
  const availableKeys = PAGE_KEYS.filter(key => key !== 'ai_demo' || AI_DEMOS_ENABLED)

  const [order, setOrder] = useState(() => {
    const saved = (config?.nav_order || []).filter(key => availableKeys.includes(key))
    return [...saved, ...availableKeys.filter(key => !saved.includes(key))]
  })
  const [enabled, setEnabled] = useState(() =>
    Object.fromEntries(availableKeys.map(key => [key, !!config?.[`${key}_enabled`]]))
  )
  const [dragIndex, setDragIndex] = useState(null)
  // Index in `order` where the drop-position line renders — 0..order.length,
  // where order.length means "after the last row".
  const [dropIndex, setDropIndex] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleDragStart(e, index) {
    setDragIndex(index)
    setDropIndex(index)
    // Without these, browsers show a "not allowed" cursor over valid drop
    // targets — dropEffect has to be set on every dragover too, not just here.
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', order[index])
  }

  function handleRowDragOver(e, index) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const before = e.clientY < rect.top + rect.height / 2
    setDropIndex(before ? index : index + 1)
  }

  function handleContainerDragOver(e) {
    // Keeps the cursor as "move" (not "no-drop") over gaps between rows.
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop() {
    if (dragIndex !== null && dropIndex !== null && dropIndex !== dragIndex && dropIndex !== dragIndex + 1) {
      setOrder(current => reorder(current, dragIndex, dropIndex))
    }
    setDragIndex(null)
    setDropIndex(null)
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDropIndex(null)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const payload = { nav_order: order }
      for (const key of availableKeys) payload[`${key}_enabled`] = enabled[key]
      await save(payload)
      onClose()
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md flex flex-col max-h-[85vh]">

        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Reorder Navigation</h2>
          <p className="text-xs text-gray-400 mt-0.5">Drag to set the order of pages in your site's navigation and admin sidebar</p>
        </div>

        <div
          className="overflow-y-auto flex-1 px-3 py-3 flex flex-col gap-1"
          onDragOver={handleContainerDragOver}
          onDrop={handleDrop}
        >
          {order.map((key, index) => (
            <div key={key} className="flex flex-col gap-1">
              {dragIndex !== null && dropIndex === index && (
                <div className="h-0.5 rounded-full bg-gray-900 mx-1" />
              )}
              <div
                draggable
                onDragStart={e => handleDragStart(e, index)}
                onDragOver={e => handleRowDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md border border-gray-200 bg-white cursor-grab active:cursor-grabbing select-none ${
                  dragIndex === index ? 'opacity-40' : ''
                }`}
              >
                <GripVertical size={16} className="text-gray-300 flex-shrink-0" />
                <span className="text-sm text-gray-900 flex-1 truncate">{config?.[`${key}_page_name`] || key}</span>
                <button
                  type="button"
                  onClick={() => setEnabled(e => ({ ...e, [key]: !e[key] }))}
                  className={`inline-flex items-center leading-none text-xs font-medium px-2.5 py-1.5 rounded-full flex-shrink-0 transition-colors ${
                    enabled[key] ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  <span className="translate-y-px">{enabled[key] ? 'Enabled' : 'Disabled'}</span>
                </button>
              </div>
            </div>
          ))}
          {dragIndex !== null && dropIndex === order.length && (
            <div className="h-0.5 rounded-full bg-gray-900 mx-1" />
          )}
        </div>

        {error && <p className="px-6 pb-2 text-xs text-red-500">{error}</p>}

        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
