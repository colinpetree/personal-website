import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { DecoratorNode, $getNodeByKey, $createParagraphNode, CLICK_COMMAND, KEY_DOWN_COMMAND, COMMAND_PRIORITY_LOW, COMMAND_PRIORITY_HIGH } from 'lexical'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { AlignCenter, Maximize2, Expand, Link2, X } from 'lucide-react'

// ─── ImageNodeComponent ───────────────────────────────────────────────────────

function ImageNodeComponent({ src, alt, caption, width, href, nodeKey, editor }) {
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [captionFocused, setCaptionFocused] = useState(false)
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
        className={`my-4 mx-auto rounded-lg overflow-hidden transition-all select-none ${showRing ? 'ring-2 ring-blue-500' : ''}`}
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
