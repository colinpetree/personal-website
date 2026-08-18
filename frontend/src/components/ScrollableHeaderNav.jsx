import { useEffect, useState } from 'react'

function slugify(text) {
  const base = (text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'section'
}

const NAV_WIDTH = 224 // px, matches w-56
const GUTTER_GAP = 40 // px between the content column's right edge and the nav
const MIN_GUTTER = NAV_WIDTH + GUTTER_GAP + 24 // hide if the gutter can't fit the nav plus breathing room

// Fixed in the right gutter next to the content column, so it never scrolls
// with the page. Content columns vary in max-width across pages (blog posts
// and About/Home use max-w-3xl, Projects/AI Demo use max-w-4xl, Payment is
// conditional), so position is measured from the actual container rather
// than a hardcoded offset, and hidden entirely once the viewport can't fit
// it without overlapping the content.
export default function ScrollableHeaderNav({ containerRef, contentKey }) {
  const [items, setItems] = useState([])
  const [left, setLeft] = useState(null)

  useEffect(() => {
    const container = containerRef?.current
    if (!container) {
      setItems([])
      return
    }

    const headings = Array.from(container.querySelectorAll('h1, h2, h3'))
    const usedIds = new Set()
    const next = headings.map(el => {
      let id = el.id
      if (!id) {
        const base = slugify(el.textContent)
        id = base
        let i = 2
        while (usedIds.has(id)) {
          id = `${base}-${i}`
          i += 1
        }
        el.id = id
      }
      usedIds.add(id)
      // Clears the sticky navbar (h-16) when scrollIntoView lands a heading at the top.
      el.style.scrollMarginTop = '5rem'
      return { id, level: Number(el.tagName[1]), text: el.textContent || '' }
    })
    setItems(next)
  }, [containerRef, contentKey])

  useEffect(() => {
    if (items.length === 0) return undefined

    function updatePosition() {
      const container = containerRef?.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const available = window.innerWidth - rect.right
      setLeft(available >= MIN_GUTTER ? rect.right + GUTTER_GAP : null)
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [items, containerRef])

  if (items.length === 0 || left === null) return null

  function handleClick(e, id) {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav
      className="fixed top-24 max-h-[70vh] overflow-y-auto bg-white rounded-md px-3 py-2"
      style={{ left, width: NAV_WIDTH }}
      aria-label="Page sections"
    >
      {items.map(({ id, level, text }) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={e => handleClick(e, id)}
          className={`block truncate py-1 text-sm text-gray-400 hover:text-gray-600 transition-colors ${level === 1 ? 'font-semibold' : 'font-normal'}`}
        >
          {level === 3 ? `- ${text}` : text}
        </a>
      ))}
    </nav>
  )
}
