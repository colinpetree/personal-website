---
name: lexical-custom-node-guidelines
description: Implementation and debugging reference for custom Lexical DecoratorNode classes in the WYSIWYG HTML editor. Invoke this BEFORE opening any editor file when building or modifying any node — it contains the required patterns, gotchas, and reusable primitives for this project.
---

# Lexical DecoratorNode Implementation Guide

Use this guide when implementing or debugging custom Lexical `DecoratorNode` classes in the rich text editor (`frontend/src/components/admin/editor/nodes.jsx`).

---

## Reusable UI primitives

Before building anything custom, check what already exists:

| Component | Path | Props |
|-----------|------|-------|
| `ColorPicker` | `frontend/src/components/ui/ColorPicker.jsx` | `value` (hex string), `onChange(hex)`, `presets` (optional hex array) |

**Icon imports:** All icons come from `lucide-react`. Before committing to an icon name, verify it exists in the installed version:
```bash
grep -r "IconName" frontend/node_modules/lucide-react/dist/esm/lucide-react.mjs
```
The installed version may not have every icon shown in the Lucide docs. A missing icon causes a silent build error at rollup time.

---

## The wrapper-element rule

If `exportDOM()` wraps its content in a container element (e.g. `<figure>`), then `importDOM()` **must** register a handler for that container — not just the inner element.

**Why this matters:** `$generateNodesFromDOM` (called by `LoadHtmlPlugin` on editor reload) descends into any element that has no registered handler and processes its children individually. A `<figcaption>` inside an unhandled `<figure>` becomes a stray text paragraph in the editor — the classic symptom is ghost text appearing below the node after each save cycle.

## Correct pattern

```js
static importDOM() {
  return {
    // Handle the wrapper — this prevents Lexical from processing children separately
    figure: () => ({
      conversion: (domNode) => {
        if (!domNode.classList.contains('my-node-class')) return null  // ignore other figures
        const inner = domNode.querySelector('video, audio, img')       // whatever is inside
        if (!inner) return null
        const figcaption = domNode.querySelector('figcaption')
        const caption = figcaption?.textContent?.trim() || ''
        return { node: new MyNode(inner.getAttribute('src') || '', caption) }
      },
      priority: 1,
    }),

    // Keep a fallback for bare inner elements (e.g. pasted content without a figure)
    video: () => ({
      conversion: (domNode) => {
        if (!(domNode instanceof HTMLVideoElement)) return null
        if (domNode.closest('figure.my-node-class')) return null  // already handled by figure
        return { node: new MyNode(domNode.getAttribute('src') || '', '') }
      },
      priority: 1,
    }),
  }
}
```

## Real example in this project

`ImageNode` (line ~229) is the reference implementation — it handles `<figure>`, `<a>` wrappers, and bare `<img>` elements. `AudioNode` had this bug (figcaption became stray text after save) and was fixed by adding a `figure` handler.

---

## Persisting metadata through the HTML round-trip

`exportDOM` produces static HTML stored in the database. `importJSON` is used when the Lexical JSON state is loaded, but `importDOM` is what runs when that HTML is parsed back into the editor (via `LoadHtmlPlugin`). If `importDOM` can't recover all node fields, data is silently lost on every save/reload cycle.

**Rule:** store every field that isn't visually derivable from the HTML as a `data-` attribute on the outermost element.

```js
exportDOM() {
  const wrap = document.createElement('div')
  wrap.className = 'my-node'
  wrap.setAttribute('data-src', this.__src)
  wrap.setAttribute('data-title', this.__title)
  wrap.setAttribute('data-size', String(this.__size))
  // ... build visual children ...
  return { element: wrap }
}

static importDOM() {
  return {
    div: (node) => {
      if (!node.classList?.contains('my-node')) return null
      return {
        conversion: (domNode) => {
          const src = domNode.getAttribute('data-src') || ''
          if (!src) return null
          return { node: new MyNode(
            src,
            domNode.getAttribute('data-title') || '',
            parseInt(domNode.getAttribute('data-size') || '0', 10),
          )}
        },
        priority: 2,  // override Lexical's default handlers (e.g. <a>, <div>)
      }
    },
  }
}
```

---

## Backwards compatibility when changing exportDOM structure

When `exportDOM` is changed (e.g. switching from `<a>` to `<div>` as the wrapper, or replacing `<figcaption>` with `<p>`), existing posts in the database still have the old HTML. Add a second handler in `importDOM` for the old format so old posts round-trip cleanly on re-save:

