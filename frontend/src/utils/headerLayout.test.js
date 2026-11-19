import { describe, expect, it } from 'vitest'
import { leadingHeaderLayout, startsWithOverlayHeader } from './headerLayout'

describe('leadingHeaderLayout', () => {
  it('reads the layout of a leading header', () => {
    expect(leadingHeaderLayout('<header class="header-regular" data-layout="regular"></header><p>x</p>')).toBe('regular')
    expect(leadingHeaderLayout('<header class="header-linear-split"></header>')).toBe('linear-split')
  })

  it('returns null when content does not start with a header', () => {
    expect(leadingHeaderLayout('<p>Intro</p><header class="header-full"></header>')).toBeNull()
    expect(leadingHeaderLayout('')).toBeNull()
    expect(leadingHeaderLayout(null)).toBeNull()
    expect(leadingHeaderLayout('plain text, no tags')).toBeNull()
  })

  it('skips leading whitespace, text and comments', () => {
    expect(leadingHeaderLayout('  \n<!-- note <p> -->\n<header class="header-wide"></header>')).toBe('wide')
  })

  it('finds class in any attribute position (the sanitizer re-serializes HTML)', () => {
    expect(leadingHeaderLayout('<header data-layout="full" class="header-full"></header>')).toBe('full')
    expect(leadingHeaderLayout("<header class='x header-split y'></header>")).toBe('split')
  })

  it('is not fooled by ">" inside an attribute value', () => {
    expect(leadingHeaderLayout('<header data-button-text="Go >" class="header-fullscreen"></header>')).toBe('fullscreen')
  })

  it('ignores unknown header classes', () => {
    expect(leadingHeaderLayout('<header class="header-bogus"></header>')).toBeNull()
  })

  it('stays linear on malformed input (it runs on every Navbar render)', () => {
    const evil = '<a'.repeat(200_000)
    const start = performance.now()
    expect(leadingHeaderLayout(evil)).toBeNull()
    expect(performance.now() - start).toBeLessThan(500)
  })
})

describe('startsWithOverlayHeader', () => {
  it('is true only for layouts the navbar overlays', () => {
    for (const layout of ['full', 'split', 'fullscreen', 'linear', 'linear-split']) {
      expect(startsWithOverlayHeader(`<header class="header-${layout}"></header>`)).toBe(true)
    }
    for (const layout of ['regular', 'wide']) {
      expect(startsWithOverlayHeader(`<header class="header-${layout}"></header>`)).toBe(false)
    }
    expect(startsWithOverlayHeader('<p>hi</p>')).toBe(false)
  })
})
