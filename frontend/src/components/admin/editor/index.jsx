import { forwardRef } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HeadingNode, QuoteNode, $createHeadingNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { LinkNode } from '@lexical/link'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import { TableNode, TableRowNode, TableCellNode } from '@lexical/table'
import { $getRoot } from 'lexical'
import theme from './theme'
import { ImageNode, VideoNode, AudioNode, FileNode, GalleryNode, DividerNode, CalloutNode, ButtonNode, LinkGroupNode, ToggleNode, CodeBlockNode, HeaderNode, YouTubeNode, VimeoNode, SpotifyNode, WideTableNode, StyledTableCellNode, FontFamilyContext } from './nodes'
import {
  LoadHtmlPlugin,
  HtmlOutputPlugin,
  FloatingToolbarPlugin,
  SlashCommandPlugin,
  ListIndentPlugin,
  DecoratorArrowNavigationPlugin,
  EditorHandlePlugin,
  TableActionMenuPlugin,
  TableColumnResizePlugin,
  TableDragScrollPlugin,
  DragDropPastePlugin,
  RecordingModalPlugin,
  VideoPosterModalPlugin,
} from './plugins'

const RichTextEditor = forwardRef(function RichTextEditor(
  { initialHtml, onChange, placeholder = 'Start writing…', firstBlockH1 = false, narrowPreview = false, readingColumnPreview = false, fontFamily = 'default' },
  ref
) {
  const initialConfig = {
    namespace: 'BlogEditor',
    theme,
    nodes: [
      HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeBlockNode, DividerNode, CalloutNode, ButtonNode, LinkGroupNode, ToggleNode, HeaderNode, ImageNode, VideoNode, AudioNode, FileNode, GalleryNode, YouTubeNode, VimeoNode, SpotifyNode,
      TableNode, TableRowNode, TableCellNode, WideTableNode, StyledTableCellNode,
      { replace: TableNode, with: () => new WideTableNode(), withKlass: WideTableNode },
      { replace: TableCellNode, with: (n) => new StyledTableCellNode(n.__headerState, n.__colSpan, n.__width), withKlass: StyledTableCellNode },
    ],
    onError: (error) => { throw error },
    ...(firstBlockH1 && {
      editorState: () => {
        $getRoot().append($createHeadingNode('h1'))
      },
    }),
  }

  // 'sans' flips the ambient font for every element that otherwise inherits
  // it (paragraph, quote, lists, links) — the elements that are hard-coded
  // sans-serif regardless of ambient font already stay sans, so no override
  // is needed. 'serif' keeps the ambient font-serif but needs those hard-coded
  // elements won back via the data-font-family="serif" CSS overrides (see
  // index.css) and, for decorator-rendered nodes, the FontFamilyContext below.
  const ambientFontClass = fontFamily === 'sans' ? 'font-sans' : 'font-serif'

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <FontFamilyContext.Provider value={fontFamily}>
        <div className="relative bg-white text-gray-900">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                data-font-family={fontFamily}
                className={`outline-none min-h-[500px] pt-2 pb-10 prose prose-gray max-w-none ${ambientFontClass}${narrowPreview ? ' content-narrow-preview' : ''}${readingColumnPreview ? ' content-2xl-preview' : ''}`}
              />
            }
            placeholder={
              placeholder
                ? <div className="absolute top-2 left-0 right-0 max-w-3xl mx-auto px-6 text-gray-400 pointer-events-none select-none">
                    {placeholder}
                  </div>
                : null
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin />
        <TablePlugin hasCellMerge hasCellBackgroundColor hasTabHandler hasHorizontalScroll />
        <LoadHtmlPlugin html={initialHtml} />
        <HtmlOutputPlugin onChange={onChange} />
        <FloatingToolbarPlugin />
        <SlashCommandPlugin />
        <DragDropPastePlugin />
        <ListIndentPlugin />
        <DecoratorArrowNavigationPlugin />
        <TableActionMenuPlugin />
        <TableColumnResizePlugin />
        <TableDragScrollPlugin />
        <RecordingModalPlugin />
        <VideoPosterModalPlugin />
        <EditorHandlePlugin handleRef={ref} />
      </FontFamilyContext.Provider>
    </LexicalComposer>
  )
})

export default RichTextEditor
