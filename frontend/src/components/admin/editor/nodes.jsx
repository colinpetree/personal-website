import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { createEditor, DecoratorNode, $getNodeByKey, $getRoot, $createParagraphNode, CLICK_COMMAND, KEY_DOWN_COMMAND, COMMAND_PRIORITY_LOW, COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_CRITICAL, $createNodeSelection, $setSelection } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { LexicalNestedComposer } from '@lexical/react/LexicalNestedComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { LinkNode } from '@lexical/link'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { AlignLeft, AlignCenter, AlignJustify, Maximize2, Expand, Link2, X, Music, FileText, Plus, Download, Repeat, ChevronDown, Copy, Check } from 'lucide-react'
import ColorPicker from '../../ui/ColorPicker'
import Picker from '@emoji-mart/react'
import emojiData from '@emoji-mart/data'
import { handleUpload } from './upload'
import { FloatingToolbarPlugin } from './plugins'
import { Tooltip } from '../../ui/Tooltip'

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
            <Tooltip key={w} content={title}>
              <button
                onMouseDown={e => { e.preventDefault(); setWidth(w) }}
                className={`p-1.5 rounded transition-colors ${
                  width === w ? 'text-white bg-white/20' : 'text-gray-300 hover:text-white hover:bg-white/15'
                }`}
              >
                <Icon size={14} strokeWidth={2} />
              </button>
            </Tooltip>
          ))}

          <div className="w-px h-4 bg-gray-600 mx-1" />

          <Tooltip content="Link">
            <button
              onMouseDown={e => { e.preventDefault(); setLinkDraft(href); setShowLinkInput(v => !v) }}
              className={`p-1.5 rounded transition-colors ${
                href ? 'text-blue-400 bg-white/10' : 'text-gray-300 hover:text-white hover:bg-white/15'
              }`}
            >
              <Link2 size={14} strokeWidth={2} />
            </button>
          </Tooltip>

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
                <Tooltip content="Remove link">
                  <button
                    onMouseDown={e => { e.preventDefault(); commitLink('') }}
                    className="text-gray-400 hover:text-red-400 p-1 rounded transition-colors"
                  >
                    <X size={12} />
                  </button>
                </Tooltip>
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
            <Tooltip key={w} content={title}>
              <button
                onMouseDown={e => { e.preventDefault(); setWidth(w) }}
                className={`p-1.5 rounded transition-colors ${
                  width === w ? 'text-white bg-white/20' : 'text-gray-300 hover:text-white hover:bg-white/15'
                }`}
              >
                <Icon size={14} strokeWidth={2} />
              </button>
            </Tooltip>
          ))}
          <div className="w-px h-4 bg-gray-600 mx-1" />
          <Tooltip content="Loop">
            <button
              onMouseDown={e => { e.preventDefault(); toggleLoop() }}
              className={`p-1.5 rounded transition-colors ${
                loop ? 'text-white bg-white/20' : 'text-gray-300 hover:text-white hover:bg-white/15'
              }`}
            >
              <Repeat size={14} strokeWidth={2} />
            </button>
          </Tooltip>
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
    if (this.__loop) {
      video.setAttribute('autoplay', '')
      video.setAttribute('muted', '')
      video.setAttribute('loop', '')
      video.setAttribute('playsinline', '')
    } else {
      video.setAttribute('controls', '')
      if (this.__thumbnailSrc) video.setAttribute('poster', this.__thumbnailSrc)
    }
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
          <audio controls controlsList="nodownload noplaybackrate" src={src} className="w-full" style={{ height: '32px' }} />
        </div>
        {displayName && (
          <Tooltip content="Download" side="left">
            <a
              href={`${src}?name=${encodeURIComponent(displayName)}`}
              download={displayName}
              onClick={e => e.stopPropagation()}
              className="shrink-0 p-2 text-gray-400 hover:text-gray-600 rounded transition-colors select-auto"
            >
              <Download size={16} />
            </a>
          </Tooltip>
        )}
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
      figure: () => ({
        conversion: (domNode) => {
          if (!domNode.classList.contains('audio-player')) return null
          const audio = domNode.querySelector('audio')
          if (!audio) return null
          const src = domNode.getAttribute('data-src') || audio.getAttribute('src') || ''
          const filename = domNode.getAttribute('data-filename') || ''
          const title = domNode.getAttribute('data-title') || domNode.querySelector('figcaption')?.textContent?.trim() || ''
          const duration = parseFloat(domNode.getAttribute('data-duration') || '0')
          const thumbnailSrc = domNode.getAttribute('data-thumbnail-src') || ''
          return { node: new AudioNode(src, filename, title, duration, thumbnailSrc) }
        },
        priority: 1,
      }),
      audio: () => ({
        conversion: (domNode) => {
          if (!(domNode instanceof HTMLAudioElement)) return null
          if (domNode.closest('figure.audio-player')) return null
          return { node: new AudioNode(domNode.getAttribute('src') || '', '') }
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
    const displayName = this.__title || this.__filename
    const durationStr = formatDuration(this.__duration)

    const figure = document.createElement('figure')
    figure.className = 'audio-player'
    figure.setAttribute('data-src', this.__src)
    figure.setAttribute('data-filename', this.__filename)
    figure.setAttribute('data-title', this.__title)
    figure.setAttribute('data-duration', String(this.__duration))
    if (this.__thumbnailSrc) figure.setAttribute('data-thumbnail-src', this.__thumbnailSrc)
    figure.style.cssText = 'max-width:740px;margin:1rem auto;display:flex;align-items:center;gap:0.75rem;padding:0.75rem;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0.5rem'

    // Thumbnail or music icon
    if (this.__thumbnailSrc) {
      const img = document.createElement('img')
      img.setAttribute('src', this.__thumbnailSrc)
      img.setAttribute('alt', '')
      img.style.cssText = 'flex-shrink:0;width:3rem;height:3rem;object-fit:cover;border-radius:0.5rem'
      figure.appendChild(img)
    } else {
      const iconWrap = document.createElement('div')
      iconWrap.style.cssText = 'flex-shrink:0;width:2.25rem;height:2.25rem;display:flex;align-items:center;justify-content:center;background:#e5e7eb;border-radius:9999px;color:#6b7280'
      iconWrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
      figure.appendChild(iconWrap)
    }

    // Center: title + audio controls
    const center = document.createElement('div')
    center.style.cssText = 'min-width:0;flex:1'
    if (displayName) {
      const nameEl = document.createElement('p')
      nameEl.style.cssText = 'font-size:0.875rem;font-weight:500;color:#374151;margin:0 0 0.25rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
      nameEl.textContent = displayName
      if (durationStr) {
        const dur = document.createElement('span')
        dur.style.cssText = 'font-size:0.75rem;color:#9ca3af;font-weight:normal;margin-left:0.5rem'
        dur.textContent = durationStr
        nameEl.appendChild(dur)
      }
      center.appendChild(nameEl)
    }
    const audio = document.createElement('audio')
    audio.setAttribute('src', this.__src)
    audio.setAttribute('controls', '')
    audio.setAttribute('controlsList', 'nodownload noplaybackrate')
    audio.style.cssText = 'width:100%;height:32px'
    center.appendChild(audio)
    figure.appendChild(center)

    // Download button
    if (displayName) {
      const dl = document.createElement('a')
      dl.setAttribute('href', `${this.__src}?name=${encodeURIComponent(displayName)}`)
      dl.setAttribute('download', displayName)
      dl.style.cssText = 'flex-shrink:0;padding:0.5rem;color:#9ca3af;border-radius:0.25rem;text-decoration:none;display:flex;align-items:center;justify-content:center'
      dl.setAttribute('title', 'Download')
      dl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
      figure.appendChild(dl)
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
      <Tooltip content="Download" side="left">
        <a
          href={(() => { const n = title || filename; return n ? `${src}?name=${encodeURIComponent(n)}` : src })()}
          download={title || filename || undefined}
          onClick={e => e.stopPropagation()}
          className="shrink-0 p-2 text-gray-400 hover:text-gray-600 rounded transition-colors select-auto"
        >
          <Download size={16} />
        </a>
      </Tooltip>
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

  static importDOM() {
    return {
      div: (node) => {
        if (!node.classList?.contains('file-attachment')) return null
        return {
          conversion: (domNode) => {
            const src = domNode.getAttribute('data-src') || ''
            if (!src) return null
            return { node: new FileNode(
              src,
              domNode.getAttribute('data-filename') || '',
              domNode.getAttribute('data-mime-type') || '',
              parseInt(domNode.getAttribute('data-size') || '0', 10),
              domNode.getAttribute('data-title') || '',
              domNode.getAttribute('data-description') || '',
            )}
          },
          priority: 2,
        }
      },
      a: (node) => {
        if (!node.classList?.contains('file-attachment')) return null
        return {
          conversion: (domNode) => {
            const href = domNode.getAttribute('href') || ''
            const src = href.split('?')[0]
            if (!src) return null
            const filename = domNode.getAttribute('download') || ''
            const title = domNode.querySelector('span')?.textContent?.trim() || filename
            return { node: new FileNode(src, filename, '', 0, title, '') }
          },
          priority: 2,
        }
      },
    }
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
    const friendlyName = this.__title || this.__filename
    const ext = this.__filename?.includes('.') ? this.__filename.split('.').pop().toUpperCase() : 'FILE'
    const sizeStr = formatFileSize(this.__size)

    const wrap = document.createElement('div')
    wrap.className = 'file-attachment'
    wrap.setAttribute('data-src', this.__src)
    wrap.setAttribute('data-filename', this.__filename)
    wrap.setAttribute('data-mime-type', this.__mimeType)
    wrap.setAttribute('data-size', String(this.__size))
    wrap.setAttribute('data-title', this.__title)
    wrap.setAttribute('data-description', this.__description)
    wrap.style.cssText = 'max-width:740px;margin:1rem auto;display:flex;align-items:flex-start;gap:0.75rem;padding:0.75rem;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0.5rem'

    const iconWrap = document.createElement('div')
    iconWrap.style.cssText = 'flex-shrink:0;width:2.25rem;height:2.25rem;display:flex;align-items:center;justify-content:center;background:#dbeafe;border-radius:0.5rem;color:#2563eb;margin-top:2px'
    iconWrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'
    wrap.appendChild(iconWrap)

    const center = document.createElement('div')
    center.style.cssText = 'min-width:0;flex:1'
    const nameEl = document.createElement('span')
    nameEl.textContent = friendlyName || 'File'
    nameEl.style.cssText = 'font-size:0.875rem;font-weight:500;color:#1f2937;display:block'
    center.appendChild(nameEl)
    if (this.__description) {
      const descEl = document.createElement('span')
      descEl.textContent = this.__description
      descEl.style.cssText = 'font-size:0.75rem;color:#6b7280;display:block;margin-top:2px'
      center.appendChild(descEl)
    }
    const metaEl = document.createElement('span')
    metaEl.textContent = sizeStr ? `${ext} · ${sizeStr}` : ext
    metaEl.style.cssText = 'font-size:0.75rem;color:#9ca3af;display:block;margin-top:4px'
    center.appendChild(metaEl)
    wrap.appendChild(center)

    if (friendlyName) {
      const dl = document.createElement('a')
      dl.setAttribute('href', `${this.__src}?name=${encodeURIComponent(friendlyName)}`)
      dl.setAttribute('download', friendlyName)
      dl.setAttribute('title', 'Download')
      dl.style.cssText = 'flex-shrink:0;padding:0.5rem;color:#9ca3af;text-decoration:none;display:flex;align-items:center;justify-content:center'
      dl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
      wrap.appendChild(dl)
    }

    return { element: wrap }
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

// ─── DividerNodeComponent ─────────────────────────────────────────────────────

function DividerNodeComponent({ nodeKey, editor }) {
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

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="max-w-3xl mx-auto select-none"
    >
      <div className={`mx-6 py-4 rounded transition-all ${
        isSelected ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''
      }`}>
        <hr className="border-gray-300 my-0" />
      </div>
    </div>
  )
}

// ─── DividerNode ──────────────────────────────────────────────────────────────

export class DividerNode extends DecoratorNode {
  static getType() { return 'divider' }
  static clone(node) { return new DividerNode(node.__key) }

  static importJSON() { return new DividerNode() }
  exportJSON() { return { type: 'divider', version: 1 } }

  static importDOM() {
    return {
      hr: () => ({
        conversion: () => ({ node: new DividerNode() }),
        priority: 0,
      }),
    }
  }

  exportDOM() {
    return { element: document.createElement('hr') }
  }

  createDOM() {
    const span = document.createElement('span')
    span.style.display = 'contents'
    return span
  }
  updateDOM() { return false }
  isInline() { return false }

  decorate(editor) {
    return <DividerNodeComponent nodeKey={this.getKey()} editor={editor} />
  }
}

export function $createDividerNode() {
  return new DividerNode()
}

// ─── CalloutBodySyncPlugin ────────────────────────────────────────────────────

function CalloutBodySyncPlugin({ parentEditor, nodeKey, initialHtml }) {
  const [nestedEditor] = useLexicalComposerContext()
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    if (!initialHtml) return
    nestedEditor.update(() => {
      const parser = new DOMParser()
      const dom = parser.parseFromString(initialHtml, 'text/html')
      const nodes = $generateNodesFromDOM(nestedEditor, dom)
      $getRoot().clear()
      $getRoot().append(...nodes)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return nestedEditor.registerUpdateListener(() => {
      nestedEditor.read(() => {
        const html = $generateHtmlFromNodes(nestedEditor, null)
        parentEditor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (node instanceof CalloutNode) node.getWritable().__html = html
        })
      })
    })
  }, [nestedEditor, parentEditor, nodeKey])

  // Enter exits to main editor and inserts paragraph below callout.
  // Shift+Enter passes through as a soft line break.
  useEffect(() => {
    return nestedEditor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (event.key !== 'Enter' || event.shiftKey) return false
        event.preventDefault()
        parentEditor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (!node) return
          const para = $createParagraphNode()
          node.insertAfter(para)
          para.selectStart()
        })
        const root = parentEditor.getRootElement()
        if (root) root.focus({ preventScroll: true })
        return true
      },
      COMMAND_PRIORITY_CRITICAL
    )
  }, [nestedEditor, parentEditor, nodeKey])

  return null
}

