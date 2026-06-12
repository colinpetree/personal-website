# Lexical Table Node

Reference for understanding and modifying the table feature in the blog post editor.

---

## Architecture overview

Tables use **`@lexical/table`** (`TableNode` / `TableRowNode` / `TableCellNode` as `ElementNode`s inside the single main editor). This means cells are **not** nested editors — they are regions of the one main editor. Bold / italic / underline / strikethrough / code / links and the `FloatingToolbarPlugin` work inside cells for free with no extra code.

Two custom subclasses extend the base package nodes:

| Subclass | Extends | Adds |
|---|---|---|
| `WideTableNode` | `TableNode` | `__tableWidth` (`'regular'`\|`'wide'`), `__borderColor` (hex / `'transparent'`) |
| `StyledTableCellNode` | `TableCellNode` | `__textColorMode` (`'auto'`\|`'light'`\|`'dark'`) |

Cell background color uses the **native** `TableCellNode.setBackgroundColor` / `getBackgroundColor` — no custom field needed.

---

## Files

| File | Role |
|---|---|
| `frontend/src/components/admin/editor/nodes.jsx` | `WideTableNode`, `StyledTableCellNode`, `decorateTableElement`, `tableElFromDOM` |
| `frontend/src/components/admin/editor/plugins.jsx` | `TableActionMenuPlugin`, `TableColumnResizePlugin`, `$activeTableCell`, slash insert flow, `insertTable()` |
| `frontend/src/components/admin/editor/index.jsx` | Node registration (`replace` + `withKlass`), plugin mounts |
| `frontend/src/components/admin/editor/theme.js` | Lexical theme keys for table CSS classes |
| `frontend/src/index.css` | All table CSS (shared editor + public blog) |

---

## Node registration (`index.jsx`)

```js
nodes: [
  // ... other nodes ...
  TableNode, TableRowNode, TableCellNode,   // base types must be listed
  WideTableNode, StyledTableCellNode,        // subclass types
  { replace: TableNode,     with: () => new WideTableNode(),                                           withKlass: WideTableNode },
  { replace: TableCellNode, with: (n) => new StyledTableCellNode(n.__headerState, n.__colSpan, n.__width), withKlass: StyledTableCellNode },
]
```

Plugins mounted:
```jsx
<TablePlugin hasCellMerge hasCellBackgroundColor hasTabHandler />
<TableActionMenuPlugin />
<TableColumnResizePlugin />
```

---

## `WideTableNode` — key facts

- **Type string:** `'wide-table'`
- **Default col width:** 170 px per column (set in `insertTable()`)
- **Auto width mode:** ≥5 cols → `'wide'`, <5 → `'regular'` (set once at creation; togglable via menu)
- **Placement is CSS-only** — no inline margin/transform is set by JS; see CSS section
- **Border color** drives `--table-border-color` CSS var via `decorateTableElement`

### `decorateTableElement(tableEl, width, colWidths, borderColor)`

Called in `createDOM`, `updateDOM`, and `exportDOM.after`. Sets:
- Classes `blog-table`, `blog-table-wide` / `blog-table-regular`
- `style.width` = sum of `colWidths` in px (powers drag-resize)
- `--table-border-color` CSS custom property

### Round-trip attributes (on `<table>`)

| Attribute | Value | Purpose |
|---|---|---|
| `data-width` | `'regular'` \| `'wide'` | Recovered in `importDOM` |
| `data-border-color` | hex / `'transparent'` | Recovered in `importDOM` |

### `importDOM` guard

Wraps the base `TableNode.importDOM` handler at priority 2. Only claims elements that the base handler also claims (guard is inside `conversion`, not the outer fn — base already guards by tag).

---

## `StyledTableCellNode` — key facts

- **Type string:** `'styled-tablecell'`
- **Text color resolution:** calls `resolveTextColor(mode, bgHex)` (from `nodes.jsx`). `auto` → `getContrastColor(bg)`, `light` → `'white'`, `dark` → `'black'`
- **`exportDOM`:** fixes `border: 1px solid #e5e7eb` on the element, sets `data-text-color`, strips transparent bg
- **`importDOM`:** wraps base `td`/`th` handlers; strips resolved inline `color` before base conversion so text nodes aren't baked with a color, then restores via `setTextColorMode`

