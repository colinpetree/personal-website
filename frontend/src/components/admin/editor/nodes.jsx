import { useState, useEffect, useRef } from 'react'
import { DecoratorNode, $getNodeByKey, $createParagraphNode, CLICK_COMMAND, KEY_DOWN_COMMAND, COMMAND_PRIORITY_LOW, COMMAND_PRIORITY_HIGH } from 'lexical'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'

// ─── ImageNodeComponent ───────────────────────────────────────────────────────

function ImageNodeComponent({ src, alt, caption, nodeKey, editor }) {
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [captionFocused, setCaptionFocused] = useState(false)
  const imgRef = useRef(null)

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
  // Uses registerCommand so returning true consumes the event and prevents
  // Lexical's own Enter handler from running and re-moving the selection.
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
      if (node instanceof ImageNode) {
        node.getWritable().__caption = val
      }
    })
  }

  return (
    <figure
      className={`my-4 rounded-lg overflow-hidden transition-all select-none ${showRing ? 'ring-2 ring-blue-500' : ''}`}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="max-w-full h-auto block"
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
  )
}

// ─── ImageNode ────────────────────────────────────────────────────────────────

export class ImageNode extends DecoratorNode {
  static getType() { return 'image' }
  static clone(node) { return new ImageNode(node.__src, node.__alt, node.__caption, node.__key) }

  static importJSON(data) { return new ImageNode(data.src, data.alt || '', data.caption || '') }
  exportJSON() { return { type: 'image', src: this.__src, alt: this.__alt, caption: this.__caption, version: 1 } }

  static importDOM() {
    return {
      figure: () => ({
        conversion: (domNode) => {
          const img = domNode.querySelector('img')
          if (!img) return null
          const figcaption = domNode.querySelector('figcaption')
          const caption = figcaption?.textContent?.trim() || ''
          return { node: new ImageNode(img.getAttribute('src') || '', img.getAttribute('alt') || '', caption) }
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

  constructor(src, alt = '', caption = '', key) {
    super(key)
    this.__src = src
    this.__alt = alt
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
    if (!this.__src) return { element: null }
    if (this.__caption) {
      const figure = document.createElement('figure')
      const img = document.createElement('img')
      img.setAttribute('src', this.__src)
      img.setAttribute('alt', this.__alt)
      figure.appendChild(img)
      const figcaption = document.createElement('figcaption')
      figcaption.textContent = this.__caption
      figure.appendChild(figcaption)
      return { element: figure }
    }
    const img = document.createElement('img')
    img.setAttribute('src', this.__src)
    img.setAttribute('alt', this.__alt)
    return { element: img }
  }

  decorate(editor) {
    return (
      <ImageNodeComponent
        src={this.__src}
        alt={this.__alt}
        caption={this.__caption}
        nodeKey={this.getKey()}
        editor={editor}
      />
    )
  }
}

export function $createImageNode(src, alt = '', caption = '') {
  return new ImageNode(src, alt, caption)
}
