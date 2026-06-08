import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { DecoratorNode, $getNodeByKey, $createParagraphNode, CLICK_COMMAND, KEY_DOWN_COMMAND, COMMAND_PRIORITY_LOW, COMMAND_PRIORITY_HIGH } from 'lexical'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { AlignCenter, Maximize2, Expand, Link2, X, Music, FileText, Plus, Download, Repeat } from 'lucide-react'
import { handleUpload } from './upload'

// ─── ImageNodeComponent ───────────────────────────────────────────────────────

function ImageNodeComponent({ src, alt, caption, width, href, nodeKey, editor }) {
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [captionFocused, setCaptionFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [toolbarPos, setToolbarPos] = useState(null)
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')
  const imgRef = useRef(null)
  const figRef = useRef(null)

  const showRing = isSelected || captionFocused

  // Intercept Lexical's CLICK_COMMAND so clicking the image sets NodeSelection
  // instead of letting Lexical create a RangeSelection at the click position.
  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const el = imgRef.current
        if (el && (event.target === el || el.contains(event.target))) {
          clearSelection()
          setSelected(true)
          return true
        }
        return false
      },
      COMMAND_PRIORITY_LOW
    )
  }, [editor, setSelected, clearSelection])

  // Enter while the image node is selected inserts a paragraph after it.
  useEffect(() => {
    if (!isSelected) return
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (event.key !== 'Enter') return false
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (!node) return
          const para = $createParagraphNode()
          node.insertAfter(para)
          para.selectStart()
        })
        return true
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [isSelected, editor, nodeKey])

  // Position toolbar above the figure whenever selection or link input state changes.
  useLayoutEffect(() => {
    if (!isSelected || !figRef.current) { setToolbarPos(null); return }
    function calc() {
      const rect = figRef.current?.getBoundingClientRect()
      if (!rect) return
      const W = showLinkInput ? 380 : 200
      const H = 40
      let left = rect.left + window.scrollX + rect.width / 2 - W / 2
      left = Math.max(8, Math.min(left, window.innerWidth + window.scrollX - W - 8))
      let top = rect.top + window.scrollY - H - 8
      if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + 8
      setToolbarPos({ top, left })
    }
    calc()
    window.addEventListener('scroll', calc, true)
    window.addEventListener('resize', calc)
    return () => { window.removeEventListener('scroll', calc, true); window.removeEventListener('resize', calc) }
  }, [isSelected, showLinkInput])

  function handleCaptionChange(e) {
    const val = e.target.value
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof ImageNode) {
        node.getWritable().__caption = val
      }
    })
  }

  function setWidth(newWidth) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof ImageNode) node.getWritable().__width = newWidth
    })
  }

  function commitLink(value = linkDraft.trim()) {
    if (value && !/^https?:\/\//i.test(value)) value = 'https://' + value
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof ImageNode) node.getWritable().__href = value
    })
    setShowLinkInput(false)
  }

  const widthMaxMap = { regular: '740px', wide: '1040px', full: '100%' }

  return (
    <>
      <figure
        ref={figRef}
        style={{ maxWidth: widthMaxMap[width] ?? '740px' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`my-4 mx-auto rounded-lg overflow-hidden transition-all select-none ${showRing ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className="w-full h-auto block"
          draggable={false}
        />
        <figcaption>
          <input
            type="text"
            value={caption}
            onChange={handleCaptionChange}
            onFocus={() => setCaptionFocused(true)}
            onBlur={() => setCaptionFocused(false)}
            onClick={e => e.stopPropagation()}
            placeholder="Type caption for image (optional)"
            className="w-full text-sm text-gray-500 text-center bg-transparent border-0 outline-none py-2 px-4 placeholder-gray-400 select-text"
          />
        </figcaption>
      </figure>

      {isSelected && toolbarPos && createPortal(
        <div
          style={{ position: 'absolute', top: toolbarPos.top, left: toolbarPos.left, zIndex: 9999 }}
          className="flex items-center gap-0.5 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 shadow-2xl"
          onMouseDown={e => e.preventDefault()}
        >
          {[
            { key: 'regular', icon: AlignCenter, title: 'Regular width' },
            { key: 'wide',    icon: Maximize2,   title: 'Wide' },
            { key: 'full',    icon: Expand,      title: 'Full width' },
          ].map(({ key: w, icon: Icon, title }) => (
            <button
              key={w}
              title={title}
              onMouseDown={e => { e.preventDefault(); setWidth(w) }}
              className={`p-1.5 rounded transition-colors ${
                width === w ? 'text-white bg-white/20' : 'text-gray-300 hover:text-white hover:bg-white/15'
              }`}
            >
              <Icon size={14} strokeWidth={2} />
            </button>
          ))}

          <div className="w-px h-4 bg-gray-600 mx-1" />

          <button
            title="Link"
            onMouseDown={e => { e.preventDefault(); setLinkDraft(href); setShowLinkInput(v => !v) }}
            className={`p-1.5 rounded transition-colors ${
              href ? 'text-blue-400 bg-white/10' : 'text-gray-300 hover:text-white hover:bg-white/15'
            }`}
          >
            <Link2 size={14} strokeWidth={2} />
          </button>

          {showLinkInput && (
            <div className="flex items-center gap-1 ml-1">
              <input
                autoFocus
                type="text"
                value={linkDraft}
                onChange={e => setLinkDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitLink() }
                  if (e.key === 'Escape') setShowLinkInput(false)
                }}
                placeholder="https://..."
                className="text-xs bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 w-44 outline-none focus:border-blue-500"
                onClick={e => e.stopPropagation()}
              />
              {href && (
                <button
                  title="Remove link"
                  onMouseDown={e => { e.preventDefault(); commitLink('') }}
                  className="text-gray-400 hover:text-red-400 p-1 rounded transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

// ─── ImageNode ────────────────────────────────────────────────────────────────

export class ImageNode extends DecoratorNode {
  static getType() { return 'image' }
  static clone(node) { return new ImageNode(node.__src, node.__alt, node.__caption, node.__width, node.__href, node.__key) }

  static importJSON(data) {
    return new ImageNode(data.src, data.alt || '', data.caption || '', data.width || 'regular', data.href || '')
  }
  exportJSON() {
    return { type: 'image', version: 1, src: this.__src, alt: this.__alt, caption: this.__caption, width: this.__width, href: this.__href }
  }

  static importDOM() {
    return {
      // Intercept <a> tags that wrap a <figure> before LinkNode claims them.
      // Returning null conversion skips the <a> element itself and lets its
      // children be processed — the figure handler below then picks up the href.
      a: (domNode) => {
        if (!domNode.querySelector(':scope > figure')) return null
        return { conversion: () => null, priority: 4 }
      },
      figure: () => ({
        conversion: (domNode) => {
          const img = domNode.querySelector('img')
          if (!img) return null
          const figcaption = domNode.querySelector('figcaption')
          const caption = figcaption?.textContent?.trim() || ''
          const width = domNode.getAttribute('data-width') || 'regular'
          const parent = domNode.parentElement
          const href = (parent?.tagName === 'A') ? (parent.getAttribute('href') || '') : ''
          return { node: new ImageNode(img.getAttribute('src') || '', img.getAttribute('alt') || '', caption, width, href) }
        },
        priority: 1,
      }),
      img: () => ({
        conversion: (domNode) => {
          if (!(domNode instanceof HTMLImageElement)) return null
          return { node: new ImageNode(domNode.getAttribute('src') || '', domNode.getAttribute('alt') || '', '') }
        },
        priority: 0,
      }),
    }
  }

  constructor(src, alt = '', caption = '', width = 'regular', href = '', key) {
    super(key)
    this.__src = src
    this.__alt = alt
    this.__caption = caption
    this.__width = width
    this.__href = href
  }

  createDOM() {
    const span = document.createElement('span')
    span.style.display = 'contents'
    return span
  }
  updateDOM() { return false }
  isInline() { return false }

  exportDOM() {
    if (!this.__src) return { element: null }

    const img = document.createElement('img')
    img.setAttribute('src', this.__src)
    img.setAttribute('alt', this.__alt)
    img.style.cssText = 'width:100%;height:auto;display:block;margin:0'

    const figure = document.createElement('figure')
    figure.setAttribute('data-width', this.__width || 'regular')
    figure.style.borderRadius = '0.5rem'
    figure.style.overflow = 'hidden'

    if (this.__width === 'wide') {
      figure.style.cssText += ';width:min(1040px,100vw);position:relative;left:50%;transform:translateX(-50%);margin:1.5rem 0;border-radius:0.5rem;overflow:hidden'
    } else if (this.__width === 'full') {
      figure.style.cssText += ';width:100vw;position:relative;left:50%;transform:translateX(-50%);margin:1.5rem 0;border-radius:0;overflow:hidden'
    } else {
      figure.style.cssText += ';max-width:740px;margin:1.5rem auto;border-radius:0.5rem;overflow:hidden'
    }

    figure.appendChild(img)

    if (this.__caption) {
      const figcaption = document.createElement('figcaption')
      figcaption.textContent = this.__caption
      figure.appendChild(figcaption)
    }

    if (this.__href) {
      const a = document.createElement('a')
      a.setAttribute('href', this.__href)
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
      a.appendChild(figure)
      return { element: a }
    }
    return { element: figure }
  }

  decorate(editor) {
    return (
      <ImageNodeComponent
        src={this.__src}
        alt={this.__alt}
        caption={this.__caption}
        width={this.__width}
        href={this.__href}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createImageNode(src, alt = '', caption = '') {
  return new ImageNode(src, alt, caption)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(seconds) {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── VideoNodeComponent ───────────────────────────────────────────────────────

function VideoNodeComponent({ src, caption, width, loop, nodeKey, editor }) {
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [captionFocused, setCaptionFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [toolbarPos, setToolbarPos] = useState(null)
  const figRef = useRef(null)

  const showRing = isSelected || captionFocused

  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const el = figRef.current
        if (!el || !el.contains(event.target)) return false
        if (event.target.tagName === 'INPUT') return false
        clearSelection()
        setSelected(true)
        return true
      },
      COMMAND_PRIORITY_LOW
    )
  }, [editor, setSelected, clearSelection])

  useEffect(() => {
    if (!isSelected) return
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (event.key !== 'Enter') return false
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (!node) return
          const para = $createParagraphNode()
          node.insertAfter(para)
          para.selectStart()
        })
        return true
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [isSelected, editor, nodeKey])

  useLayoutEffect(() => {
    if (!isSelected || !figRef.current) { setToolbarPos(null); return }
    function calc() {
      const rect = figRef.current?.getBoundingClientRect()
      if (!rect) return
      const W = 170
      const H = 40
      let left = rect.left + window.scrollX + rect.width / 2 - W / 2
      left = Math.max(8, Math.min(left, window.innerWidth + window.scrollX - W - 8))
      let top = rect.top + window.scrollY - H - 8
      if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + 8
      setToolbarPos({ top, left })
    }
    calc()
    window.addEventListener('scroll', calc, true)
    window.addEventListener('resize', calc)
    return () => { window.removeEventListener('scroll', calc, true); window.removeEventListener('resize', calc) }
  }, [isSelected])

  function handleCaptionChange(e) {
    const val = e.target.value
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof VideoNode) node.getWritable().__caption = val
    })
  }

  function setWidth(newWidth) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof VideoNode) node.getWritable().__width = newWidth
    })
  }

  function toggleLoop() {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof VideoNode) node.getWritable().__loop = !node.__loop
    })
  }

  const widthMaxMap = { regular: '740px', wide: '1040px', full: '100%' }

  return (
    <>
      <figure
        ref={figRef}
        style={{ maxWidth: widthMaxMap[width] ?? '740px' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`my-4 mx-auto rounded-lg overflow-hidden transition-all select-none ${showRing ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}
      >
        <video src={src} controls loop={loop || undefined} className="w-full block bg-black" />
        <figcaption>
          <input
            type="text"
            value={caption}
            onChange={handleCaptionChange}
            onFocus={() => setCaptionFocused(true)}
            onBlur={() => setCaptionFocused(false)}
            onClick={e => e.stopPropagation()}
            placeholder="Type caption for video (optional)"
            className="w-full text-sm text-gray-500 text-center bg-transparent border-0 outline-none py-2 px-4 placeholder-gray-400 select-text"
          />
        </figcaption>
      </figure>

      {isSelected && toolbarPos && createPortal(
        <div
          style={{ position: 'absolute', top: toolbarPos.top, left: toolbarPos.left, zIndex: 9999 }}
          className="flex items-center gap-0.5 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 shadow-2xl"
          onMouseDown={e => e.preventDefault()}
        >
          {[
            { key: 'regular', icon: AlignCenter, title: 'Regular width' },
            { key: 'wide',    icon: Maximize2,   title: 'Wide' },
            { key: 'full',    icon: Expand,      title: 'Full width' },
          ].map(({ key: w, icon: Icon, title }) => (
            <button
              key={w}
              title={title}
              onMouseDown={e => { e.preventDefault(); setWidth(w) }}
              className={`p-1.5 rounded transition-colors ${
                width === w ? 'text-white bg-white/20' : 'text-gray-300 hover:text-white hover:bg-white/15'
              }`}
            >
              <Icon size={14} strokeWidth={2} />
            </button>
          ))}
          <div className="w-px h-4 bg-gray-600 mx-1" />
          <button
            title="Loop"
            onMouseDown={e => { e.preventDefault(); toggleLoop() }}
            className={`p-1.5 rounded transition-colors ${
              loop ? 'text-white bg-white/20' : 'text-gray-300 hover:text-white hover:bg-white/15'
            }`}
          >
            <Repeat size={14} strokeWidth={2} />
          </button>
        </div>,
        document.body
      )}
    </>
  )
}

// ─── VideoNode ────────────────────────────────────────────────────────────────

export class VideoNode extends DecoratorNode {
  static getType() { return 'video' }
  static clone(node) {
    return new VideoNode(node.__src, node.__caption, node.__width, node.__loop, node.__thumbnailSrc, node.__key)
  }

  static importJSON(data) {
    return new VideoNode(data.src, data.caption || '', data.width || 'regular', data.loop || false, data.thumbnailSrc || '')
  }
  exportJSON() {
    return { type: 'video', version: 1, src: this.__src, caption: this.__caption, width: this.__width, loop: this.__loop, thumbnailSrc: this.__thumbnailSrc }
  }

  static importDOM() {
    return {
      video: () => ({
        conversion: (domNode) => {
          if (!(domNode instanceof HTMLVideoElement)) return null
          const figure = domNode.closest('figure')
          const caption = figure?.querySelector('figcaption')?.textContent?.trim() || ''
          const widthClass = figure?.className?.match(/kg-width-(\w+)/)?.[1] || 'regular'
          return { node: new VideoNode(domNode.getAttribute('src') || '', caption, widthClass, domNode.hasAttribute('loop')) }
        },
        priority: 1,
      }),
    }
  }

  constructor(src, caption = '', width = 'regular', loop = false, thumbnailSrc = '', key) {
    super(key)
    this.__src = src
    this.__caption = caption
    this.__width = width
    this.__loop = loop
    this.__thumbnailSrc = thumbnailSrc
  }

  createDOM() {
    const span = document.createElement('span')
    span.style.display = 'contents'
    return span
  }
  updateDOM() { return false }
  isInline() { return false }

  exportDOM() {
    if (!this.__src) return { element: null }
    const video = document.createElement('video')
    video.setAttribute('src', this.__src)
    video.setAttribute('controls', '')
    if (this.__loop) video.setAttribute('loop', '')
    if (this.__thumbnailSrc) video.setAttribute('poster', this.__thumbnailSrc)
    video.style.cssText = 'width:100%;display:block'

    const figure = document.createElement('figure')
    figure.className = `kg-width-${this.__width || 'regular'}`
    if (this.__width === 'wide') {
      figure.style.cssText = 'width:min(1040px,100vw);position:relative;left:50%;transform:translateX(-50%);margin:1.5rem 0;border-radius:0.5rem;overflow:hidden;background:#000'
    } else if (this.__width === 'full') {
      figure.style.cssText = 'width:100vw;position:relative;left:50%;transform:translateX(-50%);margin:1.5rem 0;border-radius:0;overflow:hidden;background:#000'
    } else {
      figure.style.cssText = 'max-width:740px;margin:1.5rem auto;border-radius:0.5rem;overflow:hidden;background:#000'
    }
    figure.appendChild(video)
    if (this.__caption) {
      const figcaption = document.createElement('figcaption')
      figcaption.textContent = this.__caption
      figure.appendChild(figcaption)
    }
    return { element: figure }
  }

  decorate(editor) {
    return (
      <VideoNodeComponent
        src={this.__src}
        caption={this.__caption}
        width={this.__width}
        loop={this.__loop}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createVideoNode(src, caption = '') {
  return new VideoNode(src, caption)
}

// ─── AudioNodeComponent ───────────────────────────────────────────────────────

function AudioNodeComponent({ src, filename, title, duration, thumbnailSrc, nodeKey, editor }) {
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [isHovered, setIsHovered] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const el = containerRef.current
        if (!el || !el.contains(event.target)) return false
        clearSelection()
        setSelected(true)
        return true
      },
      COMMAND_PRIORITY_LOW
    )
  }, [editor, setSelected, clearSelection])

  useEffect(() => {
    if (!isSelected) return
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (event.key !== 'Enter') return false
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (!node) return
          const para = $createParagraphNode()
          node.insertAfter(para)
          para.selectStart()
        })
        return true
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [isSelected, editor, nodeKey])

  const displayName = title || filename || 'Audio'
  const durationStr = formatDuration(duration)

  return (
    <>
      <div
        ref={containerRef}
        style={{ maxWidth: '740px' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`my-4 mx-auto flex items-center gap-3 p-3 bg-gray-50 border rounded-lg transition-all select-none ${
          isSelected ? 'ring-2 ring-blue-500 border-transparent' : isHovered ? 'ring-1 ring-blue-300 border-transparent' : 'border-gray-200'
        }`}
      >
        {thumbnailSrc ? (
          <img src={thumbnailSrc} alt="" className="shrink-0 w-12 h-12 object-cover rounded-lg" draggable={false} />
        ) : (
          <div className="shrink-0 w-9 h-9 flex items-center justify-center bg-gray-200 rounded-full text-gray-500">
            <Music size={16} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-700 truncate mb-1">
            {displayName}
            {durationStr && <span className="ml-2 text-xs text-gray-400 font-normal">{durationStr}</span>}
          </p>
          <audio controls src={src} className="w-full" style={{ height: '32px' }} />
        </div>
      </div>
    </>
  )
}

// ─── AudioNode ────────────────────────────────────────────────────────────────

export class AudioNode extends DecoratorNode {
  static getType() { return 'audio' }
  static clone(node) {
    return new AudioNode(node.__src, node.__filename, node.__title, node.__duration, node.__thumbnailSrc, node.__key)
  }

  static importJSON(data) {
    return new AudioNode(data.src, data.filename || '', data.title || '', data.duration || 0, data.thumbnailSrc || '')
  }
  exportJSON() {
    return { type: 'audio', version: 1, src: this.__src, filename: this.__filename, title: this.__title, duration: this.__duration, thumbnailSrc: this.__thumbnailSrc }
  }

  static importDOM() {
    return {
      audio: () => ({
        conversion: (domNode) => {
          if (!(domNode instanceof HTMLAudioElement)) return null
          const figure = domNode.closest('figure.audio-player')
          const figcaption = figure?.querySelector('figcaption')
          return { node: new AudioNode(domNode.getAttribute('src') || '', figcaption?.textContent?.trim() || '') }
        },
        priority: 1,
      }),
    }
  }

  constructor(src, filename = '', title = '', duration = 0, thumbnailSrc = '', key) {
    super(key)
    this.__src = src
    this.__filename = filename
    this.__title = title
    this.__duration = duration
    this.__thumbnailSrc = thumbnailSrc
  }

  createDOM() {
    const span = document.createElement('span')
    span.style.display = 'contents'
    return span
  }
  updateDOM() { return false }
  isInline() { return false }

  exportDOM() {
    if (!this.__src) return { element: null }
    const figure = document.createElement('figure')
    figure.className = 'audio-player'
    figure.style.cssText = 'margin:1.5rem 0'
    const audio = document.createElement('audio')
    audio.setAttribute('src', this.__src)
    audio.setAttribute('controls', '')
    audio.style.cssText = 'width:100%'
    figure.appendChild(audio)
    const displayName = this.__title || this.__filename
    if (displayName) {
      const figcaption = document.createElement('figcaption')
      figcaption.textContent = displayName
      figure.appendChild(figcaption)
    }
    return { element: figure }
  }

  decorate(editor) {
    return (
      <AudioNodeComponent
        src={this.__src}
        filename={this.__filename}
        title={this.__title}
        duration={this.__duration}
        thumbnailSrc={this.__thumbnailSrc}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createAudioNode(src, filename = '') {
  return new AudioNode(src, filename)
}

// ─── FileNodeComponent ────────────────────────────────────────────────────────

function FileNodeComponent({ src, filename, mimeType, size, title, description, nodeKey, editor }) {
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [inputFocused, setInputFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const containerRef = useRef(null)

  const showRing = isSelected || inputFocused

  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const el = containerRef.current
        if (!el || !el.contains(event.target)) return false
        if (event.target.tagName === 'A' || event.target.tagName === 'INPUT') return false
        clearSelection()
        setSelected(true)
        return true
      },
      COMMAND_PRIORITY_LOW
    )
  }, [editor, setSelected, clearSelection])

  useEffect(() => {
    if (!isSelected) return
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (event.key !== 'Enter') return false
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (!node) return
          const para = $createParagraphNode()
          node.insertAfter(para)
          para.selectStart()
        })
        return true
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [isSelected, editor, nodeKey])

  function handleTitleChange(e) {
    const val = e.target.value.slice(0, 80)
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof FileNode) node.getWritable().__title = val
    })
  }

  function handleDescriptionChange(e) {
    const val = e.target.value.slice(0, 100)
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof FileNode) node.getWritable().__description = val
    })
  }

  const ext = filename && filename.includes('.') ? filename.split('.').pop().toUpperCase() : 'FILE'
  const sizeStr = formatFileSize(size)

  return (
    <div
      ref={containerRef}
      style={{ maxWidth: '740px' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`my-4 mx-auto flex items-start gap-3 p-3 bg-gray-50 border rounded-lg transition-all select-none ${
        showRing ? 'ring-2 ring-blue-500 border-transparent' : isHovered ? 'ring-1 ring-blue-300 border-transparent' : 'border-gray-200'
      }`}
    >
      <div className="shrink-0 w-9 h-9 flex items-center justify-center bg-blue-100 rounded-lg text-blue-600 mt-0.5">
        <FileText size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onClick={e => e.stopPropagation()}
          placeholder={filename || 'File title'}
          maxLength={80}
          className="w-full text-sm font-medium text-gray-800 bg-transparent border-0 outline-none placeholder-gray-400 select-text"
        />
        <input
          type="text"
          value={description}
          onChange={handleDescriptionChange}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onClick={e => e.stopPropagation()}
          placeholder="Add optional file description"
          maxLength={100}
          className="w-full text-xs text-gray-500 bg-transparent border-0 outline-none mt-0.5 placeholder-gray-400 select-text"
        />
        <p className="text-xs text-gray-400 mt-1">{ext}{sizeStr ? ` · ${sizeStr}` : ''}</p>
      </div>
      <a
        href={src}
        download={filename || undefined}
        onClick={e => e.stopPropagation()}
        className="shrink-0 p-2 text-gray-400 hover:text-gray-600 rounded transition-colors select-auto"
        title="Download"
      >
        <Download size={16} />
      </a>
    </div>
  )
}