---

## Slash insert flow (`plugins.jsx`)

SLASH_ITEMS entry:
```js
{ label: 'Table', description: 'Rows and columns', Icon: Table, action: 'table' }
```

Opens a **grid picker popover** (max 20×20, `TABLE_MAX_DIM`). On pick, calls `insertTable(cols, rows)`:

1. Clears the slash paragraph, dispatches `INSERT_TABLE_COMMAND({ columns, rows, includeHeaders: false })`
2. In `editor.update()`: removes the now-empty slash paragraph if it has a sibling, finds the new table via selection, sets `colWidths = Array(cols).fill(170)`, sets `tableWidth` (`cols >= 5 ? 'wide' : 'regular'`), inserts a trailing paragraph if none exists

---

## `TableActionMenuPlugin` — floating toolbar

Shown above the table whenever the cursor is in any cell (range or table selection).

### `info` state shape

```js
{
  tableKey,       // WideTableNode key
  cellKey,        // anchor StyledTableCellNode key (for reading current display values)
  cellKeys,       // ALL selected cell keys — used for multi-cell write operations
  width,          // 'regular' | 'wide'
  borderColor,    // hex or 'transparent'
  cols, rows,     // current table dimensions
  bg,             // anchor cell background (hex or null)
  textMode,       // anchor cell text color mode
  cellAlign,      // anchor cell paragraph alignment
}
```

### Helpers

```js
const onTable = (fn) => run(() => { /* gets table by tableKey, calls fn(t) */ })
const onCells = (fn) => run(() => { /* iterates cellKeys, calls fn(c) for each valid cell */ })
```

Use `onTable` for table-level changes (width, border color).  
Use `onCells` for cell-level changes (background, text color mode, alignment) — applies to **all selected cells**, not just the anchor.

### Toolbar button groups (left → right)

1. **Width group** (`AlignJustify` = regular, `StretchHorizontal` = wide)
2. **Cell alignment group** (`AlignLeft`, `AlignCenter`) — `setCellAlign` iterates `cellKeys` and calls `child.setFormat(a)` on each cell's paragraph children directly (not `FORMAT_ELEMENT_COMMAND`)
3. **Color options** (`PaintBucket`) — popover: background color + text color mode. Background presets: `['transparent', '#f3f4f6', '#e5e7eb', '#9ca3af', '#fde047']`; text mode: Eclipse/Sun/Moon icons
4. **Table options** (`Columns3Cog`) — popover icon bar: insert col left/right, insert row above/below, divider, delete column (`RectangleVertical`), delete row (`RectangleHorizontal`). Insert buttons disabled (opacity 0.3) at cap
5. **Table borders** (`Grid2x2`) — popover: `ColorSwatchMenu` with presets `['transparent', '#e5e7eb', '#9ca3af', '#6b7280', '#374151', '#111827']`
6. Divider
7. **Undo / Redo** (`Undo2` / `Redo2`) — dispatch `UNDO_COMMAND` / `REDO_COMMAND`
8. Divider
9. **Delete table** (`Trash2`, red on hover)

### Popover positioning

Each button that opens a popover is wrapped in a `<div className="relative">`. The popover uses `absolute bottom-full left-1/2 -translate-x-1/2 mb-2` — this centers it over its own button, not the whole toolbar.

### Panel visibility during sub-popups

