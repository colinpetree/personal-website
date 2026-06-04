import { useCallback, useEffect, useRef, useState } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HeadingNode, QuoteNode, $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND } from '@lexical/list'
import { LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { CodeNode, $createCodeNode } from '@lexical/code'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $setBlocksType } from '@lexical/selection'
import {
  $getSelection, $isRangeSelection, $createParagraphNode, $getRoot,
  FORMAT_TEXT_COMMAND, DecoratorNode, UNDO_COMMAND, REDO_COMMAND,
} from 'lexical'
import { $isHeadingNode } from '@lexical/rich-text'
import { $isListNode } from '@lexical/list'
import { $isCodeNode } from '@lexical/code'

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

// ─── Toolbar ─────────────────────────────────────────────────────────────────

const BLOCK_LABELS = {
  paragraph: 'Paragraph',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  quote: 'Quote',
  code: 'Code',
  bullet: 'Bulleted list',
  number: 'Numbered list',
}

function Toolbar({ onImageUpload }) {
  const [editor] = useLexicalComposerContext()
  const [blockType, setBlockType] = useState('paragraph')
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)
  const [isStrike, setIsStrike] = useState(false)
  const [isCode, setIsCode] = useState(false)
  const [isLink, setIsLink] = useState(false)
  const [showBlockMenu, setShowBlockMenu] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return

        const anchor = selection.anchor.getNode()
        const topLevel = anchor.getKey() === 'root'
          ? anchor
          : anchor.getTopLevelElementOrThrow()

        if ($isListNode(topLevel)) {
          setBlockType(topLevel.getListType() === 'number' ? 'number' : 'bullet')
        } else if ($isHeadingNode(topLevel)) {
          setBlockType(topLevel.getTag())
        } else if ($isCodeNode(topLevel)) {
          setBlockType('code')
        } else {
          setBlockType(topLevel.getType())
        }

        setIsBold(selection.hasFormat('bold'))
        setIsItalic(selection.hasFormat('italic'))
        setIsUnderline(selection.hasFormat('underline'))
        setIsStrike(selection.hasFormat('strikethrough'))
        setIsCode(selection.hasFormat('code'))
      })
    })
  }, [editor])

  function setBlockFormat(type) {
    setShowBlockMenu(false)
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      if (type === 'paragraph') {
        $setBlocksType(selection, () => $createParagraphNode())
      } else if (type === 'h1' || type === 'h2' || type === 'h3') {
        $setBlocksType(selection, () => $createHeadingNode(type))
      } else if (type === 'quote') {
        $setBlocksType(selection, () => $createQuoteNode())
      } else if (type === 'code') {
        $setBlocksType(selection, () => $createCodeNode())
      }
    })
    if (type === 'bullet') editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
    if (type === 'number') editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
  }

  function handleLink() {
    const url = window.prompt('Enter URL:')
    if (url) editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
  }

  async function handleImageFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const filename = await onImageUpload(file)
      const src = `/api/uploads/${filename}`
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          const node = $createImageNode(src, '')
          selection.insertNodes([node])
        }
      })
    } catch {
      alert('Image upload failed.')
    }
    e.target.value = ''
  }

  const btn = (active, title, onClick, children) => (
    <button
      key={title}
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
        active ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )

  return (
    <div className="flex items-center gap-0.5 flex-wrap px-3 py-2 bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
      {/* Block type dropdown */}
      <div className="relative mr-1">
        <button
          onMouseDown={e => { e.preventDefault(); setShowBlockMenu(v => !v) }}
          className="flex items-center gap-1 px-2 py-1 rounded text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors min-w-[110px]"
        >
          <span>{BLOCK_LABELS[blockType] || 'Paragraph'}</span>
          <span className="text-xs">▾</span>
        </button>
        {showBlockMenu && (
          <div className="absolute top-full left-0 mt-1 bg-gray-900 border border-gray-700 rounded-md shadow-lg z-20 py-1 min-w-[140px]">
            {Object.entries(BLOCK_LABELS).map(([type, label]) => (
              <button
                key={type}
                onMouseDown={e => { e.preventDefault(); setBlockFormat(type) }}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  blockType === type ? 'text-white bg-gray-700' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-gray-600 mx-1" />

      {btn(isBold, 'Bold', () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'), <b>B</b>)}
      {btn(isItalic, 'Italic', () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic'), <i>I</i>)}
      {btn(isUnderline, 'Underline', () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline'), <u>U</u>)}
      {btn(isStrike, 'Strikethrough', () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough'), <s>S</s>)}
      {btn(isCode, 'Inline code', () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code'), <code className="font-mono">{`<>`}</code>)}

      <div className="w-px h-5 bg-gray-600 mx-1" />

      {btn(false, 'Link', handleLink, '🔗')}
      <button
        title="Insert image"
        onMouseDown={e => { e.preventDefault(); fileRef.current?.click() }}
        className="px-2 py-1 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
      >
        🖼
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />

      <div className="w-px h-5 bg-gray-600 mx-1" />

      {btn(false, 'Undo', () => editor.dispatchCommand(UNDO_COMMAND, undefined), '↩')}
      {btn(false, 'Redo', () => editor.dispatchCommand(REDO_COMMAND, undefined), '↪')}
    </div>
  )
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

export default function RichTextEditor({ initialHtml, onChange, placeholder = 'Start writing…' }) {
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
      <div className="flex flex-col rounded-lg overflow-hidden border border-gray-700">
        <Toolbar onImageUpload={handleImageUpload} />
        <div className="relative bg-gray-900 text-gray-100">
          <RichTextPlugin
            contentEditable={
              <ContentEditable className="outline-none min-h-[500px] px-6 py-5 text-base leading-relaxed" />
            }
            placeholder={
              <div className="absolute top-5 left-6 text-gray-500 pointer-events-none select-none">
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
      </div>
    </LexicalComposer>
  )
}
