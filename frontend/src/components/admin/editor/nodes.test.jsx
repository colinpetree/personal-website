// @vitest-environment jsdom
//
// The editor's custom nodes write the HTML that is saved as content_html and
// served on the public site (and prerendered). These tests pin down that
// exported HTML and check it survives a save/load round trip
// (exportDOM -> importDOM -> exportDOM), which is what happens every time a
// post is reopened in the editor.
import { describe, expect, it } from 'vitest'
import { $getRoot, createEditor } from 'lexical'
import { $generateNodesFromDOM } from '@lexical/html'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListItemNode, ListNode } from '@lexical/list'
import { LinkNode } from '@lexical/link'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'
import {
  $createGalleryNode, $createImageNode, $createVideoNode, AudioNode, ButtonNode, CalloutNode,
  CodeBlockNode, DividerNode, FileNode, GalleryNode, HeaderNode, ImageNode, LinkGroupNode,
  SpotifyNode, StyledTableCellNode, ToggleNode, VideoNode, VimeoNode, WideTableNode, YouTubeNode,
  generateSafeHtmlFromNodes,
} from './nodes'
import { leadingHeaderLayout } from '../../../utils/headerLayout'

// Same node list as the real editor (index.jsx).
function makeEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [
      HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeBlockNode, DividerNode, CalloutNode, ButtonNode, LinkGroupNode, ToggleNode, HeaderNode, ImageNode, VideoNode, AudioNode, FileNode, GalleryNode, YouTubeNode, VimeoNode, SpotifyNode,
      TableNode, TableRowNode, TableCellNode, WideTableNode, StyledTableCellNode,
      { replace: TableNode, with: () => new WideTableNode(), withKlass: WideTableNode },
      { replace: TableCellNode, with: (n) => new StyledTableCellNode(n.__headerState, n.__colSpan, n.__width), withKlass: StyledTableCellNode },
    ],
    onError: (error) => { throw error },
  })
}

// Builds content with `build` (called inside an editor update) and returns
// the HTML the editor would save.
function exportWith(build) {
  const editor = makeEditor()
  editor.update(() => { $getRoot().clear().append(...build()) }, { discrete: true })
  return editor.read(() => generateSafeHtmlFromNodes(editor, null))
}

// Loads saved HTML into a fresh editor, the way reopening a post does, and
// exports it again.
function roundTrip(html) {
  const editor = makeEditor()
  editor.update(() => {
    const dom = new DOMParser().parseFromString(html, 'text/html')
    $getRoot().clear().append(...$generateNodesFromDOM(editor, dom))
  }, { discrete: true })
  return editor.read(() => generateSafeHtmlFromNodes(editor, null))
}

const parse = (html) => new DOMParser().parseFromString(html, 'text/html').body

describe('ImageNode export', () => {
  it('writes a figure with lazy loading and its intrinsic size', () => {
    const html = exportWith(() => [$createImageNode('/uploads/a.webp', 'Alt text', 'A caption', 'regular', '', '', '', false, 1200, 800)])
    const img = parse(html).querySelector('figure img')
    expect(img.getAttribute('src')).toBe('/uploads/a.webp')
    expect(img.getAttribute('alt')).toBe('Alt text')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('width')).toBe('1200')
    expect(img.getAttribute('height')).toBe('800')
    expect(parse(html).querySelector('figcaption').textContent).toBe('A caption')
  })

  it('opens a linked image in a new tab safely', () => {
    const html = exportWith(() => [$createImageNode('/uploads/a.webp', '', '', 'regular', 'https://example.com')])
    const a = parse(html).querySelector('a')
    expect(a.getAttribute('href')).toBe('https://example.com')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('survives a save and reload unchanged', () => {
    const html = exportWith(() => [$createImageNode('/uploads/a.webp', 'Alt', 'Cap', 'wide', 'https://example.com', '/uploads/a-400.webp 400w', 'data:image/webp;base64,AAAA', true, 1200, 800)])
    expect(roundTrip(html)).toBe(html)
  })
})

describe('GalleryNode export', () => {
  const images = Array.from({ length: 5 }, (_, i) => ({ src: `/uploads/g${i}.webp`, alt: `G${i}`, width: 400, height: 300 }))

  it('lays out rows from the shared row table', () => {
    const html = exportWith(() => [$createGalleryNode(images, 'Gallery caption')])
    const rows = [...parse(html).querySelectorAll('.gallery-row')]
    expect(rows.map((r) => r.querySelectorAll('img').length)).toEqual([3, 2])
  })

  it('survives a save and reload unchanged', () => {
    const html = exportWith(() => [$createGalleryNode(images, 'Gallery caption')])
    expect(roundTrip(html)).toBe(html)
  })
})

describe('VideoNode export', () => {
  it('a looping video autoplays muted, and the export marker never leaks', () => {
    const html = exportWith(() => [$createVideoNode('/uploads/v.mp4', '', 'regular', true)])
    expect(html).toContain('autoplay=""')
    expect(html).not.toContain('data-export-autoplay')
    const video = parse(html).querySelector('video')
    expect(video.hasAttribute('muted')).toBe(true)
    expect(video.hasAttribute('loop')).toBe(true)
  })

  it('a normal video has controls and is never muted or autoplaying', () => {
    const html = exportWith(() => [$createVideoNode('/uploads/v.mp4')])
    const video = parse(html).querySelector('video')
    expect(video.hasAttribute('controls')).toBe(true)
    expect(video.hasAttribute('muted')).toBe(false)
    expect(video.hasAttribute('autoplay')).toBe(false)
  })
})

describe('HeaderNode export', () => {
  for (const layout of ['regular', 'wide', 'full', 'fullscreen', 'linear']) {
    it(`a ${layout} header is what the Navbar overlay check reads`, () => {
      const html = exportWith(() => [new HeaderNode(layout, 'left', 'Big heading', 'Sub')])
      // headerLayout.js decides the navbar overlay from this exact markup
      // during prerender; the two must agree.
      expect(leadingHeaderLayout(html)).toBe(layout)
    })
  }

  it('survives a save and reload unchanged', () => {
    const html = exportWith(() => [new HeaderNode('wide', 'center', 'Heading', 'Subheading', '#112233', true, 'Go', '/blog', '#ffffff')])
    expect(html).toContain('data-button-url="/blog"')
    expect(roundTrip(html)).toBe(html)
  })
})
