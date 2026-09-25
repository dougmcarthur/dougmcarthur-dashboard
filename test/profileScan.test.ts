import { describe, expect, it } from 'vitest'
import { SEEN_LIMIT, describeItems, parseSeen, scanOutcome, scanTitle } from '../shared/profileScan'

const item = (kind: string, n: number) => ({ kind, source: `association-musicnb:x#${kind}:${n}` })

describe('what a re-read announces', () => {
  it('says nothing on the first read, and remembers everything it saw', () => {
    const pending = [item('video', 1), item('photo', 1)]
    const out = scanOutcome(pending, null)
    expect(out).toEqual({ fresh: [], seen: pending.map((p) => p.source), baseline: true })
  })

  it('announces only what appeared since', () => {
    const first = scanOutcome([item('video', 1)], null)
    const second = scanOutcome([item('video', 1), item('video', 2)], JSON.stringify(first.seen))
    expect(second.fresh).toEqual([item('video', 2)])
    expect(second.baseline).toBe(false)
  })

  it('never announces an item twice, even when the artist leaves it unimported', () => {
    let seen = JSON.stringify(scanOutcome([], null).seen)
    const once = scanOutcome([item('photo', 1)], seen)
    expect(once.fresh).toHaveLength(1)
    seen = JSON.stringify(once.seen)
    expect(scanOutcome([item('photo', 1)], seen).fresh).toEqual([])
  })

  it('does not re-announce an item that leaves the profile and comes back', () => {
    const a = scanOutcome([item('link', 1)], '[]')
    const gone = scanOutcome([], JSON.stringify(a.seen))
    expect(scanOutcome([item('link', 1)], JSON.stringify(gone.seen)).fresh).toEqual([])
  })

  it('treats an unreadable stored list as no baseline, which announces nothing', () => {
    expect(parseSeen('not json')).toBeNull()
    expect(scanOutcome([item('video', 1)], '{"a":1}').fresh).toEqual([])
  })

  it('caps what it remembers, dropping the oldest', () => {
    const prior = Array.from({ length: SEEN_LIMIT }, (_, i) => `old-${i}`)
    const out = scanOutcome([item('video', 9)], JSON.stringify(prior))
    expect(out.seen).toHaveLength(SEEN_LIMIT)
    expect(out.seen[0]).toBe('old-1')
    expect(out.seen[SEEN_LIMIT - 1]).toBe(item('video', 9).source)
  })
})

describe('how it reads in the bell', () => {
  it('counts by kind, the ones worth watching first', () => {
    expect(describeItems([item('link', 1), item('video', 1), item('video', 2), item('photo', 1)])).toBe(
      '2 videos, a photo and a link',
    )
    expect(describeItems([item('audio', 1)])).toBe('a release')
    expect(describeItems([item('mystery', 1), item('video', 1)])).toBe('a video and an item')
  })

  it('names the association, never a slug or an address', () => {
    const title = scanTitle('Music NB', [item('video', 1)])
    expect(title).toBe('Music NB profile: a video to read in')
    expect(title).not.toMatch(/association-|https?:/)
  })
})
