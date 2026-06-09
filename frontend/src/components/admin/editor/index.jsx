import { forwardRef } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { LinkNode } from '@lexical/link'
import { CodeNode } from '@lexical/code'
import theme from './theme'
import { ImageNode, VideoNode, AudioNode, FileNode, GalleryNode } from './nodes'
import {
  LoadHtmlPlugin,
  HtmlOutputPlugin,
  FloatingToolbarPlugin,
  SlashCommandPlugin,
  ListIndentPlugin,
  DecoratorArrowNavigationPlugin,
  EditorHandlePlugin,
} from './plugins'

const RichTextEditor = forwardRef(function RichTextEditor(
  { initialHtml, onChange, placeholder = 'Start writing…' },
  ref
) {
  const initialConfig = {
    namespace: 'BlogEditor',
    theme,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode, ImageNode, VideoNode, AudioNode, FileNode, GalleryNode],
    onError: (error) => { throw error },
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative bg-white text-gray-900">
        <RichTextPlugin
          contentEditable={
            <ContentEditable className="outline-none min-h-[500px] pt-2 pb-10 prose prose-gray max-w-none" />
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
      <LoadHtmlPlugin html={initialHtml} />
      <HtmlOutputPlugin onChange={onChange} />
      <FloatingToolbarPlugin />
      <SlashCommandPlugin />
      <ListIndentPlugin />
      <DecoratorArrowNavigationPlugin />
      <EditorHandlePlugin handleRef={ref} />
    </LexicalComposer>
  )
})

export default RichTextEditor
