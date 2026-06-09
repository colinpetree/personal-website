import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

const DEFAULT_PRESETS = ['#000000', '#ffffff', '#9ca3af', '#3b82f6']

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

function isValidHex(hex) {
  return /^#[0-9a-f]{6}$/i.test(hex)
}

export default function ColorPicker({ value = '#000000', onChange, presets = DEFAULT_PRESETS }) {
  const safe = isValidHex(value) ? value : '#000000'
  const initial = hexToHsv(safe)
  const [h, setH] = useState(initial.h)
  const [s, setS] = useState(initial.s)
  const [v, setV] = useState(initial.v)
  const [hexInput, setHexInput] = useState(safe.slice(1))
  const [open, setOpen] = useState(false)
  const [popPos, setPopPos] = useState({ top: 0, left: 0 })

  const triggerRef = useRef(null)
  const popoverRef = useRef(null)
  const svRef = useRef(null)
  const dragging = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const hRef = useRef(h)
  hRef.current = h
  const lastEmittedRef = useRef(safe)

  // Sync when value changes externally (not from our own emits)
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

  // Close popover on outside click
  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (popoverRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Global mousemove/up for SV drag
  useEffect(() => {
    function onMove(e) {
      if (!dragging.current) return
      const coords = getSVCoords(e)
      if (!coords) return
      setS(coords.s)
      setV(coords.v)
      emit(hRef.current, coords.s, coords.v)
    }
    function onUp() { dragging.current = false }
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

  function emit(newH, newS, newV) {
    const hex = hsvToHex(newH, newS, newV)
    setHexInput(hex.slice(1))
    lastEmittedRef.current = hex
    onChangeRef.current(hex)
  }

  function openPicker() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const top = rect.bottom + 6
      const left = Math.min(rect.left, window.innerWidth - 216)
      setPopPos({ top, left })
    }
    setOpen(true)
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

  function selectPreset(hex) {
    const hsv = hexToHsv(hex)
    setH(hsv.h)
    setS(hsv.s)
    setV(hsv.v)
    setHexInput(hex.slice(1))
    lastEmittedRef.current = hex
    onChangeRef.current(hex)
  }

  const currentHex = hsvToHex(h, s, v)
  const pureHue = hsvToHex(h, 100, 100)

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={e => { e.preventDefault(); open ? setOpen(false) : openPicker() }}
        className="w-5 h-5 rounded-full border-2 border-white shadow ring-1 ring-gray-300 shrink-0"
        style={{ background: currentHex }}
        aria-label="Pick color"
      />
      {open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', top: popPos.top, left: popPos.left, zIndex: 99999 }}
          className="bg-white rounded-xl shadow-2xl border border-gray-200 p-3 w-52"
          onMouseDown={e => e.stopPropagation()}
        >
          {/* Saturation / Brightness square */}
          <div
            ref={svRef}
            className="relative w-full rounded-lg overflow-hidden mb-3 select-none"
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
          <div className="flex items-center gap-1.5 mb-3">
            <div className="w-5 h-5 rounded-full border border-gray-200 shrink-0" style={{ background: currentHex }} />
            <span className="text-xs text-gray-400 font-mono">#</span>
            <input
              type="text"
              value={hexInput.toUpperCase()}
              onChange={handleHexInput}
              className="flex-1 text-xs font-mono border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
              maxLength={6}
              spellCheck={false}
            />
          </div>

          {/* Preset swatches */}
          {presets.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {presets.map(p => (
                <button
                  key={p}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); selectPreset(p) }}
                  className="w-6 h-6 rounded-full border-2 shadow-sm transition-transform hover:scale-110"
                  style={{ background: p, borderColor: currentHex.toLowerCase() === p.toLowerCase() ? '#3b82f6' : '#e5e7eb' }}
                  aria-label={p}
                />
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
