import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Image as ImageIcon, Video as VideoIcon, Upload, Trash2 } from 'lucide-react'
import { handleUploadFull } from '../admin/editor/upload'
import { Tooltip } from './Tooltip'

function hexToHsv(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = (((g - b) / d) % 6 + 6) % 6 * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  return { h, s: max === 0 ? 0 : d / max * 100, v: max * 100 }
}

function hsvToHex(h, s, v) {
  s /= 100; v /= 100
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60)       { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) {        g = c; b = x }
  else if (h < 240) {        g = x; b = c }
  else if (h < 300) { r = x;        b = c }
  else              { r = c;        b = x }
  const toH = n => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${toH(r)}${toH(g)}${toH(b)}`
}

export function getContrastColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const toLinear = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return L > 0.179 ? 'black' : 'white'
}

function isValidHex(hex) {
  return /^#[0-9a-f]{6}$/i.test(hex)
}

const RAINBOW = 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)'

// ─── Shared picker popup UI (no trigger, no portal) ───────────────────────────

function PickerPopup({ value, onChange, verticalLightness = true }) {
  const safe = isValidHex(value) ? value : '#3b82f6'
  const initial = hexToHsv(safe)
  const [h, setH] = useState(initial.h)
  const [s, setS] = useState(initial.s)
  const [v, setV] = useState(initial.v)
  const [hexInput, setHexInput] = useState(safe.slice(1))

  const svRef = useRef(null)
  const dragging = useRef(false)
  const lightRef = useRef(null)
  const lightDragging = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const hRef = useRef(h)
  hRef.current = h
  const sRef = useRef(s)
  sRef.current = s
  const lastEmittedRef = useRef(safe)

  useEffect(() => {
    if (!isValidHex(value)) return
    if (value.toLowerCase() === lastEmittedRef.current.toLowerCase()) return
    const hsv = hexToHsv(value)
    setH(hsv.h)
    setS(hsv.s)
    setV(hsv.v)
    setHexInput(value.slice(1))
    lastEmittedRef.current = value
  }, [value])

  useEffect(() => {
    function onMove(e) {
      if (dragging.current) {
        const coords = getSVCoords(e)
        if (coords) {
          setS(coords.s)
          setV(coords.v)
          emit(hRef.current, coords.s, coords.v)
        }
      }
      if (lightDragging.current) {
        const newV = getLightV(e)
        if (newV != null) {
          setV(newV)
          emit(hRef.current, sRef.current, newV)
        }
      }
    }
    function onUp() { dragging.current = false; lightDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function getSVCoords(e) {
    const rect = svRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      s: Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100)),
      v: Math.max(0, Math.min(100, (1 - (e.clientY - rect.top) / rect.height) * 100)),
    }
  }

  function getLightV(e) {
    const rect = lightRef.current?.getBoundingClientRect()
    if (!rect) return null
    return Math.max(0, Math.min(100, (1 - (e.clientY - rect.top) / rect.height) * 100))
  }

  function handleLightDown(e) {
    lightDragging.current = true
    const newV = getLightV(e)
    if (newV == null) return
    setV(newV)
    emit(hRef.current, sRef.current, newV)
  }

  function emit(newH, newS, newV) {
    const hex = hsvToHex(newH, newS, newV)
    setHexInput(hex.slice(1))
    lastEmittedRef.current = hex
    onChangeRef.current(hex)
  }

  function handleSVDown(e) {
    dragging.current = true
    const coords = getSVCoords(e)
    if (!coords) return
    setS(coords.s)
    setV(coords.v)
    emit(h, coords.s, coords.v)
  }

  function handleHue(e) {
    const newH = Number(e.target.value)
    setH(newH)
    emit(newH, s, v)
  }

  function handleHexInput(e) {
    const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
    setHexInput(raw)
    if (raw.length === 6) {
      const hex = '#' + raw
      const hsv = hexToHsv(hex)
      setH(hsv.h)
      setS(hsv.s)
      setV(hsv.v)
      lastEmittedRef.current = hex
      onChangeRef.current(hex)
    }
  }

  const currentHex = hsvToHex(h, s, v)
  const pureHue = hsvToHex(h, 100, 100)

  return (
    <>
      {/* Saturation / Brightness square (+ optional vertical lightness slider) */}
      <div className="flex gap-2 mb-3">
        <div
          ref={svRef}
          className="relative flex-1 rounded-lg overflow-hidden select-none"
          style={{ height: '120px', cursor: 'crosshair' }}
          onMouseDown={handleSVDown}
        >
          <div className="absolute inset-0" style={{ background: pureHue }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #ffffff, transparent)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #000000, transparent)' }} />
          <div
            className="absolute w-3 h-3 rounded-full border-2 border-white shadow pointer-events-none"
            style={{ left: `${s}%`, top: `${100 - v}%`, transform: 'translate(-50%, -50%)' }}
          />
        </div>

        {verticalLightness && (
          <div
            ref={lightRef}
            onMouseDown={e => { e.preventDefault(); handleLightDown(e) }}
            className="relative w-3.5 rounded-full select-none shrink-0"
            style={{ height: '120px', cursor: 'ns-resize', background: `linear-gradient(to bottom, ${pureHue}, #000000)` }}
            title="Lightness"
          >
            <div
              className="absolute left-1/2 w-4 h-4 rounded-full border-2 border-white shadow pointer-events-none"
              style={{ top: `${100 - v}%`, background: currentHex, transform: 'translate(-50%, -50%)' }}
            />
          </div>
        )}
      </div>

      {/* Hue slider */}
      <input
        type="range"
        min={0}
        max={360}
        value={h}
        onChange={handleHue}
        className="w-full mb-3 outline-none"
        style={{
          height: '10px', borderRadius: '5px',
          WebkitAppearance: 'none', appearance: 'none',
          background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
        }}
      />

      {/* Hex input */}
      <div className="flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-full border border-gray-200 shrink-0" style={{ background: currentHex }} />
        <span className="text-xs text-gray-400 font-mono">#</span>
        <input
          type="text"
          value={hexInput.toUpperCase()}
          onChange={handleHexInput}
          className="flex-1 min-w-0 text-xs font-mono border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
          maxLength={6}
          spellCheck={false}
        />
      </div>
    </>
  )
}

