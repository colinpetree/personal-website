import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  Bold, Italic, Underline, Strikethrough, CodeXml, Link, Link2, Link2Off,
  Heading1, Heading2, Heading3,
  Type, Quote, SquareCode,
  List, ListOrdered, SquareSplitVertical, Image, Play, Music, Paperclip, Images, Plus, MessageSquareWarning, MousePointerClick, SquareChevronDown,
  Table, AlignLeft, AlignCenter, Trash2, Undo2, Redo2,
  ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, ArrowDownToLine,
  Columns3Cog, RectangleHorizontal, RectangleVertical, Grid2x2, PaintBucket,
  FileUp, Mic,
} from 'lucide-react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $setBlocksType } from '@lexical/selection'
import { $createHeadingNode, $createQuoteNode, $isHeadingNode } from '@lexical/rich-text'
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, $isListItemNode } from '@lexical/list'
import { $findMatchingParent } from '@lexical/utils'
import { TOGGLE_LINK_COMMAND, $isLinkNode } from '@lexical/link'
import {
  INSERT_TABLE_COMMAND, $isTableNode, $isTableCellNode, $isTableSelection,
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableRow__EXPERIMENTAL, $insertTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL, $deleteTableColumn__EXPERIMENTAL,
} from '@lexical/table'
import {
  $getSelection, $isRangeSelection, $isNodeSelection, $createParagraphNode, $createTextNode, $getRoot,
  FORMAT_TEXT_COMMAND, FORMAT_ELEMENT_COMMAND, UNDO_COMMAND, REDO_COMMAND,
  KEY_DOWN_COMMAND, COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_CRITICAL, COMMAND_PRIORITY_LOW,
  $getNodeByKey, $isParagraphNode, $isDecoratorNode, $isElementNode,
  $createNodeSelection, $setSelection, createCommand,
} from 'lexical'
import { $createImageNode, $createVideoNode, $createAudioNode, $createFileNode, $createGalleryNode, $createDividerNode, $createCalloutNode, $createButtonNode, $createLinkGroupNode, $createToggleNode, $createCodeBlockNode, $createHeaderNode, $createYouTubeNode, $createVimeoNode, $createSpotifyNode } from './nodes'
import { handleUpload, handleUploadFull } from './upload'
import { Tooltip } from '../../ui/Tooltip'
import { ColorSwatchMenu } from '../../ui/ColorPicker'

// ─── LoadHtmlPlugin ───────────────────────────────────────────────────────────

// Root nodes must be elements or decorators; loose text/inline nodes (which can
// show up when loading hand-written HTML that wasn't produced by this editor,
// e.g. old textarea-authored content) get wrapped in a paragraph instead.
function normalizeRootNodes(nodes) {
  const result = []
  let buffer = []
  function flush() {
    if (buffer.length) {
      const p = $createParagraphNode()
      p.append(...buffer)
      result.push(p)
      buffer = []
    }
  }
  for (const node of nodes) {
    if ($isElementNode(node) || $isDecoratorNode(node)) {
      flush()
      result.push(node)
    } else {
      buffer.push(node)
    }
  }
  flush()
  return result
}

