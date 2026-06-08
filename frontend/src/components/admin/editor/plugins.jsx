import { createPortal } from 'react-dom'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Bold, Italic, Underline, Strikethrough, Code, Link2 } from 'lucide-react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $setBlocksType } from '@lexical/selection'
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list'
import { TOGGLE_LINK_COMMAND } from '@lexical/link'
import { $createCodeNode } from '@lexical/code'
import {
  $getSelection, $isRangeSelection, $createParagraphNode, $getRoot,
  FORMAT_TEXT_COMMAND, KEY_DOWN_COMMAND, COMMAND_PRIORITY_HIGH,
  $getNodeByKey, $isParagraphNode, $isDecoratorNode,
  $createNodeSelection, $setSelection,
} from 'lexical'
import { $createImageNode, $createVideoNode, $createAudioNode, $createFileNode, $createGalleryNode } from './nodes'
import { handleUpload, handleUploadFull } from './upload'

// ─── LoadHtmlPlugin ───────────────────────────────────────────────────────────

export function LoadHtmlPlugin({ html }) {
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

// ─── HtmlOutputPlugin ─────────────────────────────────────────────────────────

export function HtmlOutputPlugin({ onChange }) {
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

// ─── FloatingToolbarPlugin ────────────────────────────────────────────────────

export function FloatingToolbarPlugin() {
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

        const W = 272
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

// ─── SlashCommandPlugin ───────────────────────────────────────────────────────

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
  { label: 'Video',         description: 'Upload a video',        icon: '▶',   action: 'video' },
  { label: 'Audio',         description: 'Upload an audio file',  icon: '♪',   action: 'audio' },
  { label: 'File',          description: 'Upload any file',       icon: '📎',  action: 'file' },
  { label: 'Gallery',       description: 'Image grid',            icon: '⊞',   action: 'gallery' },
]

export function SlashCommandPlugin() {
  const [editor] = useLexicalComposerContext()
  const [menu, setMenu] = useState({
    visible: false, top: 0, left: 0, filter: '', selectedIndex: 0, nodeKey: null,
  })
  const menuRef = useRef(menu)
  menuRef.current = menu
  const fileRef = useRef(null)
  const pendingNodeKeyRef = useRef(null)
  const pendingActionRef = useRef(null)

  function getItems(filter) {
    if (!filter) return SLASH_ITEMS
    const q = filter.toLowerCase()
    return SLASH_ITEMS.filter(i => i.label.toLowerCase().includes(q))
  }

  const filteredItems = getItems(menu.filter)
  const filteredItemsRef = useRef(filteredItems)
  filteredItemsRef.current = filteredItems

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

  const UPLOAD_ACTIONS = new Set(['image', 'video', 'audio', 'file', 'gallery'])
  const ACCEPT_MAP = { image: 'image/*', video: 'video/*', audio: 'audio/*', file: '*', gallery: 'image/*' }

  function applyItem(item) {
    const nodeKey = menuRef.current.nodeKey
    setMenu(m => ({ ...m, visible: false }))

    if (UPLOAD_ACTIONS.has(item.action)) {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node && $isParagraphNode(node)) node.clear()
      })
      pendingNodeKeyRef.current = nodeKey
      pendingActionRef.current = item.action
      fileRef.current.accept = ACCEPT_MAP[item.action]
      fileRef.current.multiple = item.action === 'gallery'
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
    })
  }

  async function handleMediaFile(e) {
    const files = [...(e.target.files || [])]
    if (!files.length) return
    const paragraphKey = pendingNodeKeyRef.current
    const action = pendingActionRef.current
    pendingNodeKeyRef.current = null
    pendingActionRef.current = null
    e.target.value = ''

    try {
      if (action === 'image') {
        const filename = await handleUpload(files[0])
        editor.update(() => {
          const node = $getNodeByKey(paragraphKey)
          if (node && $isParagraphNode(node)) node.replace($createImageNode(`/api/uploads/${filename}`, ''))
        })
      } else if (action === 'video') {
        const filename = await handleUpload(files[0])
        editor.update(() => {
          const node = $getNodeByKey(paragraphKey)
          if (node && $isParagraphNode(node)) node.replace($createVideoNode(`/api/uploads/${filename}`))
        })
      } else if (action === 'audio') {
        const data = await handleUploadFull(files[0])
        editor.update(() => {
          const node = $getNodeByKey(paragraphKey)
          if (node && $isParagraphNode(node)) node.replace($createAudioNode(`/api/uploads/${data.filename}`, data.original_name))
        })
      } else if (action === 'file') {
        const data = await handleUploadFull(files[0])
        editor.update(() => {
          const node = $getNodeByKey(paragraphKey)
          if (node && $isParagraphNode(node)) node.replace($createFileNode(`/api/uploads/${data.filename}`, data.original_name, data.mime_type, data.size || 0))
        })
      } else if (action === 'gallery') {
        const uploaded = []
        for (const file of files) {
          const filename = await handleUpload(file)
          uploaded.push({ src: `/api/uploads/${filename}`, alt: '' })
        }
        if (uploaded.length) {
          editor.update(() => {
            const node = $getNodeByKey(paragraphKey)
            if (node && $isParagraphNode(node)) node.replace($createGalleryNode(uploaded))
          })
        }
      }
    } catch {
      const label = action ? action.charAt(0).toUpperCase() + action.slice(1) : 'Upload'
      alert(`${label} upload failed.`)
    }
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
      <input ref={fileRef} type="file" className="hidden" onChange={handleMediaFile} />
    </>,
    document.body
  )
}

// ─── DecoratorArrowNavigationPlugin ──────────────────────────────────────────
// Intercepts ArrowDown/ArrowUp when the adjacent block is a DecoratorNode so
// the node gets a NodeSelection instead of being skipped by Lexical's default
// arrow-key movement. Only fires when the cursor is at the visual edge of the
// current paragraph (last line for down, first line for up).

export function DecoratorArrowNavigationPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false
        const isDown = event.key === 'ArrowDown'

        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return false

        let topElement
        try {
          topElement = selection.anchor.getNode().getTopLevelElementOrThrow()
        } catch {
          return false
        }

        const sibling = isDown ? topElement.getNextSibling() : topElement.getPreviousSibling()
        if (!sibling || !$isDecoratorNode(sibling) || sibling.isInline()) return false

        // Only intercept when the cursor is visually at the edge of the block.
        // This lets normal line-by-line movement work inside multi-line paragraphs.
        const domEl = editor.getElementByKey(topElement.getKey())
        const domSel = window.getSelection()
        if (domEl && domSel && domSel.rangeCount > 0) {
          const cursorRect = domSel.getRangeAt(0).getBoundingClientRect()
          const elRect = domEl.getBoundingClientRect()
          const lineH = parseFloat(window.getComputedStyle(domEl).lineHeight) || 24
          if (isDown && cursorRect.bottom < elRect.bottom - lineH) return false
          if (!isDown && cursorRect.top > elRect.top + lineH) return false
        }

        event.preventDefault()
        const sel = $createNodeSelection()
        sel.add(sibling.getKey())
        $setSelection(sel)
        return true
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [editor])

  return null
}

// ─── EditorHandlePlugin ───────────────────────────────────────────────────────

export function EditorHandlePlugin({ handleRef }) {
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
