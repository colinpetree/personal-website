---
name: lexical-custom-node-guidelines
description: Implementation and debugging reference for custom Lexical DecoratorNode classes in the WYSIWYG HTML editor. Use it when building any new editor node. 
---

# Lexical DecoratorNode Implementation Guide

Use this guide when implementing or debugging custom Lexical `DecoratorNode` classes in the rich text editor (`frontend/src/components/admin/editor/nodes.jsx`).

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

```jsx
useEffect(() => {
  return editor.registerCommand(
    CLICK_COMMAND,
    (event) => {
      const el = containerRef.current
      if (!el || !el.contains(event.target)) return false
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

When `applyItem` replaces the slash paragraph with a new node, the old paragraph's selection becomes invalid. Always move the selection after the replace:

```js
case 'myNode': {
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

### Reference implementation

`DividerNode` (bottom of `nodes.jsx`) is the minimal reference — no fields, just the interaction skeleton. `AudioNode` is a good reference for a node with fields and a more complex layout.

---

## Checklist when adding a new DecoratorNode

**Interaction**
- [ ] `useLexicalNodeSelection` + `isHovered` state wired to ring classes on the container
- [ ] `CLICK_COMMAND` at `COMMAND_PRIORITY_LOW` sets selection when click target is inside the node
- [ ] `KEY_DOWN_COMMAND` at `COMMAND_PRIORITY_HIGH` (gated on `isSelected`) handles Enter → insert paragraph below
- [ ] `applyItem` case moves selection after `node.replace()` (next sibling or new paragraph)
- [ ] Arrow-key navigation is free — no work needed (`DecoratorArrowNavigationPlugin` handles it)

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