// ─── ColorPicker — standalone rainbow-triggered picker ────────────────────────

export default function ColorPicker({ value = '#3b82f6', onChange }) {
  const [pickerColor, setPickerColor] = useState(isValidHex(value) ? value : '#3b82f6')
  const [open, setOpen] = useState(false)
  const [popPos, setPopPos] = useState({ top: 0, left: 0 })

  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (popoverRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  function openPicker() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const top = rect.bottom + 6
      const left = Math.min(rect.left, window.innerWidth - 248)
      setPopPos({ top, left })
    }
    setOpen(true)
  }

  function handleChange(hex) {
    setPickerColor(hex)
    onChange(hex)
  }

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={e => { e.preventDefault(); open ? setOpen(false) : openPicker() }}
        className="w-5 h-5 rounded-full border-2 border-white shadow ring-1 ring-gray-300 shrink-0"
        style={{ background: RAINBOW }}
        aria-label="Pick color"
      />
      {open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', top: popPos.top, left: popPos.left, zIndex: 99999 }}
          className="bg-white rounded-xl shadow-2xl border border-gray-200 p-3 w-60"
          onMouseDown={e => e.stopPropagation()}
        >
          <PickerPopup value={pickerColor} onChange={handleChange} />
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── ColorSwatchMenu — current-color trigger → presets + rainbow picker ───────

export function ColorSwatchMenu({
  value = '#000000',
  onChange,
  presets = [],
  presetLabels = [],
  imageFilename = null,
  imageActive = false,
  imageHidden = false,
  onImageUpload,
  onImageSelect,
  onImageDelete,
  videoFilename = null,
  videoActive = false,
  videoHidden = false,
  onVideoUpload,
  onVideoSelect,
  onVideoDelete,
  onOpenChange,
  initialOpen = false,
  anchorEl = null,
  verticalLightness = true,
}) {
  const initialCustom = isValidHex(value) && !presets.map(p => p.toLowerCase()).includes(value.toLowerCase())
    ? value
    : '#3b82f6'
  const [swatchesOpen, setSwatchesOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [imgMgmtOpen, setImgMgmtOpen] = useState(false)
  const [vidMgmtOpen, setVidMgmtOpen] = useState(false)
  const [pickerColor, setPickerColor] = useState(initialCustom)
  const [swatchPos, setSwatchPos] = useState({ top: 0, centerX: 0 })
  const [pickerPos, setPickerPos] = useState({ top: 0, centerX: 0 })
  const [imgMgmtPos, setImgMgmtPos] = useState({ top: 0, centerX: 0 })
  const [vidMgmtPos, setVidMgmtPos] = useState({ top: 0, centerX: 0 })

  const triggerRef = useRef(null)
  const rainbowRef = useRef(null)
  const imageSwatchRef = useRef(null)
  const videoSwatchRef = useRef(null)
  const fileInputRef = useRef(null)
  const replaceFileInputRef = useRef(null)
  const videoFileInputRef = useRef(null)
  const videoReplaceFileInputRef = useRef(null)
  const swatchPopoverRef = useRef(null)
  const pickerPopoverRef = useRef(null)
  const imgMgmtPopoverRef = useRef(null)
  const vidMgmtPopoverRef = useRef(null)
  const prevOpenRef = useRef(false)

  useEffect(() => {
    const open = swatchesOpen || pickerOpen || imgMgmtOpen || vidMgmtOpen
    if (open !== prevOpenRef.current) {
      prevOpenRef.current = open
      onOpenChange?.(open)
    }
  }, [swatchesOpen, pickerOpen, imgMgmtOpen, vidMgmtOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (initialOpen) openSwatches() }, []) // eslint-disable-line

  useEffect(() => {
    if (!swatchesOpen && !pickerOpen && !imgMgmtOpen && !vidMgmtOpen) return
    function handle(e) {
      const inSwatch = swatchPopoverRef.current?.contains(e.target)
      const inPicker = pickerPopoverRef.current?.contains(e.target)
      const inImgMgmt = imgMgmtPopoverRef.current?.contains(e.target)
      const inVidMgmt = vidMgmtPopoverRef.current?.contains(e.target)
      const inTrigger = triggerRef.current?.contains(e.target)
      if (!inSwatch && !inPicker && !inImgMgmt && !inVidMgmt && !inTrigger) {
        setSwatchesOpen(false)
        setPickerOpen(false)
        setImgMgmtOpen(false)
        setVidMgmtOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [swatchesOpen, pickerOpen, imgMgmtOpen, vidMgmtOpen])

  function openSwatches() {
    const el = anchorEl || triggerRef.current
    const rect = el?.getBoundingClientRect()
    if (rect) setSwatchPos({ top: rect.top - 6, centerX: rect.left + rect.width / 2 })
    setSwatchesOpen(true)
  }

  function openPicker() {
    const rect = rainbowRef.current?.getBoundingClientRect()
    if (rect) {
      // Popover is centered on this point via translateX(-50%); clamp so it
      // can't run off either edge of the viewport (width varies with the
      // lightness slider — w-60/240px when shown, w-52/208px otherwise).
      const width = verticalLightness ? 240 : 208
      const rawCenterX = rect.left + rect.width / 2
      const centerX = Math.min(Math.max(rawCenterX, width / 2 + 8), window.innerWidth - width / 2 - 8)
      setPickerPos({ top: rect.top - 6, centerX })
    }
    setPickerOpen(true)
  }

  function handlePreset(hex) {
    onChange(hex)
    setPickerOpen(false)
  }

  function handlePickerChange(hex) {
    setPickerColor(hex)
    onChange(hex)
  }

  async function doImageUpload(file) {
    if (!file) return
    try {
      const { filename, lqip } = await handleUploadFull(file)
      onImageUpload?.(filename, lqip)
      setSwatchesOpen(false)
      setImgMgmtOpen(false)
    } catch {}
  }

  async function doVideoUpload(file) {
    if (!file) return
    try {
      const { filename } = await handleUploadFull(file)
      onVideoUpload?.(filename)
      setSwatchesOpen(false)
      setVidMgmtOpen(false)
    } catch {}
  }

  function handleImageSwatch() {
    if (!imageFilename) {
      fileInputRef.current?.click()
    } else {
      const rect = imageSwatchRef.current?.getBoundingClientRect()
      if (rect) setImgMgmtPos({ top: rect.top - 6, centerX: rect.left + rect.width / 2 })
      onImageSelect?.()
      setImgMgmtOpen(v => !v)
      setVidMgmtOpen(false)
      setPickerOpen(false)
    }
  }

  function handleVideoSwatch() {
    if (!videoFilename) {
      videoFileInputRef.current?.click()
    } else {
      const rect = videoSwatchRef.current?.getBoundingClientRect()
      if (rect) setVidMgmtPos({ top: rect.top - 6, centerX: rect.left + rect.width / 2 })
      onVideoSelect?.()
      setVidMgmtOpen(v => !v)
      setImgMgmtOpen(false)
      setPickerOpen(false)
    }
  }

  const safe = isValidHex(value) ? value : '#000000'
  const isCustomColor = !presets.map(p => p.toLowerCase()).includes(safe.toLowerCase())
  const showImageSwatch = !!onImageUpload && !imageHidden
  const showVideoSwatch = !!onVideoUpload && !videoHidden

  const triggerStyle = imageActive && imageFilename
    ? { backgroundImage: `url(/api/uploads/${imageFilename})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : videoActive && videoFilename
    ? { background: '#000000' }
    : { background: safe }

  return (
    <div className="relative inline-flex">
      {/* Hidden file inputs */}
      {showImageSwatch && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { doImageUpload(e.target.files?.[0]); e.target.value = '' }}
          />
          <input
            ref={replaceFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { doImageUpload(e.target.files?.[0]); e.target.value = '' }}
          />
        </>
      )}
      {showVideoSwatch && (
        <>
          <input
            ref={videoFileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={e => { doVideoUpload(e.target.files?.[0]); e.target.value = '' }}
          />
          <input
            ref={videoReplaceFileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={e => { doVideoUpload(e.target.files?.[0]); e.target.value = '' }}
          />
        </>
      )}

      {!anchorEl && (
        <button
          ref={triggerRef}
          type="button"
          onMouseDown={e => { e.preventDefault(); swatchesOpen ? (setSwatchesOpen(false), setPickerOpen(false), setImgMgmtOpen(false), setVidMgmtOpen(false)) : openSwatches() }}
          className="w-5 h-5 rounded-full border-2 border-white shadow ring-1 ring-gray-300 shrink-0 overflow-hidden"
          style={triggerStyle}
          aria-label="Choose color"
        >
          {videoActive && videoFilename && (
            <div className="w-full h-full flex items-center justify-center bg-gray-800">
              <VideoIcon size={10} className="text-white" />
            </div>
          )}
        </button>
      )}

      {/* Swatch preset popover */}
      {swatchesOpen && createPortal(
        <div
          ref={swatchPopoverRef}
          style={{ position: 'fixed', top: swatchPos.top, left: swatchPos.centerX, transform: 'translateX(-50%) translateY(-100%)', zIndex: 99999 }}
          className="bg-white rounded-xl shadow-2xl border border-gray-200 p-2.5"
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="flex gap-1.5">
            {/* Image swatch — leftmost */}
            {showImageSwatch && (
              <Tooltip content="Image">
                <button
                  ref={imageSwatchRef}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); handleImageSwatch() }}
                  className="w-6 h-6 rounded-full border-2 shadow-sm transition-transform hover:scale-110 shrink-0 flex items-center justify-center overflow-hidden bg-gray-100"
                  style={{ borderColor: imageActive ? '#3b82f6' : '#e5e7eb' }}
                  aria-label="Background image"
                >
                  {imageFilename
                    ? <img src={`/api/uploads/${imageFilename}`} className="w-full h-full object-cover" alt="" />
                    : <ImageIcon size={12} className="text-gray-400" />
                  }
                </button>
              </Tooltip>
            )}
            {/* Video swatch */}
            {showVideoSwatch && (
              <Tooltip content="Video">
                <button
                  ref={videoSwatchRef}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); handleVideoSwatch() }}
                  className="w-6 h-6 rounded-full border-2 shadow-sm transition-transform hover:scale-110 shrink-0 flex items-center justify-center overflow-hidden bg-gray-100"
                  style={{ borderColor: videoActive ? '#3b82f6' : '#e5e7eb' }}
                  aria-label="Background video"
                >
                  {videoFilename
                    ? <div className="w-full h-full flex items-center justify-center bg-gray-800"><VideoIcon size={12} className="text-white" /></div>
                    : <VideoIcon size={12} className="text-gray-400" />
                  }
                </button>
              </Tooltip>
            )}
            {presets.map((p, i) => (
              <Tooltip key={p} content={presetLabels[i]}>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); handlePreset(p) }}
                  className="w-6 h-6 rounded-full border-2 shadow-sm transition-transform hover:scale-110 shrink-0"
                  style={{
                    background: p,
                    borderColor: !imageActive && !videoActive && safe.toLowerCase() === p.toLowerCase() ? '#3b82f6' : '#e5e7eb',
                  }}
                  aria-label={presetLabels[i] || p}
                />
              </Tooltip>
            ))}
            {/* Rainbow swatch */}
            <Tooltip content="Color">
              <button
                ref={rainbowRef}
                type="button"
                onMouseDown={e => { e.preventDefault(); pickerOpen ? setPickerOpen(false) : (openPicker(), onChange(pickerColor)) }}
                className="w-6 h-6 rounded-full border-2 shadow-sm transition-transform hover:scale-110 shrink-0"
                style={{ background: RAINBOW, borderColor: (!imageActive && !videoActive && (pickerOpen || isCustomColor)) ? '#3b82f6' : '#e5e7eb' }}
                aria-label="Custom color"
              />
            </Tooltip>
          </div>
        </div>,
        document.body
      )}

      {/* Color picker popover */}
      {pickerOpen && createPortal(
        <div
          ref={pickerPopoverRef}
          style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.centerX, transform: 'translateX(-50%) translateY(-100%)', zIndex: 100000 }}
          className={`bg-white rounded-xl shadow-2xl border border-gray-200 p-3 ${verticalLightness ? 'w-60' : 'w-52'}`}
          onMouseDown={e => e.stopPropagation()}
        >
          <PickerPopup value={pickerColor} onChange={handlePickerChange} verticalLightness={verticalLightness} />
        </div>,
        document.body
      )}

      {/* Image management popover */}
      {imgMgmtOpen && createPortal(
        <div
          ref={imgMgmtPopoverRef}
          style={{ position: 'fixed', top: imgMgmtPos.top, left: imgMgmtPos.centerX, transform: 'translateX(-50%) translateY(-100%)', zIndex: 100000 }}
          className="bg-white rounded-xl shadow-2xl border border-gray-200 p-2.5"
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="flex gap-1.5">
            <Tooltip content="Upload Image">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); replaceFileInputRef.current?.click() }}
                className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
                aria-label="Replace image"
              >
                <Upload size={12} className="text-gray-500" />
              </button>
            </Tooltip>
            <Tooltip content="Delete Image">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); onImageDelete?.(); setImgMgmtOpen(false); setSwatchesOpen(false) }}
                className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors"
                aria-label="Delete image"
              >
                <Trash2 size={12} className="text-red-400" />
              </button>
            </Tooltip>
          </div>
        </div>,
        document.body
      )}

      {/* Video management popover */}
      {vidMgmtOpen && createPortal(
        <div
          ref={vidMgmtPopoverRef}
          style={{ position: 'fixed', top: vidMgmtPos.top, left: vidMgmtPos.centerX, transform: 'translateX(-50%) translateY(-100%)', zIndex: 100000 }}
          className="bg-white rounded-xl shadow-2xl border border-gray-200 p-2.5"
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="flex gap-1.5">
            <Tooltip content="Upload Video">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); videoReplaceFileInputRef.current?.click() }}
                className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
                aria-label="Replace video"
              >
                <Upload size={12} className="text-gray-500" />
              </button>
            </Tooltip>
            <Tooltip content="Delete Video">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); onVideoDelete?.(); setVidMgmtOpen(false); setSwatchesOpen(false) }}
                className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors"
                aria-label="Delete video"
              >
                <Trash2 size={12} className="text-red-400" />
              </button>
            </Tooltip>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
