import { describe, expect, it } from 'vitest'
import { DOCS_FILTER_NONE, EMPTY_LIST_FILTER, filterList, isListFilterActive, sortList } from './adminListFilter'

const items = [
  { id: 1, title: 'Hello World', slug: 'hello-world', status: 'published', created_at: '2026-01-01', updated_at: '2026-03-01', publish_date: '2026-01-02', docs_section: { id: 7 } },
  { id: 2, title: 'Untitled', slug: 'untitled', status: 'draft', created_at: '2026-02-01', updated_at: '2026-02-05', publish_date: '2025-12-01', docs_section: null },
  { id: 3, title: 'Untitled', slug: 'untitled-2', status: 'scheduled', created_at: '2026-02-01', updated_at: '2026-04-01', publish_date: '2026-06-01', docs_section: null },
]
const ids = (list) => list.map((i) => i.id)

describe('filterList', () => {
  it('returns everything when no filter is set', () => {
    expect(isListFilterActive(EMPTY_LIST_FILTER)).toBe(false)
    expect(filterList(items, EMPTY_LIST_FILTER)).toBe(items)
  })

  it('matches every term against title and /slug, case-insensitive', () => {
    expect(ids(filterList(items, { ...EMPTY_LIST_FILTER, query: 'HELLO world' }))).toEqual([1])
    expect(ids(filterList(items, { ...EMPTY_LIST_FILTER, query: '/untitled-2' }))).toEqual([3])
    expect(ids(filterList(items, { ...EMPTY_LIST_FILTER, query: 'hello untitled' }))).toEqual([])
  })

  it('filters by status and docs section', () => {
    expect(ids(filterList(items, { ...EMPTY_LIST_FILTER, status: 'draft' }))).toEqual([2])
    expect(ids(filterList(items, { ...EMPTY_LIST_FILTER, docs: '7' }))).toEqual([1])
    expect(ids(filterList(items, { ...EMPTY_LIST_FILTER, docs: DOCS_FILTER_NONE }))).toEqual([2, 3])
  })
})

describe('sortList', () => {
  it('sorts by recently edited', () => {
    expect(ids(sortList(items, 'updated-desc'))).toEqual([3, 1, 2])
  })

  it('breaks created-date ties by id so the order is stable', () => {
    expect(ids(sortList(items, 'created-asc'))).toEqual([1, 2, 3])
    expect(ids(sortList(items, 'created-desc'))).toEqual([3, 2, 1])
  })

  it('puts drafts last in either published direction, even with a stale publish_date', () => {
    expect(ids(sortList(items, 'published-desc'))).toEqual([3, 1, 2])
    expect(ids(sortList(items, 'published-asc'))).toEqual([1, 3, 2])
  })

  it('does not mutate the input', () => {
    const before = ids(items)
    sortList(items, 'updated-desc')
    expect(ids(items)).toEqual(before)
  })
})
