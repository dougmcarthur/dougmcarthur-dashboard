import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SIDE_PANEL, SIDE_PANELS, isDocked, loadSidePanel, saveSidePanel } from '../frontend/src/sidePanel'

/**
 * Whether the notifications are pinned is a preference of one browser, so it is
 * read from storage that can be empty, hand-edited, from an older version of
 * this code, or not there at all. None of those may break the page, and none may
 * pin a panel the person never pinned.
 */

function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
  return store
}

afterEach(() => vi.unstubAllGlobals())

describe('loading', () => {
  it('starts unpinned, with the panel ready to show once it is', () => {
    stubStorage()
    expect(loadSidePanel()).toEqual({ pinned: false, open: true, panel: 'notifications' })
  })

  it('has no storage to read in a private window, and does not mind', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(loadSidePanel()).toEqual(DEFAULT_SIDE_PANEL)
  })

  it('reads what was saved', () => {
    const store = stubStorage()
    saveSidePanel({ pinned: true, open: false, panel: 'answers' })
    expect(store.size).toBe(1)
    expect(loadSidePanel()).toEqual({ pinned: true, open: false, panel: 'answers' })
  })

  it('falls back on text that is not JSON', () => {
    stubStorage({ 'scout.sidePanel': '{not json' })
    expect(loadSidePanel()).toEqual(DEFAULT_SIDE_PANEL)
  })

  it('does not take a truthy string for a yes', () => {
    // The string "false" is truthy. A field that is not a boolean is not an answer.
    stubStorage({ 'scout.sidePanel': JSON.stringify({ pinned: 'false', open: 0 }) })
    expect(loadSidePanel()).toEqual(DEFAULT_SIDE_PANEL)
  })

  it('keeps the field it understood when the other is missing', () => {
    stubStorage({ 'scout.sidePanel': JSON.stringify({ pinned: true }) })
    expect(loadSidePanel()).toEqual({ pinned: true, open: true, panel: 'notifications' })
  })

  it('opens the first panel rather than an empty column when the stored one is unknown', () => {
    // A build that has a panel this one has not, or a hand edit.
    stubStorage({ 'scout.sidePanel': JSON.stringify({ pinned: true, open: true, panel: 'calendar' }) })
    expect(loadSidePanel().panel).toBe(SIDE_PANELS[0])
    stubStorage({ 'scout.sidePanel': JSON.stringify({ pinned: true, open: true, panel: 7 }) })
    expect(loadSidePanel().panel).toBe(SIDE_PANELS[0])
  })

  it('saves nothing, quietly, when storage refuses', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    })
    expect(() => saveSidePanel({ pinned: true, open: true, panel: 'notifications' })).not.toThrow()
  })
})

describe('whether the panel is beside the page', () => {
  it('needs it pinned, open and the screen wide enough', () => {
    const state = { pinned: true, open: true, panel: 'answers' as const }
    expect(isDocked(state, true)).toBe(true)
    expect(isDocked({ ...state, pinned: false }, true)).toBe(false)
    expect(isDocked({ ...state, open: false }, true)).toBe(false)
    expect(isDocked(state, false)).toBe(false)
  })
})