```js
static importDOM() {
  return {
    // New format
    div: (node) => {
      if (!node.classList?.contains('my-node')) return null
      return {
        conversion: (domNode) => ({ node: new MyNode(domNode.getAttribute('data-src') || '') }),
        priority: 2,
      }
    },
    // Old format (backwards compat)
    a: (node) => {
      if (!node.classList?.contains('my-node')) return null
      return {
        conversion: (domNode) => {
          const src = (domNode.getAttribute('href') || '').split('?')[0]
          if (!src) return null
          return { node: new MyNode(src) }
        },
        priority: 2,
      }
    },
  }
}
```

**Symptom of a missing backwards-compat handler:** old posts render as plain text/links in the editor after the first re-open, and saving "upgrades" them — but only if the user manually re-saves each post.

---

## Standard interaction behavior (required for every block DecoratorNode)

Every block `DecoratorNode` in this editor must implement hover highlighting, selection ring, arrow-key navigation, and Enter-to-paragraph. These are **not optional** — they are the baseline UX contract for all nodes.

### 1. Hover + selection ring

Use `useLexicalNodeSelection` and a local `isHovered` state. Apply Tailwind ring classes conditionally:

```jsx
const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
const [isHovered, setIsHovered] = useState(false)

// on the container element:
className={`... transition-all ${
  isSelected ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''
}`}
onMouseEnter={() => setIsHovered(true)}
onMouseLeave={() => setIsHovered(false)}
```

### 2. Click to select

Register `CLICK_COMMAND` at `COMMAND_PRIORITY_LOW`. Only handle clicks whose `event.target` is inside the node's DOM element.

**Important:** if the node contains interactive children (`<textarea>`, `<input>`, `<a>`), exempt their clicks so the native element still receives focus:

```jsx
useEffect(() => {
  return editor.registerCommand(
    CLICK_COMMAND,
    (event) => {
      const el = containerRef.current
      if (!el || !el.contains(event.target)) return false
      // Exempt interactive children — let them handle their own clicks
      if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT') return false
      clearSelection()
      setSelected(true)
      return true
    },
    COMMAND_PRIORITY_LOW
  )
}, [editor, setSelected, clearSelection])
```

### 3. Enter key inserts a paragraph below

Register `KEY_DOWN_COMMAND` at `COMMAND_PRIORITY_HIGH`, but **only when the node is selected**. On `Enter`, insert a new paragraph after the node and move the cursor into it.

```jsx
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
```

### 4. Arrow-key navigation (free — no per-node work needed)

`DecoratorArrowNavigationPlugin` (in `plugins.jsx`) already intercepts `ArrowUp`/`ArrowDown` when a text paragraph is adjacent to a block decorator node, and when a decorator node is selected and the user arrows to the next. **No per-node code required.**

### 5. Inserting a node from the slash menu

Each node needs two things in `plugins.jsx`:

**A. An entry in `SLASH_ITEMS`** (the array around line 160):
```js
{ label: 'My Node', description: 'Short description', Icon: SomeLucideIcon, action: 'myNode' },
```
`Icon` is a Lucide component imported at the top of `plugins.jsx`. Verify the name exists before using it (see icon verification above).

**B. A case in `applyItem()`** — use `if (item.action === ...)` blocks (not a switch):
```js
if (item.action === 'myNode') {
  editor.update(() => {
    const node = $getNodeByKey(nodeKey)
    if (!node || !$isParagraphNode(node)) return
    const newNode = $createMyNode()
    node.replace(newNode)
    const next = newNode.getNextSibling()
    if ($isElementNode(next)) {
      next.selectStart()
    } else {
      const para = $createParagraphNode()
      newNode.insertAfter(para)
      para.selectStart()
    }
  })
  return
}
```
When `applyItem` replaces the slash paragraph with a new node, the old paragraph's selection becomes invalid — always move selection to the next sibling or a new paragraph.

### 6. Floating toolbar pattern

Nodes with settings panels use a floating toolbar rendered via `createPortal` to `document.body`. Position it above the node with a `useLayoutEffect` that recalculates on scroll/resize:

