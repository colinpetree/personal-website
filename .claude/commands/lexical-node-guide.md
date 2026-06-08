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

## Checklist when adding a new DecoratorNode

- [ ] `exportDOM()` — what is the outermost element returned?
- [ ] `importDOM()` — is there a handler for that outermost element?
- [ ] Does the inner-element handler guard against duplicating work (`domNode.closest('figure.my-class') return null`)?
- [ ] Are all non-visual fields stored as `data-` attributes so `importDOM` can fully reconstruct the node?
- [ ] If changing an existing `exportDOM` structure, is there a backwards-compat handler for the old format?
- [ ] Test: insert node → save → reload editor → confirm node renders cleanly with no ghost text
- [ ] Test: save again → reload → confirm no data changed (title, filename, size, etc. all survive)
