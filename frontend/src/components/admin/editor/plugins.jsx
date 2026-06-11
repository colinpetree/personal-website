import { createPortal } from 'react-dom'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  Bold, Italic, Underline, Strikethrough, Code, Link2,
  Type, Heading1, Heading2, Heading3, Quote, Code2,
  List, ListOrdered, Minus, Image, Video, Music, Paperclip, LayoutGrid, Plus, MessageSquare, MousePointerClick, ChevronDown, PanelTop,
  PlayCircle, Film, Music2,
} from 'lucide-react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $setBlocksType } from '@lexical/selection'
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, $isListItemNode } from '@lexical/list'
import { $findMatchingParent } from '@lexical/utils'
import { TOGGLE_LINK_COMMAND } from '@lexical/link'
import {
  $getSelection, $isRangeSelection, $isNodeSelection, $createParagraphNode, $createTextNode, $getRoot,
  FORMAT_TEXT_COMMAND, KEY_DOWN_COMMAND, COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_CRITICAL,
  $getNodeByKey, $isParagraphNode, $isDecoratorNode, $isElementNode,
  $createNodeSelection, $setSelection,
} from 'lexical'
import { $createImageNode, $createVideoNode, $createAudioNode, $createFileNode, $createGalleryNode, $createDividerNode, $createCalloutNode, $createButtonNode, $createToggleNode, $createCodeBlockNode, $createHeaderNode, $createYouTubeNode, $createVimeoNode, $createSpotifyNode } from './nodes'
import { handleUpload, handleUploadFull } from './upload'
import { Tooltip } from '../../ui/Tooltip'

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
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          setFocusedPara(null)
          setMenu(m => m.visible && !menuRef.current.embedAction ? { ...m, visible: false } : m)
          setPlusButton(b => b.visible ? { ...b, visible: false } : b)
          return
        }

        const node = selection.anchor.getNode()
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
            top: rect.bottom + window.scrollY + 6,
            left: rect.left + window.scrollX,
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
              setMenu(m => ({ ...m, top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX }))
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
              top: rect.top + window.scrollY + rect.height / 2,
              left: rect.left + window.scrollX - 44,
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
      top: rect.bottom + window.scrollY + 6,
      left: rect.left + window.scrollX,
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

  function applyItem(item) {
    const nodeKey = menuRef.current.nodeKey

    if (item.action === 'youtube' || item.action === 'vimeo' || item.action === 'spotify') {
      setMenu(m => ({ ...m, embedAction: item.action, filter: '', selectedIndex: 0 }))
      setEmbedUrl('')
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
            style={{ position: 'absolute', top: plusButton.top, left: plusButton.left, transform: 'translateY(-50%)', zIndex: 9999 }}
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
          style={{ position: 'absolute', top: menu.top, left: menu.left, zIndex: 9999 }}
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
      {menu.visible && !menu.embedAction && filteredItems.length > 0 && (
        <div
          style={{ position: 'absolute', top: menu.top, left: menu.left, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-2xl py-2 w-72 max-h-80 overflow-y-auto"
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
      editor.getRootElement()?.focus()
    },
  }), [editor])
  return null
}
