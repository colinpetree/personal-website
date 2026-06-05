import { createPortal } from 'react-dom'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Bold, Italic, Underline, Strikethrough, Code, Link2 } from 'lucide-react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HeadingNode, QuoteNode, $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list'
import { LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { CodeNode, $createCodeNode } from '@lexical/code'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $setBlocksType } from '@lexical/selection'
import {
  $getSelection, $isRangeSelection, $createParagraphNode, $getRoot,
  FORMAT_TEXT_COMMAND, DecoratorNode,
  KEY_DOWN_COMMAND, COMMAND_PRIORITY_HIGH, $getNodeByKey, $isParagraphNode,
} from 'lexical'

// ─── ImageNode ───────────────────────────────────────────────────────────────

class ImageNode extends DecoratorNode {
  static getType() { return 'image' }
  static clone(node) { return new ImageNode(node.__src, node.__alt, node.__key) }

  static importJSON(data) { return new ImageNode(data.src, data.alt || '') }
  exportJSON() { return { type: 'image', src: this.__src, alt: this.__alt, version: 1 } }

  constructor(src, alt = '', key) {
    super(key)
    this.__src = src
    this.__alt = alt
  }

  createDOM() {
    const span = document.createElement('span')
    span.style.display = 'contents'
    return span
  }
  updateDOM() { return false }

  exportDOM() {
    const img = document.createElement('img')
    img.setAttribute('src', this.__src)
    img.setAttribute('alt', this.__alt)
    return { element: img }
  }

  isInline() { return false }

  decorate() {
    return (
      <img
        src={this.__src}
        alt={this.__alt}
        className="max-w-full h-auto rounded-lg my-4 block"
        draggable={false}
      />
    )
  }
}

function $createImageNode(src, alt = '') { return new ImageNode(src, alt) }

// ─── Plugins ─────────────────────────────────────────────────────────────────

function LoadHtmlPlugin({ html }) {
  const [editor] = useLexicalComposerContext()
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current || !html) return
    loaded.current = true
    editor.update(() => {
      const parser = new DOMParser()
      const dom = parser.parseFromString(html, 'text/html')
      const nodes = $generateNodesFromDOM(editor, dom)
      const root = $getRoot()
      root.clear()
      root.append(...nodes)
    })
  }, [editor, html])

  return null
}

function HtmlOutputPlugin({ onChange }) {
  const [editor] = useLexicalComposerContext()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      editor.read(() => {
        const html = $generateHtmlFromNodes(editor, null)
        onChangeRef.current(html)
      })
    })
  }, [editor])

  return null
}

// ─── Floating format toolbar ──────────────────────────────────────────────────

function FloatingToolbarPlugin() {
  const [editor] = useLexicalComposerContext()
  const [toolbar, setToolbar] = useState({
    visible: false, top: 0, left: 0,
    bold: false, italic: false, underline: false, strike: false, code: false,
  })

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          setToolbar(t => t.visible ? { ...t, visible: false } : t)
          return
        }

        const nativeSel = window.getSelection()
        if (!nativeSel || nativeSel.rangeCount === 0) {
          setToolbar(t => t.visible ? { ...t, visible: false } : t)
          return
        }

        const rect = nativeSel.getRangeAt(0).getBoundingClientRect()
        if (!rect || rect.width === 0) {
          setToolbar(t => t.visible ? { ...t, visible: false } : t)
          return
        }

        const W = 272 // approximate toolbar width
        const H = 40
        let left = rect.left + window.scrollX + rect.width / 2 - W / 2
        left = Math.max(8, Math.min(left, window.innerWidth + window.scrollX - W - 8))
        let top = rect.top + window.scrollY - H - 8
        if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + 8

        setToolbar({
          visible: true, top, left,
          bold: selection.hasFormat('bold'),
          italic: selection.hasFormat('italic'),
          underline: selection.hasFormat('underline'),
          strike: selection.hasFormat('strikethrough'),
          code: selection.hasFormat('code'),
        })
      })
    })
  }, [editor])

  function handleLink() {
    const url = window.prompt('Enter URL:')
    if (url) editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
  }

  function fmtBtn(active, Icon, format) {
    return (
      <button
        onMouseDown={e => { e.preventDefault(); editor.dispatchCommand(FORMAT_TEXT_COMMAND, format) }}
        className={`p-1.5 rounded transition-colors ${
          active ? 'text-white bg-white/20' : 'text-gray-300 hover:text-white hover:bg-white/15'
        }`}
      >
        <Icon size={14} strokeWidth={2} />
      </button>
    )
  }

  if (!toolbar.visible) return null

  return createPortal(
    <div
      style={{ position: 'absolute', top: toolbar.top, left: toolbar.left, zIndex: 9999 }}
      className="flex items-center gap-0.5 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 shadow-2xl"
      onMouseDown={e => e.preventDefault()}
    >
      {fmtBtn(toolbar.bold, Bold, 'bold')}
      {fmtBtn(toolbar.italic, Italic, 'italic')}
      {fmtBtn(toolbar.underline, Underline, 'underline')}
      {fmtBtn(toolbar.strike, Strikethrough, 'strikethrough')}
      {fmtBtn(toolbar.code, Code, 'code')}
      <div className="w-px h-4 bg-gray-600 mx-1" />
      <button
        onMouseDown={e => { e.preventDefault(); handleLink() }}
        className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-white/15 transition-colors"
      >
        <Link2 size={14} strokeWidth={2} />
      </button>
    </div>,
    document.body
  )
}

