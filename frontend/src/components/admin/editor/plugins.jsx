import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  Bold, Italic, Underline, Strikethrough, Code, Link2,
  Type, Heading1, Heading2, Heading3, Quote, Code2,
  List, ListOrdered, Minus, Image, Video, Music, Paperclip, LayoutGrid, Plus, MessageSquare, MousePointerClick, ChevronDown, PanelTop,
  PlayCircle, Film, Music2,
  Table, AlignLeft, AlignCenter, AlignJustify, StretchHorizontal, Trash2, Undo2, Redo2,
  ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, ArrowDownToLine,
  Eclipse, Sun, Moon, Columns3Cog, RectangleHorizontal, RectangleVertical, Grid2x2, PaintBucket,
} from 'lucide-react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $setBlocksType } from '@lexical/selection'
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, $isListItemNode } from '@lexical/list'
import { $findMatchingParent } from '@lexical/utils'
import { TOGGLE_LINK_COMMAND } from '@lexical/link'
import {
  INSERT_TABLE_COMMAND, $isTableNode, $isTableCellNode, $isTableSelection,
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableRow__EXPERIMENTAL, $insertTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL, $deleteTableColumn__EXPERIMENTAL,
} from '@lexical/table'
import {
  $getSelection, $isRangeSelection, $isNodeSelection, $createParagraphNode, $createTextNode, $getRoot,
  FORMAT_TEXT_COMMAND, FORMAT_ELEMENT_COMMAND, UNDO_COMMAND, REDO_COMMAND,
  KEY_DOWN_COMMAND, COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_CRITICAL,
  $getNodeByKey, $isParagraphNode, $isDecoratorNode, $isElementNode,
  $createNodeSelection, $setSelection,
} from 'lexical'
import { $createImageNode, $createVideoNode, $createAudioNode, $createFileNode, $createGalleryNode, $createDividerNode, $createCalloutNode, $createButtonNode, $createToggleNode, $createCodeBlockNode, $createHeaderNode, $createYouTubeNode, $createVimeoNode, $createSpotifyNode } from './nodes'
import { handleUpload, handleUploadFull } from './upload'
import { Tooltip } from '../../ui/Tooltip'
import { ColorSwatchMenu } from '../../ui/ColorPicker'

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

  function fmtBtn(active, Icon, format, label) {
    return (
      <Tooltip key={format} content={label}>
        <button
          onMouseDown={e => { e.preventDefault(); editor.dispatchCommand(FORMAT_TEXT_COMMAND, format) }}
          className={`p-1.5 rounded transition-colors ${
            active ? 'text-white bg-white/20' : 'text-gray-300 hover:text-white hover:bg-white/15'
          }`}
        >
          <Icon size={14} strokeWidth={2} />
        </button>
      </Tooltip>
    )
  }

  if (!toolbar.visible) return null

  return createPortal(
    <div
      style={{ position: 'absolute', top: toolbar.top, left: toolbar.left, zIndex: 9999 }}
      className="flex items-center gap-0.5 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 shadow-2xl"
      onMouseDown={e => e.preventDefault()}
    >
      {fmtBtn(toolbar.bold, Bold, 'bold', 'Bold')}
      {fmtBtn(toolbar.italic, Italic, 'italic', 'Italic')}
      {fmtBtn(toolbar.underline, Underline, 'underline', 'Underline')}
      {fmtBtn(toolbar.strike, Strikethrough, 'strikethrough', 'Strikethrough')}
      {fmtBtn(toolbar.code, Code, 'code', 'Inline code')}
      <div className="w-px h-4 bg-gray-600 mx-1" />
      <Tooltip content="Link">
        <button
          onMouseDown={e => { e.preventDefault(); handleLink() }}
          className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-white/15 transition-colors"
        >
          <Link2 size={14} strokeWidth={2} />
        </button>
      </Tooltip>
    </div>,
    document.body
  )
}

// ─── SlashCommandPlugin ───────────────────────────────────────────────────────

const SLASH_ITEMS = [
  { label: 'Text',          description: 'Plain paragraph',      Icon: Type,        action: 'paragraph' },
  { label: 'Heading 1',     description: 'Large section heading', Icon: Heading1,    action: 'h1' },
  { label: 'Heading 2',     description: 'Medium heading',        Icon: Heading2,    action: 'h2' },
  { label: 'Heading 3',     description: 'Small heading',         Icon: Heading3,    action: 'h3' },
  { label: 'Quote',         description: 'Capture a quote',       Icon: Quote,       action: 'quote' },
  { label: 'Code',          description: 'Code snippet',          Icon: Code2,       action: 'code' },
  { label: 'Bulleted List', description: 'Unordered list',        Icon: List,        action: 'bullet' },
  { label: 'Numbered List', description: 'Ordered list',          Icon: ListOrdered, action: 'number' },
  { label: 'Divider',       description: 'Horizontal rule',        Icon: Minus,       action: 'divider' },
  { label: 'Callout',       description: 'Highlighted callout box', Icon: MessageSquare,      action: 'callout' },
  { label: 'Button',        description: 'Clickable link button',  Icon: MousePointerClick,  action: 'button' },
  { label: 'Toggle',        description: 'Collapsible section',   Icon: ChevronDown,        action: 'toggle' },
  { label: 'Header',        description: 'Full-width banner with heading and button', Icon: PanelTop, action: 'header' },
  { label: 'Image',         description: 'Upload an image',       Icon: Image,       action: 'image' },
  { label: 'Video',         description: 'Upload a video',        Icon: Video,       action: 'video' },
  { label: 'Audio',         description: 'Upload an audio file',  Icon: Music,       action: 'audio' },
  { label: 'File',          description: 'Upload any file',       Icon: Paperclip,   action: 'file' },
  { label: 'Gallery',       description: 'Image grid',            Icon: LayoutGrid,  action: 'gallery' },
  { label: 'Table',         description: 'Rows and columns',      Icon: Table,       action: 'table' },
  { label: 'YouTube',       description: 'Embed a YouTube video',  Icon: PlayCircle,  action: 'youtube' },
  { label: 'Vimeo',         description: 'Embed a Vimeo video',    Icon: Film,        action: 'vimeo' },
  { label: 'Spotify',       description: 'Embed Spotify audio',    Icon: Music2,      action: 'spotify' },
]