```jsx
const [toolbarPos, setToolbarPos] = useState(null)

useLayoutEffect(() => {
  if (!isSelected || !containerRef.current) { setToolbarPos(null); return }
  const TOOLBAR_WIDTH = 280  // adjust to fit your controls
  function calc() {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    let left = rect.left + window.scrollX + rect.width / 2 - TOOLBAR_WIDTH / 2
    left = Math.max(8, Math.min(left, window.innerWidth + window.scrollX - TOOLBAR_WIDTH - 8))
    let top = rect.top + window.scrollY - 48  // 48 = toolbar height + gap
    if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + 8  // flip below if no room
    setToolbarPos({ top, left })
  }
  calc()
  window.addEventListener('scroll', calc, true)
  window.addEventListener('resize', calc)
  return () => { window.removeEventListener('scroll', calc, true); window.removeEventListener('resize', calc) }
}, [isSelected])

// In JSX:
{isSelected && toolbarPos && createPortal(
  <div
    style={{ position: 'absolute', top: toolbarPos.top, left: toolbarPos.left, zIndex: 9999 }}
    className="flex items-center gap-0.5 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 shadow-2xl"
    onMouseDown={e => e.preventDefault()}  // prevent stealing focus from editor
  >
    {/* toolbar controls */}
  </div>,
  document.body
)}
```

`onMouseDown={e => e.preventDefault()}` on the toolbar wrapper is required — without it, clicking toolbar buttons blurs the editor and deselects the node before the button's action fires.

### Reference implementation

`DividerNode` (bottom of `nodes.jsx`) is the minimal reference — no fields, just the interaction skeleton. `ImageNode`/`VideoNode` are the reference for the full floating toolbar pattern. `CalloutNode` (at the end of `nodes.jsx`) is the reference for nodes with both interactive text inputs and a settings toolbar.

---

## Checklist when adding a new DecoratorNode

**Interaction**
- [ ] `useLexicalNodeSelection` + `isHovered` state wired to ring classes on the container
- [ ] `CLICK_COMMAND` at `COMMAND_PRIORITY_LOW` sets selection when click target is inside the node; exempts `TEXTAREA`/`INPUT` children
- [ ] `KEY_DOWN_COMMAND` at `COMMAND_PRIORITY_HIGH` (gated on `isSelected`) handles Enter → insert paragraph below
- [ ] `applyItem` case in `plugins.jsx` moves selection after `node.replace()` (next sibling or new paragraph)
- [ ] `SLASH_ITEMS` entry added with a verified lucide icon name
- [ ] Arrow-key navigation is free — no work needed (`DecoratorArrowNavigationPlugin` handles it)

**Floating toolbar (if node has settings)**
- [ ] `useLayoutEffect` positions toolbar above node, flips below if no room, cleans up scroll/resize listeners
- [ ] Toolbar wrapper has `onMouseDown={e => e.preventDefault()}` to prevent focus loss
- [ ] Toolbar rendered via `createPortal` to `document.body`

**HTML round-trip**
- [ ] `exportDOM()` — what is the outermost element returned?
- [ ] `importDOM()` — is there a handler for that outermost element?
- [ ] Does the inner-element handler guard against duplicating work (`domNode.closest('figure.my-class') return null`)?
- [ ] Are all non-visual fields stored as `data-` attributes so `importDOM` can fully reconstruct the node?
- [ ] If changing an existing `exportDOM` structure, is there a backwards-compat handler for the old format?

**Public-facing style parity**
- [ ] Compare the node's visual design in the editor to how the exported HTML renders on the public blog (`BlogPostPage.jsx` renders `content_html` via `dangerouslySetInnerHTML` inside `.blog-content.prose`)
- [ ] The `@tailwindcss/typography` prose defaults may not match the editor's Tailwind classes — check color, spacing, margins, and borders
- [ ] Add overrides to `.blog-content <element>` in `frontend/src/index.css` for any properties that diverge (color, margin, padding, border, etc.)
- [ ] The editor's selection ring and hover states are editor-only UI and should NOT appear on the public site — the raw exported HTML has no interactive wrapper, so this is already handled

**Testing**
- [ ] Insert node → save → reload editor → confirm node renders cleanly with no ghost text
- [ ] Save again → reload → confirm no data changed (title, filename, size, etc. all survive)
- [ ] Click node → confirm blue ring appears; hover without clicking → confirm lighter ring
- [ ] Arrow Up/Down through node from adjacent paragraph → confirm navigation works
- [ ] Press Enter while node is selected → confirm cursor moves to paragraph below
- [ ] Open the published blog post in the browser and confirm the node looks the same as in the editor (same color, spacing, and proportions)