export function LoadHtmlPlugin({ html }) {
  const [editor] = useLexicalComposerContext()
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    if (!html) return
    editor.update(() => {
      const parser = new DOMParser()
      const dom = parser.parseFromString(html, 'text/html')
      const nodes = $generateNodesFromDOM(editor, dom)
      const root = $getRoot()
      root.clear()
      root.append(...normalizeRootNodes(nodes))
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
    return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return
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
    heading: null, showHeadings: false,
  })
  const [linkState, setLinkState] = useState({ hasLink: false, url: '', mixed: false })
  const [showLinkPopover, setShowLinkPopover] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')
  const linkButtonRef = useRef(null)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })

  function calcPos(rect) {
    const H = 40
    const left = Math.max(8, Math.min(rect.left + rect.width / 2, window.innerWidth - 8))
    let top = rect.top - H - 8
    if (top < 8) top = rect.bottom + 8
    return { top, left }
  }

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

        const selNodes = selection.getNodes()
        const linkUrls = new Set()
        for (const node of selNodes) {
          const linkNode = $findMatchingParent(node, $isLinkNode)
          if (linkNode) linkUrls.add(linkNode.getURL())
        }
        setLinkState({
          hasLink: linkUrls.size > 0,
          url: linkUrls.size === 1 ? [...linkUrls][0] : '',
          mixed: linkUrls.size > 1,
        })

        const anchorNode = selection.anchor.getNode()
        const blockNode = $findMatchingParent(anchorNode, node => node.getParent() === $getRoot())
        const heading = $isHeadingNode(blockNode) ? blockNode.getTag() : null
        const showHeadings = $isParagraphNode(blockNode) || $isHeadingNode(blockNode)
        const { top, left } = calcPos(rect)

        setToolbar({
          visible: true, top, left,
          bold: selection.hasFormat('bold'),
          italic: selection.hasFormat('italic'),
          underline: selection.hasFormat('underline'),
          strike: selection.hasFormat('strikethrough'),
          code: selection.hasFormat('code'),
          heading, showHeadings,
        })
      })
    })
  }, [editor])

  useEffect(() => {
    if (!toolbar.visible) return
    const onScroll = () => {
      const nativeSel = window.getSelection()
      if (!nativeSel || nativeSel.rangeCount === 0) return
      const rect = nativeSel.getRangeAt(0).getBoundingClientRect()
      if (!rect || rect.width === 0) return
      const { top, left } = calcPos(rect)
      setToolbar(t => ({ ...t, top, left }))
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [toolbar.visible])

  function openLinkPopover() {
    if (showLinkPopover) { cancelLink(); return }
    if (!linkButtonRef.current) return
    const rect = linkButtonRef.current.getBoundingClientRect()
    setPopoverPos({ top: rect.top - 8, left: rect.left + rect.width / 2 })
    setLinkDraft(linkState.mixed ? '' : linkState.url)
    setShowLinkPopover(true)
  }

  function commitLink() {
    const url = linkDraft.trim()
    if (url) editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
    setShowLinkPopover(false)
    setLinkDraft('')
  }

  function removeLink() {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    setShowLinkPopover(false)
    setLinkDraft('')
  }

  function cancelLink() {
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

  function toggleHeading(tag) {
    editor.update(() => {
      const sel = $getSelection()
      if (!$isRangeSelection(sel)) return
      const anchor = sel.anchor.getNode()
      const block = $findMatchingParent(anchor, n => n.getParent() === $getRoot())
      if ($isHeadingNode(block) && block.getTag() === tag) {
        $setBlocksType(sel, () => $createParagraphNode())
      } else {
        $setBlocksType(sel, () => $createHeadingNode(tag))
      }
    })
  }

  function fmtBtn(active, Icon, format, label) {
    return (
      <Tooltip key={format} content={label}>
        <button
          onMouseDown={e => { e.preventDefault(); editor.dispatchCommand(FORMAT_TEXT_COMMAND, format) }}
          className={`p-1.5 rounded-md transition-colors ${
            active ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Icon size={14} strokeWidth={2} />
        </button>
      </Tooltip>
    )
  }

  if (!toolbar.visible && !showLinkPopover) return null

  const toolbarPortal = createPortal(
    <div
      style={{ position: 'fixed', top: toolbar.top, left: toolbar.left, transform: 'translateX(-50%)', zIndex: 9999 }}
      className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-xl px-1.5 py-1 shadow-2xl"
      onMouseDown={e => e.preventDefault()}
    >
      {fmtBtn(toolbar.bold, Bold, 'bold', 'Bold')}
      {fmtBtn(toolbar.italic, Italic, 'italic', 'Italic')}
      {fmtBtn(toolbar.underline, Underline, 'underline', 'Underline')}
      {fmtBtn(toolbar.strike, Strikethrough, 'strikethrough', 'Strikethrough')}
      {fmtBtn(toolbar.code, CodeXml, 'code', 'Inline code')}
      {toolbar.showHeadings && (
        <>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          {[
            { tag: 'h1', Icon: Heading1, label: 'Heading 1' },
            { tag: 'h2', Icon: Heading2, label: 'Heading 2' },
            { tag: 'h3', Icon: Heading3, label: 'Heading 3' },
          ].map(({ tag, Icon, label }) => (
            <Tooltip key={tag} content={label}>
              <button
                onMouseDown={e => { e.preventDefault(); toggleHeading(tag) }}
                className={`p-1.5 rounded-md transition-colors ${
                  toolbar.heading === tag ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon size={14} strokeWidth={2} />
              </button>
            </Tooltip>
          ))}
        </>
      )}
      <div className="w-px h-5 bg-gray-200 mx-0.5" />
      <Tooltip content="Link">
        <button
          ref={linkButtonRef}
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); openLinkPopover() }}
          className={`p-1.5 rounded-md transition-colors ${
            linkState.hasLink ? 'text-blue-500 hover:bg-gray-100' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Link2 size={14} strokeWidth={2} />
        </button>
      </Tooltip>
      {linkState.hasLink && (
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
  )

  return <>
    {toolbarPortal}
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
}

// ─── SlashCommandPlugin ───────────────────────────────────────────────────────

function YouTubeLogo() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" fill="#FF0000"/>
      <path d="M9.75 15.02V8.98L15.5 12l-5.75 3.02z" fill="#fff"/>
    </svg>
  )
}

function VimeoLogo() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.396 7.164c-.093 2.026-1.507 4.799-4.245 8.32C15.322 19.16 12.928 21 10.97 21c-1.214 0-2.24-1.119-3.079-3.359l-1.68-6.172C5.54 9.23 4.893 8.11 4.2 8.11c-.16 0-.71.332-1.653.993L1.5 7.697c1.048-.92 2.08-1.84 3.094-2.76C5.939 3.788 7.005 3.105 7.7 3.04c1.67-.16 2.7.982 3.083 3.425.418 2.631.708 4.265.869 4.902.483 2.19 1.012 3.283 1.589 3.283.449 0 1.123-.71 2.022-2.127.897-1.418 1.376-2.497 1.435-3.237.127-1.225-.353-1.84-1.435-1.84-.512 0-1.038.118-1.578.35 1.048-3.43 3.05-5.097 6.005-5.003 2.19.065 3.223 1.485 3.106 4.37z" fill="#1AB7EA"/>
    </svg>
  )
}

function SpotifyLogo() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#1DB954"/>
      <path d="M16.5 16.5c-.2 0-.3-.1-.5-.2-2.1-1.3-4.7-1.6-7.8-.9-.3.1-.6-.1-.7-.4-.1-.3.1-.6.4-.7 3.4-.8 6.3-.4 8.6 1 .2.1.3.4.2.7-.1.3-.1.5-.2.5zm1.1-2.5c-.2 0-.4-.1-.5-.2-2.4-1.5-6-1.9-8.8-1-.3.1-.7-.1-.8-.4-.1-.3.1-.7.4-.8 3.2-.9 7.1-.5 9.8 1.2.3.2.4.5.2.8-.1.3-.3.4-.3.4zm.1-2.5c-2.8-1.7-7.5-1.8-10.2-1-.4.1-.8-.1-.9-.5-.1-.4.1-.8.5-.9 3.1-.9 8.2-.7 11.4 1.1.3.2.5.6.3.9-.2.3-.6.5-1.1.4z" fill="#fff"/>
    </svg>
  )
}

const SLASH_GROUPS = [
  {
    label: 'PRIMARY',
    items: [
      { label: 'Bulleted List', Icon: List,                 action: 'bullet'  },
      { label: 'Numbered List', Icon: ListOrdered,          action: 'number'  },
      { label: 'Code',          Icon: SquareCode,           action: 'code'    },
      { label: 'Table',         Icon: Table,                action: 'table'   },
      { label: 'Divider',       Icon: SquareSplitVertical,  action: 'divider' },
      { label: 'Quote',         Icon: Quote,                action: 'quote'   },
      { label: 'Toggle',        Icon: SquareChevronDown,    action: 'toggle'  },
      { label: 'Button',        Icon: MousePointerClick,    action: 'button'  },
      { label: 'Link Group',    Icon: Link,                 action: 'linkGroup' },
      { label: 'Callout',       Icon: MessageSquareWarning, action: 'callout' },
      { label: 'Header',        Icon: RectangleHorizontal,  action: 'header'  },
    ],
  },
  {
    label: 'UPLOADS',
    items: [
      { label: 'Image',     Icon: Image,     action: 'image'     },
      { label: 'Gallery',   Icon: Images,    action: 'gallery'   },
      { label: 'Video',     Icon: Play,      action: 'video'     },
      { label: 'Audio',     Icon: Music,     action: 'audio'     },
      { label: 'File',      Icon: Paperclip, action: 'file'      },
      { label: 'Recording', Icon: Mic,       action: 'recording' },
    ],
  },
  {
    label: 'EMBED',
    items: [
      { label: 'YouTube', Icon: YouTubeLogo, action: 'youtube' },
      { label: 'Vimeo',   Icon: VimeoLogo,   action: 'vimeo'  },
      { label: 'Spotify', Icon: SpotifyLogo, action: 'spotify' },
    ],
  },
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

  function getFilteredGroups(filter) {
    if (!filter) return SLASH_GROUPS
    const q = filter.toLowerCase()
    return SLASH_GROUPS
      .map(g => ({ ...g, items: g.items.filter(i => i.label.toLowerCase().includes(q)) }))
      .filter(g => g.items.length > 0)
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

  const filteredGroups = getFilteredGroups(menu.filter)
  const allFilteredItems = filteredGroups.flatMap(g => g.items)
  const filteredItemsRef = useRef(allFilteredItems)
  filteredItemsRef.current = allFilteredItems

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

        if (!$isParagraphNode(topLevel) && !$isHeadingNode(topLevel)) {
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
      if (table.setTableWidth) table.setTableWidth(cols >= 6 ? 'wide' : 'regular')
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
      // Read synchronously — editor.update() is deferred when called inside a
      // Lexical command handler, so we can't rely on its callback having run
      // before checking paragraphFound or before calling fileRef.current.click().
      let paragraphFound = false
      let savedText = ''
      editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey)
        if (!node || !$isParagraphNode(node)) return
        paragraphFound = true
        savedText = node.getTextContent()
      })
      if (!paragraphFound) return
      pendingNodeKeyRef.current = nodeKey
      pendingActionRef.current = item.action
      pendingSavedTextRef.current = savedText
      fileRef.current.accept = ACCEPT_MAP[item.action]
      fileRef.current.multiple = item.action === 'gallery'
      // Clear the slash text — can run async, we don't need to wait for it.
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node && $isParagraphNode(node)) node.clear()
      })
      fileRef.current.click()
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

    if (item.action === 'linkGroup') {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (!node || !$isParagraphNode(node)) return
        const group = $createLinkGroupNode()
        node.replace(group)
        const next = group.getNextSibling()
        if ($isElementNode(next)) {
          next.selectStart()
        } else {
          const para = $createParagraphNode()
          group.insertAfter(para)
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

    if (item.action === 'recording') {
      const prevKey = editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey)
        return node?.getPreviousSibling()?.__key || null
      })
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) node.remove()
      })
      editor.dispatchCommand(OPEN_RECORDING_MODAL_COMMAND, prevKey)
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
        const data = await handleUploadFull(files[0])
        editor.update(() => {
          const node = $getNodeByKey(paragraphKey)
          if (node && $isParagraphNode(node)) node.replace($createImageNode(`/api/uploads/${data.filename}`, '', '', 'regular', '', data.srcset || '', data.lqip || ''))
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
          const data = await handleUploadFull(file)
          uploaded.push({ src: `/api/uploads/${data.filename}`, alt: '', srcset: data.srcset || '' })
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
      {menu.visible && !menu.embedAction && !menu.tablePicker && allFilteredItems.length > 0 && (
        <div
          style={{ position: 'fixed', top: menu.top, left: menu.left, zIndex: 9999, maxHeight: Math.min(320, window.innerHeight - menu.top - 8) }}
          className="bg-white border border-gray-200 rounded-xl shadow-2xl py-2 w-72 overflow-y-auto"
        >
          {filteredGroups.map(group => (
            <div key={group.label}>
              <p className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">{group.label}</p>
              {group.items.map(item => {
                const flatIdx = allFilteredItems.indexOf(item)
                return (
                  <button
                    key={item.action}
                    ref={flatIdx === menu.selectedIndex ? selectedItemRef : null}
                    onMouseDown={e => { e.preventDefault(); applyItem(item) }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                      flatIdx === menu.selectedIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="shrink-0 w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg text-gray-500">
                      <item.Icon size={16} strokeWidth={2} />
                    </span>
                    <p className="text-sm font-medium text-gray-900 leading-tight">{item.label}</p>
                  </button>
                )
              })}
            </div>
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
  const isRange = $isRangeSelection(sel)
  const isTable = $isTableSelection(sel)
  if (!isRange && !isTable) {
    return null
  }
  if (isRange) {
    const anchorNode = sel.anchor.getNode()
    const cell = $findMatchingParent(anchorNode, n => $isTableCellNode(n))
    return cell
  }
  if (isTable) {
    const n = sel.anchor.getNode()
    const cell = $isTableCellNode(n) ? n : $findMatchingParent(n, x => $isTableCellNode(x))
    return cell
  }
  return null
}

// Light-mode floating toolbar shown above a table whenever the cursor is in one
// of its cells. Provides width/alignment, cell styling, add/delete rows &
// columns, undo/redo, and delete-table.
export function TableActionMenuPlugin() {
  const [editor] = useLexicalComposerContext()
  const [info, setInfo] = useState(null) // { tableKey, cellKey, width, align, cols, rows, bg, textColor, cellAlign }
  const [pos, setPos] = useState(null)
  const [panel, setPanel] = useState(null) // 'textColor' | 'cellBg' | 'border' | 'add' | null
  const toolbarRef = useRef(null)
  const textColorBtnRef = useRef(null)
  const cellBgBtnRef = useRef(null)
  const borderBtnRef = useRef(null)

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
          textColor: cell.getTextColor ? cell.getTextColor() : null,
          cellAlign,
        })
      })
    })
  }, [editor])

  // Hide panels when the menu hides.
  useEffect(() => { if (!info) setPanel(null) }, [info])

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

  const insertColumn = (after) => {
    run(() => {
      const t = $getNodeByKey(info.tableKey)
      if (!t || !$isTableNode(t)) return
      const oldWidths = t.getColWidths() || []
      const oldTotal = oldWidths.reduce((a, b) => a + (b || 0), 0) || info.cols * 170
      $insertTableColumn__EXPERIMENTAL(after)
      const updated = $getNodeByKey(info.tableKey)
      if (!updated || !$isTableNode(updated)) return
      const newCount = info.cols + 1
      updated.setTableWidth(newCount >= 6 ? 'wide' : 'regular')
      const maxPx = newCount >= 6 ? 1280 : 720
      const targetTotal = Math.min(oldTotal + 170, maxPx)
      updated.setColWidths(Array(newCount).fill(Math.floor(targetTotal / newCount)))
    })
  }
  const insertRow = (after) => { run(() => $insertTableRow__EXPERIMENTAL(after)) }
  const deleteColumn = () => {
    run(() => {
      $deleteTableColumn__EXPERIMENTAL()
      const updated = $getNodeByKey(info.tableKey)
      if (!updated || !$isTableNode(updated)) return
      const newCount = info.cols - 1
      updated.setTableWidth(newCount >= 6 ? 'wide' : 'regular')
    })
  }
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
  const setCellTextColor = (hex) => onCells(c => c.setTextColor && c.setTextColor(hex))
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
      {/* Cell alignment */}
      <div className={grp}>
        <Tooltip content="Align left"><button className={btn(info.cellAlign !== 'center')} onClick={() => setCellAlign('left')}><AlignLeft size={15} /></button></Tooltip>
        <Tooltip content="Align center"><button className={btn(info.cellAlign === 'center')} onClick={() => setCellAlign('center')}><AlignCenter size={15} /></button></Tooltip>
      </div>
      {/* Text color */}
      <Tooltip content="Text color">
        <button ref={textColorBtnRef} className={`${ico} ${panel === 'textColor' ? 'bg-gray-100 text-gray-800' : ''}`} onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} onClick={() => setPanel(p => p === 'textColor' ? null : 'textColor')}><Type size={15} /></button>
      </Tooltip>
      {panel === 'textColor' && (
        <ColorSwatchMenu
          anchorEl={textColorBtnRef.current}
          value={info.textColor || '#000000'}
          onChange={setCellTextColor}
          presets={['#000000', '#1f2937', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#f9fafb', '#ffffff']}
          onOpenChange={(open) => { if (!open) setPanel(null) }}
          initialOpen
        />
      )}
      {/* Color fill */}
      <Tooltip content="Color fill">
        <button ref={cellBgBtnRef} className={`${ico} ${panel === 'cellBg' ? 'bg-gray-100 text-gray-800' : ''}`} onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} onClick={() => setPanel(p => p === 'cellBg' ? null : 'cellBg')}><PaintBucket size={15} /></button>
      </Tooltip>
      {panel === 'cellBg' && (
        <ColorSwatchMenu
          anchorEl={cellBgBtnRef.current}
          value={info.bg && info.bg !== 'transparent' ? info.bg : 'transparent'}
          onChange={setCellBg}
          presets={['transparent', '#f3f4f6', '#e5e7eb', '#9ca3af', '#fde047']}
          onOpenChange={(open) => { if (!open) setPanel(null) }}
          initialOpen
        />
      )}
      {/* Border color */}
      <Tooltip content="Border color">
        <button ref={borderBtnRef} className={`${ico} ${panel === 'border' ? 'bg-gray-100 text-gray-800' : ''}`} onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} onClick={() => setPanel(p => p === 'border' ? null : 'border')}><Grid2x2 size={15} /></button>
      </Tooltip>
      {panel === 'border' && (
        <ColorSwatchMenu
          anchorEl={borderBtnRef.current}
          value={info.borderColor || '#e5e7eb'}
          onChange={setBorderColor}
          presets={['transparent', '#e5e7eb', '#9ca3af', '#6b7280', '#374151', '#111827']}
          onOpenChange={(open) => { if (!open) setPanel(null) }}
          initialOpen
        />
      )}
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
    const raw = editor.getElementByKey(tableKey)
    const tableEl = raw?.nodeName === 'TABLE' ? raw : raw?.querySelector('table') || raw
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

// Auto-scrolls the nearest .blog-table-scroll-wrapper horizontally when the user
// drags a cell selection toward the left or right edge of the visible area.
export function TableDragScrollPlugin() {
  useEffect(() => {
    let wrapper = null
    let animId = null
    let vx = 0

    function step() {
      animId = null
      if (!wrapper || vx === 0) return
      wrapper.scrollLeft += vx
      animId = requestAnimationFrame(step)
    }

    function onMouseDown(e) {
      if (!(e.buttons & 1)) return
      const cell = e.target.closest?.('td, th')
      if (!cell) return
      const w = cell.closest('.blog-table-scroll-wrapper')
      if (!w) return
      wrapper = w
    }

    function onMouseMove(e) {
      if (!wrapper) return
      if (!(e.buttons & 1)) { stop(); return }
      const rect = wrapper.getBoundingClientRect()
      const ZONE = 80
      const MAX = 12
      if (e.clientX < rect.left + ZONE) {
        vx = -MAX * Math.max(0, 1 - (e.clientX - rect.left) / ZONE)
      } else if (e.clientX > rect.right - ZONE) {
        vx = MAX * Math.max(0, 1 - (rect.right - e.clientX) / ZONE)
      } else {
        vx = 0
      }
      if (vx !== 0 && animId === null) animId = requestAnimationFrame(step)
    }

    function stop() {
      wrapper = null
      vx = 0
      if (animId !== null) { cancelAnimationFrame(animId); animId = null }
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', stop)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', stop)
      if (animId !== null) cancelAnimationFrame(animId)
    }
  }, [])

  return null
}

// ─── DragDropPastePlugin ──────────────────────────────────────────────────────

function scrollToBottom(el) {
  let node = el.parentElement
  while (node && node !== document.body) {
    const { overflow, overflowY } = getComputedStyle(node)
    if (/(auto|scroll)/.test(overflow + overflowY)) {
      requestAnimationFrame(() => {
        if (node.scrollHeight > node.clientHeight) {
          node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
        }
      })
      return
    }
    node = node.parentElement
  }
  requestAnimationFrame(() => {
    if (document.body.scrollHeight > window.innerHeight) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    }
  })
}

async function uploadMediaFile(file) {
  const data = await handleUploadFull(file)
  return { data, file }
}

function createNodeFromUpload({ data, file }) {
  const url = `/api/uploads/${data.filename}`
  const mime = file.type
  if (mime.startsWith('image/')) return $createImageNode(url, '', '', 'regular', '', data.srcset || '', data.lqip || '')
  if (mime.startsWith('video/')) return $createVideoNode(url, '')
  if (mime.startsWith('audio/')) return $createAudioNode(url, data.original_name || file.name)
  return $createFileNode(url, data.original_name || file.name, data.mime_type || file.type, data.size || file.size)
}

function captureAnchorKey(editor) {
  let key = null
  editor.read(() => {
    const sel = $getSelection()
    if ($isRangeSelection(sel)) {
      key = sel.anchor.getNode().getTopLevelElement()?.getKey() ?? null
    }
    if (!key) key = $getRoot().getLastChild()?.getKey() ?? null
  })
  return key
}

function insertMediaNodes(editor, anchorKey, uploads) {
  editor.update(() => {
    const mediaNodes = uploads.map(createNodeFromUpload)
    let insertAfter = (anchorKey ? $getNodeByKey(anchorKey) : null) ?? $getRoot().getLastChild()
    const replaceAnchor =
      mediaNodes.length === 1 &&
      insertAfter &&
      $isParagraphNode(insertAfter) &&
      insertAfter.getTextContent() === ''

    for (const node of mediaNodes) {
      if (replaceAnchor && insertAfter) {
        insertAfter.replace(node)
      } else {
        insertAfter.insertAfter(node)
      }
      insertAfter = node
      const para = $createParagraphNode()
      insertAfter.insertAfter(para)
      insertAfter = para
    }
    if ($isParagraphNode(insertAfter)) insertAfter.selectStart()
  })
}

function extractBrowserImageUrl(dataTransfer) {
  const uriList = dataTransfer.getData('text/uri-list')
  if (uriList) {
    const first = uriList.split('\n').find(line => !line.startsWith('#'))?.trim()
    if (first) return first
  }
  const html = dataTransfer.getData('text/html')
  if (html) {
    const match = html.match(/<img[^>]+src="([^"]+)"/)
    if (match) return match[1]
  }
  return null
}

export function DragDropPastePlugin() {
  const [editor] = useLexicalComposerContext()
  const [overlayRect, setOverlayRect] = useState(null)

  useEffect(() => {
    const root = editor.getRootElement()
    if (!root) return
    // editorWrapper  = div.relative.bg-white (index.jsx) — defines the visual top of the overlay
    // dropContainer  = its parent, which also contains the 33vh bottom-padding div in the page
    const editorWrapper = root.parentElement ?? root
    const dropContainer = editorWrapper.parentElement ?? editorWrapper

    const calcOverlayRect = () => {
      const editorR = editorWrapper.getBoundingClientRect()
      return { top: Math.max(0, editorR.top), left: editorR.left, width: editorR.width }
    }

    const onDragEnter = (e) => {
      const types = Array.from(e.dataTransfer?.types ?? [])
      if (types.includes('Files') || types.includes('text/uri-list')) {
        setOverlayRect(calcOverlayRect())
      }
    }

    const onDragLeave = (e) => {
      if (dropContainer.contains(e.relatedTarget)) return
      setOverlayRect(null)
    }

    const onDragOver = (e) => {
      const types = Array.from(e.dataTransfer?.types ?? [])
      if (types.includes('Files') || types.includes('text/uri-list')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }
    }

    const onDrop = async (e) => {
      setOverlayRect(null)
      const files = Array.from(e.dataTransfer?.files ?? [])

      if (files.length) {
        e.preventDefault()
        e.stopPropagation()
        const anchorKey = captureAnchorKey(editor)
        try {
          const uploads = await Promise.all(files.map(uploadMediaFile))
          insertMediaNodes(editor, anchorKey, uploads)
          scrollToBottom(root)
        } catch (err) {
          console.error('[DragDropPastePlugin] upload failed', err)
        }
        return
      }

      // Browser image drag — URL carried in dataTransfer, no file blob
      const imageUrl = extractBrowserImageUrl(e.dataTransfer)
      if (!imageUrl) return
      e.preventDefault()
      e.stopPropagation()
      const anchorKey = captureAnchorKey(editor)
      try {
        const res = await fetch(imageUrl, { mode: 'cors' })
        if (!res.ok) return
        const blob = await res.blob()
        if (!blob.type.startsWith('image/')) return
        const ext = imageUrl.split('.').pop()?.split('?')[0] || 'jpg'
        const file = new File([blob], `dropped-image.${ext}`, { type: blob.type })
        const upload = await uploadMediaFile(file)
        insertMediaNodes(editor, anchorKey, [upload])
        scrollToBottom(root)
      } catch {
        // CORS-blocked or network error — silently skip
      }
    }

    const onPaste = async (e) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter(item => item.kind === 'file')
        .map(item => item.getAsFile())
        .filter(Boolean)
      if (!files.length) return
      e.preventDefault()
      const anchorKey = captureAnchorKey(editor)
      try {
        const uploads = await Promise.all(files.map(uploadMediaFile))
        insertMediaNodes(editor, anchorKey, uploads)
      } catch (err) {
        console.error('[DragDropPastePlugin] paste upload failed', err)
      }
    }

    dropContainer.addEventListener('dragenter', onDragEnter, true)
    dropContainer.addEventListener('dragleave', onDragLeave, true)
    dropContainer.addEventListener('dragover', onDragOver, true)
    dropContainer.addEventListener('drop', onDrop, true)
    root.addEventListener('paste', onPaste, true)
    return () => {
      dropContainer.removeEventListener('dragenter', onDragEnter, true)
      dropContainer.removeEventListener('dragleave', onDragLeave, true)
      dropContainer.removeEventListener('dragover', onDragOver, true)
      dropContainer.removeEventListener('drop', onDrop, true)
      root.removeEventListener('paste', onPaste, true)
    }
  }, [editor])

  return overlayRect
    ? createPortal(
        <div
          style={{
            position: 'fixed',
            top: overlayRect.top,
            left: overlayRect.left,
            width: overlayRect.width,
            bottom: 0,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
          className="flex flex-col items-center justify-center gap-3 bg-blue-50/90 backdrop-blur-sm"
        >
          <FileUp size={40} className="text-blue-400" strokeWidth={1.5} />
          <p className="text-sm font-medium text-blue-500">Drop to insert file</p>
        </div>,
        document.body
      )
    : null
}

// ─── RecordingModalPlugin ─────────────────────────────────────────────────────

export const OPEN_RECORDING_MODAL_COMMAND = createCommand('OPEN_RECORDING_MODAL_COMMAND')

function formatRecordingTime(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function RecordingModal({ onClose, onInsert }) {
  const [phase, setPhase] = useState('idle') // 'idle' | 'recording' | 'recorded' | 'saving'
  const [devices, setDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [deviceSearch, setDeviceSearch] = useState('')
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false)
  const [outputName, setOutputName] = useState('')

  const deviceDropdownRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const audioRef = useRef(null)
  const timerIntervalRef = useRef(null)

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(all => {
      setDevices(all.filter(d => d.kind === 'audioinput'))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && phase !== 'recording' && phase !== 'saving') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase, onClose])

  useEffect(() => {
    const url = audioUrl
    return () => {
      clearInterval(timerIntervalRef.current)
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (url) URL.revokeObjectURL(url)
    }
  }, [audioUrl])

  async function refreshDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevices(all.filter(d => d.kind === 'audioinput'))
    } catch {}
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      })
      streamRef.current = stream
      await refreshDevices()

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setAudioBlob(blob)
        setAudioUrl(url)
        setPhase('recorded')
        setCurrentTime(0)
        setDuration(0)
        setIsPlaying(false)
      }
      mediaRecorderRef.current = mr
      mr.start()
      setPhase('recording')
      setRecordingTime(0)
      timerIntervalRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    } catch (err) {
      console.error('Recording failed:', err)
      setPhase('idle')
    }
  }

  function stopRecording() {
    clearInterval(timerIntervalRef.current)
    mediaRecorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  function discardRecording() {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setSaveError(null)
    setShowConfirm(false)
    setOutputName('')
    setPhase('idle')
  }

  function togglePlayPause() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play()
      setIsPlaying(true)
    }
  }

  async function handleInsert() {
    setPhase('saving')
    setSaveError(null)
    try {
      const ext = audioBlob.type.includes('ogg') ? 'ogg' : audioBlob.type.includes('mp4') ? 'mp4' : 'webm'
      const file = new File([audioBlob], `recording-${Date.now()}.${ext}`, { type: audioBlob.type })
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/admin/upload-recording', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'ffmpeg_not_found') {
          setSaveError('Cannot convert audio to MP3 — FFmpeg not found on the server.')
        } else {
          setSaveError(`Failed to save recording.${data.detail ? ` ${data.detail}` : ''}`)
        }
        setPhase('recorded')
        return
      }
      const displayName = (outputName.trim() || 'recording') + '.mp3'
      onInsert(`/api/uploads/${data.filename}`, displayName)
    } catch {
      setSaveError('Failed to save recording.')
      setPhase('recorded')
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={e => { if (e.target === e.currentTarget && phase !== 'recording' && phase !== 'saving') onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Mic size={16} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-800">Record Audio</span>
          </div>
          <button
            onClick={onClose}
            disabled={phase === 'recording' || phase === 'saving'}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
          >
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Device / filename row */}
          <div>
            {(phase === 'idle' || phase === 'recording') && (
              <label className="block text-xs font-medium text-gray-500 mb-1">Input device</label>
            )}
          <div className="flex items-center gap-2">
            {(phase === 'recorded' || phase === 'saving') ? (
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">File name</label>
                <div className="flex items-center border border-gray-200 rounded overflow-hidden focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100">
                  <input
                    type="text"
                    placeholder="recording"
                    value={outputName}
                    onChange={e => setOutputName(e.target.value)}
                    disabled={phase === 'saving'}
                    className="flex-1 text-sm px-2 py-1.5 outline-none bg-white disabled:opacity-50"
                    onKeyDown={e => e.stopPropagation()}
                  />
                  <span className="px-2 py-1.5 text-sm text-gray-500 bg-gray-100 border-l border-gray-200 shrink-0 select-none">.mp3</span>
                </div>
              </div>
            ) : (
              <div ref={deviceDropdownRef} className="relative flex-1">
                <input
                  type="text"
                  placeholder={selectedDeviceId
                    ? (devices.find(d => d.deviceId === selectedDeviceId)?.label || 'Selected device')
                    : 'Select microphone…'
                  }
                  value={deviceSearch}
                  onFocus={() => { setDeviceSearch(''); setDeviceDropdownOpen(true) }}
                  onChange={e => { setDeviceSearch(e.target.value); setSelectedDeviceId(''); setDeviceDropdownOpen(true) }}
                  onBlur={() => setTimeout(() => setDeviceDropdownOpen(false), 150)}
                  disabled={phase === 'recording'}
                  className={`w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 disabled:opacity-50 ${selectedDeviceId ? 'placeholder-blue-600 font-medium' : 'placeholder-gray-400'}`}
                  onKeyDown={e => e.stopPropagation()}
                />
                {deviceDropdownOpen && (
                  <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto text-sm list-none p-0 m-0">
                    {devices.length === 0
                      ? <li className="px-3 py-2 text-gray-400">Default microphone</li>
                      : devices
                          .filter(d => !deviceSearch || (d.label || '').toLowerCase().includes(deviceSearch.toLowerCase()))
                          .map(d => (
                            <li
                              key={d.deviceId}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => { setSelectedDeviceId(d.deviceId); setDeviceSearch(''); setDeviceDropdownOpen(false) }}
                              className={`px-3 py-2 cursor-pointer hover:bg-gray-50 truncate ${selectedDeviceId === d.deviceId ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
                            >
                              {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                            </li>
                          ))
                    }
                  </ul>
                )}
              </div>
            )}
            {phase === 'recording' && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-mono text-red-600 tabular-nums">{formatRecordingTime(recordingTime)}</span>
              </div>
            )}
          </div>
          </div>

          {/* Playback row */}
          {(phase === 'recorded' || phase === 'saving') && (
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlayPause}
                disabled={phase === 'saving'}
                className="p-2 rounded-md text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
              >
                {isPlaying
                  ? <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                }
              </button>
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.01}
                value={currentTime}
                onChange={e => {
                  const t = Number(e.target.value)
                  setCurrentTime(t)
                  if (audioRef.current) audioRef.current.currentTime = t
                }}
                onKeyDown={e => e.stopPropagation()}
                className="flex-1 h-1.5 accent-blue-500 disabled:opacity-40"
                disabled={phase === 'saving'}
              />
              <span className="text-xs font-mono text-gray-500 shrink-0 tabular-nums">
                {formatRecordingTime(currentTime)} / {formatRecordingTime(duration)}
              </span>
              <Tooltip content="Discard recording">
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={phase === 'saving'}
                  className="p-2 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </Tooltip>
            </div>
          )}

          {/* Error */}
          {saveError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              <span className="flex-1">{saveError}</span>
              <button onClick={() => setSaveError(null)} className="text-red-400 hover:text-red-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}

          {/* Discard confirm overlay */}
          {showConfirm && (
            <div className="flex items-center justify-between px-3 py-2.5 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700">Discard this recording?</p>
              <div className="flex gap-2">
                <button onClick={discardRecording} className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors">Discard</button>
                <button onClick={() => setShowConfirm(false)} className="px-3 py-1 text-xs bg-white border border-gray-200 text-gray-600 rounded hover:bg-gray-50 transition-colors">Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center px-5 py-4 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            {phase === 'idle' && (
              <button
                onClick={startRecording}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition-colors text-sm font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                Start Recording
              </button>
            )}
            {phase === 'recording' && (
              <button
                onClick={stopRecording}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-400 text-red-600 bg-red-50 hover:bg-red-100 transition-colors text-sm font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                Stop
              </button>
            )}
            {(phase === 'recorded' || phase === 'saving') && (
              <>
                {phase === 'saving' && (
                  <span className="text-sm text-gray-500 flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    Saving…
                  </span>
                )}
                <button
                  onClick={handleInsert}
                  disabled={phase === 'saving'}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Save Recording
                </button>
              </>
            )}
          </div>
        </div>

        <audio
          ref={audioRef}
          src={audioUrl || undefined}
          className="hidden"
          onTimeUpdate={e => setCurrentTime(e.target.currentTime)}
          onLoadedMetadata={e => setDuration(e.target.duration)}
          onEnded={() => setIsPlaying(false)}
        />
      </div>
    </div>,
    document.body
  )
}

export function RecordingModalPlugin() {
  const [editor] = useLexicalComposerContext()
  const [isOpen, setIsOpen] = useState(false)
  const insertAfterKeyRef = useRef(null)

  useEffect(() => {
    return editor.registerCommand(
      OPEN_RECORDING_MODAL_COMMAND,
      (prevKey) => {
        insertAfterKeyRef.current = prevKey
        setIsOpen(true)
        return true
      },
      COMMAND_PRIORITY_LOW
    )
  }, [editor])

  function handleInsert(src, filename) {
    editor.update(() => {
      const audioNode = $createAudioNode(src, filename)
      const prevKey = insertAfterKeyRef.current

      if (prevKey) {
        const prevNode = $getNodeByKey(prevKey)
        if (prevNode) {
          prevNode.insertAfter(audioNode)
        } else {
          $getRoot().append(audioNode)
        }
      } else {
        const root = $getRoot()
        const first = root.getFirstChild()
        if (first) first.insertBefore(audioNode)
        else root.append(audioNode)
      }

      const next = audioNode.getNextSibling()
      if (!next || !$isElementNode(next)) {
        const para = $createParagraphNode()
        audioNode.insertAfter(para)
        para.selectStart()
      } else {
        next.selectStart()
      }
    })
    setIsOpen(false)
  }

  if (!isOpen) return null

  return (
    <RecordingModal
      onClose={() => setIsOpen(false)}
      onInsert={handleInsert}
    />
  )
}
