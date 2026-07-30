const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2]

// Wires up a video-figure exported with data-segment-loop="true": a settings button
// that opens a popover for Start/End (seconds) + speed, and enforces the loop bounds
// during playback since native <video loop> can't loop a sub-range of the clip.
export function setupSegmentLoopVideo(figure) {
  const video = figure.querySelector('video')
  if (!video) return null

  const state = { start: 0, end: 0, speed: 1 }

  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-label', 'Loop segment settings')
  button.className = 'absolute top-2 right-2 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors'
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>'

  const panel = document.createElement('div')
  panel.className = 'absolute top-11 right-2 z-10 hidden w-52 rounded-lg bg-white text-gray-700 shadow-xl border border-gray-200 p-3 text-sm'

  function field(labelText) {
    const wrap = document.createElement('label')
    wrap.className = 'flex items-center justify-between gap-2 mb-2'
    const label = document.createElement('span')
    label.textContent = labelText
    label.className = 'text-gray-600'
    const input = document.createElement('input')
    input.type = 'number'
    input.step = '0.1'
    input.min = '0'
    input.className = 'w-20 border border-gray-300 rounded px-1.5 py-0.5 text-right'
    wrap.appendChild(label)
    wrap.appendChild(input)
    panel.appendChild(wrap)
    return input
  }

  const startInput = field('Start (s)')
  const endInput = field('End (s)')

  const speedWrap = document.createElement('label')
  speedWrap.className = 'flex items-center justify-between gap-2'
  const speedLabel = document.createElement('span')
  speedLabel.textContent = 'Speed'
  speedLabel.className = 'text-gray-600'
  const speedSelect = document.createElement('select')
  speedSelect.className = 'border border-gray-300 rounded px-1.5 py-0.5'
  SPEED_OPTIONS.forEach(s => {
    const opt = document.createElement('option')
    opt.value = String(s)
    opt.textContent = `${s}x`
    if (s === 1) opt.selected = true
    speedSelect.appendChild(opt)
  })
  speedWrap.appendChild(speedLabel)
  speedWrap.appendChild(speedSelect)
  panel.appendChild(speedWrap)

  function clamp() {
    const duration = video.duration || state.end || 0
    let start = parseFloat(startInput.value)
    let end = parseFloat(endInput.value)
    if (!Number.isFinite(start)) start = state.start
    if (!Number.isFinite(end)) end = state.end
    start = Math.max(0, Math.min(start, duration))
    end = Math.max(0, Math.min(end, duration))
    if (end <= start) end = Math.min(duration, start + 0.1)
    state.start = start
    state.end = end
    startInput.value = start.toFixed(1)
    endInput.value = end.toFixed(1)
  }

  function applyBounds() {
    clamp()
    if (video.currentTime < state.start || video.currentTime > state.end) {
      video.currentTime = state.start
    }
  }

  startInput.addEventListener('change', applyBounds)
  endInput.addEventListener('change', applyBounds)
  speedSelect.addEventListener('change', () => {
    state.speed = parseFloat(speedSelect.value) || 1
    video.playbackRate = state.speed
  })

  function togglePanel(e) {
    e.stopPropagation()
    panel.classList.toggle('hidden')
  }
  button.addEventListener('click', togglePanel)

  function onOutsideClick(e) {
    if (panel.contains(e.target) || e.target === button) return
    panel.classList.add('hidden')
  }
  document.addEventListener('click', onOutsideClick)

  function onLoadedMetadata() {
    state.start = 0
    state.end = video.duration || 0
    startInput.value = state.start.toFixed(1)
    endInput.value = state.end.toFixed(1)
  }
  if (video.readyState >= 1 && video.duration) {
    onLoadedMetadata()
  } else {
    video.addEventListener('loadedmetadata', onLoadedMetadata)
  }

  function onTimeUpdate() {
    if (state.end > state.start && (video.currentTime >= state.end || video.currentTime < state.start)) {
      video.currentTime = state.start
    }
  }
  video.addEventListener('timeupdate', onTimeUpdate)

  figure.appendChild(button)
  figure.appendChild(panel)

  return () => {
    video.removeEventListener('loadedmetadata', onLoadedMetadata)
    video.removeEventListener('timeupdate', onTimeUpdate)
    document.removeEventListener('click', onOutsideClick)
    button.remove()
    panel.remove()
  }
}