`swatchOpen` state (fed by `ColorSwatchMenu`'s `onOpenChange`) keeps the toolbar from hiding while a color picker is open.

### Suppressing slash menu + plus button inside cells

`TableCellNode` is a Lexical **shadow root**, so `getTopLevelElementOrThrow()` from inside a cell returns the cell's paragraph — meaning `$isParagraphNode(topLevel)` is true and the slash/plus logic would incorrectly fire. The update listener in `SlashCommandPlugin` has an explicit early-return guard:

```js
if ($findMatchingParent(node, n => $isTableCellNode(n))) {
  setFocusedPara(null)
  setMenu(m => ...)
  setPlusButton(b => ...)
  return
}
```

---

## `TableColumnResizePlugin`

Renders drag handles at each column boundary of the active table (portal to `document.body`). Handle width = 7px, centered on the column's right edge.

- **Interior handles:** redistribute width between two neighbors (`w[i] += delta`, `w[i+1] -= delta`), min 48px per column
- **Rightmost handle:** shrinks/grows the table's total width only (`w[last] += dx`)
- On `mouseup`: commits widths to the node via `t.setColWidths(widths)` inside `editor.update()`
- During drag: applies DOM widths directly (`col.style.width`, `table.style.width`) for live feedback without triggering Lexical re-renders

---

## CSS (`index.css`)

### Placement rules (scoped per context)

The editor centers each block in a 48rem column (`max-w-3xl mx-auto px-6`). The public blog's container IS the ~45rem column. So placement is scoped separately:

```css
/* Public blog */
.blog-content table.blog-table-regular { max-width: 100%; margin-left: 0; }
.blog-content table.blog-table-wide    { max-width: min(80rem, calc(100vw - 2rem)); margin-left: 50%; transform: translateX(-50%); }

/* Editor */
[contenteditable] table.blog-table-regular { max-width: min(45rem, 100%); margin-left: max(0px, calc((100% - 45rem) / 2)); }
[contenteditable] table.blog-table-wide    { max-width: min(80rem, 100%); margin-left: 50%; transform: translateX(-50%); }
```

`margin: auto` does **not** center an element wider than its container — `translateX(-50%)` is required for wide tables.

### Border color

```css
table.blog-table td, table.blog-table th {
  border: 1px solid var(--table-border-color, #e5e7eb);
}
```

`--table-border-color` is set inline on `<table>` by `decorateTableElement`. Default `#e5e7eb` applies when not set.

### Editor paragraph reset inside cells

The editor paragraph theme class (`max-w-3xl mx-auto px-6 mb-3`) would produce a large indent inside cells. Overridden:

```css
table.blog-table td .editor-paragraph,
table.blog-table th .editor-paragraph {
  max-width: none; padding-left: 0; padding-right: 0;
  margin-left: 0; margin-right: 0; margin-bottom: 0;
}
```

### Cell selection highlight (editor only)

Blue inset border via `::after` pseudo-element. With `border-collapse: collapse`, adjacent selected cells' `::after` borders coincide at shared edges, giving a unified outline:

```css
.blog-table-cell-selected { caret-color: transparent; position: relative; }
.blog-table-cell-selected::after {
  content: ''; position: absolute; inset: 0;
  border: 2px solid #3b82f6; pointer-events: none; z-index: 2;
}
```

---

## Hard caps

`TABLE_MAX_DIM = 20` — enforced in the grid picker (`max 20×20`) and in the table options panel (insert column/row buttons disabled when `cols >= 20` or `rows >= 20`).

---

## Adding a new field to `WideTableNode`

1. Declare `__myField` on the class
2. Initialize in `constructor`
3. Copy in `afterCloneFrom`
4. Add getter / setter (use `getWritable()` in setter)
5. Apply in `createDOM` and `updateDOM` (call `decorateTableElement` or set directly on the DOM element)
6. In `exportDOM.after`: set `data-my-field` attribute on the `<table>` element
7. In `importDOM.conversion`: read `node.getAttribute('data-my-field')`
8. In `exportJSON`: add `myField: this.__myField`
9. In `updateFromJSON`: call `.setMyField(serializedNode.myField || defaultValue)`
10. In `plugins.jsx` `setInfo`: read `table.getMyField()`
11. Add handler + UI in `TableActionMenuPlugin`

## Adding a new field to `StyledTableCellNode`

Same pattern, but `exportDOM` operates on `out.element` (the `<td>`/`<th>`), and `importDOM` wraps the base `td`/`th` handlers.
