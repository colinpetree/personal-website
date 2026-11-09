// Search, status filter and sort shared by the admin Blog Posts and Pages
// lists (see components/admin/AdminListFilterBar.jsx). Modeled on lit-review's
// lib/listFilter.js.

export const EMPTY_LIST_FILTER = { query: '', status: '' }

export const DEFAULT_LIST_SORT = 'created-desc'

export const STATUS_LABELS = { published: 'Published', scheduled: 'Scheduled', draft: 'Draft' }

export const CREATED_SORT_OPTIONS = [
  { value: 'created-desc', label: 'Newest created' },
  { value: 'created-asc', label: 'Oldest created' },
]

export const PUBLISHED_SORT_OPTIONS = [
  { value: 'published-desc', label: 'Newest published' },
  { value: 'published-asc', label: 'Oldest published' },
]

export function isListFilterActive(filter) {
  return Boolean(filter.query.trim() || filter.status)
}

// Matches title and URL ("/slug"). Every whitespace-separated term must
// appear, case-insensitive.
export function filterList(items, filter) {
  if (!isListFilterActive(filter)) return items
  const terms = filter.query.toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter(item => {
    if (filter.status && item.status !== filter.status) return false
    if (!terms.length) return true
    const text = `${item.title ?? ''} /${item.slug ?? ''}`.toLowerCase()
    return terms.every(term => text.includes(term))
  })
}

// A draft isn't published even if it kept a publish_date from an earlier
// schedule, so it has no publish date for sorting.
function publishedKey(item) {
  return item.status !== 'draft' && item.publish_date ? item.publish_date : ''
}

function compare(ka, kb, sign) {
  if (ka === kb) return 0
  return ka < kb ? -sign : sign
}

// Timestamps are ISO strings, so they compare correctly as text. Sorting by
// published date breaks ties by created date, and puts items with no publish
// date (drafts) after the rest in either direction. Final ties fall back to id
// so the order is stable.
export function sortList(items, sort) {
  const [field, dir] = sort.split('-')
  const sign = dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    if (field === 'published') {
      const pa = publishedKey(a)
      const pb = publishedKey(b)
      if (!pa !== !pb) return pa ? -1 : 1
      const byPublished = compare(pa, pb, sign)
      if (byPublished) return byPublished
    }
    return compare(a.created_at ?? '', b.created_at ?? '', sign) || compare(a.id, b.id, sign)
  })
}