// ─── CalloutNodeComponent ─────────────────────────────────────────────────────

const CALLOUT_COLOR_PRESETS = [
  { label: 'White',  value: '#00000000' },
  { label: 'Gray',   value: '#abb4be33' },
  { label: 'Blue',   value: '#14b8ff33' },
  { label: 'Green',  value: '#30cf4333' },
  { label: 'Yellow', value: '#ffb41f33' },
  { label: 'Red',    value: '#f50b2333' },
  { label: 'Pink',   value: '#fb2d8d33' },
  { label: 'Purple', value: '#8e42ff33' },
]

function CalloutNodeComponent({ emojiEnabled, emoji, color, html, nodeKey, editor }) {
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [isHovered, setIsHovered] = useState(false)
  const [nestedFocused, setNestedFocused] = useState(false)
  const [toolbarPos, setToolbarPos] = useState(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const containerRef = useRef(null)
  const nestedContainerRef = useRef(null)
  const emojiButtonRef = useRef(null)
  const emojiPickerRef = useRef(null)
  const [pickerPos, setPickerPos] = useState(null)

  useEffect(() => {
    if (!showEmojiPicker) return
    function handleOutside(e) {
      if (
        emojiPickerRef.current && !emojiPickerRef.current.contains(e.target) &&
        emojiButtonRef.current && !emojiButtonRef.current.contains(e.target)
      ) {
        setShowEmojiPicker(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showEmojiPicker])

  function toggleEmojiPicker() {
    if (showEmojiPicker) { setShowEmojiPicker(false); return }
    const rect = emojiButtonRef.current?.getBoundingClientRect()
    if (!rect) return
    const pickerW = 352
    let left = rect.left + window.scrollX
    if (left + pickerW > window.innerWidth + window.scrollX - 8) {
      left = window.innerWidth + window.scrollX - pickerW - 8
    }
    setPickerPos({ top: rect.bottom + window.scrollY + 4, left: Math.max(8, left) })
    setShowEmojiPicker(true)
  }

  const nestedEditor = useMemo(() => createEditor({
    namespace: 'CalloutBody',
    nodes: [LinkNode],
    theme: { text: { bold: 'font-bold', italic: 'italic', underline: 'underline', strikethrough: 'line-through', code: 'bg-gray-100 rounded px-1 font-mono text-sm' }, paragraph: 'my-0' },
    onError: console.error,
  }), [])

  const showRing = isSelected || nestedFocused

  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const el = containerRef.current
        if (!el || !el.contains(event.target)) return false
        if (nestedContainerRef.current?.contains(event.target)) return false
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
    if ((!isSelected && !nestedFocused) || !containerRef.current) { setToolbarPos(null); return }
    function calc() {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const W = 280
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
  }, [isSelected, nestedFocused])

  function setEmojiEnabled(val) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof CalloutNode) node.getWritable().__emojiEnabled = val
    })
  }

  function setEmoji(val) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof CalloutNode) node.getWritable().__emoji = val
    })
    setShowEmojiPicker(false)
  }

  function setColor(val) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof CalloutNode) node.getWritable().__color = val
    })
  }

  return (
    <>
      <div
        ref={containerRef}
        className="my-4 max-w-3xl mx-auto"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          style={{ background: color }}
          className={`mx-6 rounded-lg px-7 py-5 flex items-start gap-3 transition-all ${
            showRing ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''
          }`}
        >
        {emojiEnabled && (
          <span className="text-xl shrink-0 select-none">{emoji}</span>
        )}
        <div
          ref={nestedContainerRef}
          className="flex-1 relative"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.preventDefault()
              const root = editor.getRootElement()
              if (root) root.focus({ preventScroll: true })
              editor.update(() => {
                const sel = $createNodeSelection()
                sel.add(nodeKey)
                $setSelection(sel)
              })
            }
          }}
        >
          <LexicalNestedComposer initialEditor={nestedEditor} initialTheme={{ text: { bold: 'font-bold', italic: 'italic', underline: 'underline', strikethrough: 'line-through', code: 'bg-gray-100 rounded px-1 font-mono text-sm' }, paragraph: 'my-0' }}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  onFocus={() => setNestedFocused(true)}
                  onBlur={() => setNestedFocused(false)}
                  className="outline-none text-gray-800 leading-relaxed w-full"
                />
              }
              placeholder={
                <div className="text-gray-400 pointer-events-none absolute top-1/2 -translate-y-1/2 left-0 select-none">
                  Callout text...
                </div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <HistoryPlugin />
            <LinkPlugin />
            <FloatingToolbarPlugin />
            <CalloutBodySyncPlugin parentEditor={editor} nodeKey={nodeKey} initialHtml={html} />
          </LexicalNestedComposer>
        </div>
        </div>
      </div>

      {(isSelected || nestedFocused) && toolbarPos && createPortal(
        <div
          style={{ position: 'absolute', top: toolbarPos.top, left: toolbarPos.left, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
          onMouseDown={e => e.preventDefault()}
        >
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="text-xs text-gray-500">Emoji</span>
            <Tooltip content={emojiEnabled ? 'Hide emoji' : 'Show emoji'}>
              <button
                onMouseDown={e => { e.preventDefault(); setEmojiEnabled(!emojiEnabled); setShowEmojiPicker(false) }}
                className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-200 ${
                  emojiEnabled ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 mt-0.5 ${
                  emojiEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                }`} />
              </button>
            </Tooltip>

            {emojiEnabled && (
              <Tooltip content="Change emoji">
                <button
                  ref={emojiButtonRef}
                  onMouseDown={e => { e.preventDefault(); toggleEmojiPicker() }}
                  className={`px-1.5 py-0.5 rounded text-sm transition-colors ${
                    showEmojiPicker ? 'bg-gray-100' : 'hover:bg-gray-100'
                  }`}
                >
                  {emoji}
                </button>
              </Tooltip>
            )}

            <div className="w-px h-4 bg-gray-200 mx-1" />

            {CALLOUT_COLOR_PRESETS.map(({ label, value }) => (
              <Tooltip key={value} content={label}>
                <button
                  onMouseDown={e => { e.preventDefault(); setColor(value) }}
                  className="w-4 h-4 rounded-full shadow-sm transition-transform hover:scale-110 shrink-0"
                  style={{
                    background: value,
                    outline: color === value ? '2px solid #3b82f6' : '1px solid #d1d5db',
                    outlineOffset: color === value ? '1px' : '0',
                  }}
                />
              </Tooltip>
            ))}
          </div>

        </div>,
        document.body
      )}

      {showEmojiPicker && pickerPos && createPortal(
        <div
          ref={emojiPickerRef}
          style={{ position: 'absolute', top: pickerPos.top, left: pickerPos.left, zIndex: 10000 }}
        >
          <Picker
            data={emojiData}
            onEmojiSelect={(e) => setEmoji(e.native)}
            theme="light"
            previewPosition="none"
            skinTonePosition="none"
            autoFocus
          />
        </div>,
        document.body
      )}
    </>
  )
}

// ─── CalloutNode ──────────────────────────────────────────────────────────────

export class CalloutNode extends DecoratorNode {
  static getType() { return 'callout' }
  static clone(node) {
    return new CalloutNode(node.__emojiEnabled, node.__emoji, node.__color, node.__html, node.__key)
  }

  static importJSON(data) {
    const html = data.html || (data.text ? `<p>${data.text}</p>` : '')
    return new CalloutNode(data.emojiEnabled ?? true, data.emoji || '💡', data.color || '#14b8ff33', html)
  }
  exportJSON() {
    return { type: 'callout', version: 1, emojiEnabled: this.__emojiEnabled, emoji: this.__emoji, color: this.__color, html: this.__html }
  }

  static importDOM() {
    return {
      div: (node) => {
        if (!node.classList?.contains('callout')) return null
        return {
          conversion: (domNode) => {
            const bodyEl = domNode.querySelector('.callout-body')
            const html = bodyEl
              ? bodyEl.innerHTML
              : (domNode.querySelector('p')?.textContent?.trim()
                  ? `<p>${domNode.querySelector('p').textContent.trim()}</p>`
                  : '')
            return {
              node: new CalloutNode(
                domNode.getAttribute('data-emoji-enabled') !== 'false',
                domNode.getAttribute('data-emoji') || '💡',
                domNode.getAttribute('data-color') || '#14b8ff33',
                html,
              )
            }
          },
          priority: 2,
        }
      },
    }
  }

  constructor(emojiEnabled = true, emoji = '💡', color = '#14b8ff33', html = '', key) {
    super(key)
    this.__emojiEnabled = emojiEnabled
    this.__emoji = emoji
    this.__color = color
    this.__html = html
  }

  createDOM() {
    const span = document.createElement('span')
    span.style.display = 'contents'
    return span
  }
  updateDOM() { return false }
  isInline() { return false }

  exportDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'callout'
    wrap.setAttribute('data-emoji-enabled', String(this.__emojiEnabled))
    wrap.setAttribute('data-emoji', this.__emoji)
    wrap.setAttribute('data-color', this.__color)
    wrap.style.cssText = `background:${this.__color};border-radius:0.5rem;padding:20px 28px;display:flex;gap:0.75rem;margin:1rem 0;align-items:flex-start;box-sizing:border-box`

    if (this.__emojiEnabled) {
      const span = document.createElement('span')
      span.style.cssText = 'font-size:1.25rem;flex-shrink:0;line-height:1.625'
      span.textContent = this.__emoji
      wrap.appendChild(span)
    }

    const body = document.createElement('div')
    body.className = 'callout-body not-prose'
    body.style.cssText = 'flex:1;color:#1f2937;line-height:1.625;margin:0'
    body.innerHTML = this.__html || ''
    wrap.appendChild(body)

    return { element: wrap }
  }

  decorate(editor) {
    return (
      <CalloutNodeComponent
        emojiEnabled={this.__emojiEnabled}
        emoji={this.__emoji}
        color={this.__color}
        html={this.__html}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createCalloutNode() {
  return new CalloutNode(true, '💡', '#14b8ff33', '')
}

// ─── ButtonNodeComponent ──────────────────────────────────────────────────────

function ButtonNodeComponent({ label, href, align, nodeKey, editor }) {
  const TOOLBAR_WIDTH = 380
  const containerRef = useRef(null)
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [isHovered, setIsHovered] = useState(false)
  const [toolbarPos, setToolbarPos] = useState(null)
  const [localLabel, setLocalLabel] = useState(label)
  const [localHref, setLocalHref] = useState(href)

  useEffect(() => { setLocalLabel(label) }, [label])
  useEffect(() => { setLocalHref(href) }, [href])

  function commitLabel(val) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!node) return
      node.getWritable().setLabel(val)
    })
  }

  function commitHref(val) {
    const normalized = val && !val.startsWith('http://') && !val.startsWith('https://') ? `https://${val}` : val
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!node) return
      node.getWritable().setHref(normalized)
    })
  }

  function commitAlign(val) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!node) return
      node.getWritable().setAlign(val)
    })
  }

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

  useLayoutEffect(() => {
    if (!isSelected || !containerRef.current) { setToolbarPos(null); return }
    function calc() {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      let left = rect.left + window.scrollX + rect.width / 2 - TOOLBAR_WIDTH / 2
      left = Math.max(8, Math.min(left, window.innerWidth + window.scrollX - TOOLBAR_WIDTH - 8))
      let top = rect.top + window.scrollY - 48
      if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + 8
      setToolbarPos({ top, left })
    }
    calc()
    window.addEventListener('scroll', calc, true)
    window.addEventListener('resize', calc)
    return () => { window.removeEventListener('scroll', calc, true); window.removeEventListener('resize', calc) }
  }, [isSelected])

  return (
    <div
      ref={containerRef}
      className={`my-2 py-3 max-w-3xl mx-auto px-6 rounded transition-all ${isSelected ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}
      style={{ textAlign: align }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <a className="inline-block bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-lg pointer-events-none select-none no-underline">
        {localLabel || 'Click here'}
      </a>

      {isSelected && toolbarPos && createPortal(
        <div
          style={{ position: 'absolute', top: toolbarPos.top, left: toolbarPos.left, zIndex: 9999, width: TOOLBAR_WIDTH }}
          className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 shadow-2xl"
          onMouseDown={e => e.preventDefault()}
        >
          <Tooltip content="Align left">
            <button
              className={`p-1 rounded ${align === 'left' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              onClick={() => commitAlign('left')}
            >
              <AlignLeft size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Align center">
            <button
              className={`p-1 rounded ${align === 'center' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              onClick={() => commitAlign('center')}
            >
              <AlignCenter size={16} />
            </button>
          </Tooltip>

          <div className="w-px h-4 bg-gray-600 mx-1 flex-shrink-0" />

          <input
            value={localLabel}
            onChange={e => setLocalLabel(e.target.value)}
            onBlur={e => commitLabel(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur() }}
            onMouseDown={e => e.stopPropagation()}
            placeholder="Button label"
            className="bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-600 w-28 min-w-0"
          />

          <input
            value={localHref}
            onChange={e => setLocalHref(e.target.value)}
            onBlur={e => commitHref(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur() }}
            onMouseDown={e => e.stopPropagation()}
            placeholder="https://..."
            className="bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-600 flex-1 min-w-0"
          />
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── ButtonNode ───────────────────────────────────────────────────────────────

export class ButtonNode extends DecoratorNode {
  static getType() { return 'button' }

  static clone(node) {
    return new ButtonNode(node.__label, node.__href, node.__align, node.__key)
  }

  static importJSON(data) {
    return new ButtonNode(data.label || 'Click here', data.href || '', data.align || 'center')
  }

  exportJSON() {
    return { type: 'button', version: 1, label: this.__label, href: this.__href, align: this.__align }
  }

  static importDOM() {
    return {
      div: (node) => {
        if (!node.classList?.contains('btn-wrapper')) return null
        return {
          conversion: (domNode) => {
            const label = domNode.getAttribute('data-label') || domNode.querySelector('a')?.textContent || ''
            const href  = domNode.getAttribute('data-href')  || domNode.querySelector('a')?.getAttribute('href') || ''
            const align = domNode.getAttribute('data-align') || 'center'
            return { node: new ButtonNode(label, href, align) }
          },
          priority: 2,
        }
      },
    }
  }

  constructor(label = 'Click here', href = '', align = 'center', key) {
    super(key)
    this.__label = label
    this.__href = href
    this.__align = align
  }

  createDOM() {
    const span = document.createElement('span')
    span.style.display = 'contents'
    return span
  }

  updateDOM() { return false }
  isInline() { return false }

  setLabel(label) { this.getWritable().__label = label }
  setHref(href) { this.getWritable().__href = href }
  setAlign(align) { this.getWritable().__align = align }

  exportDOM() {
    const wrap = document.createElement('div')
    wrap.className = `btn-wrapper btn-${this.__align}`
    wrap.setAttribute('data-label', this.__label)
    wrap.setAttribute('data-href', this.__href)
    wrap.setAttribute('data-align', this.__align)
    const a = document.createElement('a')
    a.className = 'btn'
    a.href = this.__href
    a.textContent = this.__label
    wrap.appendChild(a)
    return { element: wrap }
  }

  decorate(editor) {
    return (
      <ButtonNodeComponent
        label={this.__label}
        href={this.__href}
        align={this.__align}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createButtonNode() {
  return new ButtonNode('Click here', '', 'center')
}

// ─── ToggleSummarySyncPlugin ──────────────────────────────────────────────────

function ToggleSummarySyncPlugin({ parentEditor, nodeKey, initialHtml }) {
  const [nestedEditor] = useLexicalComposerContext()
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    if (!initialHtml) return
    nestedEditor.update(() => {
      const parser = new DOMParser()
      const dom = parser.parseFromString(initialHtml, 'text/html')
      const nodes = $generateNodesFromDOM(nestedEditor, dom)
      $getRoot().clear()
      $getRoot().append(...nodes)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return nestedEditor.registerUpdateListener(() => {
      nestedEditor.read(() => {
        const html = $generateHtmlFromNodes(nestedEditor, null)
        parentEditor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (node instanceof ToggleNode) node.getWritable().__summaryHtml = html
        })
      })
    })
  }, [nestedEditor, parentEditor, nodeKey])

  useEffect(() => {
    return nestedEditor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (event.key !== 'Enter' || event.shiftKey) return false
        event.preventDefault()
        parentEditor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (!node) return
          const para = $createParagraphNode()
          node.insertAfter(para)
          para.selectStart()
        })
        const root = parentEditor.getRootElement()
        if (root) root.focus({ preventScroll: true })
        return true
      },
      COMMAND_PRIORITY_CRITICAL
    )
  }, [nestedEditor, parentEditor, nodeKey])

  return null
}

// ─── ToggleBodySyncPlugin ─────────────────────────────────────────────────────

function ToggleBodySyncPlugin({ parentEditor, nodeKey, initialHtml }) {
  const [nestedEditor] = useLexicalComposerContext()
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    if (!initialHtml) return
    nestedEditor.update(() => {
      const parser = new DOMParser()
      const dom = parser.parseFromString(initialHtml, 'text/html')
      const nodes = $generateNodesFromDOM(nestedEditor, dom)
      $getRoot().clear()
      $getRoot().append(...nodes)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return nestedEditor.registerUpdateListener(() => {
      nestedEditor.read(() => {
        const html = $generateHtmlFromNodes(nestedEditor, null)
        parentEditor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (node instanceof ToggleNode) node.getWritable().__contentHtml = html
        })
      })
    })
  }, [nestedEditor, parentEditor, nodeKey])

  useEffect(() => {
    return nestedEditor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (event.key !== 'Enter' || event.shiftKey) return false
        event.preventDefault()
        parentEditor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (!node) return
          const para = $createParagraphNode()
          node.insertAfter(para)
          para.selectStart()
        })
        const root = parentEditor.getRootElement()
        if (root) root.focus({ preventScroll: true })
        return true
      },
      COMMAND_PRIORITY_CRITICAL
    )
  }, [nestedEditor, parentEditor, nodeKey])

  return null
}

// ─── ToggleNodeComponent ──────────────────────────────────────────────────────

function ToggleNodeComponent({ summaryHtml, contentHtml, nodeKey, editor }) {
  const containerRef = useRef(null)
  const summaryContainerRef = useRef(null)
  const bodyContainerRef = useRef(null)
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [isHovered, setIsHovered] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [summaryFocused, setSummaryFocused] = useState(false)
  const [bodyFocused, setBodyFocused] = useState(false)

  const showRing = isSelected || summaryFocused || bodyFocused

  const summaryEditor = useMemo(() => createEditor({
    namespace: 'ToggleSummary',
    nodes: [LinkNode],
    theme: { text: { bold: 'font-bold', italic: 'italic', underline: 'underline', strikethrough: 'line-through', code: 'bg-gray-100 rounded px-1 font-mono text-sm' }, paragraph: 'my-0' },
    onError: console.error,
  }), [])

  const bodyEditor = useMemo(() => createEditor({
    namespace: 'ToggleBody',
    nodes: [LinkNode],
    theme: { text: { bold: 'font-bold', italic: 'italic', underline: 'underline', strikethrough: 'line-through', code: 'bg-gray-100 rounded px-1 font-mono text-sm' }, paragraph: 'my-0' },
    onError: console.error,
  }), [])

  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const el = containerRef.current
        if (!el || !el.contains(event.target)) return false
        if (summaryContainerRef.current?.contains(event.target)) return false
        if (bodyContainerRef.current?.contains(event.target)) return false
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

  function escapeToSelect(e) {
    if (e.key !== 'Escape') return
    e.preventDefault()
    const root = editor.getRootElement()
    if (root) root.focus({ preventScroll: true })
    editor.update(() => {
      const sel = $createNodeSelection()
      sel.add(nodeKey)
      $setSelection(sel)
    })
  }

  return (
    <div
      ref={containerRef}
      className="my-4 max-w-3xl mx-auto"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`mx-6 rounded-lg border bg-white transition-all overflow-hidden ${
          showRing ? 'ring-2 ring-blue-500 border-transparent' : isHovered ? 'ring-1 ring-blue-300 border-transparent' : 'border-gray-200'
        }`}
      >
        {/* Header row */}
        <div className="flex items-center gap-2 px-4 py-3">
          <div
            ref={summaryContainerRef}
            className="flex-1 relative"
            onClick={e => e.stopPropagation()}
            onKeyDown={escapeToSelect}
          >
            <LexicalNestedComposer
              initialEditor={summaryEditor}
              initialTheme={{ text: { bold: 'font-bold', italic: 'italic', underline: 'underline', strikethrough: 'line-through', code: 'bg-gray-100 rounded px-1 font-mono text-sm' }, paragraph: 'my-0' }}
            >
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    onFocus={() => setSummaryFocused(true)}
                    onBlur={() => setSummaryFocused(false)}
                    className="outline-none font-semibold text-gray-800 text-base w-full leading-relaxed"
                  />
                }
                placeholder={
                  <div className="text-gray-400 pointer-events-none absolute top-0 left-0 select-none text-base font-semibold">
                    Toggle title…
                  </div>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              <HistoryPlugin />
              <LinkPlugin />
              <FloatingToolbarPlugin />
              <ToggleSummarySyncPlugin parentEditor={editor} nodeKey={nodeKey} initialHtml={summaryHtml} />
            </LexicalNestedComposer>
          </div>

          <button
            onMouseDown={e => { e.preventDefault(); setIsExpanded(v => !v) }}
            className="text-gray-400 hover:text-gray-600 shrink-0 transition-colors"
            tabIndex={-1}
          >
            <ChevronDown
              size={16}
              style={{ transform: isExpanded ? 'rotate(-180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
            />
          </button>
        </div>

        {/* Body (CSS-hidden when collapsed so editor state is preserved) */}
        <div className={isExpanded ? 'block' : 'hidden'}>
          <div
            ref={bodyContainerRef}
            className="not-prose px-4 py-3 border-t border-gray-100 relative"
            onClick={e => e.stopPropagation()}
            onKeyDown={escapeToSelect}
          >
            <LexicalNestedComposer
              initialEditor={bodyEditor}
              initialTheme={{ text: { bold: 'font-bold', italic: 'italic', underline: 'underline', strikethrough: 'line-through', code: 'bg-gray-100 rounded px-1 font-mono text-sm' }, paragraph: 'my-0' }}
            >
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    onFocus={() => setBodyFocused(true)}
                    onBlur={() => setBodyFocused(false)}
                    className="outline-none text-gray-700 text-sm w-full leading-relaxed"
                  />
                }
                placeholder={
                  <div className="text-gray-400 pointer-events-none absolute top-0 left-0 select-none text-sm">
                    Toggle content…
                  </div>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              <HistoryPlugin />
              <LinkPlugin />
              <FloatingToolbarPlugin />
              <ToggleBodySyncPlugin parentEditor={editor} nodeKey={nodeKey} initialHtml={contentHtml} />
            </LexicalNestedComposer>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ToggleNode ───────────────────────────────────────────────────────────────

export class ToggleNode extends DecoratorNode {
  static getType() { return 'toggle' }

  static clone(node) {
    return new ToggleNode(node.__summaryHtml, node.__contentHtml, node.__key)
  }

  static importJSON(data) {
    return new ToggleNode(data.summaryHtml || '', data.contentHtml || '')
  }

  exportJSON() {
    return { type: 'toggle', version: 1, summaryHtml: this.__summaryHtml, contentHtml: this.__contentHtml }
  }

  static importDOM() {
    return {
      details: (node) => {
        if (!node.classList?.contains('toggle')) return null
        return {
          conversion: (domNode) => {
            const summaryHtml = domNode.querySelector('.toggle-summary')?.innerHTML || ''
            const contentHtml = domNode.querySelector('.toggle-body')?.innerHTML || ''
            return { node: new ToggleNode(summaryHtml, contentHtml) }
          },
          priority: 2,
        }
      },
    }
  }

  constructor(summaryHtml = '', contentHtml = '', key) {
    super(key)
    this.__summaryHtml = summaryHtml
    this.__contentHtml = contentHtml
  }

  createDOM() {
    const span = document.createElement('span')
    span.style.display = 'contents'
    return span
  }

  updateDOM() { return false }
  isInline() { return false }

  setSummaryHtml(val) { this.getWritable().__summaryHtml = val }
  setContentHtml(val) { this.getWritable().__contentHtml = val }

  exportDOM() {
    const details = document.createElement('details')
    details.className = 'toggle'

    const summary = document.createElement('summary')
    summary.className = 'toggle-summary not-prose'
    summary.innerHTML = this.__summaryHtml || ''
    details.appendChild(summary)

    const body = document.createElement('div')
    body.className = 'toggle-body not-prose'
    body.innerHTML = this.__contentHtml || ''
    details.appendChild(body)

    return { element: details }
  }

  decorate(editor) {
    return (
      <ToggleNodeComponent
        summaryHtml={this.__summaryHtml}
        contentHtml={this.__contentHtml}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createToggleNode() {
  return new ToggleNode('', '')
}

// ─── CodeBlockNode ────────────────────────────────────────────────────────────

function CodeBlockComponent({ code, showLineNumbers, nodeKey, editor }) {
  const [localCode, setLocalCode] = useState(code)
  const [copied, setCopied] = useState(false)
  const [textareaFocused, setTextareaFocused] = useState(false)
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [isHovered, setIsHovered] = useState(false)
  const [toolbarPos, setToolbarPos] = useState(null)
  const containerRef = useRef(null)

  useEffect(() => { setLocalCode(code) }, [code])

  useLayoutEffect(() => {
    if ((!isSelected && !textareaFocused) || !containerRef.current) { setToolbarPos(null); return }
    function calc() {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const left = rect.left + window.scrollX + rect.width / 2
      let top = rect.top + window.scrollY - 40 - 8
      if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + 8
      setToolbarPos({ top, left })
    }
    calc()
    window.addEventListener('scroll', calc, true)
    window.addEventListener('resize', calc)
    return () => { window.removeEventListener('scroll', calc, true); window.removeEventListener('resize', calc) }
  }, [isSelected, textareaFocused])

  const showRing = isSelected || textareaFocused

  function commitCode(val) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) node.getWritable().setCode(val)
    })
  }

  function handleCopy() {
    navigator.clipboard.writeText(localCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function commitShowLineNumbers(val) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) node.getWritable().setShowLineNumbers(val)
    })
  }

  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const el = containerRef.current
        if (!el || !el.contains(event.target)) return false
        if (event.target.tagName === 'TEXTAREA') return false
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

  return (
    <>
    <div
      ref={containerRef}
      className="max-w-3xl mx-auto my-3"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`mx-6 relative bg-gray-100 rounded overflow-hidden transition-all ${showRing ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}>
        <div className="flex">
          {showLineNumbers && (
            <div className="select-none text-right font-mono text-sm leading-relaxed text-gray-300 pl-3 py-2 flex-shrink-0">
              {Array.from({ length: Math.max(3, localCode.split('\n').length) }, (_, i) => (
                <div key={i}>{i < localCode.split('\n').length ? i + 1 : ''}</div>
              ))}
            </div>
          )}
          <textarea
            value={localCode}
            onChange={e => { setLocalCode(e.target.value); commitCode(e.target.value) }}
            onFocus={() => setTextareaFocused(true)}
            onBlur={() => setTextareaFocused(false)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Tab') {
                e.preventDefault()
                const { selectionStart, selectionEnd, value } = e.target
                const newVal = value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd)
                setLocalCode(newVal)
                commitCode(newVal)
                requestAnimationFrame(() => {
                  e.target.selectionStart = e.target.selectionEnd = selectionStart + 2
                })
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                e.target.blur()
                const root = editor.getRootElement()
                if (root) root.focus({ preventScroll: true })
                editor.update(() => {
                  const sel = $createNodeSelection()
                  sel.add(nodeKey)
                  $setSelection(sel)
                })
              }
            }}
            rows={Math.max(3, localCode.split('\n').length)}
            className="block flex-1 p-0 pl-3 pr-8 py-2 bg-transparent outline-none resize-none font-mono text-sm leading-relaxed text-gray-800"
          />
        </div>
        <button
          onClick={handleCopy}
          onMouseDown={e => e.preventDefault()}
          className="absolute top-2 right-2 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
    {(isSelected || textareaFocused) && toolbarPos && createPortal(
      <div
        style={{ position: 'absolute', top: toolbarPos.top, left: toolbarPos.left, zIndex: 9999, transform: 'translateX(-50%)' }}
        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-lg"
        onMouseDown={e => e.preventDefault()}
      >
        <span className="text-xs text-gray-500 select-none">Line count</span>
        <button
          onMouseDown={e => { e.preventDefault(); commitShowLineNumbers(!showLineNumbers) }}
          className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-200 ${showLineNumbers ? 'bg-blue-500' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 mt-0.5 ${showLineNumbers ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
        </button>
      </div>,
      document.body
    )}
    </>
  )
}

export class CodeBlockNode extends DecoratorNode {
  static getType() { return 'code-block' }
  static clone(node) { return new CodeBlockNode(node.__code, node.__showLineNumbers, node.__key) }

  static importJSON(data) {
    return new CodeBlockNode(data.code || '', data.showLineNumbers !== false)
  }

  exportJSON() {
    return { type: 'code-block', version: 1, code: this.__code, showLineNumbers: this.__showLineNumbers }
  }

  static importDOM() {
    return {
      // New format: wrapper div
      div: (node) => {
        if (!node.classList?.contains('code-block-wrapper')) return null
        return {
          conversion: (domNode) => {
            const pre = domNode.querySelector('pre.code-block')
            const code = pre?.textContent || ''
            const showLineNumbers = domNode.getAttribute('data-show-line-numbers') !== 'false'
            return { node: new CodeBlockNode(code, showLineNumbers) }
          },
          priority: 3,
        }
      },
      // Old format: bare <pre class="code-block"> (backwards compat)
      pre: (node) => {
        if (!node.classList?.contains('code-block')) return null
        if (node.closest('.code-block-wrapper')) return null
        return {
          conversion: (domNode) => ({ node: new CodeBlockNode(domNode.textContent || '', true) }),
          priority: 2,
        }
      },
    }
  }

  constructor(code = '', showLineNumbers = true, key) {
    super(key)
    this.__code = code
    this.__showLineNumbers = showLineNumbers
  }

  createDOM() {
    const span = document.createElement('span')
    span.style.display = 'contents'
    return span
  }

  updateDOM() { return false }
  isInline() { return false }

  setCode(val) { this.getWritable().__code = val }
  setShowLineNumbers(val) { this.getWritable().__showLineNumbers = val }

  exportDOM() {
    const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
    const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`

    const wrapper = document.createElement('div')
    wrapper.className = 'code-block-wrapper'
    wrapper.setAttribute('data-show-line-numbers', String(this.__showLineNumbers))

    const inner = document.createElement('div')
    inner.className = 'code-block-inner'

    if (this.__showLineNumbers) {
      const gutter = document.createElement('div')
      gutter.className = 'code-block-gutter'
      this.__code.split('\n').forEach((_, i) => {
        const div = document.createElement('div')
        div.textContent = String(i + 1)
        gutter.appendChild(div)
      })
      inner.appendChild(gutter)
    }

    const pre = document.createElement('pre')
    pre.className = 'code-block'
    pre.textContent = this.__code
    inner.appendChild(pre)

    wrapper.appendChild(inner)

    const btn = document.createElement('button')
    btn.className = 'code-block-copy'
    btn.setAttribute('aria-label', 'Copy code')
    btn.setAttribute('onclick', `var p=this.closest('.code-block-wrapper').querySelector('.code-block');navigator.clipboard.writeText(p.textContent);var b=this;b.innerHTML='${CHECK_ICON}';setTimeout(function(){b.innerHTML='${COPY_ICON}'},1500)`)
    btn.innerHTML = COPY_ICON
    wrapper.appendChild(btn)

    return { element: wrapper }
  }

  decorate(editor) {
    return (
      <CodeBlockComponent
        code={this.__code}
        showLineNumbers={this.__showLineNumbers}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createCodeBlockNode(code = '') {
  return new CodeBlockNode(code)
}

// ─── HeaderFieldSyncPlugin ────────────────────────────────────────────────────

function HeaderFieldSyncPlugin({ parentEditor, nodeKey, setterName, initialHtml, onEnterKey }) {
  const [nestedEditor] = useLexicalComposerContext()
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    const html = initialHtml?.trim()
    if (!html) return
    const safeHtml = html.includes('<') ? html : `<p>${html}</p>`
    nestedEditor.update(() => {
      const parser = new DOMParser()
      const dom = parser.parseFromString(safeHtml, 'text/html')
      const nodes = $generateNodesFromDOM(nestedEditor, dom)
      $getRoot().clear()
      $getRoot().append(...nodes)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return nestedEditor.registerUpdateListener(() => {
      nestedEditor.read(() => {
        const html = $generateHtmlFromNodes(nestedEditor, null)
        parentEditor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (!node) return
          node[setterName](html)
        })
      })
    })
  }, [nestedEditor, parentEditor, nodeKey, setterName])

  useEffect(() => {
    return nestedEditor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (event.key !== 'Enter') return false
        event.preventDefault()
        if (onEnterKey) onEnterKey()
        return true
      },
      COMMAND_PRIORITY_CRITICAL
    )
  }, [nestedEditor, onEnterKey])

  return null
}

// ─── HeaderNodeComponent ──────────────────────────────────────────────────────

const HEADER_NESTED_THEME = {
  text: { bold: 'font-bold', italic: 'italic', underline: 'underline', strikethrough: 'line-through' },
  paragraph: 'my-0',
}

function HeaderNodeComponent({ layout, textAlign, heading, subheading, backgroundColor, buttonEnabled, buttonText, buttonUrl, buttonColor, nodeKey, editor }) {
  const PANEL_WIDTH = 280
  const containerRef = useRef(null)
  const headingContainerRef = useRef(null)
  const subheadingContainerRef = useRef(null)
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [isHovered, setIsHovered] = useState(false)
  const [headingFocused, setHeadingFocused] = useState(false)
  const [subheadingFocused, setSubheadingFocused] = useState(false)
  const [panelFocused, setPanelFocused] = useState(false)
  const [panelPos, setPanelPos] = useState(null)
  const [localButtonText, setLocalButtonText] = useState(buttonText)
  const [localButtonUrl, setLocalButtonUrl] = useState(buttonUrl)

  useEffect(() => { setLocalButtonText(buttonText) }, [buttonText])
  useEffect(() => { setLocalButtonUrl(buttonUrl) }, [buttonUrl])

  const headingEditor = useMemo(() => createEditor({ namespace: 'HeaderHeading', nodes: [LinkNode], theme: HEADER_NESTED_THEME, onError: console.error }), [])
  const subheadingEditor = useMemo(() => createEditor({ namespace: 'HeaderSubheading', nodes: [LinkNode], theme: HEADER_NESTED_THEME, onError: console.error }), [])

  const showRing = isSelected || headingFocused || subheadingFocused
  const showPanel = isSelected || headingFocused || subheadingFocused || panelFocused

  function commitField(setter, val) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!node) return
      node[setter](val)
    })
  }

  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const el = containerRef.current
        if (!el || !el.contains(event.target)) return false
        if (headingContainerRef.current?.contains(event.target)) return false
        if (subheadingContainerRef.current?.contains(event.target)) return false
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
    if (!showPanel || !containerRef.current) { setPanelPos(null); return }
    function calc() {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const offsets = {
        regular: { rightShift: 140, overlap: 220 },
        wide:    { rightShift: -40, overlap: 320 },
        full:    { rightShift: -160, overlap: 380 },
      }
      const { rightShift, overlap } = offsets[layout] || offsets.regular
      let left = rect.right + window.scrollX - PANEL_WIDTH + rightShift
      left = Math.max(8, Math.min(left, window.innerWidth + window.scrollX - PANEL_WIDTH - 8))
      const top = rect.bottom + window.scrollY - overlap
      setPanelPos({ top, left })
    }
    calc()
    window.addEventListener('scroll', calc, true)
    window.addEventListener('resize', calc)
    return () => { window.removeEventListener('scroll', calc, true); window.removeEventListener('resize', calc) }
  }, [showPanel, layout])

  const outerClass = layout === 'full' ? 'w-full' : layout === 'wide' ? 'max-w-7xl mx-auto' : 'max-w-3xl mx-auto'
  const sideMargin = layout === 'full' ? '' : 'mx-6'
  const paddingXClass    = layout === 'regular' ? 'px-20' : 'px-64'
  const textAlignClass   = textAlign === 'center' ? 'text-center' : 'text-left'
  const minHeightClass   = layout === 'full' ? 'min-h-[551px]' : layout === 'wide' ? 'min-h-[447px]' : 'min-h-[347px]'
  const headingTextClass = layout === 'full' ? 'text-6xl' : layout === 'wide' ? 'text-5xl' : 'text-4xl'
  const subTextClass     = layout === 'full' ? 'text-2xl' : layout === 'wide' ? 'text-[22px]' : 'text-xl'
  const btnTextClass     = layout === 'full' ? 'text-lg' : 'text-base'

  return (
    <>
      <div
        className={`my-4 ${outerClass}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          ref={containerRef}
          style={{ background: backgroundColor }}
          className={`${sideMargin} ${minHeightClass} ${paddingXClass} rounded-lg py-10 flex flex-col justify-center gap-3 ${showRing ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}
        >
          <div
            ref={headingContainerRef}
            className={`relative ${textAlignClass}`}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault()
                const root = editor.getRootElement()
                if (root) root.focus({ preventScroll: true })
                editor.update(() => { const sel = $createNodeSelection(); sel.add(nodeKey); $setSelection(sel) })
              }
            }}
          >
            <LexicalNestedComposer initialEditor={headingEditor} initialTheme={HEADER_NESTED_THEME}>
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    onFocus={() => setHeadingFocused(true)}
                    onBlur={() => setHeadingFocused(false)}
                    className={`bg-transparent text-white ${headingTextClass} font-bold outline-none w-full caret-white`}
                  />
                }
                placeholder={
                  <div className={`text-white/50 pointer-events-none absolute top-0 left-0 ${headingTextClass} font-bold select-none`}>Heading</div>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              <HistoryPlugin />
              <LinkPlugin />
              <FloatingToolbarPlugin />
              <HeaderFieldSyncPlugin
                parentEditor={editor}
                nodeKey={nodeKey}
                setterName="setHeading"
                initialHtml={heading}
                onEnterKey={() => subheadingEditor.getRootElement()?.focus()}
              />
            </LexicalNestedComposer>
          </div>

          <div
            ref={subheadingContainerRef}
            className={`relative ${textAlignClass}`}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault()
                const root = editor.getRootElement()
                if (root) root.focus({ preventScroll: true })
                editor.update(() => { const sel = $createNodeSelection(); sel.add(nodeKey); $setSelection(sel) })
              }
            }}
          >
            <LexicalNestedComposer initialEditor={subheadingEditor} initialTheme={HEADER_NESTED_THEME}>
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    onFocus={() => setSubheadingFocused(true)}
                    onBlur={() => setSubheadingFocused(false)}
                    className={`bg-transparent text-white/80 ${subTextClass} outline-none w-full caret-white`}
                  />
                }
                placeholder={
                  <div className={`text-white/40 pointer-events-none absolute top-0 left-0 ${subTextClass} select-none`}>Subheading</div>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              <HistoryPlugin />
              <LinkPlugin />
              <FloatingToolbarPlugin />
              <HeaderFieldSyncPlugin
                parentEditor={editor}
                nodeKey={nodeKey}
                setterName="setSubheading"
                initialHtml={subheading}
                onEnterKey={() => {
                  editor.update(() => {
                    const node = $getNodeByKey(nodeKey)
                    if (!node) return
                    const para = $createParagraphNode()
                    node.insertAfter(para)
                    para.selectStart()
                  })
                  const root = editor.getRootElement()
                  if (root) root.focus({ preventScroll: true })
                }}
              />
            </LexicalNestedComposer>
          </div>
          {buttonEnabled && (
            <div className={`mt-2 ${textAlignClass}`}>
              <span
                className={`inline-block px-5 py-2 rounded-lg text-white ${btnTextClass} font-medium pointer-events-none select-none`}
                style={{ background: buttonColor }}
              >
                {localButtonText || 'Learn More'}
              </span>
            </div>
          )}
        </div>
      </div>

      {showPanel && panelPos && createPortal(
        <div
          style={{ position: 'absolute', top: panelPos.top, left: panelPos.left, zIndex: 9999, width: PANEL_WIDTH }}
          className="bg-white border border-gray-200 rounded-xl shadow-xl py-4 px-4 flex flex-col gap-3"
          onMouseDown={e => e.preventDefault()}
          onFocus={() => setPanelFocused(true)}
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setPanelFocused(false) }}
        >
          {/* Layout */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Layout</span>
            <div className="flex gap-1">
              <Tooltip content="Regular width">
                <button
                  className={`p-1.5 rounded ${layout === 'regular' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  onClick={() => commitField('setLayout', 'regular')}
                >
                  <AlignCenter size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Wide">
                <button
                  className={`p-1.5 rounded ${layout === 'wide' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  onClick={() => commitField('setLayout', 'wide')}
                >
                  <AlignJustify size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Full width">
                <button
                  className={`p-1.5 rounded ${layout === 'full' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  onClick={() => commitField('setLayout', 'full')}
                >
                  <Maximize2 size={15} />
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          {/* Alignment */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Alignment</span>
            <div className="flex gap-1">
              <Tooltip content="Align left">
                <button
                  className={`p-1.5 rounded ${textAlign !== 'center' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  onClick={() => commitField('setTextAlign', 'left')}
                >
                  <AlignLeft size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Align center">
                <button
                  className={`p-1.5 rounded ${textAlign === 'center' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  onClick={() => commitField('setTextAlign', 'center')}
                >
                  <AlignCenter size={15} />
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          {/* Background */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Background</span>
            <ColorPicker
              value={backgroundColor}
              onChange={val => commitField('setBackgroundColor', val)}
              presets={['#000000', '#1e293b', '#1e3a5f', '#ffffff']}
            />
          </div>

          <div className="h-px bg-gray-100" />

          {/* Button toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Button</span>
            <div
              onClick={() => commitField('setButtonEnabled', !buttonEnabled)}
              className={`relative w-10 h-6 rounded-full cursor-pointer transition-colors ${buttonEnabled ? 'bg-gray-900' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${buttonEnabled ? 'translate-x-4' : ''}`} />
            </div>
          </div>

          {buttonEnabled && (
            <>
              <div className="h-px bg-gray-100" />

              {/* Button color */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Button Color</span>
                <ColorPicker
                  value={buttonColor}
                  onChange={val => commitField('setButtonColor', val)}
                  presets={['#3b82f6', '#22c55e', '#ef4444', '#ffffff']}
                />
              </div>

              {/* Button text */}
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-gray-500">Button text</span>
                <input
                  value={localButtonText}
                  onChange={e => setLocalButtonText(e.target.value)}
                  onBlur={e => commitField('setButtonText', e.target.value)}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur() }}
                  onMouseDown={e => e.stopPropagation()}
                  placeholder="Add button text"
                  className="w-full bg-gray-100 text-gray-900 text-sm px-3 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-gray-400"
                />
              </div>

              {/* Button URL */}
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-gray-500">Button URL</span>
                <input
                  value={localButtonUrl}
                  onChange={e => setLocalButtonUrl(e.target.value)}
                  onBlur={e => {
                    let val = e.target.value.trim()
                    if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
                      val = 'https://' + val
                      setLocalButtonUrl(val)
                    }
                    commitField('setButtonUrl', val)
                  }}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur() }}
                  onMouseDown={e => e.stopPropagation()}
                  placeholder="Add link"
                  className="w-full bg-gray-100 text-gray-900 text-sm px-3 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-gray-400"
                />
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

// ─── HeaderNode ───────────────────────────────────────────────────────────────

export class HeaderNode extends DecoratorNode {
  static getType() { return 'header' }

  static clone(node) {
    return new HeaderNode(node.__layout, node.__textAlign, node.__heading, node.__subheading, node.__backgroundColor, node.__buttonEnabled, node.__buttonText, node.__buttonUrl, node.__buttonColor, node.__key)
  }

  static importJSON(data) {
    return new HeaderNode(
      data.layout || 'regular',
      data.textAlign || 'left',
      data.heading || '',
      data.subheading || '',
      data.backgroundColor || '#1e293b',
      data.buttonEnabled || false,
      data.buttonText || 'Learn More',
      data.buttonUrl || '',
      data.buttonColor || '#3b82f6',
    )
  }

  exportJSON() {
    return {
      type: 'header', version: 1,
      layout: this.__layout,
      textAlign: this.__textAlign,
      heading: this.__heading,
      subheading: this.__subheading,
      backgroundColor: this.__backgroundColor,
      buttonEnabled: this.__buttonEnabled,
      buttonText: this.__buttonText,
      buttonUrl: this.__buttonUrl,
      buttonColor: this.__buttonColor,
    }
  }

  static importDOM() {
    return {
      header: (node) => {
        if (!node.classList?.contains('header-regular') &&
            !node.classList?.contains('header-wide') &&
            !node.classList?.contains('header-full')) return null
        return {
          conversion: (domNode) => {
            const layout = domNode.getAttribute('data-layout') || 'regular'
            const heading = domNode.querySelector('.header-heading')?.innerHTML || ''
            const subheading = domNode.querySelector('.header-subheading')?.innerHTML || ''
            const backgroundColor = domNode.style.background || '#1e293b'
            const buttonEnabled = domNode.getAttribute('data-button-enabled') === 'true'
            const buttonText = domNode.getAttribute('data-button-text') || 'Learn More'
            const buttonUrl = domNode.getAttribute('data-button-url') || ''
            const buttonColor = domNode.getAttribute('data-button-color') || '#3b82f6'
            const textAlign = domNode.getAttribute('data-text-align') || 'left'
            return { node: new HeaderNode(layout, textAlign, heading, subheading, backgroundColor, buttonEnabled, buttonText, buttonUrl, buttonColor) }
          },
          priority: 2,
        }
      },
    }
  }

  constructor(layout = 'regular', textAlign = 'left', heading = '', subheading = '', backgroundColor = '#1e293b', buttonEnabled = false, buttonText = 'Learn More', buttonUrl = '', buttonColor = '#3b82f6', key) {
    super(key)
    this.__layout = layout
    this.__textAlign = textAlign
    this.__heading = heading
    this.__subheading = subheading
    this.__backgroundColor = backgroundColor
    this.__buttonEnabled = buttonEnabled
    this.__buttonText = buttonText
    this.__buttonUrl = buttonUrl
    this.__buttonColor = buttonColor
  }

  createDOM() {
    const span = document.createElement('span')
    span.style.display = 'contents'
    return span
  }

  updateDOM() { return false }
  isInline() { return false }

  setLayout(val) { this.getWritable().__layout = val }
  setTextAlign(val) { this.getWritable().__textAlign = val }
  setHeading(val) { this.getWritable().__heading = val }
  setSubheading(val) { this.getWritable().__subheading = val }
  setBackgroundColor(val) { this.getWritable().__backgroundColor = val }
  setButtonEnabled(val) { this.getWritable().__buttonEnabled = val }
  setButtonText(val) { this.getWritable().__buttonText = val }
  setButtonUrl(val) { this.getWritable().__buttonUrl = val }
  setButtonColor(val) { this.getWritable().__buttonColor = val }

  exportDOM() {
    const heights      = { regular: '347px', wide: '447px', full: '551px' }
    const headingSizes = { regular: '36px',  wide: '48px',  full: '60px' }
    const subSizes     = { regular: '20px',  wide: '22px',  full: '24px' }
    const btnSizes     = { regular: '16px',  wide: '16px',  full: '18px' }

    const header = document.createElement('header')
    header.className = `header-${this.__layout}`
    header.style.background = this.__backgroundColor
    header.setAttribute('data-layout', this.__layout)
    header.setAttribute('data-button-enabled', String(this.__buttonEnabled))
    header.setAttribute('data-button-text', this.__buttonText)
    header.setAttribute('data-button-url', this.__buttonUrl)
    header.setAttribute('data-button-color', this.__buttonColor)
    header.setAttribute('data-text-align', this.__textAlign)

    const inner = document.createElement('div')
    inner.className = 'header-inner'
    inner.style.minHeight = heights[this.__layout] || '347px'
    inner.style.textAlign = this.__textAlign || 'left'
    inner.style.display = 'flex'
    inner.style.flexDirection = 'column'
    inner.style.justifyContent = 'center'

    const headingEl = document.createElement('div')
    headingEl.className = 'header-heading'
    headingEl.style.fontSize = headingSizes[this.__layout] || '36px'
    headingEl.style.fontWeight = 'bold'
    headingEl.style.color = 'white'
    headingEl.innerHTML = this.__heading
    inner.appendChild(headingEl)

    const subEl = document.createElement('div')
    subEl.className = 'header-subheading'
    subEl.style.fontSize = subSizes[this.__layout] || '20px'
    subEl.style.color = 'rgba(255,255,255,0.8)'
    subEl.innerHTML = this.__subheading
    inner.appendChild(subEl)

    if (this.__buttonEnabled) {
      const a = document.createElement('a')
      a.className = 'header-btn'
      a.href = this.__buttonUrl
      a.textContent = this.__buttonText
      a.style.background = this.__buttonColor
      a.style.fontSize = btnSizes[this.__layout] || '16px'
      inner.appendChild(a)
    }

    header.appendChild(inner)
    return { element: header }
  }

  decorate(editor) {
    return (
      <HeaderNodeComponent
        layout={this.__layout}
        textAlign={this.__textAlign}
        heading={this.__heading}
        subheading={this.__subheading}
        backgroundColor={this.__backgroundColor}
        buttonEnabled={this.__buttonEnabled}
        buttonText={this.__buttonText}
        buttonUrl={this.__buttonUrl}
        buttonColor={this.__buttonColor}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createHeaderNode() {
  return new HeaderNode()
}