// ─── FileNode ─────────────────────────────────────────────────────────────────

export class FileNode extends DecoratorNode {
  static getType() { return 'file' }
  static clone(node) {
    return new FileNode(node.__src, node.__filename, node.__mimeType, node.__size, node.__title, node.__description, node.__key)
  }

  static importJSON(data) {
    return new FileNode(data.src, data.filename || '', data.mimeType || '', data.size || 0, data.title || '', data.description || '')
  }
  exportJSON() {
    return { type: 'file', version: 1, src: this.__src, filename: this.__filename, mimeType: this.__mimeType, size: this.__size, title: this.__title, description: this.__description }
  }

  constructor(src, filename = '', mimeType = '', size = 0, title = '', description = '', key) {
    super(key)
    this.__src = src
    this.__filename = filename
    this.__mimeType = mimeType
    this.__size = size
    this.__title = title
    this.__description = description
  }

  createDOM() {
    const span = document.createElement('span')
    span.style.display = 'contents'
    return span
  }
  updateDOM() { return false }
  isInline() { return false }

  exportDOM() {
    if (!this.__src) return { element: null }
    const a = document.createElement('a')
    a.className = 'file-attachment'
    a.setAttribute('href', this.__src)
    if (this.__filename) a.setAttribute('download', this.__filename)
    a.style.cssText = 'display:flex;align-items:center;gap:0.75rem;padding:0.75rem;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0.5rem;margin:1.5rem 0;text-decoration:none;color:inherit'
    const textWrap = document.createElement('div')
    textWrap.style.cssText = 'min-width:0;flex:1'
    const nameEl = document.createElement('span')
    nameEl.textContent = this.__title || this.__filename || 'Download file'
    nameEl.style.cssText = 'font-size:0.875rem;font-weight:500;color:#1d4ed8;display:block'
    textWrap.appendChild(nameEl)
    if (this.__description) {
      const descEl = document.createElement('span')
      descEl.textContent = this.__description
      descEl.style.cssText = 'font-size:0.75rem;color:#6b7280;display:block;margin-top:2px'
      textWrap.appendChild(descEl)
    }
    if (this.__size) {
      const sizeEl = document.createElement('span')
      sizeEl.textContent = formatFileSize(this.__size)
      sizeEl.style.cssText = 'font-size:0.75rem;color:#9ca3af;display:block;margin-top:2px'
      textWrap.appendChild(sizeEl)
    }
    a.appendChild(textWrap)
    return { element: a }
  }

