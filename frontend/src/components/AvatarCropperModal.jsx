import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { getCroppedImageBlob } from '../utils/cropImage'

// Shared crop/zoom step used before uploading an image — inserted between
// file selection and the actual upload call. Originally built for the
// circular avatar flow (public user profile, admin staff profile); the
// site-icon (favicon) upload reuses it with cropShape="rect" and its own
// title, since both need the same square-aspect crop/zoom UI, just a
// different overlay mask and no upload-blob squashing surprise from
// react-easy-crop's cropShape="round" (that prop only changes the preview
// mask, not the actual cropped rectangle — see getCroppedImageBlob).
export default function AvatarCropperModal({ imageSrc, onCancel, onCropped, cropShape = 'round', title = 'Adjust your photo' }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels)
  }, [])

  async function handleSave() {
    if (!croppedAreaPixels) return
    setSaving(true)
    setError('')
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels)
      onCropped(blob)
    } catch (err) {
      setError(err.message || 'Failed to crop image')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm flex flex-col overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>

        <div className="relative w-full h-72 bg-gray-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape={cropShape}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="flex-1"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onCancel} disabled={saving} className="text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !croppedAreaPixels}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