function parseYouTubeId(url) {
  const patterns = [
    /[?&]v=([^&#]+)/,
    /youtu\.be\/([^?&#]+)/,
    /youtube\.com\/embed\/([^?&#]+)/,
    /youtube\.com\/shorts\/([^?&#]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

function parseVimeoId(url) {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  return m ? m[1] : null
}

function parseSpotifyPath(url) {
  const m = url.match(/open\.spotify\.com\/(track|album|playlist|episode|artist)\/([a-zA-Z0-9]+)/)
  return m ? `${m[1]}/${m[2]}` : null
}

export function SlashCommandPlugin() {
  const [editor] = useLexicalComposerContext()
  const [menu, setMenu] = useState({
    visible: false, top: 0, left: 0, filter: '', selectedIndex: 0, nodeKey: null, plusTriggered: false, embedAction: null,
  })
  const menuRef = useRef(menu)
  menuRef.current = menu
  const [embedUrl, setEmbedUrl] = useState('')
  const [tableHover, setTableHover] = useState({ rows: 1, cols: 1 })
  const [plusButton, setPlusButton] = useState({ visible: false, top: 0, left: 0, nodeKey: null })
  const focusedParaRef = useRef(null)
  const fileRef = useRef(null)
  const pendingNodeKeyRef = useRef(null)
  const pendingActionRef = useRef(null)
  const pendingSavedTextRef = useRef(null)
  const selectedItemRef = useRef(null)

  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [menu.selectedIndex])

  // Re-pin menu to paragraph on any scroll (window or inner editor div).
  useEffect(() => {
    if (!menu.visible || !menu.nodeKey) return
    const update = () => {
      const domEl = editor.getElementByKey(menuRef.current.nodeKey)
      if (!domEl) return
      const rect = domEl.getBoundingClientRect()
      setMenu(m => ({ ...m, top: calcMenuTop(rect), left: rect.left }))
    }
    document.addEventListener('scroll', update, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', update, { capture: true })
  }, [editor, menu.visible, menu.nodeKey])

  // Re-pin plus button on any scroll.
  useEffect(() => {
    if (!plusButton.visible || !plusButton.nodeKey) return
    const nodeKey = plusButton.nodeKey
    const update = () => {
      const domEl = editor.getElementByKey(nodeKey)
      if (!domEl) return
      const rect = domEl.getBoundingClientRect()
      setPlusButton(b => ({ ...b, top: rect.top + rect.height / 2, left: rect.left - 44 }))
    }
    document.addEventListener('scroll', update, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', update, { capture: true })
  }, [editor, plusButton.visible, plusButton.nodeKey])

  useEffect(() => {
    return () => {
      pendingNodeKeyRef.current = null
      pendingActionRef.current = null
      pendingSavedTextRef.current = null
    }
  }, [])

  function getItems(filter) {
    if (!filter) return SLASH_ITEMS
    const q = filter.toLowerCase()
    return SLASH_ITEMS.filter(i => i.label.toLowerCase().includes(q))
  }

  // Returns a viewport-relative top for the menu. Only flips above the cursor
  // when there is genuinely very little space below (<120px) AND more space above.
  function calcMenuTop(rect) {
    const spaceBelow = window.innerHeight - rect.bottom - 6
    const spaceAbove = rect.top - 6
    if (spaceBelow < 120 && spaceAbove > spaceBelow) {
      return Math.max(8, rect.top - 6 - Math.min(320, spaceAbove))
    }
    return rect.bottom + 6
  }

  const filteredItems = getItems(menu.filter)
  const filteredItemsRef = useRef(filteredItems)
  filteredItemsRef.current = filteredItems

  function setFocusedPara(el) {
    if (focusedParaRef.current && focusedParaRef.current !== el) {
      focusedParaRef.current.classList.remove('is-cursor-para')
    }
    focusedParaRef.current = el || null
    if (el) el.classList.add('is-cursor-para')
  }

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      // While the table grid picker is open, freeze the slash menu so editor
      // updates don't reset it (the slash paragraph still holds "/table").
      if (menuRef.current.tablePicker) return
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          setFocusedPara(null)
          setMenu(m => m.visible && !menuRef.current.embedAction ? { ...m, visible: false } : m)
          setPlusButton(b => b.visible ? { ...b, visible: false } : b)
          return
        }

        const node = selection.anchor.getNode()

        // Suppress slash menu and plus button inside table cells
        if ($findMatchingParent(node, n => $isTableCellNode(n))) {
          setFocusedPara(null)
          setMenu(m => m.visible && !menuRef.current.embedAction ? { ...m, visible: false } : m)
          setPlusButton(b => b.visible ? { ...b, visible: false } : b)
          return
        }

        let topLevel
        try {
          topLevel = node.getKey() === 'root' ? node : node.getTopLevelElementOrThrow()
        } catch {
          setFocusedPara(null)
          setMenu(m => m.visible ? { ...m, visible: false } : m)
          setPlusButton(b => b.visible ? { ...b, visible: false } : b)
          return
        }

        if (!$isParagraphNode(topLevel)) {
          setFocusedPara(null)
          setMenu(m => m.visible && !menuRef.current.embedAction ? { ...m, visible: false } : m)
          setPlusButton(b => b.visible ? { ...b, visible: false } : b)
          return
        }

        const text = topLevel.getTextContent()
        const domEl = editor.getElementByKey(topLevel.getKey())
        setFocusedPara(domEl)

        if (text.startsWith('/')) {
          if (!domEl) return
          const rect = domEl.getBoundingClientRect()
          setPlusButton(b => b.visible ? { ...b, visible: false } : b)
          setMenu({
            visible: true,
            top: calcMenuTop(rect),
            left: rect.left,
            filter: text.slice(1),
            selectedIndex: 0,
            nodeKey: topLevel.getKey(),
            plusTriggered: false,
          })
        } else if (menuRef.current.visible && menuRef.current.plusTriggered) {
          // Menu was opened by + button — close it if cursor moved or paragraph got content
          if (text === '' && topLevel.getKey() === menuRef.current.nodeKey) {
            // Still on the same empty paragraph; keep menu open and update position
            if (domEl) {
              const rect = domEl.getBoundingClientRect()
              setMenu(m => ({ ...m, top: calcMenuTop(rect), left: rect.left }))
            }
          } else {
            setMenu(m => ({ ...m, visible: false, plusTriggered: false }))
          }
        } else {
          setMenu(m => m.visible && !menuRef.current.embedAction ? { ...m, visible: false } : m)

          // Show plus button when cursor is collapsed in an empty paragraph
          if (selection.isCollapsed() && text === '' && domEl) {
            const rect = domEl.getBoundingClientRect()
            setPlusButton({
              visible: true,
              top: rect.top + rect.height / 2,
              left: rect.left - 44,
              nodeKey: topLevel.getKey(),
            })
          } else {
            setPlusButton(b => b.visible ? { ...b, visible: false } : b)
          }
        }
      })
    })
  }, [editor])

  function handlePlusClick(e) {
    e.preventDefault()
    const { nodeKey } = plusButton
    const domEl = editor.getElementByKey(nodeKey)
    if (!domEl) return
    const rect = domEl.getBoundingClientRect()
    setPlusButton(b => ({ ...b, visible: false }))
    setMenu({
      visible: true,
      top: calcMenuTop(rect),
      left: rect.left,
      filter: '',
      selectedIndex: 0,
      nodeKey,
      plusTriggered: true,
    })
    editor.focus()
  }

  useEffect(() => {
    if (!menu.visible) return
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        const items = filteredItemsRef.current
        const m = menuRef.current
        if (m.tablePicker) {
          if (event.key === 'Escape') { event.preventDefault(); setMenu(x => ({ ...x, visible: false, tablePicker: false })); return true }
          event.preventDefault()
          return true
        }
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
      COMMAND_PRIORITY_CRITICAL
    )
  }, [editor, menu.visible]) // eslint-disable-line react-hooks/exhaustive-deps

  const UPLOAD_ACTIONS = new Set(['image', 'video', 'audio', 'file', 'gallery'])
  const ACCEPT_MAP = { image: 'image/*', video: 'video/*', audio: 'audio/*', file: '*', gallery: 'image/*' }

  function submitEmbedUrl() {
    const url = embedUrl.trim()
    if (!url) return
    const action = menuRef.current.embedAction
    const nodeKey = menuRef.current.nodeKey

    let isValid = false
    if (action === 'youtube') isValid = !!parseYouTubeId(url)
    else if (action === 'vimeo') isValid = !!parseVimeoId(url)
    else if (action === 'spotify') isValid = !!parseSpotifyPath(url)
    if (!isValid) return

    setMenu(m => ({ ...m, visible: false, embedAction: null }))
    setEmbedUrl('')

    editor.update(() => {
      const para = $getNodeByKey(nodeKey)
      if (!para || !$isParagraphNode(para)) return

      let newNode
      if (action === 'youtube') {
        newNode = $createYouTubeNode(parseYouTubeId(url))
      } else if (action === 'vimeo') {
        newNode = $createVimeoNode(parseVimeoId(url))
      } else if (action === 'spotify') {
        newNode = $createSpotifyNode(parseSpotifyPath(url))
      }
      if (!newNode) return

      para.replace(newNode)
      const next = newNode.getNextSibling()
      if ($isElementNode(next)) {
        next.selectStart()
      } else {
        const newPara = $createParagraphNode()
        newNode.insertAfter(newPara)
        newPara.selectStart()
      }
    })
  }

  const TABLE_MAX = 20

  function insertTable(cols, rows) {
    const nodeKey = menuRef.current.nodeKey
    setMenu(m => ({ ...m, visible: false, tablePicker: false }))

    editor.update(() => {
      const para = $getNodeByKey(nodeKey)
      if (para && $isParagraphNode(para)) { para.clear(); para.selectStart() }
    })
    editor.dispatchCommand(INSERT_TABLE_COMMAND, { columns: String(cols), rows: String(rows), includeHeaders: false })
    editor.update(() => {
      // Remove the now-empty slash paragraph (the table was inserted after it).
      const para = $getNodeByKey(nodeKey)
      if (para && $isParagraphNode(para) && para.getTextContent() === '' && para.getNextSibling()) {
        para.remove()
      }
      // The insert command leaves the selection inside the first cell — use it
      // to find the new table, then set default widths + width mode.
      const sel = $getSelection()
      if (!$isRangeSelection(sel)) return
      const cell = $findMatchingParent(sel.anchor.getNode(), n => $isTableCellNode(n))
      if (!cell) return
      const table = $getTableNodeFromLexicalNodeOrThrow(cell)
      // Fixed default column width: small tables stay narrow (and rest left),
      // bigger ones grow toward / past the column. CSS max-width caps prevent
      // overflow (regular → text column, wide → 80rem like the wide header).
      if (table.setColWidths) table.setColWidths(Array(cols).fill(170))
      if (table.setTableWidth) table.setTableWidth(cols >= 5 ? 'wide' : 'regular')
      // Ensure there is always a paragraph after the table to escape into.
      if (!table.getNextSibling()) table.insertAfter($createParagraphNode())
    })
  }

  function applyItem(item) {
    const nodeKey = menuRef.current.nodeKey

    if (item.action === 'youtube' || item.action === 'vimeo' || item.action === 'spotify') {
      setMenu(m => ({ ...m, embedAction: item.action, filter: '', selectedIndex: 0 }))
      setEmbedUrl('')
      return
    }

    if (item.action === 'table') {
      setTableHover({ rows: 1, cols: 1 })
      setMenu(m => ({ ...m, tablePicker: true, filter: '', selectedIndex: 0 }))
      return
    }

    setMenu(m => ({ ...m, visible: false }))

    if (UPLOAD_ACTIONS.has(item.action)) {
      let paragraphFound = false
      let savedText = ''
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (!node || !$isParagraphNode(node)) return
        paragraphFound = true
        savedText = node.getTextContent()
        node.clear()
      })
      if (!paragraphFound) return
      pendingNodeKeyRef.current = nodeKey
      pendingActionRef.current = item.action
      pendingSavedTextRef.current = savedText
      fileRef.current.accept = ACCEPT_MAP[item.action]
      fileRef.current.multiple = item.action === 'gallery'
      fileRef.current?.click()
      return
    }

    if (item.action === 'divider') {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (!node || !$isParagraphNode(node)) return
        const divider = $createDividerNode()
        node.replace(divider)
        const next = divider.getNextSibling()
        if ($isElementNode(next)) {
          next.selectStart()
        } else {
          const para = $createParagraphNode()
          divider.insertAfter(para)
          para.selectStart()
        }
      })
      return
    }

    if (item.action === 'callout') {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (!node || !$isParagraphNode(node)) return
        const callout = $createCalloutNode()
        node.replace(callout)
        const next = callout.getNextSibling()
        if ($isElementNode(next)) {
          next.selectStart()
        } else {
          const para = $createParagraphNode()
          callout.insertAfter(para)
          para.selectStart()
        }
      })
      return
    }

    if (item.action === 'button') {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (!node || !$isParagraphNode(node)) return
        const btn = $createButtonNode()
        node.replace(btn)
        const next = btn.getNextSibling()
        if ($isElementNode(next)) {
          next.selectStart()
        } else {
          const para = $createParagraphNode()
          btn.insertAfter(para)
          para.selectStart()
        }
      })
      return
    }

    if (item.action === 'toggle') {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (!node || !$isParagraphNode(node)) return
        const toggle = $createToggleNode()
        node.replace(toggle)
        const next = toggle.getNextSibling()
        if ($isElementNode(next)) {
          next.selectStart()
        } else {
          const para = $createParagraphNode()
          toggle.insertAfter(para)
          para.selectStart()
        }
      })
      return
    }

    if (item.action === 'code') {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (!node || !$isParagraphNode(node)) return
        const codeBlock = $createCodeBlockNode()
        node.replace(codeBlock)
        const next = codeBlock.getNextSibling()
        if ($isElementNode(next)) {
          next.selectStart()
        } else {
          const para = $createParagraphNode()
          codeBlock.insertAfter(para)
          para.selectStart()
        }
      })
      return
    }

    if (item.action === 'header') {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (!node || !$isParagraphNode(node)) return
        const headerNode = $createHeaderNode()
        node.replace(headerNode)
        const next = headerNode.getNextSibling()
        if ($isElementNode(next)) {
          next.selectStart()
        } else {
          const para = $createParagraphNode()
          headerNode.insertAfter(para)
          para.selectStart()
        }
      })
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
      }
    })
  }

  function handleMediaCancel() {
    const nodeKey = pendingNodeKeyRef.current
    const savedText = pendingSavedTextRef.current
    pendingNodeKeyRef.current = null
    pendingActionRef.current = null
    pendingSavedTextRef.current = null
    if (!nodeKey || !savedText) return
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node && $isParagraphNode(node)) {
        node.append($createTextNode(savedText))
        node.selectEnd()
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
    pendingSavedTextRef.current = null
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
      {plusButton.visible && (
        <Tooltip content="Insert block" side="right">
          <button
            style={{ position: 'fixed', top: plusButton.top, left: plusButton.left, transform: 'translateY(-50%)', zIndex: 9999 }}
            className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-300 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            onMouseDown={handlePlusClick}
            tabIndex={-1}
            aria-label="Insert block"
          >
            <Plus size={20} strokeWidth={2} />
          </button>
        </Tooltip>
      )}
      {menu.visible && menu.embedAction && (
        <div
          style={{ position: 'fixed', top: menu.top, left: menu.left, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-2xl p-3 w-72"
        >
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            {menu.embedAction === 'youtube' ? 'YouTube URL' : menu.embedAction === 'vimeo' ? 'Vimeo URL' : 'Spotify URL'}
          </p>
          <input
            autoFocus
            type="text"
            value={embedUrl}
            onChange={e => setEmbedUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); submitEmbedUrl() }
              if (e.key === 'Escape') { e.preventDefault(); setMenu(m => ({ ...m, visible: false, embedAction: null })); setEmbedUrl('') }
            }}
            placeholder={
              menu.embedAction === 'youtube' ? 'https://www.youtube.com/watch?v=…' :
              menu.embedAction === 'vimeo' ? 'https://vimeo.com/…' :
              'https://open.spotify.com/track/…'
            }
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>
      )}
      {menu.visible && menu.tablePicker && (() => {
        const dispCols = Math.min(TABLE_MAX, Math.max(5, tableHover.cols + 1))
        const dispRows = Math.min(TABLE_MAX, Math.max(5, tableHover.rows + 1))
        return (
          <div
            style={{ position: 'fixed', top: menu.top, left: menu.left, zIndex: 9999 }}
            className="bg-white border border-gray-200 rounded-xl shadow-2xl p-3 select-none"
            onMouseDown={e => e.preventDefault()}
          >
            <div className="flex flex-col gap-1" onMouseLeave={() => setTableHover({ rows: 1, cols: 1 })}>
              {Array.from({ length: dispRows }).map((_, ri) => (
                <div key={ri} className="flex gap-1">
                  {Array.from({ length: dispCols }).map((_, ci) => {
                    const active = ri < tableHover.rows && ci < tableHover.cols
                    return (
                      <button
                        key={ci}
                        onMouseEnter={() => setTableHover({ rows: ri + 1, cols: ci + 1 })}
                        onMouseDown={e => { e.preventDefault(); insertTable(ci + 1, ri + 1) }}
                        className={`w-4 h-4 rounded-sm border ${active ? 'bg-blue-100 border-blue-500' : 'bg-gray-50 border-gray-300'}`}
                        aria-label={`${ci + 1} by ${ri + 1}`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-gray-500 mt-2">{tableHover.cols} × {tableHover.rows}</p>
          </div>
        )
      })()}
      {menu.visible && !menu.embedAction && !menu.tablePicker && filteredItems.length > 0 && (
        <div
          style={{ position: 'fixed', top: menu.top, left: menu.left, zIndex: 9999, maxHeight: Math.min(320, window.innerHeight - menu.top - 8) }}
          className="bg-white border border-gray-200 rounded-xl shadow-2xl py-2 w-72 overflow-y-auto"
        >
          <p className="px-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Blocks</p>
          {filteredItems.map((item, i) => (
            <button
              key={item.action}
              ref={i === menu.selectedIndex ? selectedItemRef : null}
              onMouseDown={e => { e.preventDefault(); applyItem(item) }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                i === menu.selectedIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
            >
              <span className="shrink-0 w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg text-gray-500">
                <item.Icon size={16} strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 leading-tight">{item.label}</p>
                <p className="text-xs text-gray-400 leading-tight">{item.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      <input ref={fileRef} type="file" className="hidden" onChange={handleMediaFile} onCancel={handleMediaCancel} />
    </>,
    document.body
  )
}

// ─── ListIndentPlugin ─────────────────────────────────────────────────────────

export function ListIndentPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (event.key !== 'Tab') return false

        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return false

        const listItem = $findMatchingParent(selection.anchor.getNode(), node => $isListItemNode(node))
        if (!listItem) return false

        event.preventDefault()

        editor.update(() => {
          const sel = $getSelection()
          if (!$isRangeSelection(sel)) return
          const item = $findMatchingParent(sel.anchor.getNode(), node => $isListItemNode(node))
          if (!item) return

          if (event.shiftKey) {
            const indent = item.getIndent()
            if (indent > 0) {
              item.setIndent(indent - 1)
            } else {
              $setBlocksType(sel, () => $createParagraphNode())
            }
          } else {
            if (item.getPreviousSibling() !== null) {
              item.setIndent(item.getIndent() + 1)
            }
          }
        })

        return true
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [editor])

  return null
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

        if ($isRangeSelection(selection)) {
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
            const elRect = domEl.getBoundingClientRect()
            const lineH = parseFloat(window.getComputedStyle(domEl).lineHeight) || 24
            // getBoundingClientRect() returns a zero rect for collapsed ranges in Chrome;
            // getClientRects() correctly reflects the cursor's line position.
            const rects = domSel.getRangeAt(0).getClientRects()
            if (rects.length > 0) {
              if (isDown && rects[rects.length - 1].bottom < elRect.bottom - lineH) return false
              if (!isDown && rects[0].top > elRect.top + lineH) return false
            }
          }

          event.preventDefault()
          const sel = $createNodeSelection()
          sel.add(sibling.getKey())
          $setSelection(sel)
          return true
        }

        if ($isNodeSelection(selection)) {
          const nodes = selection.getNodes()
          if (nodes.length !== 1 || !$isDecoratorNode(nodes[0]) || nodes[0].isInline()) return false

          const sibling = isDown ? nodes[0].getNextSibling() : nodes[0].getPreviousSibling()
          if (!sibling) return false

          event.preventDefault()
          if ($isDecoratorNode(sibling) && !sibling.isInline()) {
            const sel = $createNodeSelection()
            sel.add(sibling.getKey())
            $setSelection(sel)
          } else if ($isElementNode(sibling)) {
            isDown ? sibling.selectStart() : sibling.selectEnd()
          }
          return true
        }

        return false
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
    focusAtEnd() {
      editor.getRootElement()?.focus({ preventScroll: true })
      editor.update(() => {
        const root = $getRoot()
        const lastChild = root.getLastChild()
        if ($isParagraphNode(lastChild)) {
          lastChild.selectEnd()
        } else {
          const paragraph = $createParagraphNode()
          root.append(paragraph)
          paragraph.select()
        }
      })
    },
  }), [editor])
  return null
}

// ─── Table helpers / floating menu ───────────────────────────────────────────

const TABLE_MAX_DIM = 20

// Resolve the table cell that currently holds the selection (range or table
// selection), or null when the selection is outside any table.
function $activeTableCell() {
  const sel = $getSelection()
  if ($isRangeSelection(sel)) {
    return $findMatchingParent(sel.anchor.getNode(), n => $isTableCellNode(n))
  }
  if ($isTableSelection(sel)) {
    const n = sel.anchor.getNode()
    return $isTableCellNode(n) ? n : $findMatchingParent(n, x => $isTableCellNode(x))
  }
  return null
}

// Light-mode floating toolbar shown above a table whenever the cursor is in one
// of its cells. Provides width/alignment, cell styling, add/delete rows &
// columns, undo/redo, and delete-table.
export function TableActionMenuPlugin() {
  const [editor] = useLexicalComposerContext()
  const [info, setInfo] = useState(null) // { tableKey, cellKey, width, align, cols, rows, bg, textMode, cellAlign }
  const [pos, setPos] = useState(null)
  const [panel, setPanel] = useState(null) // 'cell' | 'add' | null
  const [swatchOpen, setSwatchOpen] = useState(false)
  const toolbarRef = useRef(null)

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const cell = $activeTableCell()
        if (!cell) { setInfo(prev => (prev ? null : prev)); return }
        const table = $getTableNodeFromLexicalNodeOrThrow(cell)
        let cellAlign = 'left'
        const firstEl = cell.getChildren().find(c => $isElementNode(c))
        if (firstEl && firstEl.getFormatType) {
          cellAlign = firstEl.getFormatType() === 'center' ? 'center' : 'left'
        }
        // Collect all selected cell keys so multi-cell operations apply to all of them.
        const sel = $getSelection()
        let cellKeys = [cell.getKey()]
        if ($isTableSelection(sel)) {
          const selected = sel.getNodes().filter(n => $isTableCellNode(n))
          if (selected.length > 0) cellKeys = selected.map(n => n.getKey())
        }
        setInfo({
          tableKey: table.getKey(),
          cellKey: cell.getKey(),
          cellKeys,
          width: table.getTableWidth ? table.getTableWidth() : 'regular',
          borderColor: table.getBorderColor ? table.getBorderColor() : '#e5e7eb',
          cols: table.getColumnCount(),
          rows: table.getChildrenSize(),
          bg: cell.getBackgroundColor ? cell.getBackgroundColor() : null,
          textMode: cell.getTextColorMode ? cell.getTextColorMode() : 'auto',
          cellAlign,
        })
      })
    })
  }, [editor])

  // Hide panels when the menu hides.
  useEffect(() => { if (!info) { setPanel(null); setSwatchOpen(false) } }, [info])

  // Position the toolbar above the table.
  useLayoutEffect(() => {
    if (!info) { setPos(null); return }
    function calc() {
      const tableEl = editor.getElementByKey(info.tableKey)
      if (!tableEl) { setPos(null); return }
      const rect = tableEl.getBoundingClientRect()
      const width = toolbarRef.current?.offsetWidth || 360
      let left = rect.left + window.scrollX + rect.width / 2 - width / 2
      left = Math.max(8, Math.min(left, window.innerWidth + window.scrollX - width - 8))
      let top = rect.top + window.scrollY - 48
      if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + 8
      setPos({ top, left })
    }
    calc()
    window.addEventListener('scroll', calc, true)
    window.addEventListener('resize', calc)
    return () => { window.removeEventListener('scroll', calc, true); window.removeEventListener('resize', calc) }
  }, [editor, info])

  if (!info || !pos) return null

  const run = (fn) => editor.update(fn)
  const onTable = (fn) => run(() => { const t = $getNodeByKey(info.tableKey); if (t && $isTableNode(t)) fn(t) })
  const onCells = (fn) => run(() => { info.cellKeys.forEach(key => { const c = $getNodeByKey(key); if (c && $isTableCellNode(c)) fn(c) }) })

  const setWidth = (w) => onTable(t => t.setTableWidth && t.setTableWidth(w))
  const insertColumn = (after) => { run(() => $insertTableColumn__EXPERIMENTAL(after)); setPanel(null) }
  const insertRow = (after) => { run(() => $insertTableRow__EXPERIMENTAL(after)); setPanel(null) }
  const deleteColumn = () => run(() => $deleteTableColumn__EXPERIMENTAL())
  const deleteRow = () => run(() => $deleteTableRow__EXPERIMENTAL())
  const deleteTable = () => run(() => {
    const t = $getNodeByKey(info.tableKey)
    if (!t) return
    const para = $createParagraphNode()
    t.insertAfter(para)
    t.remove()
    para.selectStart()
  })
  const setCellBg = (hex) => onCells(c => c.setBackgroundColor(hex === 'transparent' ? null : hex))
  const setCellTextMode = (mode) => onCells(c => c.setTextColorMode && c.setTextColorMode(mode))
  const setCellAlign = (a) => {
    run(() => {
      info.cellKeys.forEach(key => {
        const c = $getNodeByKey(key)
        if (!c || !$isTableCellNode(c)) return
        c.getChildren().forEach(child => { if ($isElementNode(child)) child.setFormat(a) })
      })
    })
    setInfo(prev => prev ? { ...prev, cellAlign: a } : prev)
  }
  const setBorderColor = (hex) => onTable(t => t.setBorderColor && t.setBorderColor(hex))

  const grp = 'flex gap-0.5 bg-gray-100 rounded-lg p-0.5'
  const btn = (active) => `p-1.5 rounded-md transition-colors ${active ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`
  const ico = 'p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors'
  const divider = <div className="w-px h-5 bg-gray-200 mx-0.5" />
  const colsAtMax = info.cols >= TABLE_MAX_DIM
  const rowsAtMax = info.rows >= TABLE_MAX_DIM

  return createPortal(
    <div
      ref={toolbarRef}
      style={{ position: 'absolute', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-xl px-1.5 py-1 shadow-2xl"
      onMouseDown={e => e.preventDefault()}
    >
      {/* Width */}
      <div className={grp}>
        <Tooltip content="Regular width"><button className={btn(info.width !== 'wide')} onClick={() => setWidth('regular')}><AlignJustify size={15} /></button></Tooltip>
        <Tooltip content="Wide width"><button className={btn(info.width === 'wide')} onClick={() => setWidth('wide')}><StretchHorizontal size={15} /></button></Tooltip>
      </div>
      {divider}
      {/* Cell alignment */}
      <div className={grp}>
        <Tooltip content="Align left"><button className={btn(info.cellAlign !== 'center')} onClick={() => setCellAlign('left')}><AlignLeft size={15} /></button></Tooltip>
        <Tooltip content="Align center"><button className={btn(info.cellAlign === 'center')} onClick={() => setCellAlign('center')}><AlignCenter size={15} /></button></Tooltip>
      </div>
      {/* Color options */}
      <div className="relative">
        <Tooltip content="Color options">
          <button className={`${ico} ${panel === 'cell' ? 'bg-gray-100 text-gray-800' : ''}`} onClick={() => setPanel(p => p === 'cell' ? null : 'cell')}><PaintBucket size={15} /></button>
        </Tooltip>
        {panel === 'cell' && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 w-56 space-y-3" onMouseDown={e => e.preventDefault()}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Background color</span>
              <ColorSwatchMenu
                value={info.bg && info.bg !== 'transparent' ? info.bg : 'transparent'}
                onChange={setCellBg}
                presets={['transparent', '#f3f4f6', '#e5e7eb', '#9ca3af', '#fde047']}
                onOpenChange={setSwatchOpen}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Text color</span>
              <div className={grp}>
                <Tooltip content="Auto"><button className={btn(info.textMode === 'auto')} onClick={() => setCellTextMode('auto')}><Eclipse size={15} /></button></Tooltip>
                <Tooltip content="Light"><button className={btn(info.textMode === 'light')} onClick={() => setCellTextMode('light')}><Sun size={15} /></button></Tooltip>
                <Tooltip content="Dark"><button className={btn(info.textMode === 'dark')} onClick={() => setCellTextMode('dark')}><Moon size={15} /></button></Tooltip>
              </div>
            </div>
          </div>
        )}
      </div>
      {divider}
      {/* Table options */}
      <div className="relative">
        <Tooltip content="Table options">
          <button className={`${ico} ${panel === 'add' ? 'bg-gray-100 text-gray-800' : ''}`} onClick={() => setPanel(p => p === 'add' ? null : 'add')}><Columns3Cog size={16} /></button>
        </Tooltip>
        {panel === 'add' && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white border border-gray-200 rounded-xl shadow-2xl px-2 py-1.5 flex items-center gap-0.5" onMouseDown={e => e.preventDefault()}>
            <Tooltip content="Insert column left"><button className={ico} disabled={colsAtMax} onClick={() => insertColumn(false)} style={colsAtMax ? { opacity: 0.3, pointerEvents: 'none' } : {}}><ArrowLeftToLine size={15} /></button></Tooltip>
            <Tooltip content="Insert column right"><button className={ico} disabled={colsAtMax} onClick={() => insertColumn(true)} style={colsAtMax ? { opacity: 0.3, pointerEvents: 'none' } : {}}><ArrowRightToLine size={15} /></button></Tooltip>
            <Tooltip content="Insert row above"><button className={ico} disabled={rowsAtMax} onClick={() => insertRow(false)} style={rowsAtMax ? { opacity: 0.3, pointerEvents: 'none' } : {}}><ArrowUpToLine size={15} /></button></Tooltip>
            <Tooltip content="Insert row below"><button className={ico} disabled={rowsAtMax} onClick={() => insertRow(true)} style={rowsAtMax ? { opacity: 0.3, pointerEvents: 'none' } : {}}><ArrowDownToLine size={15} /></button></Tooltip>
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <Tooltip content="Delete column"><button className={`${ico} hover:text-red-600`} onClick={deleteColumn}><RectangleVertical size={15} /></button></Tooltip>
            <Tooltip content="Delete row"><button className={`${ico} hover:text-red-600`} onClick={deleteRow}><RectangleHorizontal size={15} /></button></Tooltip>
          </div>
        )}
      </div>
      {/* Table borders */}
      <div className="relative">
        <Tooltip content="Table borders">
          <button className={`${ico} ${panel === 'border' ? 'bg-gray-100 text-gray-800' : ''}`} onClick={() => setPanel(p => p === 'border' ? null : 'border')}><Grid2x2 size={15} /></button>
        </Tooltip>
        {panel === 'border' && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 w-52" onMouseDown={e => e.preventDefault()}>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-500">Border color</span>
              <ColorSwatchMenu
                value={info.borderColor || '#e5e7eb'}
                onChange={setBorderColor}
                presets={['transparent', '#e5e7eb', '#9ca3af', '#6b7280', '#374151', '#111827']}
                onOpenChange={setSwatchOpen}
              />
            </div>
          </div>
        )}
      </div>
      {divider}
      <Tooltip content="Undo"><button className={ico} onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}><Undo2 size={15} /></button></Tooltip>
      <Tooltip content="Redo"><button className={ico} onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}><Redo2 size={15} /></button></Tooltip>
      {divider}
      <Tooltip content="Delete table"><button className={`${ico} hover:text-red-600`} onClick={deleteTable}><Trash2 size={15} /></button></Tooltip>
    </div>,
    document.body
  )
}