  decorate(editor) {
    return (
      <FileNodeComponent
        src={this.__src}
        filename={this.__filename}
        mimeType={this.__mimeType}
        size={this.__size}
        title={this.__title}
        description={this.__description}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createFileNode(src, filename = '', mimeType = '', size = 0) {
  return new FileNode(src, filename, mimeType, size)
}

// ─── GalleryNodeComponent ─────────────────────────────────────────────────────

function GalleryNodeComponent({ images, caption, nodeKey, editor }) {
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [captionFocused, setCaptionFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const containerRef = useRef(null)
  const addFileRef = useRef(null)

  const showRing = isSelected || captionFocused

  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const el = containerRef.current
        if (!el || !el.contains(event.target)) return false
        if (event.target.tagName === 'INPUT') return false
        clearSelection()
        setSelected(true)
        return true
      },
      COMMAND_PRIORITY_LOW
    )
  }, [editor, setSelected, clearSelection])

  useEffect(() => {
    if (!isSelected) return
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (event.key !== 'Enter') return false
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (!node) return
          const para = $createParagraphNode()
          node.insertAfter(para)
          para.selectStart()
        })
        return true
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [isSelected, editor, nodeKey])

  function removeImage(index) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof GalleryNode) {
        const w = node.getWritable()
        w.__images = w.__images.filter((_, i) => i !== index)
      }
    })
  }

  function handleCaptionChange(e) {
    const val = e.target.value
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof GalleryNode) node.getWritable().__caption = val
    })
  }

  async function handleAddImages(e) {
    const remaining = 9 - images.length
    const files = [...(e.target.files || [])].slice(0, remaining)
    e.target.value = ''
    if (!files.length) return
    for (const file of files) {
      try {
        const filename = await handleUpload(file)
        const newSrc = `/api/uploads/${filename}`
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (node instanceof GalleryNode) {
            const w = node.getWritable()
            w.__images = [...w.__images, { src: newSrc, alt: '' }]
          }
        })
      } catch {
        // skip failed individual uploads
      }
    }
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`my-4 rounded-lg overflow-hidden transition-all ${showRing ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}
    >
      <div className="grid grid-cols-3 gap-1">
        {images.map((img, i) => (
          <div key={i} className="relative aspect-square overflow-hidden bg-gray-100 group">
            <img src={img.src} alt={img.alt} className="w-full h-full object-cover" draggable={false} />
            <button
              onMouseDown={e => { e.preventDefault(); removeImage(i) }}
              className="absolute top-1 right-1 w-5 h-5 bg-gray-900/70 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={10} />
            </button>
          </div>
        ))}
        {images.length < 9 && (
          <button
            onMouseDown={e => { e.preventDefault(); addFileRef.current?.click() }}
            className="aspect-square flex flex-col items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-500 transition-colors"
          >
            <Plus size={20} />
            <span className="text-xs mt-1">Add image</span>
          </button>
        )}
      </div>
      <input ref={addFileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAddImages} />
      <input
        type="text"
        value={caption}
        onChange={handleCaptionChange}
        onFocus={() => setCaptionFocused(true)}
        onBlur={() => setCaptionFocused(false)}
        onClick={e => e.stopPropagation()}
        placeholder="Type caption for gallery (optional)"
        className="w-full text-sm text-gray-500 text-center bg-transparent border-0 outline-none py-2 px-4 placeholder-gray-400 select-text"
      />
    </div>
  )
}

// ─── GalleryNode ──────────────────────────────────────────────────────────────

export class GalleryNode extends DecoratorNode {
  static getType() { return 'gallery' }
  static clone(node) {
    return new GalleryNode(node.__images.map(img => ({ ...img })), node.__caption, node.__key)
  }

  static importJSON(data) {
    return new GalleryNode(data.images || [], data.caption || '')
  }
  exportJSON() {
    return { type: 'gallery', version: 1, images: this.__images, caption: this.__caption }
  }

  static importDOM() {
    return {
      figure: (domNode) => {
        if (!domNode.classList?.contains('gallery')) return null
        return {
          conversion: (domNode) => {
            const imgs = [...domNode.querySelectorAll('img')]
            const images = imgs.map(img => ({ src: img.getAttribute('src') || '', alt: img.getAttribute('alt') || '' }))
            const caption = domNode.querySelector('figcaption')?.textContent?.trim() || ''
            return { node: new GalleryNode(images, caption) }
          },
          priority: 2,
        }
      },
    }
  }

  constructor(images = [], caption = '', key) {
    super(key)
    this.__images = images
    this.__caption = caption
  }

  createDOM() {
    const span = document.createElement('span')
    span.style.display = 'contents'
    return span
  }
  updateDOM() { return false }
  isInline() { return false }

  exportDOM() {
    if (!this.__images.length) return { element: null }
    const figure = document.createElement('figure')
    figure.className = 'gallery'
    figure.style.cssText = 'margin:1.5rem 0'
    const grid = document.createElement('div')
    grid.className = 'gallery-grid'
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px;border-radius:0.5rem;overflow:hidden'
    for (const img of this.__images) {
      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'aspect-ratio:1;overflow:hidden;background:#f3f4f6'
      const imgEl = document.createElement('img')
      imgEl.setAttribute('src', img.src)
      imgEl.setAttribute('alt', img.alt || '')
      imgEl.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block'
      wrapper.appendChild(imgEl)
      grid.appendChild(wrapper)
    }
    figure.appendChild(grid)
    if (this.__caption) {
      const figcaption = document.createElement('figcaption')
      figcaption.textContent = this.__caption
      figure.appendChild(figcaption)
    }
    return { element: figure }
  }

  decorate(editor) {
    return (
      <GalleryNodeComponent
        images={this.__images}
        caption={this.__caption}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createGalleryNode(images = [], caption = '') {
  return new GalleryNode(images, caption)
}
