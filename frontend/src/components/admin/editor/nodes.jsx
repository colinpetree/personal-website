import { createContext, useContext, useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
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
import { TableNode, TableCellNode } from '@lexical/table'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { AlignLeft, AlignCenter, Maximize2, Columns2, RectangleVertical, RectangleHorizontal, StretchHorizontal, Fullscreen, Link, Link2, Link2Off, X, Music, FileText, Plus, Download, Repeat, Scissors, ChevronDown, Copy, Check, Image as ImageIcon, Upload, Trash2, Eclipse, Sun, Moon, Mic, Square, Play, Pause, Save, AlertCircle, Loader2, Circle, Type, PaintBucket, GripVertical } from 'lucide-react'
import ColorPicker, { ColorSwatchMenu, getContrastColor } from '../../ui/ColorPicker'

function resolveTextColor(mode, bgHex) {
  if (mode === 'light') return 'white'
  if (mode === 'dark') return 'black'
  return getContrastColor(bgHex)
}

// Wraps $generateHtmlFromNodes to restore the real `autoplay` attribute on
// exported background videos. VideoNode/HeaderNode.exportDOM() never set a
// real `autoplay` attribute on their (live-document-owned) detached <video>
// elements — only a harmless `data-export-autoplay` marker — because
// `autoplay` + `src` together on such an element is what causes Chrome/
// Firefox/Brave to start a real, audible native player purely from calling
// exportDOM() (which runs on every editor.update(), i.e. every keystroke or
// panel click). Swapping the marker for the real attribute here, on the
// plain string returned by $generateHtmlFromNodes, happens after
// `.outerHTML` has already been read — so no live <video> element ever
// carries `autoplay` at all. Use this everywhere $generateHtmlFromNodes is
// called instead of calling it directly.
export function generateSafeHtmlFromNodes(editor, selection) {
  const html = $generateHtmlFromNodes(editor, selection)
  return html.replace(/\s*data-export-autoplay=""/g, ' autoplay=""')
}

// Lexical exports an empty rich-text field as markup like '<p><br></p>' rather than ''
function isBlankHtml(html) {
  if (!html) return true
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return !tmp.textContent.trim()
}

// Font Family editor setting ('default' | 'sans' | 'serif') — provided by
// RichTextEditor around the whole composer tree. Decorator nodes below are
// always sans-serif by default (see index.css's "Keep these elements
// sans-serif" block for the public-page equivalent), so only 'serif' mode
// needs to flip them; 'default' and 'sans' both render as font-sans.
export const FontFamilyContext = createContext('default')
function decoratorFontClass(fontFamily) {
  return fontFamily === 'serif' ? 'font-serif' : 'font-sans'
}
import Picker from '@emoji-mart/react'
import emojiData from '@emoji-mart/data'
import { handleUploadFull } from './upload'
import { FloatingToolbarPlugin } from './plugins'
import { Tooltip } from '../../ui/Tooltip'
import { useToast } from '../../../context/ToastContext'
import { SOCIAL_PLATFORMS, GENERIC_ICONS, resolveLinkIcon, getPlatformMonoSvg } from './socialIcons'

// ─── ImageNodeComponent ───────────────────────────────────────────────────────

function ImageNodeComponent({ src, alt, caption, width, href, srcset, lqip, nodeKey, editor }) {
  const fontFamily = useContext(FontFamilyContext)
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [captionFocused, setCaptionFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [toolbarPos, setToolbarPos] = useState(null)
  const [showLinkPopover, setShowLinkPopover] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')
  const [imgLoaded, setImgLoaded] = useState(false)
  const showLinkPopoverRef = useRef(false)
  showLinkPopoverRef.current = showLinkPopover
  const linkButtonRef = useRef(null)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })
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

  // Position toolbar above the figure whenever selection changes.
  useLayoutEffect(() => {
    if (!isSelected || !figRef.current) { setToolbarPos(null); if (showLinkPopoverRef.current) { setShowLinkPopover(false); setLinkDraft('') } return }
    function calc() {
      const rect = figRef.current?.getBoundingClientRect()
      if (!rect) return
      const W = 200
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

  function saveHref(value) {
    if (value && !/^https?:\/\//i.test(value)) value = 'https://' + value
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof ImageNode) node.getWritable().__href = value
    })
  }

  function openLinkPopover() {
    if (showLinkPopover) { cancelLink(); return }
    if (!linkButtonRef.current) return
    const rect = linkButtonRef.current.getBoundingClientRect()
    setPopoverPos({ top: rect.top - 8, left: rect.left + rect.width / 2 })
    setLinkDraft(href || '')
    setShowLinkPopover(true)
  }

  function commitLink() {
    saveHref(linkDraft.trim())
    setShowLinkPopover(false)
    setLinkDraft('')
  }

  function cancelLink() {
    setShowLinkPopover(false)
    setLinkDraft('')
  }

  function removeLink() {
    saveHref('')
    setShowLinkPopover(false)
    setLinkDraft('')
  }

  useEffect(() => {
    if (!showLinkPopover) return
    const onScroll = () => {
      if (!linkButtonRef.current) return
      const r = linkButtonRef.current.getBoundingClientRect()
      setPopoverPos({ top: r.top - 8, left: r.left + r.width / 2 })
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [showLinkPopover])

  const widthMaxMap = { regular: '740px', wide: '1040px', full: '100%', narrow: '524px' }

  return (
    <>
      <figure
        ref={figRef}
        style={{ maxWidth: widthMaxMap[width] ?? '740px' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`my-4 mx-auto rounded-lg overflow-hidden transition-all select-none ${showRing ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}
      >
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          {lqip && !imgLoaded && (
            <img
              src={lqip}
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ filter: 'blur(20px)', transform: 'scale(1.05)' }}
            />
          )}
          <img
            ref={imgRef}
            src={src}
            srcSet={srcset || undefined}
            sizes={srcset ? '(max-width: 740px) 100vw, 740px' : undefined}
            alt={alt}
            onLoad={() => setImgLoaded(true)}
            className="w-full h-auto block"
            style={{ transition: 'opacity 0.4s', opacity: lqip && !imgLoaded ? 0 : 1 }}
            draggable={false}
          />
        </div>
        <figcaption className="mt-0">
          <input
            type="text"
            value={caption}
            onChange={handleCaptionChange}
            onFocus={() => setCaptionFocused(true)}
            onBlur={() => setCaptionFocused(false)}
            onClick={e => e.stopPropagation()}
            placeholder="Type caption for image (optional)"
            className={`w-full ${decoratorFontClass(fontFamily)} text-sm text-gray-500 text-center bg-transparent border-0 outline-none py-2 px-4 placeholder-gray-400 select-text`}
          />
        </figcaption>
      </figure>

      {isSelected && toolbarPos && createPortal(
        <div
          style={{ position: 'absolute', top: toolbarPos.top, left: toolbarPos.left, zIndex: 9999 }}
          className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-xl px-1.5 py-1 shadow-2xl"
          onMouseDown={e => e.preventDefault()}
        >
          {[
            { key: 'narrow',  icon: RectangleVertical,   title: 'Narrow width' },
            { key: 'regular', icon: RectangleHorizontal, title: 'Regular width' },
            { key: 'wide',    icon: StretchHorizontal,   title: 'Wide width' },
            { key: 'full',    icon: Maximize2,           title: 'Full width' },
          ].map(({ key: w, icon: Icon, title }) => (
            <Tooltip key={w} content={title}>
              <button
                onMouseDown={e => { e.preventDefault(); setWidth(w) }}
                className={`p-1.5 rounded-md transition-colors ${
                  width === w ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon size={14} strokeWidth={2} />
              </button>
            </Tooltip>
          ))}

          <div className="w-px h-5 bg-gray-200 mx-0.5" />

          <Tooltip content="Link">
            <button
              ref={linkButtonRef}
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); openLinkPopover() }}
              className={`p-1.5 rounded-md transition-colors ${
                href ? 'text-blue-500 hover:bg-gray-100' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Link2 size={14} strokeWidth={2} />
            </button>
          </Tooltip>

          {href && (
            <Tooltip content="Remove link">
              <button
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); removeLink() }}
                className="p-1.5 rounded-md transition-colors text-gray-500 hover:text-red-500 hover:bg-gray-100"
              >
                <Link2Off size={14} strokeWidth={2} />
              </button>
            </Tooltip>
          )}
        </div>,
        document.body
      )}

      {showLinkPopover && createPortal(
        <div
          style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left, transform: 'translate(-50%, -100%)', zIndex: 10000 }}
          className="bg-white border border-gray-200 rounded-xl shadow-2xl px-2 py-2 flex items-center gap-1"
        >
          <input
            autoFocus
            type="text"
            value={linkDraft}
            onChange={e => setLinkDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitLink() }
              if (e.key === 'Escape') { e.preventDefault(); cancelLink() }
            }}
            onBlur={commitLink}
            placeholder="Add link…"
            className="text-xs bg-white text-gray-800 border border-gray-200 rounded px-2 py-1 w-52 outline-none focus:border-blue-500"
          />
        </div>,
        document.body
      )}
    </>
  )
}

// ─── ImageNode ────────────────────────────────────────────────────────────────

export class ImageNode extends DecoratorNode {
  static getType() { return 'image' }
  static clone(node) { return new ImageNode(node.__src, node.__alt, node.__caption, node.__width, node.__href, node.__srcset, node.__lqip, node.__key) }

  static importJSON(data) {
    return new ImageNode(data.src, data.alt || '', data.caption || '', data.width || 'regular', data.href || '', data.srcset || '', data.lqip || '')
  }
  exportJSON() {
    return { type: 'image', version: 1, src: this.__src, alt: this.__alt, caption: this.__caption, width: this.__width, href: this.__href, srcset: this.__srcset, lqip: this.__lqip }
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
          const srcset = domNode.getAttribute('data-srcset') || img.getAttribute('srcset') || ''
          const lqip = domNode.getAttribute('data-lqip') || ''
          return { node: new ImageNode(img.getAttribute('src') || '', img.getAttribute('alt') || '', caption, width, href, srcset, lqip) }
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

  constructor(src, alt = '', caption = '', width = 'regular', href = '', srcset = '', lqip = '', key) {
    super(key)
    this.__src = src
    this.__alt = alt
    this.__caption = caption
    this.__width = width
    this.__href = href
    this.__srcset = srcset
    this.__lqip = lqip
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
    if (this.__srcset) {
      img.setAttribute('srcset', this.__srcset)
      img.setAttribute('sizes', '(max-width: 740px) 100vw, 740px')
    }
    img.style.cssText = 'width:100%;height:auto;display:block;margin:0'

    const figure = document.createElement('figure')
    figure.setAttribute('data-width', this.__width || 'regular')
    if (this.__srcset) figure.setAttribute('data-srcset', this.__srcset)
    if (this.__lqip) figure.setAttribute('data-lqip', this.__lqip)
    figure.style.borderRadius = '0.5rem'
    figure.style.overflow = 'hidden'

    if (this.__width === 'wide') {
      figure.style.cssText += ';width:min(1040px,100vw);position:relative;left:50%;transform:translateX(-50%);margin:1.5rem 0;border-radius:0.5rem;overflow:hidden'
    } else if (this.__width === 'full') {
      figure.style.cssText += ';width:100vw;position:relative;left:50%;transform:translateX(-50%);margin:1.5rem 0;border-radius:0;overflow:hidden'
    } else if (this.__width === 'narrow') {
      figure.style.cssText += ';max-width:524px;margin:1.5rem auto;border-radius:0.5rem;overflow:hidden'
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
        srcset={this.__srcset}
        lqip={this.__lqip}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createImageNode(src, alt = '', caption = '', width = 'regular', href = '', srcset = '', lqip = '') {
  return new ImageNode(src, alt, caption, width, href, srcset, lqip)
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

function VideoNodeComponent({ src, caption, width, loop, segmentLoop, nodeKey, editor }) {
  const fontFamily = useContext(FontFamilyContext)
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
      const W = 204
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
      if (!(node instanceof VideoNode)) return
      const writable = node.getWritable()
      writable.__loop = !node.__loop
      if (writable.__loop) writable.__segmentLoop = false
    })
  }

  function toggleSegmentLoop() {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!(node instanceof VideoNode)) return
      const writable = node.getWritable()
      writable.__segmentLoop = !node.__segmentLoop
      if (writable.__segmentLoop) writable.__loop = false
    })
  }

  const widthMaxMap = { regular: '740px', wide: '1040px', full: '100%', narrow: '524px' }

  return (
    <>
      <figure
        ref={figRef}
        style={{ maxWidth: widthMaxMap[width] ?? '740px' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`my-4 mx-auto rounded-lg overflow-hidden transition-all select-none ${showRing ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}
      >
        <video src={src} controls loop={loop || undefined} disablePictureInPicture className="w-full block bg-black" />
        <figcaption className="mt-0">
          <input
            type="text"
            value={caption}
            onChange={handleCaptionChange}
            onFocus={() => setCaptionFocused(true)}
            onBlur={() => setCaptionFocused(false)}
            onClick={e => e.stopPropagation()}
            placeholder="Type caption for video (optional)"
            className={`w-full ${decoratorFontClass(fontFamily)} text-sm text-gray-500 text-center bg-transparent border-0 outline-none py-2 px-4 placeholder-gray-400 select-text`}
          />
        </figcaption>
      </figure>

      {isSelected && toolbarPos && createPortal(
        <div
          style={{ position: 'absolute', top: toolbarPos.top, left: toolbarPos.left, zIndex: 9999 }}
          className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-xl px-1.5 py-1 shadow-2xl"
          onMouseDown={e => e.preventDefault()}
        >
          {[
            { key: 'narrow',  icon: RectangleVertical,   title: 'Narrow width' },
            { key: 'regular', icon: RectangleHorizontal, title: 'Regular width' },
            { key: 'wide',    icon: StretchHorizontal,   title: 'Wide width' },
            { key: 'full',    icon: Maximize2,           title: 'Full width' },
          ].map(({ key: w, icon: Icon, title }) => (
            <Tooltip key={w} content={title}>
              <button
                onMouseDown={e => { e.preventDefault(); setWidth(w) }}
                className={`p-1.5 rounded-md transition-colors ${
                  width === w ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon size={14} strokeWidth={2} />
              </button>
            </Tooltip>
          ))}
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <Tooltip content="Loop">
            <button
              onMouseDown={e => { e.preventDefault(); toggleLoop() }}
              className={`p-1.5 rounded-md transition-colors ${
                loop ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Repeat size={14} strokeWidth={2} />
            </button>
          </Tooltip>
          <Tooltip content="Segment Loop">
            <button
              onMouseDown={e => { e.preventDefault(); toggleSegmentLoop() }}
              className={`p-1.5 rounded-md transition-colors ${
                segmentLoop ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Scissors size={14} strokeWidth={2} />
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
    return new VideoNode(node.__src, node.__caption, node.__width, node.__loop, node.__thumbnailSrc, node.__segmentLoop, node.__key)
  }

  static importJSON(data) {
    return new VideoNode(data.src, data.caption || '', data.width || 'regular', data.loop || false, data.thumbnailSrc || '', data.segmentLoop || false)
  }
  exportJSON() {
    return { type: 'video', version: 1, src: this.__src, caption: this.__caption, width: this.__width, loop: this.__loop, thumbnailSrc: this.__thumbnailSrc, segmentLoop: this.__segmentLoop }
  }

  static importDOM() {
    return {
      figure: (domNode) => {
        if (!domNode.querySelector(':scope > video')) return null
        return {
          conversion: (domNode) => {
            const video = domNode.querySelector('video')
            if (!video) return null
            const caption = domNode.querySelector('figcaption')?.textContent?.trim() || ''
            const widthClass = domNode.className?.match(/kg-width-(\w+)/)?.[1] || 'regular'
            const loop = video.hasAttribute('loop')
            const thumbnailSrc = video.getAttribute('poster') || ''
            const segmentLoop = domNode.getAttribute('data-segment-loop') === 'true'
            return { node: new VideoNode(video.getAttribute('src') || '', caption, widthClass, loop, thumbnailSrc, segmentLoop) }
          },
          priority: 1,
        }
      },
      video: () => ({
        conversion: (domNode) => {
          if (!(domNode instanceof HTMLVideoElement)) return null
          if (domNode.closest('figure')) return null
          return { node: new VideoNode(domNode.getAttribute('src') || '', '') }
        },
        priority: 1,
      }),
    }
  }

  constructor(src, caption = '', width = 'regular', loop = false, thumbnailSrc = '', segmentLoop = false, key) {
    super(key)
    this.__src = src
    this.__caption = caption
    this.__width = width
    this.__loop = loop
    this.__thumbnailSrc = thumbnailSrc
    this.__segmentLoop = segmentLoop
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
    // This element is only ever used to build an HTML string via outerHTML
    // and is never attached to the visible DOM — but it's still owned by the
    // live, fully-active page document, and exportDOM() runs on every
    // editor.update() (Lexical regenerates content_html for autosave on
    // every keystroke/click). Browsers don't require an element to be
    // connected under <body> to start decoding — only for its ownerDocument
    // to be the active document — so a real `autoplay` attribute here would
    // start a genuine, audio-capable native player every single time this
    // runs, regardless of `muted` timing (confirmed live via Chrome's Media
    // panel: dozens of real player instances were created purely from this
    // export path during ordinary panel interaction). The `muted`
    // property/attribute below is still set for good measure, but the actual
    // fix is that the real `autoplay` attribute is NEVER set on this live
    // element — see `data-export-autoplay` below and
    // `generateSafeHtmlFromNodes()`, which swaps it back in as a plain
    // string after `.outerHTML` has already been read, so no live element
    // ever carries `autoplay` + `src` at the same time.
    video.muted = true
    video.defaultMuted = true
    video.volume = 0
    video.setAttribute('src', this.__src)
    video.setAttribute('disablepictureinpicture', '')
    if (this.__loop) {
      video.setAttribute('data-export-autoplay', '')
      video.setAttribute('muted', '')
      video.setAttribute('loop', '')
      video.setAttribute('playsinline', '')
    } else {
      video.setAttribute('controls', '')
      if (this.__segmentLoop) video.setAttribute('playsinline', '')
      if (this.__thumbnailSrc && !this.__segmentLoop) video.setAttribute('poster', this.__thumbnailSrc)
    }
    video.style.cssText = 'width:100%;display:block'

    const figure = document.createElement('figure')
    figure.className = `kg-width-${this.__width || 'regular'}`
    if (this.__width === 'wide') {
      figure.style.cssText = 'width:min(1040px,100vw);position:relative;left:50%;transform:translateX(-50%);margin:1.5rem 0;border-radius:0.5rem;overflow:hidden;background:#000'
    } else if (this.__width === 'full') {
      figure.style.cssText = 'width:100vw;position:relative;left:50%;transform:translateX(-50%);margin:1.5rem 0;border-radius:0;overflow:hidden;background:#000'
    } else if (this.__width === 'narrow') {
      figure.style.cssText = 'max-width:524px;margin:1.5rem auto;border-radius:0.5rem;overflow:hidden;background:#000'
      if (this.__segmentLoop) figure.style.position = 'relative'
    } else {
      figure.style.cssText = 'max-width:740px;margin:1.5rem auto;border-radius:0.5rem;overflow:hidden;background:#000'
      if (this.__segmentLoop) figure.style.position = 'relative'
    }
    if (this.__segmentLoop) figure.setAttribute('data-segment-loop', 'true')
    figure.appendChild(video)
    if (this.__caption) {
      const figcaption = document.createElement('figcaption')
      figcaption.textContent = this.__caption
      figcaption.style.cssText = 'background:#fff'
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
        segmentLoop={this.__segmentLoop}
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
  const fontFamily = useContext(FontFamilyContext)
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
        className={`my-4 mx-auto media-regular-preview flex items-center gap-3 p-3 bg-gray-50 border rounded-lg transition-all select-none ${
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
          <p className={`text-sm font-medium ${decoratorFontClass(fontFamily)} text-gray-700 truncate mt-0 mb-1`}>
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
              className="shrink-0 self-start p-2 text-gray-400 hover:text-gray-600 rounded transition-colors select-auto"
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
      figure: (domNode) => {
        if (!domNode.classList.contains('audio-player')) return null
        return {
          conversion: (domNode) => {
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
        }
      },
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
    figure.style.cssText = 'box-sizing:border-box;max-width:740px;margin:1rem auto;display:flex;align-items:center;gap:0.75rem;padding:0.75rem;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0.5rem'

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
  const fontFamily = useContext(FontFamilyContext)
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
      className={`my-4 mx-auto media-regular-preview flex items-start gap-3 p-3 bg-gray-50 border rounded-lg transition-all select-none ${decoratorFontClass(fontFamily)} ${
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
        <p className="text-xs text-gray-400 mt-1 mb-0">{ext}{sizeStr ? ` · ${sizeStr}` : ''}</p>
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
    wrap.style.cssText = 'box-sizing:border-box;max-width:740px;margin:1rem auto;display:flex;align-items:flex-start;gap:0.75rem;padding:0.75rem;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0.5rem'

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
  const fontFamily = useContext(FontFamilyContext)
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
        const data = await handleUploadFull(file)
        const newImg = { src: `/api/uploads/${data.filename}`, alt: '', srcset: data.srcset || '' }
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (node instanceof GalleryNode) {
            const w = node.getWritable()
            w.__images = [...w.__images, newImg]
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
      className={`my-6 rounded-lg overflow-hidden transition-all ${showRing ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}
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
        className={`w-full ${decoratorFontClass(fontFamily)} text-sm text-gray-500 text-center bg-transparent border-0 outline-none py-2 px-4 placeholder-gray-400 select-text`}
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
            const images = imgs.map(img => ({
              src: img.getAttribute('src') || '',
              alt: img.getAttribute('alt') || '',
              srcset: img.getAttribute('srcset') || '',
            }))
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
      if (img.srcset) {
        imgEl.setAttribute('srcset', img.srcset)
        imgEl.setAttribute('sizes', '400px')
      }
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
        const html = generateSafeHtmlFromNodes(nestedEditor, null)
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
  const fontFamily = useContext(FontFamilyContext)
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
                  className={`outline-none ${decoratorFontClass(fontFamily)} text-gray-800 leading-relaxed w-full text-[18px] lg:text-[20px]`}
                />
              }
              placeholder={
                <div className={`${decoratorFontClass(fontFamily)} text-gray-400 pointer-events-none absolute top-1/2 -translate-y-1/2 left-0 select-none text-[18px] lg:text-[20px]`}>
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
    body.style.cssText = 'flex:1;color:#1f2937;margin:0'
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

function ButtonNodeComponent({ label, href, align, buttonColor, textColorMode, nodeKey, editor }) {
  const fontFamily = useContext(FontFamilyContext)
  const PANEL_W = 240
  const containerRef = useRef(null)
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [isHovered, setIsHovered] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [panelFocused, setPanelFocused] = useState(false)
  const [panelPos, setPanelPos] = useState(null)
  const [localLabel, setLocalLabel] = useState(label)
  const [localHref, setLocalHref] = useState(href)

  const showPanel = isSelected || colorPickerOpen || panelFocused
  const resolvedTextColor = resolveTextColor(textColorMode, buttonColor)

  useEffect(() => { setLocalLabel(label) }, [label])
  useEffect(() => { setLocalHref(href) }, [href])

  function commitField(setter, val) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!node) return
      node[setter](val)
    })
  }

  function commitLabel(val) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!node) return
      node.getWritable().setLabel(val)
    })
  }

  function commitHref(val) {
    const trimmed = val.trim()
    const normalized = trimmed && !trimmed.startsWith('http://') && !trimmed.startsWith('https://') ? `https://${trimmed}` : trimmed
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
    if (!showPanel || !containerRef.current) { setPanelPos(null); return }
    function calc() {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      let left = rect.right + window.scrollX - PANEL_W + 140
      left = Math.max(8, Math.min(left, window.innerWidth + window.scrollX - PANEL_W - 8))
      const top = rect.bottom + window.scrollY + 6
      setPanelPos({ top, left })
    }
    calc()
    window.addEventListener('scroll', calc, true)
    window.addEventListener('resize', calc)
    return () => { window.removeEventListener('scroll', calc, true); window.removeEventListener('resize', calc) }
  }, [showPanel])

  return (
    <div
      ref={containerRef}
      className={`my-2 py-3 max-w-3xl mx-auto px-6 rounded transition-all ${isSelected ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}
      style={{ textAlign: align }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <a
        style={{ backgroundColor: buttonColor, color: resolvedTextColor }}
        className={`inline-block text-sm font-medium ${decoratorFontClass(fontFamily)} px-5 py-2 rounded-lg pointer-events-none select-none no-underline`}
      >
        {localLabel || <span style={{ color: 'white' }}>Add button text</span>}
      </a>

      {showPanel && panelPos && createPortal(
        <div
          style={{ position: 'absolute', top: panelPos.top, left: panelPos.left, zIndex: 9999, width: PANEL_W }}
          className="bg-white border border-gray-200 rounded-xl shadow-xl py-4 px-4 flex flex-col gap-3"
          onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
          onFocus={() => setPanelFocused(true)}
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setPanelFocused(false) }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Align</span>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <Tooltip content="Left">
                <button
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
                  onClick={() => commitAlign('left')}
                  className={`p-1.5 rounded-md transition-colors ${align === 'left' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                ><AlignLeft size={15} /></button>
              </Tooltip>
              <Tooltip content="Center">
                <button
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
                  onClick={() => commitAlign('center')}
                  className={`p-1.5 rounded-md transition-colors ${align === 'center' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                ><AlignCenter size={15} /></button>
              </Tooltip>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Color</span>
            <ColorSwatchMenu
              value={buttonColor}
              presets={['#000000', '#146AF8']}
              onChange={val => commitField('setButtonColor', val)}
              onOpenChange={setColorPickerOpen}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Text color</span>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <Tooltip content="Light">
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} onClick={() => commitField('setTextColorMode', 'light')} className={`p-1.5 rounded-md transition-colors ${textColorMode === 'light' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Sun size={15} /></button>
              </Tooltip>
              <Tooltip content="Dark">
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} onClick={() => commitField('setTextColorMode', 'dark')} className={`p-1.5 rounded-md transition-colors ${textColorMode === 'dark' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Moon size={15} /></button>
              </Tooltip>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-gray-500">Button text</span>
            <input
              value={localLabel}
              onChange={e => setLocalLabel(e.target.value)}
              onBlur={e => commitLabel(e.target.value)}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur() }}
              onMouseDown={e => e.stopPropagation()}
              placeholder="Add button text"
              className="text-sm px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:border-blue-400 w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-gray-500">Button URL</span>
            <input
              value={localHref}
              onChange={e => setLocalHref(e.target.value)}
              onBlur={e => commitHref(e.target.value)}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur() }}
              onMouseDown={e => e.stopPropagation()}
              placeholder="Add link"
              className="text-sm px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:border-blue-400 w-full"
            />
          </div>
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
    return new ButtonNode(node.__label, node.__href, node.__align, node.__buttonColor, node.__textColorMode, node.__key)
  }

  static importJSON(data) {
    return new ButtonNode(
      data.label || 'Click here',
      data.href || '',
      data.align || 'center',
      data.buttonColor || '#3b82f6',
      data.textColorMode || 'auto',
    )
  }

  exportJSON() {
    return { type: 'button', version: 1, label: this.__label, href: this.__href, align: this.__align, buttonColor: this.__buttonColor, textColorMode: this.__textColorMode }
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
            const buttonColor = domNode.getAttribute('data-button-color') || '#3b82f6'
            const textColorMode = domNode.getAttribute('data-text-color-mode') || 'auto'
            return { node: new ButtonNode(label, href, align, buttonColor, textColorMode) }
          },
          priority: 2,
        }
      },
    }
  }

  constructor(label = 'Click here', href = '', align = 'center', buttonColor = '#3b82f6', textColorMode = 'auto', key) {
    super(key)
    this.__label = label
    this.__href = href
    this.__align = align
    this.__buttonColor = buttonColor
    this.__textColorMode = textColorMode
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
  setButtonColor(val) { this.getWritable().__buttonColor = val }
  setTextColorMode(val) { this.getWritable().__textColorMode = val }

  exportDOM() {
    const wrap = document.createElement('div')
    wrap.className = `btn-wrapper btn-${this.__align}`
    wrap.setAttribute('data-label', this.__label)
    wrap.setAttribute('data-href', this.__href)
    wrap.setAttribute('data-align', this.__align)
    wrap.setAttribute('data-button-color', this.__buttonColor)
    wrap.setAttribute('data-text-color-mode', this.__textColorMode)
    const a = document.createElement('a')
    a.className = 'btn'
    if (this.__href) a.href = this.__href
    a.textContent = this.__label
    a.style.background = this.__buttonColor
    a.style.setProperty('--btn-text-color', resolveTextColor(this.__textColorMode, this.__buttonColor))
    wrap.appendChild(a)
    return { element: wrap }
  }

  decorate(editor) {
    return (
      <ButtonNodeComponent
        label={this.__label}
        href={this.__href}
        align={this.__align}
        buttonColor={this.__buttonColor}
        textColorMode={this.__textColorMode}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createButtonNode() {
  return new ButtonNode('', '', 'center', '#000000', 'light')
}

// ─── LinkGroupEditModal ─────────────────────────────────────────────────────

// Every icon type (brand SVG, generic SVG, emoji, or the no-icon placeholder) renders
// inside a fixed-size slot of the same footprint, so icons in different link rows line
// up in the same column and read as the same size — regardless of a given lucide icon's
// intrinsic proportions or an emoji glyph's natural rendered width.
function LinkGroupIconPreview({ link, size = 22 }) {
  if (!link.iconEnabled) return null
  const resolved = resolveLinkIcon(link)
  const badgeSize = size + 7
  const slotStyle = { width: badgeSize, height: badgeSize }
  if (!resolved) {
    return (
      <span className="inline-flex items-center justify-center shrink-0" style={slotStyle}>
        <Link size={size} className="text-gray-300" />
      </span>
    )
  }
  if (resolved.type === 'emoji') {
    return (
      <span className="inline-flex items-center justify-center shrink-0" style={{ ...slotStyle, fontSize: size, lineHeight: 1 }}>
        {resolved.value}
      </span>
    )
  }
  if (resolved.variant === 'platform') {
    return (
      <span
        className="inline-flex items-center justify-center bg-white shrink-0"
        style={{ ...slotStyle, borderRadius: '0.4rem' }}
      >
        <span style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: resolved.value }} />
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center shrink-0" style={slotStyle}>
      <span style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: resolved.value }} />
    </span>
  )
}

function LinkGroupEditModal({ link, onSave, onClose }) {
  const [text, setText] = useState(link.text)
  const [url, setUrl] = useState(link.url)
  const [iconEnabled, setIconEnabled] = useState(link.iconEnabled)
  const [icon, setIcon] = useState(link.icon)
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef(null)
  const iconButtonRef = useRef(null)

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      // Close just the icon picker first if it's open, so Escape doesn't
      // discard unsaved text/link edits when the author only meant to
      // dismiss the picker.
      if (showPicker) { setShowPicker(false); return }
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, showPicker])

  useEffect(() => {
    if (!showPicker) return
    function handleOutside(e) {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target) &&
        iconButtonRef.current && !iconButtonRef.current.contains(e.target)
      ) setShowPicker(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showPicker])

  function handleSave() {
    const trimmed = url.trim()
    const normalized = trimmed && !trimmed.startsWith('http://') && !trimmed.startsWith('https://') ? `https://${trimmed}` : trimmed
    onSave({ text: text.trim(), url: normalized, iconEnabled, icon })
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-800">Edit link</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Text to display</label>
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              placeholder="My Instagram"
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Link</label>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              placeholder="https://instagram.com/yourname"
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIconEnabled(!iconEnabled)}
                className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-200 ${
                  iconEnabled ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 mt-0.5 ${
                  iconEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                }`} />
              </button>
              <span className="text-xs font-medium text-gray-500">Show icon</span>
            </div>

            <div className="relative">
              <button
                ref={iconButtonRef}
                onClick={() => setShowPicker(v => !v)}
                className={`w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 hover:bg-gray-50 transition-opacity ${
                  iconEnabled ? '' : 'opacity-40 grayscale'
                }`}
              >
                <LinkGroupIconPreview link={{ text, url, iconEnabled: true, icon }} />
              </button>

              {showPicker && (
                <div ref={pickerRef} className="absolute top-full right-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5 px-0.5">Social Icons</div>
                    <div className="flex flex-wrap gap-1">
                      {SOCIAL_PLATFORMS.map(p => (
                        <Tooltip key={p.key} content={p.label}>
                          <button
                            onClick={() => { setIcon(`platform:${p.key}`); setShowPicker(false) }}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors"
                            dangerouslySetInnerHTML={{ __html: p.svg }}
                          />
                        </Tooltip>
                      ))}
                    </div>
                    <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5 mt-2 px-0.5">Social Icons (Outline)</div>
                    <div className="flex flex-wrap gap-1">
                      {SOCIAL_PLATFORMS.map(p => (
                        <Tooltip key={p.key} content={p.label}>
                          <button
                            onClick={() => { setIcon(`platform-mono:${p.key}`); setShowPicker(false) }}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
                            dangerouslySetInnerHTML={{ __html: getPlatformMonoSvg(p.key) }}
                          />
                        </Tooltip>
                      ))}
                    </div>
                    <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5 mt-2 px-0.5">Icons</div>
                    <div className="flex flex-wrap gap-1">
                      {GENERIC_ICONS.map(g => (
                        <Tooltip key={g.key} content={g.label}>
                          <button
                            onClick={() => { setIcon(`icon:${g.key}`); setShowPicker(false) }}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
                            dangerouslySetInnerHTML={{ __html: g.svg }}
                          />
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                  <Picker
                    data={emojiData}
                    onEmojiSelect={(e) => { setIcon(e.native); setShowPicker(false) }}
                    theme="light"
                    previewPosition="none"
                    skinTonePosition="none"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── LinkGroupNodeComponent ─────────────────────────────────────────────────

const RADIUS_OPTIONS = [
  { key: 'square', label: 'Square', radius: '0.125rem', preview: '2px' },
  { key: 'rounded', label: 'Slightly rounded', radius: '0.5rem', preview: '5px' },
  { key: 'pill', label: 'Pill', radius: '9999px', preview: '9999px' },
]
const RADIUS_MAP = Object.fromEntries(RADIUS_OPTIONS.map(o => [o.key, o.radius]))

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case r: h = ((g - b) / d) % 6; break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: s * 100, l: l * 100 }
}

function hslToRgb(h, s, l) {
  s /= 100; l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c } else { r = c; b = x }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')
}

// Relative luminance (WCAG) decides direction: light backgrounds darken on hover,
// dark backgrounds lighten — so the hover state reads as "this button responded"
// rather than a translucent film sitting on top of it.
function relativeLuminance(r, g, b) {
  const [rl, gl, bl] = [r, g, b].map(c => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

function linkGroupHoverColor(bgHex, textHex, darkenAmount = 4, lightenAmount = 12) {
  if (!/^#[0-9a-f]{6}$/i.test(bgHex || '')) return '#f3f4f6'
  const { r, g, b } = hexToRgb(bgHex)
  const { h, s, l } = rgbToHsl(r, g, b)
  const newL = Math.max(0, Math.min(100, l + (relativeLuminance(r, g, b) > 0.5 ? -darkenAmount : lightenAmount)))

  // A near-white background is achromatic, so shifting its own (nonexistent) hue
  // just darkens straight to gray. Borrow the font color's hue/saturation instead,
  // at the same lightness, so the hover reads as a subtle tint rather than flat gray.
  const isNearWhiteBg = r > 245 && g > 245 && b > 245
  if (isNearWhiteBg && /^#[0-9a-f]{6}$/i.test(textHex || '')) {
    const t = hexToRgb(textHex)
    const textHsl = rgbToHsl(t.r, t.g, t.b)
    const tinted = hslToRgb(textHsl.h, textHsl.s, newL)
    return rgbToHex(tinted.r, tinted.g, tinted.b)
  }

  const shifted = hslToRgb(h, s, newL)
  return rgbToHex(shifted.r, shifted.g, shifted.b)
}

// A white (or near-white) border reads as a harsh ring against a colored button
// background, since it can't blend the way a darker outline does — drop it instead.
function linkGroupBorderColor(textColor) {
  if (!/^#[0-9a-f]{6}$/i.test(textColor || '')) return textColor
  const { r, g, b } = hexToRgb(textColor)
  return r > 245 && g > 245 && b > 245 ? 'transparent' : textColor
}

function LinkGroupNodeComponent({ links, radius, buttonColor, textColor, nodeKey, editor }) {
  const fontFamily = useContext(FontFamilyContext)
  const containerRef = useRef(null)
  const toolbarRef = useRef(null)
  const textColorBtnRef = useRef(null)
  const bgColorBtnRef = useRef(null)
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [isHovered, setIsHovered] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const [toolbarPos, setToolbarPos] = useState(null)
  const [colorPanel, setColorPanel] = useState(null) // 'text' | 'bg' | null
  const [dragOrder, setDragOrder] = useState(null) // working array while a drag is in progress
  const dragIndexRef = useRef(null)

  const showToolbar = (isSelected || colorPanel !== null) && editingIndex === null

  useLayoutEffect(() => {
    if (!showToolbar || !containerRef.current) { setToolbarPos(null); return }
    function calc() {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = toolbarRef.current?.offsetWidth || 280
      let left = rect.left + window.scrollX + rect.width / 2 - width / 2
      left = Math.max(8, Math.min(left, window.innerWidth + window.scrollX - width - 8))
      let top = rect.top + window.scrollY - 48
      if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + 8
      setToolbarPos({ top, left })
    }
    calc()
    window.addEventListener('scroll', calc, true)
    window.addEventListener('resize', calc)
    return () => { window.removeEventListener('scroll', calc, true); window.removeEventListener('resize', calc) }
  }, [showToolbar])

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

  // Reads/writes the node's live __links inside the same editor.update, rather than
  // computing the next array from the React `links` prop — avoids losing an update
  // when two link edits (add/remove/save) happen before Lexical re-renders this
  // component with fresh props.
  function updateLinks(updater) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!node) return
      const writable = node.getWritable()
      writable.__links = updater(writable.__links)
    })
  }

  function addLink() {
    updateLinks(current => [...current, { text: '', url: '', iconEnabled: true, icon: null }])
  }

  function removeLink(index) {
    updateLinks(current => current.filter((_, i) => i !== index))
  }

  function saveLink(index, updated) {
    updateLinks(current => {
      const next = [...current]
      next[index] = updated
      return next
    })
  }

  function setField(setter, val) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!node) return
      node.getWritable()[setter](val)
    })
  }

  function handleDragStart(index) {
    dragIndexRef.current = index
    setDragOrder(links)
  }

  function handleDragEnter(overIndex) {
    if (dragIndexRef.current === null) return
    setDragOrder(current => {
      if (!current) return current
      const from = dragIndexRef.current
      if (from === overIndex) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(overIndex, 0, moved)
      dragIndexRef.current = overIndex
      return next
    })
  }

  // `committed` is false when the browser reports the drag was cancelled (Escape,
  // or dropped outside any valid target) — in that case discard the in-progress
  // reorder instead of saving it. Comparing dragOrder to the original `links`
  // reference (rather than just truthiness) also skips the update entirely when
  // the handle was clicked/released without ever moving over another row.
  function handleDragEnd(committed) {
    if (committed && dragOrder && dragOrder !== links) updateLinks(() => dragOrder)
    setDragOrder(null)
    dragIndexRef.current = null
  }

  const itemRadius = RADIUS_MAP[radius] || RADIUS_MAP.rounded
  const displayLinks = dragOrder || links

  return (
    <div
      ref={containerRef}
      className={`my-2 py-3 max-w-lg mx-auto px-4 rounded-xl border border-dashed border-gray-200 transition-all ${
        isSelected ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex flex-col gap-[0.6rem]">
        {displayLinks.map((link, i) => (
          <div
            key={i}
            className={`relative group ${dragIndexRef.current === i && dragOrder ? 'opacity-50' : ''}`}
            onDragOver={e => { if (dragIndexRef.current === null) return; e.preventDefault(); handleDragEnter(i) }}
            onDrop={e => e.preventDefault()}
          >
            <button
              onClick={() => setEditingIndex(i)}
              style={{ borderRadius: itemRadius, borderColor: linkGroupBorderColor(textColor), color: link.text ? textColor : undefined, '--lg-bg': buttonColor, '--lg-hover-bg': linkGroupHoverColor(buttonColor, textColor), minHeight: '3.325rem', padding: '0.6rem 1.25rem' }}
              className={`link-group-editor-item relative overflow-hidden w-full flex items-center border text-base font-medium ${decoratorFontClass(fontFamily)}`}
            >
              <span className="absolute z-10 left-[0.65rem] top-1/2 -translate-y-1/2 flex items-center">
                <LinkGroupIconPreview link={link} />
              </span>
              <span className={`relative z-10 w-full text-center ${link.text ? '' : 'text-gray-400 font-normal'}`}>
                {link.text || 'Click to add link details'}
              </span>
            </button>
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); removeLink(i) }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-700 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={11} />
            </button>
            <div
              draggable
              onDragStart={e => {
                e.stopPropagation()
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(i))
                const row = e.currentTarget.parentElement
                if (row) e.dataTransfer.setDragImage(row, 20, 26)
                handleDragStart(i)
              }}
              onDragEnd={e => { e.stopPropagation(); handleDragEnd(e.dataTransfer.dropEffect !== 'none') }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              style={{ color: textColor }}
              className="absolute z-20 right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
            >
              <GripVertical size={15} />
            </div>
          </div>
        ))}

        <button
          onClick={addLink}
          style={{ borderRadius: itemRadius, minHeight: '3.25rem' }}
          className="w-full flex items-center justify-center gap-1.5 px-4 border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors text-sm font-medium font-sans"
        >
          <Plus size={15} /> Add new link
        </button>
      </div>

      {editingIndex !== null && links[editingIndex] && (
        <LinkGroupEditModal
          link={links[editingIndex]}
          onSave={updated => saveLink(editingIndex, updated)}
          onClose={() => setEditingIndex(null)}
        />
      )}

      {showToolbar && toolbarPos && createPortal(
        <div
          ref={toolbarRef}
          style={{ position: 'absolute', top: toolbarPos.top, left: toolbarPos.left, zIndex: 9999 }}
          className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-xl px-1.5 py-1 shadow-2xl"
          onMouseDown={e => e.preventDefault()}
        >
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {RADIUS_OPTIONS.map(opt => (
              <Tooltip key={opt.key} content={opt.label}>
                <button
                  onClick={() => setField('setRadius', opt.key)}
                  className={`p-1.5 rounded-md transition-colors ${radius === opt.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <span className="block w-5 h-3 border-[1.5px] border-current" style={{ borderRadius: opt.preview }} />
                </button>
              </Tooltip>
            ))}
          </div>

          <div className="w-px h-5 bg-gray-200 mx-0.5" />

          <Tooltip content="Text color">
            <button
              ref={textColorBtnRef}
              className={`p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors ${colorPanel === 'text' ? 'bg-gray-100 text-gray-800' : ''}`}
              onClick={() => setColorPanel(p => p === 'text' ? null : 'text')}
            >
              <Type size={15} />
            </button>
          </Tooltip>
          {colorPanel === 'text' && (
            <ColorSwatchMenu
              anchorEl={textColorBtnRef.current}
              value={textColor}
              onChange={val => setField('setTextColor', val)}
              presets={['#000000', '#1f2937', '#374151', '#6b7280', '#9ca3af', '#ffffff']}
              onOpenChange={open => { if (!open) setColorPanel(null) }}
              initialOpen
            />
          )}

          <Tooltip content="Button color">
            <button
              ref={bgColorBtnRef}
              className={`p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors ${colorPanel === 'bg' ? 'bg-gray-100 text-gray-800' : ''}`}
              onClick={() => setColorPanel(p => p === 'bg' ? null : 'bg')}
            >
              <PaintBucket size={15} />
            </button>
          </Tooltip>
          {colorPanel === 'bg' && (
            <ColorSwatchMenu
              anchorEl={bgColorBtnRef.current}
              value={buttonColor}
              onChange={val => setField('setButtonColor', val)}
              presets={['#ffffff', '#f3f4f6', '#000000', '#146AF8', '#22c55e', '#ef4444']}
              onOpenChange={open => { if (!open) setColorPanel(null) }}
              initialOpen
            />
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── LinkGroupNode ────────────────────────────────────────────────────────────

export class LinkGroupNode extends DecoratorNode {
  static getType() { return 'linkGroup' }

  static clone(node) {
    return new LinkGroupNode(node.__links.map(l => ({ ...l })), node.__radius, node.__buttonColor, node.__textColor, node.__key)
  }

  static importJSON(data) {
    return new LinkGroupNode(data.links || [], data.radius || 'rounded', data.buttonColor || '#ffffff', data.textColor || '#111827')
  }

  exportJSON() {
    return {
      type: 'linkGroup', version: 1,
      links: this.__links.map(l => ({ ...l })),
      radius: this.__radius, buttonColor: this.__buttonColor, textColor: this.__textColor,
    }
  }

  static importDOM() {
    return {
      div: (node) => {
        if (!node.classList?.contains('link-group')) return null
        return {
          conversion: (domNode) => {
            const links = Array.from(domNode.querySelectorAll('a.link-group-item')).map(a => ({
              text: a.getAttribute('data-text') || '',
              url: a.getAttribute('href') || '',
              iconEnabled: a.getAttribute('data-icon-enabled') !== 'false',
              icon: a.getAttribute('data-icon') || null,
            }))
            const radius = domNode.getAttribute('data-radius') || 'rounded'
            const buttonColor = domNode.getAttribute('data-button-color') || '#ffffff'
            const textColor = domNode.getAttribute('data-text-color') || '#111827'
            return { node: new LinkGroupNode(links, radius, buttonColor, textColor) }
          },
          priority: 2,
        }
      },
    }
  }

  constructor(links = [], radius = 'rounded', buttonColor = '#ffffff', textColor = '#111827', key) {
    super(key)
    this.__links = links
    this.__radius = radius
    this.__buttonColor = buttonColor
    this.__textColor = textColor
  }

  createDOM() {
    const span = document.createElement('span')
    span.style.display = 'contents'
    return span
  }

  updateDOM() { return false }
  isInline() { return false }

  setLinks(links) { this.getWritable().__links = links }
  setRadius(radius) { this.getWritable().__radius = radius }
  setButtonColor(color) { this.getWritable().__buttonColor = color }
  setTextColor(color) { this.getWritable().__textColor = color }

  exportDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'link-group'
    wrap.setAttribute('data-radius', this.__radius)
    wrap.setAttribute('data-button-color', this.__buttonColor)
    wrap.setAttribute('data-text-color', this.__textColor)
    const itemRadius = RADIUS_MAP[this.__radius] || RADIUS_MAP.rounded
    for (const link of this.__links) {
      if (!link.url?.trim()) continue // no valid link — don't publish a dead button
      const a = document.createElement('a')
      a.className = 'link-group-item'
      a.href = link.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.setAttribute('data-text', link.text || '')
      a.setAttribute('data-icon-enabled', String(!!link.iconEnabled))
      a.setAttribute('data-icon', link.icon || '')
      a.style.borderRadius = itemRadius
      a.style.color = this.__textColor
      a.style.borderColor = linkGroupBorderColor(this.__textColor)
      a.style.setProperty('--lg-bg', this.__buttonColor)
      a.style.setProperty('--lg-hover-bg', linkGroupHoverColor(this.__buttonColor, this.__textColor))

      const resolved = resolveLinkIcon(link)
      if (resolved) {
        const iconSpan = document.createElement('span')
        iconSpan.className = 'link-group-icon'
        if (resolved.variant === 'platform') {
          const badge = document.createElement('span')
          badge.className = 'link-group-icon-badge'
          badge.innerHTML = resolved.value
          iconSpan.appendChild(badge)
        } else if (resolved.type === 'svg') {
          iconSpan.innerHTML = resolved.value
        } else {
          iconSpan.textContent = resolved.value
        }
        a.appendChild(iconSpan)
      }

      const textSpan = document.createElement('span')
      textSpan.className = 'link-group-text'
      textSpan.textContent = link.text || ''
      a.appendChild(textSpan)

      wrap.appendChild(a)
    }
    return { element: wrap }
  }

  decorate(editor) {
    return (
      <LinkGroupNodeComponent
        links={this.__links}
        radius={this.__radius}
        buttonColor={this.__buttonColor}
        textColor={this.__textColor}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createLinkGroupNode() {
  return new LinkGroupNode([])
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
        const html = generateSafeHtmlFromNodes(nestedEditor, null)
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
        const html = generateSafeHtmlFromNodes(nestedEditor, null)
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
  const fontFamily = useContext(FontFamilyContext)
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
                    className={`outline-none ${decoratorFontClass(fontFamily)} font-semibold text-gray-800 w-full leading-relaxed text-[18px] lg:text-[20px]`}
                  />
                }
                placeholder={
                  <div className={`text-gray-400 pointer-events-none absolute top-0 left-0 select-none ${decoratorFontClass(fontFamily)} font-semibold text-[18px] lg:text-[20px]`}>
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
                    className={`outline-none ${decoratorFontClass(fontFamily)} text-gray-700 w-full leading-relaxed text-[18px] lg:text-[20px]`}
                  />
                }
                placeholder={
                  <div className={`text-gray-400 pointer-events-none absolute top-3 left-4 select-none ${decoratorFontClass(fontFamily)} text-[18px] lg:text-[20px]`}>
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
  const { addToast } = useToast()
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
    navigator.clipboard.writeText(localCode).then(() => {
      setCopied(true)
      addToast({ message: 'Code copied' })
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
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
            wrap="off"
            onChange={e => { setLocalCode(e.target.value); commitCode(e.target.value) }}
            onFocus={() => setTextareaFocused(true)}
            onBlur={() => setTextareaFocused(false)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                requestAnimationFrame(() => { e.target.scrollLeft = 0 })
              }
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
            className="code-block-textarea block flex-1 p-0 pl-3 pr-8 py-2 bg-transparent outline-none resize-none font-mono text-sm leading-relaxed text-gray-800"
          />
        </div>
        <Tooltip content="Copy code">
          <button
            onClick={handleCopy}
            onMouseDown={e => e.preventDefault()}
            className={`absolute top-2 right-2 p-1 rounded bg-white text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-all ${isHovered || showRing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </Tooltip>
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
    // No inline onclick here — a page-level CSP (script-src, no 'unsafe-inline')
    // blocks inline event-handler attributes. The public blog page instead
    // wires this up via event delegation; see BlogPostPage.jsx's
    // '.code-block-copy' click handler, which reads these same icon strings.
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
        const html = generateSafeHtmlFromNodes(nestedEditor, null)
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

// The header's background video is mounted here imperatively, completely
// outside JSX/React's own reconciliation of the <video> element, and its
// mount effect depends ONLY on `src` — not on any of HeaderNodeComponent's
// many other props (shadowOverlay, textColorMode, buttonText, ...) — so it's
// created once per distinct file and left alone across unrelated panel
// re-renders. `muted` (property + attribute) is set before the element is
// attached to the DOM and before `.play()` is called, so there's no window
// where the browser could treat this as unmuted-audio autoplay.
//
// (The real source of the audio bug this whole file's history briefly
// chased through several dead ends — duplicate players, leaked instances,
// refcounting, watchdogs — turned out to live entirely in exportDOM(),
// not here: those methods never set a real `autoplay` attribute on their
// live-document-owned elements at all — see the comment on
// VideoNode.exportDOM() above and generateSafeHtmlFromNodes(). This
// component's simple mount-once/clean-up-once behavior was correct the
// whole time.)
const SPLIT_HEADER_VIDEO_STYLE = { margin: 0 }

function HeaderBgVideo({ src, className, style }) {
  const anchorRef = useRef(null)
  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor || !src) return
    const video = document.createElement('video')
    video.muted = true
    video.defaultMuted = true
    video.volume = 0
    video.setAttribute('muted', '')
    video.loop = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.disablePictureInPicture = true
    if (className) video.className = className
    if (style) Object.assign(video.style, style)
    video.src = `/api/uploads/${src}`
    anchor.parentNode.insertBefore(video, anchor.nextSibling)
    video.play().catch(() => {})
    return () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
    }
  }, [src, className]) // eslint-disable-line react-hooks/exhaustive-deps -- style is a plain object literal at call sites; intentionally excluded so this never re-runs for unrelated re-renders
  return <span ref={anchorRef} style={{ display: 'none' }} />
}

function HeaderNodeComponent({ layout, textAlign, heading, subheading, backgroundColor, buttonEnabled, buttonText, buttonUrl, buttonColor, headerImage, headerVideo, flipLayout, backgroundType, textColorMode, buttonTextColorMode, shadowOverlay, nodeKey, editor }) {
  const fontFamily = useContext(FontFamilyContext)
  const PANEL_WIDTH = 280
  const containerRef = useRef(null)
  const headingContainerRef = useRef(null)
  const subheadingContainerRef = useRef(null)
  const splitImageInputRef = useRef(null)
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [isHovered, setIsHovered] = useState(false)
  const [headingFocused, setHeadingFocused] = useState(false)
  const [subheadingFocused, setSubheadingFocused] = useState(false)
  const [panelFocused, setPanelFocused] = useState(false)
  const [bgPickerOpen, setBgPickerOpen] = useState(false)
  const [btnPickerOpen, setBtnPickerOpen] = useState(false)
  const [panelPos, setPanelPos] = useState(null)
  const [localButtonText, setLocalButtonText] = useState(buttonText)
  const [localButtonUrl, setLocalButtonUrl] = useState(buttonUrl)

  useEffect(() => { setLocalButtonText(buttonText) }, [buttonText])
  useEffect(() => { setLocalButtonUrl(buttonUrl) }, [buttonUrl])

  const headingEditor = useMemo(() => createEditor({ namespace: 'HeaderHeading', nodes: [LinkNode], theme: HEADER_NESTED_THEME, onError: console.error }), [])
  const subheadingEditor = useMemo(() => createEditor({ namespace: 'HeaderSubheading', nodes: [LinkNode], theme: HEADER_NESTED_THEME, onError: console.error }), [])

  const showRing = isSelected || headingFocused || subheadingFocused
  const showPanel = isSelected || headingFocused || subheadingFocused || panelFocused || bgPickerOpen || btnPickerOpen

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
        regular:    { rightShift: 140, overlap: 220 },
        wide:       { rightShift: -40, overlap: 320 },
        full:       { rightShift: -160, overlap: 380 },
        split:      { rightShift: -160, overlap: 380 },
        fullscreen: { rightShift: -160, overlap: 380 },
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

  const isFullish = layout === 'full' || layout === 'split' || layout === 'fullscreen'
  const outerClass = isFullish ? 'w-full' : layout === 'wide' ? 'max-w-7xl mx-auto' : 'max-w-3xl mx-auto header-regular-preview'
  const sideMargin = isFullish ? '' : 'mx-6'
  const textAlignClass   = textAlign === 'center' ? 'text-center' : 'text-left'
  // Unconditional (no md: prefix) so the editor's mobile preview matches exportDOM's
  // public HTML, which sets this same min-height as an inline style at every width —
  // previously the editor used a smaller mobile-only floor, so the header collapsed
  // shorter in the editor's mobile preview than it actually renders once published.
  const minHeightClass   = layout === 'fullscreen' ? 'min-h-screen' : layout === 'split' ? 'min-h-[600px]' : layout === 'full' ? 'min-h-[551px]' : layout === 'wide' ? 'min-h-[447px]' : 'min-h-[347px]'
  // Fullscreen ramps up across breakpoints (biggest at 2xl), rather than jumping straight
  // to its max size at md like the other layouts. leading-tight/snug (unitless, so they
  // scale correctly across every size above) keep wrapped lines tight instead of
  // inheriting the ambient prose line-height, which reads as an oversized gap at these
  // large heading/subheading font sizes.
  const headingTextClass = (layout === 'fullscreen' ? 'text-[28px] md:text-6xl xl:text-[66px] 2xl:text-7xl' : isFullish ? 'text-[28px] md:text-6xl' : layout === 'wide' ? 'text-[28px] md:text-5xl' : 'text-[28px] md:text-4xl') + ' leading-tight'
  const subTextClass     = (layout === 'fullscreen' ? 'text-base md:text-2xl xl:text-[27px] 2xl:text-3xl' : isFullish ? 'text-base md:text-2xl' : layout === 'wide' ? 'text-base md:text-[22px]' : 'text-base md:text-xl') + ' leading-snug'
  const btnTextClass     = layout === 'fullscreen' ? 'text-xl' : isFullish ? 'text-lg' : 'text-base'
  // Wide/full/fullscreen ramp side padding up gradually across breakpoints instead of
  // jumping straight from the mobile value to the full 256px at md, which otherwise
  // squeezes the heading into a narrow column on in-between (tablet/small laptop) widths.
  // Steps match index.css's public media queries exactly (no sm: step — the public CSS
  // has no breakpoint between the flat mobile value and md, so an sm: step here would
  // only apply in the editor and not on the published page).
  const paddingClass = layout === 'regular'
    ? 'px-8 md:px-20'
    : 'px-8 md:px-14 lg:px-24 xl:px-40 2xl:px-64'

  const hasBgImage = layout !== 'split' && backgroundType === 'image' && headerImage
  const hasBgVideo = layout !== 'split' && backgroundType === 'video' && headerVideo
  // background-size: cover is set via the .header-bg-image CSS class (index.css) rather
  // than inline, so the image always crops to fill the box at every width. backgroundColor
  // is a fallback in case the image is still loading or fails.
  const bgStyle = hasBgImage
    ? { backgroundColor, backgroundImage: `url(/api/uploads/${headerImage})`, backgroundRepeat: 'no-repeat', backgroundPosition: 'center center' }
    : { background: backgroundColor }

  const resolvedTextColor = resolveTextColor(textColorMode, backgroundColor)
  const resolvedButtonTextColor = resolveTextColor(buttonTextColorMode, buttonColor)

  const textContent = (
    <>
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
                style={{ color: resolvedTextColor }}
                className={`bg-transparent ${headingTextClass} font-bold ${decoratorFontClass(fontFamily)} outline-none w-full`}
              />
            }
            placeholder={
              <div style={{ color: resolvedTextColor, opacity: 0.5 }} className={`pointer-events-none absolute top-0 left-0 right-0 ${headingTextClass} font-bold ${decoratorFontClass(fontFamily)} select-none ${textAlignClass}`}>Heading</div>
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
                style={{ color: resolvedTextColor, opacity: 0.8 }}
                className={`bg-transparent ${subTextClass} ${decoratorFontClass(fontFamily)} outline-none w-full`}
              />
            }
            placeholder={
              <div style={{ color: resolvedTextColor, opacity: 0.4 }} className={`pointer-events-none absolute top-0 left-0 right-0 ${subTextClass} ${decoratorFontClass(fontFamily)} select-none ${textAlignClass}`}>Subheading</div>
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
            className={`inline-block px-5 py-2 rounded-lg ${btnTextClass} font-medium ${decoratorFontClass(fontFamily)} pointer-events-none select-none`}
            style={{ background: buttonColor, color: resolvedButtonTextColor }}
          >
            {localButtonText || <span style={{ color: resolvedButtonTextColor }}>Add button text</span>}
          </span>
        </div>
      )}
    </>
  )

  return (
    <>
      {/* Hidden file input for split image/video upload */}
      <input
        ref={splitImageInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={async e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          try {
            // file.type isn't always reliably populated by the browser/OS for
            // every video container, so fall back to the file extension —
            // matching backend/routes/admin_config.py's own ALLOWED_EXTENSIONS
            // video set — before assuming "not a video" defaults to image.
            const isVideo = file.type.startsWith('video/') ||
              /\.(mp4|webm|ogv|mov|avi)$/i.test(file.name)
            if (isVideo) {
              const { filename } = await handleUploadFull(file)
              commitField('setHeaderVideo', filename)
              commitField('setBackgroundType', 'video')
            } else {
              const { filename, lqip } = await handleUploadFull(file)
              commitField('setHeaderImage', filename)
              commitField('setHeaderImageLqip', lqip || '')
              commitField('setBackgroundType', 'image')
            }
          } catch {}
        }}
      />

      <div
        className={`my-4 header-block-editor ${outerClass}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {layout === 'split' ? (
          <div
            ref={containerRef}
            className={`${sideMargin} ${minHeightClass} flex flex-col ${flipLayout ? 'md:flex-row-reverse' : 'md:flex-row'} ${showRing ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}
          >
            {/* Image/video side */}
            {/* h-[240px] (not min-h) below md so the media's height:100% has a definite
                height to resolve against — min-height alone doesn't establish one, which
                left the media at its auto/intrinsic height with a gap below it on mobile. */}
            {(() => {
              const splitHasVideo = backgroundType === 'video' && headerVideo
              const splitMedia = splitHasVideo ? headerVideo : headerImage
              return (
                <div
                  className={`w-full md:w-1/2 h-[240px] md:h-auto bg-white flex items-center justify-center overflow-hidden relative group ${!splitMedia ? 'cursor-pointer' : ''}`}
                  onClick={!splitMedia ? () => splitImageInputRef.current?.click() : undefined}
                >
                  {splitHasVideo ? (
                    // Inline margin:0 beats @tailwindcss/typography's ".prose video"
                    // 2em top/bottom margin — without it the video sits 32px below
                    // the box's top edge, clipped by the box's own overflow:hidden.
                    <HeaderBgVideo src={headerVideo} className="w-full h-full object-cover" style={SPLIT_HEADER_VIDEO_STYLE} />
                  ) : headerImage ? (
                    <img
                      src={`/api/uploads/${headerImage}`}
                      className="w-full h-full object-cover"
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 border-2 border-dashed border-gray-200 rounded-lg px-10 py-8 pointer-events-none">
                      <ImageIcon size={40} strokeWidth={1.5} className="text-gray-300" />
                      <span className="text-sm text-gray-400">Click to upload image or video</span>
                    </div>
                  )}
                  {/* Split shows the shadow overlay on the image/video side, not the text side */}
                  {splitMedia && shadowOverlay && (
                    <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: 0.35 }} />
                  )}
                  {/* Upload / delete buttons — only shown when media exists, visible on hover */}
                  {splitMedia && (
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white border border-gray-200 rounded-lg shadow-sm p-1">
                      <button
                        type="button"
                        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); splitImageInputRef.current?.click() }}
                        className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
                        aria-label="Upload image or video"
                      >
                        <Upload size={12} className="text-gray-500" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={e => {
                          e.preventDefault(); e.stopPropagation()
                          commitField('setHeaderImage', null); commitField('setHeaderImageLqip', '')
                          commitField('setHeaderVideo', null); commitField('setBackgroundType', 'color')
                        }}
                        className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors"
                        aria-label="Delete media"
                      >
                        <Trash2 size={12} className="text-red-400" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Text side */}
            {/* min-h-[240px] matches the image side's own fixed mobile height (above) so
                neither side collapses shorter than the other; md:min-h-0 lets desktop's
                flex row stretch it to match the image side's height as before. */}
            <div
              className={`w-full md:w-1/2 min-h-[240px] md:min-h-0 flex flex-col justify-center gap-3 pl-8 pr-8 py-6 md:pl-24 md:pr-12 md:py-10`}
              style={{ background: backgroundColor }}
            >
              {textContent}
            </div>
          </div>
        ) : (
          <div
            ref={containerRef}
            style={bgStyle}
            className={`${shadowOverlay || hasBgVideo ? 'relative overflow-hidden' : ''} ${hasBgImage ? 'header-bg-image' : ''} ${sideMargin} ${minHeightClass} ${paddingClass} py-6 md:py-10 flex flex-col justify-center gap-3 ${showRing ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}
          >
            {hasBgVideo && (
              <HeaderBgVideo src={headerVideo} className="header-bg-video" />
            )}
            {shadowOverlay || hasBgVideo ? (
              <>
                {shadowOverlay && <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: 0.35 }} />}
                <div className="relative flex flex-col gap-3">{textContent}</div>
              </>
            ) : textContent}
          </div>
        )}
      </div>

      {showPanel && panelPos && createPortal(
        <div
          style={{ position: 'absolute', top: panelPos.top, left: panelPos.left, zIndex: 9999, width: PANEL_WIDTH }}
          className="bg-white border border-gray-200 rounded-xl shadow-xl py-4 px-4 flex flex-col gap-3"
          onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
          onFocus={() => setPanelFocused(true)}
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setPanelFocused(false) }}
        >
          {/* Layout */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Layout</span>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <Tooltip content="Regular width">
                <button
                  className={`p-1.5 rounded-md transition-colors ${layout === 'regular' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => commitField('setLayout', 'regular')}
                >
                  <RectangleHorizontal size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Wide width">
                <button
                  className={`p-1.5 rounded-md transition-colors ${layout === 'wide' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => commitField('setLayout', 'wide')}
                >
                  <StretchHorizontal size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Full width">
                <button
                  className={`p-1.5 rounded-md transition-colors ${layout === 'full' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => commitField('setLayout', 'full')}
                >
                  <Maximize2 size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Split">
                <button
                  className={`p-1.5 rounded-md transition-colors ${layout === 'split' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => commitField('setLayout', 'split')}
                >
                  <Columns2 size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Full screen">
                <button
                  className={`p-1.5 rounded-md transition-colors ${layout === 'fullscreen' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => commitField('setLayout', 'fullscreen')}
                >
                  <Fullscreen size={15} />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Flip Layout — split only */}
          {layout === 'split' && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Flip Layout</span>
              <div
                onClick={() => commitField('setFlipLayout', !flipLayout)}
                className={`relative w-7 h-4 rounded-full cursor-pointer transition-colors ${flipLayout ? 'bg-blue-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${flipLayout ? 'translate-x-3' : ''}`} />
              </div>
            </div>
          )}

          {/* Alignment */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Alignment</span>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <Tooltip content="Align left">
                <button
                  className={`p-1.5 rounded-md transition-colors ${textAlign !== 'center' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => commitField('setTextAlign', 'left')}
                >
                  <AlignLeft size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Align center">
                <button
                  className={`p-1.5 rounded-md transition-colors ${textAlign === 'center' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => commitField('setTextAlign', 'center')}
                >
                  <AlignCenter size={15} />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Background */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Background</span>
            <ColorSwatchMenu
              value={backgroundColor}
              onChange={val => { commitField('setBackgroundColor', val); commitField('setBackgroundType', 'color') }}
              presets={['#000000', '#f3f4f6']}
              presetLabels={['Black', 'Gray']}
              imageFilename={headerImage}
              imageActive={backgroundType === 'image'}
              imageHidden={layout === 'split'}
              onImageUpload={(filename, lqip) => { commitField('setHeaderImage', filename); commitField('setHeaderImageLqip', lqip || ''); commitField('setBackgroundType', 'image') }}
              onImageSelect={() => commitField('setBackgroundType', 'image')}
              onImageDelete={() => { commitField('setHeaderImage', null); commitField('setHeaderImageLqip', ''); commitField('setBackgroundType', 'color') }}
              videoFilename={headerVideo}
              videoActive={backgroundType === 'video'}
              videoHidden={layout === 'split'}
              onVideoUpload={filename => { commitField('setHeaderVideo', filename); commitField('setBackgroundType', 'video') }}
              onVideoSelect={() => commitField('setBackgroundType', 'video')}
              onVideoDelete={() => { commitField('setHeaderVideo', null); commitField('setBackgroundType', 'color') }}
              onOpenChange={setBgPickerOpen}
            />
          </div>

          {/* Shadow overlay */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Shadow Overlay</span>
            <div
              onClick={() => commitField('setShadowOverlay', !shadowOverlay)}
              className={`relative w-7 h-4 rounded-full cursor-pointer transition-colors ${shadowOverlay ? 'bg-blue-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${shadowOverlay ? 'translate-x-3' : ''}`} />
            </div>
          </div>

          {/* Text color */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Text color</span>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <Tooltip content="Auto">
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} onClick={() => commitField('setTextColorMode', 'auto')} className={`p-1.5 rounded-md transition-colors ${textColorMode === 'auto' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Eclipse size={15} /></button>
              </Tooltip>
              <Tooltip content="Light">
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} onClick={() => commitField('setTextColorMode', 'light')} className={`p-1.5 rounded-md transition-colors ${textColorMode === 'light' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Sun size={15} /></button>
              </Tooltip>
              <Tooltip content="Dark">
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} onClick={() => commitField('setTextColorMode', 'dark')} className={`p-1.5 rounded-md transition-colors ${textColorMode === 'dark' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Moon size={15} /></button>
              </Tooltip>
            </div>
          </div>

          {/* Button toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Button</span>
            <div
              onClick={() => commitField('setButtonEnabled', !buttonEnabled)}
              className={`relative w-7 h-4 rounded-full cursor-pointer transition-colors ${buttonEnabled ? 'bg-blue-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${buttonEnabled ? 'translate-x-3' : ''}`} />
            </div>
          </div>

          {buttonEnabled && (
            <>
              {/* Button color */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Button Color</span>
                <ColorSwatchMenu
                  value={buttonColor}
                  onChange={val => commitField('setButtonColor', val)}
                  presets={['#ffffff', '#000000']}
                  onOpenChange={setBtnPickerOpen}
                />
              </div>

              {/* Button text color */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Button text color</span>
                <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
                  <Tooltip content="Auto">
                    <button onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} onClick={() => commitField('setButtonTextColorMode', 'auto')} className={`p-1.5 rounded-md transition-colors ${buttonTextColorMode === 'auto' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Eclipse size={15} /></button>
                  </Tooltip>
                  <Tooltip content="Light">
                    <button onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} onClick={() => commitField('setButtonTextColorMode', 'light')} className={`p-1.5 rounded-md transition-colors ${buttonTextColorMode === 'light' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Sun size={15} /></button>
                  </Tooltip>
                  <Tooltip content="Dark">
                    <button onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} onClick={() => commitField('setButtonTextColorMode', 'dark')} className={`p-1.5 rounded-md transition-colors ${buttonTextColorMode === 'dark' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Moon size={15} /></button>
                  </Tooltip>
                </div>
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
    return new HeaderNode(node.__layout, node.__textAlign, node.__heading, node.__subheading, node.__backgroundColor, node.__buttonEnabled, node.__buttonText, node.__buttonUrl, node.__buttonColor, node.__headerImage, node.__headerImageLqip, node.__flipLayout, node.__backgroundType, node.__textColorMode, node.__buttonTextColorMode, node.__shadowOverlay, node.__headerVideo, node.__key)
  }

  static importJSON(data) {
    return new HeaderNode(
      data.layout || 'regular',
      data.textAlign || 'left',
      data.heading || '',
      data.subheading || '',
      data.backgroundColor || '#000000',
      data.buttonEnabled || false,
      data.buttonText || '',
      data.buttonUrl || '',
      data.buttonColor || '#3b82f6',
      data.headerImage || null,
      data.headerImageLqip || '',
      data.flipLayout || false,
      data.backgroundType || 'color',
      data.textColorMode || 'auto',
      data.buttonTextColorMode || 'auto',
      data.shadowOverlay || false,
      data.headerVideo || null,
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
      headerImage: this.__headerImage,
      headerImageLqip: this.__headerImageLqip,
      flipLayout: this.__flipLayout,
      backgroundType: this.__backgroundType,
      textColorMode: this.__textColorMode,
      buttonTextColorMode: this.__buttonTextColorMode,
      shadowOverlay: this.__shadowOverlay,
      headerVideo: this.__headerVideo,
    }
  }

  static importDOM() {
    return {
      header: (node) => {
        if (!node.classList?.contains('header-regular') &&
            !node.classList?.contains('header-wide') &&
            !node.classList?.contains('header-full') &&
            !node.classList?.contains('header-split') &&
            !node.classList?.contains('header-fullscreen')) return null
        return {
          conversion: (domNode) => {
            const layout = domNode.getAttribute('data-layout') || 'regular'
            const heading = domNode.querySelector('.header-heading')?.innerHTML || ''
            const subheading = domNode.querySelector('.header-subheading')?.innerHTML || ''
            const backgroundColor =
              domNode.getAttribute('data-background-color') ||
              domNode.querySelector('.header-inner')?.style.background ||
              domNode.querySelector('.header-split-text')?.style.background ||
              '#1e293b'
            const buttonEnabled = domNode.getAttribute('data-button-enabled') === 'true'
            const buttonText = domNode.getAttribute('data-button-text') || ''
            const buttonUrl = domNode.getAttribute('data-button-url') || ''
            const buttonColor = domNode.getAttribute('data-button-color') || '#ffffff'
            const textAlign = domNode.getAttribute('data-text-align') || 'left'
            const headerImage = domNode.getAttribute('data-header-image') || null
            const headerImageLqip = domNode.getAttribute('data-header-image-lqip') || ''
            const flipLayout = domNode.getAttribute('data-flip-layout') === 'true'
            const backgroundType = domNode.getAttribute('data-background-type') || 'color'
            const textColorMode = domNode.getAttribute('data-text-color-mode') || 'auto'
            const buttonTextColorMode = domNode.getAttribute('data-button-text-color-mode') || 'auto'
            const shadowOverlay = domNode.getAttribute('data-shadow-overlay') === 'true'
            const headerVideo = domNode.getAttribute('data-header-video') || null
            return { node: new HeaderNode(layout, textAlign, heading, subheading, backgroundColor, buttonEnabled, buttonText, buttonUrl, buttonColor, headerImage, headerImageLqip, flipLayout, backgroundType, textColorMode, buttonTextColorMode, shadowOverlay, headerVideo) }
          },
          priority: 2,
        }
      },
    }
  }

  constructor(layout = 'regular', textAlign = 'left', heading = '', subheading = '', backgroundColor = '#000000', buttonEnabled = false, buttonText = '', buttonUrl = '', buttonColor = '#ffffff', headerImage = null, headerImageLqip = '', flipLayout = false, backgroundType = 'color', textColorMode = 'auto', buttonTextColorMode = 'auto', shadowOverlay = false, headerVideo = null, key) {
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
    this.__headerImage = headerImage
    this.__headerImageLqip = headerImageLqip
    this.__flipLayout = flipLayout
    this.__backgroundType = backgroundType
    this.__textColorMode = textColorMode
    this.__buttonTextColorMode = buttonTextColorMode
    this.__shadowOverlay = shadowOverlay
    this.__headerVideo = headerVideo
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
  setHeaderImage(val) { this.getWritable().__headerImage = val }
  setHeaderImageLqip(val) { this.getWritable().__headerImageLqip = val }
  setFlipLayout(val) { this.getWritable().__flipLayout = val }
  setBackgroundType(val) { this.getWritable().__backgroundType = val }
  setTextColorMode(val) { this.getWritable().__textColorMode = val }
  setButtonTextColorMode(val) { this.getWritable().__buttonTextColorMode = val }
  setShadowOverlay(val) { this.getWritable().__shadowOverlay = val }
  setHeaderVideo(val) { this.getWritable().__headerVideo = val }

  exportDOM() {
    const heights      = { regular: '347px', wide: '447px', full: '551px', split: '600px', fullscreen: '100vh' }
    // Fullscreen's base (below xl) matches full width's size — the CSS media queries in
    // index.css (min-width: 1280px/1536px) ramp it up further at xl and 2xl.
    const headingSizes = { regular: '36px',  wide: '48px',  full: '60px',  split: '60px',  fullscreen: '60px' }
    const subSizes     = { regular: '20px',  wide: '22px',  full: '24px',  split: '24px',  fullscreen: '24px' }
    const btnSizes     = { regular: '16px',  wide: '16px',  full: '18px',  split: '18px',  fullscreen: '20px' }

    const header = document.createElement('header')
    header.className = `header-${this.__layout}`
    header.setAttribute('data-layout', this.__layout)
    header.setAttribute('data-button-enabled', String(this.__buttonEnabled))
    header.setAttribute('data-button-text', this.__buttonText)
    header.setAttribute('data-button-url', this.__buttonUrl)
    header.setAttribute('data-button-color', this.__buttonColor)
    header.setAttribute('data-text-align', this.__textAlign)
    if (this.__headerImage) header.setAttribute('data-header-image', this.__headerImage)
    if (this.__headerImageLqip) header.setAttribute('data-header-image-lqip', this.__headerImageLqip)
    if (this.__headerVideo) header.setAttribute('data-header-video', this.__headerVideo)
    header.setAttribute('data-flip-layout', String(this.__flipLayout))
    header.setAttribute('data-background-color', this.__backgroundColor)
    header.setAttribute('data-background-type', this.__backgroundType)
    header.setAttribute('data-text-color-mode', this.__textColorMode)
    header.setAttribute('data-button-text-color-mode', this.__buttonTextColorMode)
    header.setAttribute('data-shadow-overlay', String(this.__shadowOverlay))

    if (this.__layout === 'split') {
      header.style.display = 'flex'
      header.style.flexDirection = this.__flipLayout ? 'row-reverse' : 'row'
      header.style.minHeight = heights.split

      const imgSide = document.createElement('div')
      imgSide.className = 'header-split-image'
      imgSide.style.width = '50%'
      imgSide.style.background = '#ffffff'
      imgSide.style.display = 'flex'
      imgSide.style.alignItems = 'center'
      imgSide.style.justifyContent = 'center'
      imgSide.style.overflow = 'hidden'
      const splitHasVideo = this.__backgroundType === 'video' && this.__headerVideo
      if (splitHasVideo || this.__headerImage) {
        if (splitHasVideo) {
          const video = document.createElement('video')
          // See the matching comment in VideoNode.exportDOM() above: this
          // element is detached (only used to build an HTML string) but is
          // still owned by the live document, so a real `autoplay` attribute
          // would start a genuine audio-capable player on every editor
          // update, not just on save. The real `autoplay` attribute is never
          // set here — `generateSafeHtmlFromNodes()` swaps the
          // `data-export-autoplay` marker back in as a string afterward.
          video.muted = true
          video.defaultMuted = true
          video.volume = 0
          video.setAttribute('src', `/api/uploads/${this.__headerVideo}`)
          video.setAttribute('data-export-autoplay', '')
          video.setAttribute('muted', '')
          video.setAttribute('loop', '')
          video.setAttribute('playsinline', '')
          video.setAttribute('disablepictureinpicture', '')
          video.style.width = '100%'
          video.style.height = '100%'
          video.style.objectFit = 'cover'
          // Inline margin:0 beats @tailwindcss/typography's ".prose video" 2em
          // top/bottom margin (see .header-bg-video's comment in index.css for
          // the same issue on the other layouts) — without it the video sits
          // 32px below the box's top edge, clipped by imgSide's overflow:hidden.
          video.style.margin = '0'
          imgSide.appendChild(video)
        } else {
          const img = document.createElement('img')
          img.src = `/api/uploads/${this.__headerImage}`
          img.style.width = '100%'
          img.style.height = '100%'
          img.style.objectFit = 'cover'
          imgSide.appendChild(img)
        }

        // Split shows the shadow overlay on the image/video side, not the text side
        if (this.__shadowOverlay) {
          imgSide.style.position = 'relative'
          const overlay = document.createElement('div')
          overlay.style.position = 'absolute'
          overlay.style.inset = '0'
          overlay.style.background = '#000000'
          overlay.style.opacity = '0.35'
          overlay.style.pointerEvents = 'none'
          imgSide.appendChild(overlay)
        }
      }

      const textSide = document.createElement('div')
      textSide.className = 'header-split-text'
      textSide.style.width = '50%'
      textSide.style.background = this.__backgroundColor
      textSide.style.display = 'flex'
      textSide.style.flexDirection = 'column'
      textSide.style.justifyContent = 'center'
      textSide.style.padding = '40px 48px 40px 96px'
      textSide.style.textAlign = this.__textAlign || 'left'

      const textContentWrap = textSide

      const headingColor = resolveTextColor(this.__textColorMode, this.__backgroundColor)

      const headingEl = document.createElement('div')
      headingEl.className = 'header-heading'
      headingEl.style.fontSize = headingSizes.split
      headingEl.style.lineHeight = '1.25'
      headingEl.style.fontWeight = 'bold'
      headingEl.style.color = headingColor
      headingEl.innerHTML = this.__heading
      textContentWrap.appendChild(headingEl)

      if (!isBlankHtml(this.__subheading)) {
        const subEl = document.createElement('div')
        subEl.className = 'header-subheading'
        subEl.style.fontSize = subSizes.split
        subEl.style.lineHeight = '1.375'
        subEl.style.color = headingColor === 'white' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)'
        subEl.innerHTML = this.__subheading
        textContentWrap.appendChild(subEl)
      }

      if (this.__buttonEnabled) {
        const btnWrap = document.createElement('div')
        btnWrap.style.textAlign = this.__textAlign || 'left'
        btnWrap.style.marginTop = '0.5rem'
        const a = document.createElement('a')
        a.className = 'header-btn'
        if (this.__buttonUrl) a.href = this.__buttonUrl
        a.textContent = this.__buttonText
        a.style.background = this.__buttonColor
        a.style.color = resolveTextColor(this.__buttonTextColorMode, this.__buttonColor)
        a.style.fontSize = btnSizes.split
        a.style.display = 'inline-block'
        a.style.padding = '0.5rem 1.25rem'
        a.style.borderRadius = '0.5rem'
        a.style.fontWeight = '500'
        a.style.textDecoration = 'none'
        btnWrap.appendChild(a)
        textContentWrap.appendChild(btnWrap)
      }

      header.appendChild(imgSide)
      header.appendChild(textSide)
    } else {
      const hasBgImage = this.__backgroundType === 'image' && this.__headerImage
      const hasBgVideo = this.__backgroundType === 'video' && this.__headerVideo
      // background-size: cover is set via the .header-bg-image CSS class (index.css) rather
      // than inline, so the image always crops to fill the box at every width. backgroundColor
      // is a fallback in case the image is still loading or fails.
      const bgStyle = hasBgImage
        ? { backgroundColor: this.__backgroundColor, backgroundImage: `url(/api/uploads/${this.__headerImage})`, backgroundRepeat: 'no-repeat', backgroundPosition: 'center center' }
        : { background: this.__backgroundColor }

      if (this.__layout === 'regular') {
        header.style.maxWidth = '48rem'
        header.style.marginLeft = 'auto'
        header.style.marginRight = 'auto'
      }

      const inner = document.createElement('div')
      inner.className = hasBgImage ? 'header-inner header-bg-image' : 'header-inner'
      Object.assign(inner.style, bgStyle)
      inner.style.minHeight = heights[this.__layout] || '347px'
      inner.style.textAlign = this.__textAlign || 'left'
      inner.style.display = 'flex'
      inner.style.flexDirection = 'column'
      inner.style.justifyContent = 'center'
      inner.style.padding = `40px ${this.__layout === 'regular' ? '80px' : '256px'}`
      inner.style.boxSizing = 'border-box'

      if (hasBgVideo) {
        inner.style.position = 'relative'
        inner.style.overflow = 'hidden'
        const video = document.createElement('video')
        // See the matching comment in VideoNode.exportDOM() for why the real
        // `autoplay` attribute is never set on this live element.
        video.muted = true
        video.defaultMuted = true
        video.volume = 0
        video.setAttribute('src', `/api/uploads/${this.__headerVideo}`)
        video.setAttribute('data-export-autoplay', '')
        video.setAttribute('muted', '')
        video.setAttribute('loop', '')
        video.setAttribute('playsinline', '')
        video.setAttribute('disablepictureinpicture', '')
        video.className = 'header-bg-video'
        inner.appendChild(video)
      }

      // Content (and the shadow overlay, if enabled) must sit in a positioned wrapper so
      // it paints above the background video — an absolutely-positioned video otherwise
      // paints on top of plain in-flow content regardless of DOM order.
      let innerContentWrap = inner
      if (this.__shadowOverlay || hasBgVideo) {
        inner.style.position = 'relative'

        if (this.__shadowOverlay) {
          const overlay = document.createElement('div')
          overlay.style.position = 'absolute'
          overlay.style.inset = '0'
          overlay.style.background = '#000000'
          overlay.style.opacity = '0.35'
          overlay.style.pointerEvents = 'none'
          inner.appendChild(overlay)
        }

        innerContentWrap = document.createElement('div')
        innerContentWrap.style.position = 'relative'
        inner.appendChild(innerContentWrap)
      }

      const headingColor = resolveTextColor(this.__textColorMode, this.__backgroundColor)

      const headingEl = document.createElement('div')
      headingEl.className = 'header-heading'
      headingEl.style.fontSize = headingSizes[this.__layout] || '36px'
      headingEl.style.lineHeight = '1.25'
      headingEl.style.fontWeight = 'bold'
      headingEl.style.color = headingColor
      headingEl.innerHTML = this.__heading
      innerContentWrap.appendChild(headingEl)

      if (!isBlankHtml(this.__subheading)) {
        const subEl = document.createElement('div')
        subEl.className = 'header-subheading'
        subEl.style.fontSize = subSizes[this.__layout] || '20px'
        subEl.style.lineHeight = '1.375'
        subEl.style.color = headingColor === 'white' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)'
        subEl.innerHTML = this.__subheading
        innerContentWrap.appendChild(subEl)
      }

      if (this.__buttonEnabled) {
        const btnWrap = document.createElement('div')
        btnWrap.style.textAlign = this.__textAlign || 'left'
        btnWrap.style.marginTop = '0.5rem'
        const a = document.createElement('a')
        a.className = 'header-btn'
        if (this.__buttonUrl) a.href = this.__buttonUrl
        a.textContent = this.__buttonText
        a.style.background = this.__buttonColor
        a.style.color = resolveTextColor(this.__buttonTextColorMode, this.__buttonColor)
        a.style.fontSize = btnSizes[this.__layout] || '16px'
        a.style.display = 'inline-block'
        a.style.padding = '0.5rem 1.25rem'
        a.style.borderRadius = '0.5rem'
        a.style.fontWeight = '500'
        a.style.textDecoration = 'none'
        btnWrap.appendChild(a)
        innerContentWrap.appendChild(btnWrap)
      }

      header.appendChild(inner)
    }

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
        headerImage={this.__headerImage}
        headerVideo={this.__headerVideo}
        flipLayout={this.__flipLayout}
        backgroundType={this.__backgroundType}
        textColorMode={this.__textColorMode}
        buttonTextColorMode={this.__buttonTextColorMode}
        shadowOverlay={this.__shadowOverlay}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createHeaderNode() {
  return new HeaderNode()
}

// ─── YouTubeNodeComponent ─────────────────────────────────────────────────────

function YouTubeNodeComponent({ videoId, caption, nodeKey, editor }) {
  const fontFamily = useContext(FontFamilyContext)
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [captionFocused, setCaptionFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
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

  function handleCaptionChange(e) {
    const val = e.target.value
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof YouTubeNode) node.getWritable().__caption = val
    })
  }

  return (
    <figure
      ref={figRef}
      style={{ maxWidth: '740px' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`my-4 mx-auto media-regular-preview rounded-lg overflow-hidden transition-all select-none ${showRing ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}
    >
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="YouTube video"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
        />
      </div>
      <figcaption className="mt-0">
        <input
          type="text"
          value={caption}
          onChange={handleCaptionChange}
          onFocus={() => setCaptionFocused(true)}
          onBlur={() => setCaptionFocused(false)}
          onClick={e => e.stopPropagation()}
          placeholder="Type caption (optional)"
          className={`w-full ${decoratorFontClass(fontFamily)} text-sm text-gray-500 text-center bg-transparent border-0 outline-none py-2 px-4 placeholder-gray-400 select-text`}
        />
      </figcaption>
    </figure>
  )
}

// ─── YouTubeNode ──────────────────────────────────────────────────────────────

export class YouTubeNode extends DecoratorNode {
  static getType() { return 'youtube' }
  static clone(node) { return new YouTubeNode(node.__videoId, node.__caption, node.__key) }

  static importJSON(data) {
    return new YouTubeNode(data.videoId || '', data.caption || '')
  }
  exportJSON() {
    return { type: 'youtube', version: 1, videoId: this.__videoId, caption: this.__caption }
  }

  static importDOM() {
    return {
      figure: (node) => {
        if (!node.classList?.contains('embed-youtube')) return null
        return {
          conversion: (domNode) => {
            const iframe = domNode.querySelector('iframe')
            if (!iframe) return null
            const src = iframe.getAttribute('src') || ''
            const videoId = src.split('/embed/')[1]?.split('?')[0] || ''
            const caption = domNode.querySelector('figcaption')?.textContent?.trim() || ''
            return { node: new YouTubeNode(videoId, caption) }
          },
          priority: 2,
        }
      },
    }
  }

  constructor(videoId = '', caption = '', key) {
    super(key)
    this.__videoId = videoId
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
    if (!this.__videoId) return { element: null }

    const figure = document.createElement('figure')
    figure.className = 'embed embed-youtube'
    figure.style.cssText = 'max-width:740px;margin:1.5rem auto;border-radius:0.5rem;overflow:hidden'

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'position:relative;padding-bottom:56.25%;height:0'

    const iframe = document.createElement('iframe')
    iframe.setAttribute('src', `https://www.youtube.com/embed/${this.__videoId}`)
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture')
    iframe.setAttribute('allowfullscreen', '')
    iframe.setAttribute('title', 'YouTube video')
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none'

    wrapper.appendChild(iframe)
    figure.appendChild(wrapper)

    if (this.__caption) {
      const figcaption = document.createElement('figcaption')
      figcaption.textContent = this.__caption
      figcaption.style.textAlign = 'center'
      figure.appendChild(figcaption)
    }

    return { element: figure }
  }

  decorate(editor) {
    return (
      <YouTubeNodeComponent
        videoId={this.__videoId}
        caption={this.__caption}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createYouTubeNode(videoId, caption = '') {
  return new YouTubeNode(videoId, caption)
}

// ─── VimeoNodeComponent ───────────────────────────────────────────────────────

function VimeoNodeComponent({ videoId, caption, nodeKey, editor }) {
  const fontFamily = useContext(FontFamilyContext)
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [captionFocused, setCaptionFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
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

  function handleCaptionChange(e) {
    const val = e.target.value
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof VimeoNode) node.getWritable().__caption = val
    })
  }

  return (
    <figure
      ref={figRef}
      style={{ maxWidth: '740px' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`my-4 mx-auto media-regular-preview rounded-lg overflow-hidden transition-all select-none ${showRing ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}
    >
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
        <iframe
          src={`https://player.vimeo.com/video/${videoId}`}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title="Vimeo video"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
        />
      </div>
      <figcaption className="mt-0">
        <input
          type="text"
          value={caption}
          onChange={handleCaptionChange}
          onFocus={() => setCaptionFocused(true)}
          onBlur={() => setCaptionFocused(false)}
          onClick={e => e.stopPropagation()}
          placeholder="Type caption (optional)"
          className={`w-full ${decoratorFontClass(fontFamily)} text-sm text-gray-500 text-center bg-transparent border-0 outline-none py-2 px-4 placeholder-gray-400 select-text`}
        />
      </figcaption>
    </figure>
  )
}

// ─── VimeoNode ────────────────────────────────────────────────────────────────

export class VimeoNode extends DecoratorNode {
  static getType() { return 'vimeo' }
  static clone(node) { return new VimeoNode(node.__videoId, node.__caption, node.__key) }

  static importJSON(data) {
    return new VimeoNode(data.videoId || '', data.caption || '')
  }
  exportJSON() {
    return { type: 'vimeo', version: 1, videoId: this.__videoId, caption: this.__caption }
  }

  static importDOM() {
    return {
      figure: (node) => {
        if (!node.classList?.contains('embed-vimeo')) return null
        return {
          conversion: (domNode) => {
            const iframe = domNode.querySelector('iframe')
            if (!iframe) return null
            const src = iframe.getAttribute('src') || ''
            const videoId = src.split('/video/')[1]?.split('?')[0] || ''
            const caption = domNode.querySelector('figcaption')?.textContent?.trim() || ''
            return { node: new VimeoNode(videoId, caption) }
          },
          priority: 2,
        }
      },
    }
  }

  constructor(videoId = '', caption = '', key) {
    super(key)
    this.__videoId = videoId
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
    if (!this.__videoId) return { element: null }

    const figure = document.createElement('figure')
    figure.className = 'embed embed-vimeo'
    figure.style.cssText = 'max-width:740px;margin:1.5rem auto;border-radius:0.5rem;overflow:hidden'

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'position:relative;padding-bottom:56.25%;height:0'

    const iframe = document.createElement('iframe')
    iframe.setAttribute('src', `https://player.vimeo.com/video/${this.__videoId}`)
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture')
    iframe.setAttribute('allowfullscreen', '')
    iframe.setAttribute('title', 'Vimeo video')
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none'

    wrapper.appendChild(iframe)
    figure.appendChild(wrapper)

    if (this.__caption) {
      const figcaption = document.createElement('figcaption')
      figcaption.textContent = this.__caption
      figcaption.style.textAlign = 'center'
      figure.appendChild(figcaption)
    }

    return { element: figure }
  }

  decorate(editor) {
    return (
      <VimeoNodeComponent
        videoId={this.__videoId}
        caption={this.__caption}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createVimeoNode(videoId, caption = '') {
  return new VimeoNode(videoId, caption)
}

// ─── SpotifyNodeComponent ─────────────────────────────────────────────────────

function SpotifyNodeComponent({ embedPath, caption, nodeKey, editor }) {
  const fontFamily = useContext(FontFamilyContext)
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [captionFocused, setCaptionFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const figRef = useRef(null)

  const showRing = isSelected || captionFocused
  const type = embedPath.split('/')[0]
  const iframeHeight = (type === 'track' || type === 'episode') ? 152 : 352

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

  function handleCaptionChange(e) {
    const val = e.target.value
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof SpotifyNode) node.getWritable().__caption = val
    })
  }

  return (
    <figure
      ref={figRef}
      style={{ maxWidth: '740px' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`my-4 mx-auto media-regular-preview rounded-xl overflow-hidden transition-all select-none ${showRing ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''}`}
    >
      <iframe
        src={`https://open.spotify.com/embed/${embedPath}`}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        loading="lazy"
        title="Spotify player"
        style={{ width: '100%', height: `${iframeHeight}px`, border: 'none', borderRadius: '12px', display: 'block' }}
      />
      <figcaption className="mt-0">
        <input
          type="text"
          value={caption}
          onChange={handleCaptionChange}
          onFocus={() => setCaptionFocused(true)}
          onBlur={() => setCaptionFocused(false)}
          onClick={e => e.stopPropagation()}
          placeholder="Type caption (optional)"
          className={`w-full ${decoratorFontClass(fontFamily)} text-sm text-gray-500 text-center bg-transparent border-0 outline-none py-2 px-4 placeholder-gray-400 select-text`}
        />
      </figcaption>
    </figure>
  )
}

// ─── SpotifyNode ──────────────────────────────────────────────────────────────

export class SpotifyNode extends DecoratorNode {
  static getType() { return 'spotify' }
  static clone(node) { return new SpotifyNode(node.__embedPath, node.__caption, node.__key) }

  static importJSON(data) {
    return new SpotifyNode(data.embedPath || '', data.caption || '')
  }
  exportJSON() {
    return { type: 'spotify', version: 1, embedPath: this.__embedPath, caption: this.__caption }
  }

  static importDOM() {
    return {
      figure: (node) => {
        if (!node.classList?.contains('embed-spotify')) return null
        return {
          conversion: (domNode) => {
            const iframe = domNode.querySelector('iframe')
            if (!iframe) return null
            const src = iframe.getAttribute('src') || ''
            const m = src.match(/open\.spotify\.com\/embed\/(.+)$/)
            const embedPath = m ? m[1].split('?')[0] : ''
            const caption = domNode.querySelector('figcaption')?.textContent?.trim() || ''
            return { node: new SpotifyNode(embedPath, caption) }
          },
          priority: 2,
        }
      },
    }
  }

  constructor(embedPath = '', caption = '', key) {
    super(key)
    this.__embedPath = embedPath
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
    if (!this.__embedPath) return { element: null }

    const type = this.__embedPath.split('/')[0]
    const iframeHeight = (type === 'track' || type === 'episode') ? 152 : 352

    const figure = document.createElement('figure')
    figure.className = 'embed embed-spotify'
    figure.style.cssText = 'max-width:740px;margin:1.5rem auto'

    const iframe = document.createElement('iframe')
    iframe.setAttribute('src', `https://open.spotify.com/embed/${this.__embedPath}`)
    iframe.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture')
    iframe.setAttribute('allowfullscreen', '')
    iframe.setAttribute('loading', 'lazy')
    iframe.setAttribute('title', 'Spotify player')
    iframe.style.cssText = `width:100%;height:${iframeHeight}px;border:none;border-radius:12px;display:block`

    figure.appendChild(iframe)

    if (this.__caption) {
      const figcaption = document.createElement('figcaption')
      figcaption.textContent = this.__caption
      figcaption.style.textAlign = 'center'
      figure.appendChild(figcaption)
    }

    return { element: figure }
  }

  decorate(editor) {
    return (
      <SpotifyNodeComponent
        embedPath={this.__embedPath}
        caption={this.__caption}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createSpotifyNode(embedPath, caption = '') {
  return new SpotifyNode(embedPath, caption)
}

// ─── Table nodes (subclasses of @lexical/table) ──────────────────────────────
// We use the official @lexical/table package so cells are part of the single
// main editor (native rich text — no nested editors). These two subclasses add
// the project-specific fields the package doesn't have: a regular/wide width
// mode + block alignment on the table, and an auto/light/dark text-color mode
// on each cell. They also control the exported HTML so it round-trips and so
// the public blog renders with our light borders instead of the package's
// hardcoded black ones.

function decorateTableElement(tableEl, width, colWidths, borderColor) {
  if (!tableEl) return
  tableEl.classList.add('blog-table')
  tableEl.classList.toggle('blog-table-wide', width === 'wide')
  tableEl.classList.toggle('blog-table-regular', width !== 'wide')
  // Pixel width = sum of column widths (drives column drag-resize). Horizontal
  // placement (regular → left, wide → centered) is handled in CSS, scoped
  // separately for the editor and the public blog (their containers differ).
  const sum = colWidths && colWidths.length ? colWidths.reduce((a, b) => a + (b || 0), 0) : 0
  tableEl.style.width = sum ? `${sum}px` : ''
  tableEl.style.setProperty('--table-border-color', borderColor || '#e5e7eb')
}

function tableElFromDOM(dom) {
  return dom?.nodeName === 'TABLE' ? dom : dom?.querySelector?.('table') || null
}

export class WideTableNode extends TableNode {
  __tableWidth // 'regular' | 'wide'
  __borderColor // hex or 'transparent'

  static getType() { return 'wide-table' }

  static clone(node) {
    return new WideTableNode(node.__key)
  }

  afterCloneFrom(prevNode) {
    super.afterCloneFrom(prevNode)
    this.__tableWidth = prevNode.__tableWidth
    this.__borderColor = prevNode.__borderColor
  }

  constructor(key) {
    super(key)
    this.__tableWidth = 'regular'
    this.__borderColor = '#e5e7eb'
  }

  getTableWidth() { return this.getLatest().__tableWidth }
  setTableWidth(width) { const self = this.getWritable(); self.__tableWidth = width; return self }
  getBorderColor() { return this.getLatest().__borderColor }
  setBorderColor(color) { const self = this.getWritable(); self.__borderColor = color; return self }

  createDOM(config, editor) {
    const dom = super.createDOM(config, editor)
    decorateTableElement(tableElFromDOM(dom), this.__tableWidth, this.getColWidths(), this.__borderColor)
    return dom
  }

  updateDOM(prevNode, dom, config) {
    const result = super.updateDOM(prevNode, dom, config)
    decorateTableElement(tableElFromDOM(dom), this.__tableWidth, this.getColWidths(), this.__borderColor)
    return result
  }

  exportDOM(editor) {
    const out = super.exportDOM(editor)
    const prevAfter = out.after
    const borderColor = this.__borderColor
    // Use the node's own stored width state, same as the live editor
    // (createDOM/updateDOM above) — previously this recomputed width from
    // colCount >= 4 here, which disagreed with the editor's own colCount
    // >= 6 auto-classification (see plugins.jsx), so a 4–5 column table
    // could render 'wide'/centered on the public site while the editor
    // showed it as 'regular'/left-aligned, or vice versa after a column
    // was added/removed without changing colCount across that boundary.
    const tableWidth = this.__tableWidth
    const colWidths = this.getColWidths()
    const DEFAULT_COL_WIDTH = 150
    out.after = (tableElement) => {
      const el = prevAfter ? prevAfter(tableElement) : tableElement
      if (el && el.nodeName === 'TABLE') {
        // Count columns from the built DOM — more reliable than reading Lexical node tree.
        const colCount = el.rows[0]?.cells.length || el.querySelectorAll('col').length || 0
        // Use stored widths if available; otherwise default 150px/col so the table
        // always has an explicit pixel width and overflow-x: auto can fire.
        const effectiveColWidths = (colWidths && colWidths.length) ? colWidths : Array(colCount).fill(DEFAULT_COL_WIDTH)
        decorateTableElement(el, tableWidth, effectiveColWidths, borderColor)
        el.setAttribute('data-width', tableWidth)
        el.setAttribute('data-border-color', borderColor)
        const wrapper = document.createElement('div')
        wrapper.className = `blog-table-wrapper blog-table-wrapper-${tableWidth}`
        wrapper.appendChild(el.cloneNode(true))
        return wrapper
      }
      return el
    }
    return out
  }

  static importDOM() {
    const base = TableNode.importDOM()
    return {
      // Handles both the old format (bare <table>) and the new format (wrapper div
      // is unhandled/transparent, so Lexical descends into it and finds this <table>).
      // data-width and data-border-color live on the <table> in both cases.
      table: (domNode) => {
        const baseRes = base.table(domNode)
        if (!baseRes) return null
        return {
          ...baseRes,
          priority: 2,
          conversion: (node) => {
            const res = baseRes.conversion(node)
            if (res && res.node) {
              const width = node.getAttribute('data-width') || (node.classList.contains('blog-table-wide') ? 'wide' : 'regular')
              res.node.setTableWidth(width)
              res.node.setBorderColor(node.getAttribute('data-border-color') || '#e5e7eb')
            }
            return res
          },
        }
      },
    }
  }

  static importJSON(serializedNode) {
    return new WideTableNode().updateFromJSON(serializedNode)
  }

  updateFromJSON(serializedNode) {
    return super.updateFromJSON(serializedNode)
      .setTableWidth(serializedNode.tableWidth || 'regular')
      .setBorderColor(serializedNode.borderColor || '#e5e7eb')
  }

  exportJSON() {
    return { ...super.exportJSON(), tableWidth: this.__tableWidth, borderColor: this.__borderColor }
  }
}

export class StyledTableCellNode extends TableCellNode {
  __textColor // hex string | null

  static getType() { return 'styled-tablecell' }

  static clone(node) {
    const cell = new StyledTableCellNode(node.__headerState, node.__colSpan, node.__width, node.__key)
    cell.__textColor = node.__textColor
    return cell
  }

  afterCloneFrom(node) {
    super.afterCloneFrom(node)
    this.__textColor = node.__textColor
  }

  constructor(headerState, colSpan, width, key) {
    super(headerState, colSpan, width, key)
    this.__textColor = null
  }

  getTextColor() { return this.getLatest().__textColor }
  setTextColor(hex) { const self = this.getWritable(); self.__textColor = hex || null; return self }

  createDOM(config) {
    const el = super.createDOM(config)
    el.style.color = this.__textColor || ''
    return el
  }

  updateDOM(prevNode, dom, config) {
    const result = super.updateDOM(prevNode, dom, config)
    dom.style.color = this.__textColor || ''
    return result
  }

  exportDOM(editor) {
    const out = super.exportDOM(editor)
    const el = out.element
    if (el && el.nodeType === 1) {
      // Base TableCellNode.exportDOM hardcodes a black border inline —
      // strip it so table.blog-table td's CSS var-based border (driven by
      // the table's own borderColor setting) isn't shadowed by an inline style.
      el.style.removeProperty('border')
      if (this.__textColor) {
        el.setAttribute('data-text-color', this.__textColor)
        el.style.color = this.__textColor
      } else {
        el.removeAttribute('data-text-color')
        el.style.removeProperty('color')
      }
      if (this.getBackgroundColor() === 'transparent') el.style.backgroundColor = ''
    }
    return out
  }

  static importDOM() {
    const base = TableCellNode.importDOM()
    const wrap = (baseEntryFn) => (domNode) => {
      const baseRes = baseEntryFn(domNode)
      if (!baseRes) return null
      const conv = baseRes.conversion
      return {
        ...baseRes,
        conversion: (node) => {
          const raw = node.getAttribute('data-text-color') || null
          // Backwards compat: old values 'auto'/'light'/'dark' → null
          const textColor = raw && raw.startsWith('#') ? raw : null
          node.style.removeProperty('color')
          const res = conv(node)
          if (res && res.node) res.node.setTextColor(textColor)
          return res
        },
      }
    }
    return { td: wrap(base.td), th: wrap(base.th) }
  }

  static importJSON(serializedNode) {
    return new StyledTableCellNode().updateFromJSON(serializedNode)
  }

  updateFromJSON(serializedNode) {
    const hex = serializedNode.textColor || null
    return super.updateFromJSON(serializedNode).setTextColor(hex)
  }

  exportJSON() {
    return { ...super.exportJSON(), textColor: this.__textColor }
  }
}