// ─── Slash command menu ───────────────────────────────────────────────────────

const SLASH_ITEMS = [
  { label: 'Text',          description: 'Plain paragraph',      icon: 'P',   action: 'paragraph' },
  { label: 'Heading 1',     description: 'Large section heading', icon: 'H1',  action: 'h1' },
  { label: 'Heading 2',     description: 'Medium heading',        icon: 'H2',  action: 'h2' },
  { label: 'Heading 3',     description: 'Small heading',         icon: 'H3',  action: 'h3' },
  { label: 'Quote',         description: 'Capture a quote',       icon: '❝',   action: 'quote' },
  { label: 'Code',          description: 'Code snippet',          icon: '</>',  action: 'code' },
  { label: 'Bulleted List', description: 'Unordered list',        icon: '•',   action: 'bullet' },
  { label: 'Numbered List', description: 'Ordered list',          icon: '1.',  action: 'number' },
  { label: 'Image',         description: 'Upload an image',       icon: '⬜',  action: 'image' },
]

function SlashCommandPlugin({ onImageUpload }) {
  const [editor] = useLexicalComposerContext()
  const [menu, setMenu] = useState({
    visible: false, top: 0, left: 0, filter: '', selectedIndex: 0, nodeKey: null,
  })
  // Refs so keyboard handler never has stale closures
  const menuRef = useRef(menu)
  menuRef.current = menu
  const fileRef = useRef(null)
  const pendingNodeKeyRef = useRef(null)

  function getItems(filter) {
    if (!filter) return SLASH_ITEMS
    const q = filter.toLowerCase()
    return SLASH_ITEMS.filter(i => i.label.toLowerCase().includes(q))
  }

  const filteredItems = getItems(menu.filter)
  const filteredItemsRef = useRef(filteredItems)
  filteredItemsRef.current = filteredItems

  // Detect "/" at start of paragraph
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          setMenu(m => m.visible ? { ...m, visible: false } : m)
          return
        }

        const node = selection.anchor.getNode()
        let topLevel
        try {
          topLevel = node.getKey() === 'root' ? node : node.getTopLevelElementOrThrow()
        } catch {
          setMenu(m => m.visible ? { ...m, visible: false } : m)
          return
        }

        if (!$isParagraphNode(topLevel)) {
          setMenu(m => m.visible ? { ...m, visible: false } : m)
          return
        }

        const text = topLevel.getTextContent()
        if (text.startsWith('/')) {
          const domEl = editor.getElementByKey(topLevel.getKey())
          if (!domEl) return
          const rect = domEl.getBoundingClientRect()
          setMenu({
            visible: true,
            top: rect.bottom + window.scrollY + 6,
            left: rect.left + window.scrollX,
            filter: text.slice(1),
            selectedIndex: 0,
            nodeKey: topLevel.getKey(),
          })
        } else {
          setMenu(m => m.visible ? { ...m, visible: false } : m)
        }
      })
    })
  }, [editor])

  // Keyboard navigation while menu is open
  useEffect(() => {
    if (!menu.visible) return
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        const items = filteredItemsRef.current
        const m = menuRef.current
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setMenu(prev => ({ ...prev, selectedIndex: Math.min(prev.selectedIndex + 1, items.length - 1) }))
          return true
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setMenu(prev => ({ ...prev, selectedIndex: Math.max(prev.selectedIndex - 1, 0) }))
          return true
        }
        if (event.key === 'Enter') {
          const item = items[m.selectedIndex]
          if (item) {
            event.preventDefault()
            applyItem(item)
            return true
          }
          return false
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setMenu(m => ({ ...m, visible: false }))
          return true
        }
        return false
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [editor, menu.visible]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyItem(item) {
    const nodeKey = menuRef.current.nodeKey
    setMenu(m => ({ ...m, visible: false }))

    if (item.action === 'image') {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node && $isParagraphNode(node)) node.clear()
      })
      pendingNodeKeyRef.current = nodeKey
      fileRef.current?.click()
      return
    }

    if (item.action === 'bullet' || item.action === 'number') {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node && $isParagraphNode(node)) { node.clear(); node.selectEnd() }
      }, {
        onUpdate: () => {
          editor.dispatchCommand(
            item.action === 'bullet' ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND,
            undefined
          )
        },
      })
      return
    }

    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!node || !$isParagraphNode(node)) return
      node.clear()
      const sel = node.select(0, 0)
      if (item.action === 'h1' || item.action === 'h2' || item.action === 'h3') {
        $setBlocksType(sel, () => $createHeadingNode(item.action))
      } else if (item.action === 'quote') {
        $setBlocksType(sel, () => $createQuoteNode())
      } else if (item.action === 'code') {
        $setBlocksType(sel, () => $createCodeNode())
      }
      // 'paragraph' — already a paragraph, nothing more needed
    })
  }

  async function handleImageFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const nodeKey = pendingNodeKeyRef.current
    try {
      const filename = await onImageUpload(file)
      const src = `/api/uploads/${filename}`
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          const imgNode = $createImageNode(src, '')
          node.replace(imgNode)
        }
      })
    } catch {
      alert('Image upload failed.')
    }
    pendingNodeKeyRef.current = null
    e.target.value = ''
  }

  return createPortal(
    <>
      {menu.visible && filteredItems.length > 0 && (
        <div
          style={{ position: 'absolute', top: menu.top, left: menu.left, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-2xl py-2 w-72 max-h-80 overflow-y-auto"
        >
          <p className="px-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Blocks</p>
          {filteredItems.map((item, i) => (
            <button
              key={item.action}
              onMouseDown={e => { e.preventDefault(); applyItem(item) }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                i === menu.selectedIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
            >
              <span className="shrink-0 w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg text-xs font-bold text-gray-500">
                {item.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 leading-tight">{item.label}</p>
                <p className="text-xs text-gray-400 leading-tight">{item.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
    </>,
    document.body
  )
}

// ─── Editor handle (exposes focusAtStart to parent via ref) ──────────────────

function EditorHandlePlugin({ handleRef }) {
  const [editor] = useLexicalComposerContext()
  useImperativeHandle(handleRef, () => ({
    focusAtStart() {
      editor.getRootElement()?.focus({ preventScroll: true })
      editor.update(() => {
        const root = $getRoot()
        const newParagraph = $createParagraphNode()
        const firstChild = root.getFirstChild()
        if (firstChild) {
          firstChild.insertBefore(newParagraph)
        } else {
          root.append(newParagraph)
        }
        newParagraph.select()
      })
    },
  }), [editor])
  return null
}

// ─── Editor theme ─────────────────────────────────────────────────────────────

const theme = {
  heading: {
    h1: 'text-3xl font-bold mt-6 mb-3',
    h2: 'text-2xl font-bold mt-5 mb-2',
    h3: 'text-xl font-semibold mt-4 mb-2',
  },
  paragraph: 'mb-3 leading-relaxed',
  quote: 'border-l-4 border-gray-300 pl-4 italic text-gray-600 my-3',
  code: 'block bg-gray-100 rounded p-3 font-mono text-sm my-3 whitespace-pre-wrap',
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    code: 'bg-gray-100 rounded px-1 font-mono text-sm',
  },
  list: {
    ul: 'list-disc pl-6 mb-3',
    ol: 'list-decimal pl-6 mb-3',
    listitem: 'mb-1',
  },
  link: 'text-blue-600 underline',
}

// ─── Main component ──────────────────────────────────────────────────────────

const RichTextEditor = forwardRef(function RichTextEditor({ initialHtml, onChange, placeholder = 'Start writing…' }, ref) {
  const initialConfig = {
    namespace: 'BlogEditor',
    theme,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode, ImageNode],
    onError: (error) => { throw error },
  }

  async function handleImageUpload(file) {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/admin/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    if (!res.ok) throw new Error('Upload failed')
    const { filename } = await res.json()
    return filename
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative bg-white text-gray-900">
        <RichTextPlugin
          contentEditable={
            <ContentEditable className="outline-none min-h-[500px] px-6 pt-2 pb-10 prose prose-gray max-w-none" />
          }
          placeholder={
            <div className="absolute top-2 left-6 text-gray-400 pointer-events-none select-none">
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin />
      <LoadHtmlPlugin html={initialHtml} />
      <HtmlOutputPlugin onChange={onChange} />
      <FloatingToolbarPlugin />
      <SlashCommandPlugin onImageUpload={handleImageUpload} />
      <EditorHandlePlugin handleRef={ref} />
    </LexicalComposer>
  )
})

export default RichTextEditor