// ─── Table column resize ─────────────────────────────────────────────────────
// Renders thin drag handles at each column boundary of the active table.
// Interior handles redistribute width between two neighbouring columns; the
// right-most handle grows/shrinks the whole table.
export function TableColumnResizePlugin() {
  const [editor] = useLexicalComposerContext()
  const [tableKey, setTableKey] = useState(null)
  const [handles, setHandles] = useState([])
  const dragRef = useRef(null)

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const cell = $activeTableCell()
        if (!cell) { setTableKey(k => (k ? null : k)); return }
        const table = $getTableNodeFromLexicalNodeOrThrow(cell)
        setTableKey(table.getKey())
      })
    })
  }, [editor])

  useLayoutEffect(() => {
    if (!tableKey) { setHandles([]); return }
    function calc() {
      if (dragRef.current) return
      const tableEl = editor.getElementByKey(tableKey)
      const firstRow = tableEl?.querySelector('tr')
      if (!tableEl || !firstRow) { setHandles([]); return }
      const tableRect = tableEl.getBoundingClientRect()
      const cells = [...firstRow.children]
      setHandles(cells.map((c, i) => {
        const r = c.getBoundingClientRect()
        return { index: i, isLast: i === cells.length - 1, x: r.right + window.scrollX, top: tableRect.top + window.scrollY, height: tableRect.height }
      }))
    }
    calc()
    const unreg = editor.registerUpdateListener(() => calc())
    window.addEventListener('scroll', calc, true)
    window.addEventListener('resize', calc)
    return () => { unreg(); window.removeEventListener('scroll', calc, true); window.removeEventListener('resize', calc) }
  }, [editor, tableKey])

  function currentWidths(tableEl, count) {
    const cols = tableEl.querySelectorAll(':scope > colgroup > col')
    if (cols.length === count) {
      const ws = [...cols].map(c => parseFloat(c.style.width) || 0)
      if (ws.every(w => w > 0)) return ws
    }
    const firstRow = tableEl.querySelector('tr')
    return [...firstRow.children].map(c => Math.round(c.getBoundingClientRect().width))
  }

  function onHandleDown(e, handle) {
    e.preventDefault()
    const tableEl = editor.getElementByKey(tableKey)
    if (!tableEl) return
    let count = 0
    editor.getEditorState().read(() => { const t = $getNodeByKey(tableKey); if (t) count = t.getColumnCount() })
    const startWidths = currentWidths(tableEl, count)
    dragRef.current = { ...handle, startX: e.clientX, startWidths, tableEl, count }

    const move = (ev) => {
      const d = dragRef.current
      if (!d) return
      const dx = ev.clientX - d.startX
      const widths = liveWidths(d, dx)
      applyDOMWidths(d.tableEl, widths)
    }
    const up = (ev) => {
      const d = dragRef.current
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      dragRef.current = null
      if (!d) return
      const widths = liveWidths(d, ev.clientX - d.startX)
      editor.update(() => {
        const t = $getNodeByKey(tableKey)
        if (t && $isTableNode(t)) t.setColWidths(widths)
      })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  function liveWidths(d, dx) {
    const MIN = 48
    const w = [...d.startWidths]
    const i = d.index
    if (d.isLast) {
      w[i] = Math.max(MIN, d.startWidths[i] + dx)
    } else {
      const delta = Math.max(MIN - d.startWidths[i], Math.min(d.startWidths[i + 1] - MIN, dx))
      w[i] = d.startWidths[i] + delta
      w[i + 1] = d.startWidths[i + 1] - delta
    }
    return w
  }

  function applyDOMWidths(tableEl, widths) {
    const cols = tableEl.querySelectorAll(':scope > colgroup > col')
    if (cols.length === widths.length) widths.forEach((wpx, i) => { cols[i].style.width = `${wpx}px` })
    tableEl.style.width = `${widths.reduce((a, b) => a + b, 0)}px`
  }

  if (!tableKey || !handles.length) return null

  return createPortal(
    <>
      {handles.map(h => (
        <div
          key={h.index}
          onMouseDown={e => onHandleDown(e, h)}
          style={{ position: 'absolute', top: h.top, left: h.x - 3, height: h.height, width: 7, zIndex: 9998, cursor: 'col-resize' }}
          className="group"
        >
          <div className="mx-auto w-px h-full bg-transparent group-hover:bg-blue-400" />
        </div>
      ))}
    </>,
    document.body
  )
}
