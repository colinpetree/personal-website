import { describe, expect, it } from 'vitest'
import { aspectRatioOf, computeRowAspectRatio, groupImagesIntoRows } from './galleryLayout'

const imgs = (n) => Array.from({ length: n }, (_, i) => ({ src: `/${i}.webp`, width: 400, height: 300 }))
const sizes = (rows) => rows.map((r) => r.length)

describe('groupImagesIntoRows', () => {
  it('uses the fixed row table for 1 to 9 images', () => {
    expect(sizes(groupImagesIntoRows(imgs(1)))).toEqual([1])
    expect(sizes(groupImagesIntoRows(imgs(4)))).toEqual([2, 2])
    expect(sizes(groupImagesIntoRows(imgs(5)))).toEqual([3, 2])
    expect(sizes(groupImagesIntoRows(imgs(7)))).toEqual([3, 2, 2])
    expect(sizes(groupImagesIntoRows(imgs(9)))).toEqual([3, 3, 3])
  })

  it('never drops images past the maximum', () => {
    const rows = groupImagesIntoRows(imgs(11))
    expect(rows.flat()).toHaveLength(11)
    expect(sizes(rows)).toEqual([3, 3, 3, 2])
  })

  it('keeps image order', () => {
    const input = imgs(6)
    expect(groupImagesIntoRows(input).flat()).toEqual(input)
  })

  it('returns no rows for no images', () => {
    expect(groupImagesIntoRows([])).toEqual([])
  })
})

describe('aspect ratios', () => {
  it('falls back to 1 when dimensions are missing', () => {
    expect(aspectRatioOf({ width: 800, height: 400 })).toBe(2)
    expect(aspectRatioOf({ width: 800 })).toBe(1)
    expect(aspectRatioOf(undefined)).toBe(1)
  })

  it('sums the images in a row', () => {
    expect(computeRowAspectRatio([{ width: 400, height: 200 }, { width: 300, height: 300 }])).toBe(3)
  })
})
