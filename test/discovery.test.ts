import { describe, it, expect } from 'vitest'
import {
  normaliseName,
  normaliseHost,
  isDuplicate,
  gateCandidates,
  MAX_NEW_PER_RUN,
} from '../src/lib/discovery'

function candidate(name: string, url: string, fitScore = 4) {
  return { name, url, fitScore }
}

describe('normalisation', () => {
  it('treats the same event across years as one thing', () => {
    expect(normaliseName('Sawdust City Music Festival 2027')).toBe(
      normaliseName('sawdust city music festival'),
    )
    expect(normaliseName('The Winnipeg Folk Fest')).toBe(normaliseName('Winnipeg Folk Festival'))
  })

  it('keeps genuinely different events apart', () => {
    expect(normaliseName('Riverbend Folk Festival')).not.toBe(normaliseName('Sawdust City Festival'))
  })

  it('compares links by host, so a deep link matches its home page', () => {
    expect(normaliseHost('https://www.example.com/apply/2027')).toBe('example.com')
    expect(normaliseHost('https://example.com')).toBe('example.com')
    expect(normaliseHost('not a url')).toBeNull()
    expect(normaliseHost(null)).toBeNull()
  })
})

describe('isDuplicate', () => {
  const existing = [
    { name: 'Sawdust City Music Festival 2026', url: 'https://sawdustcity.com/' },
    { name: 'Prairie Sessions', url: null },
  ]

  it('matches on name even when the year differs', () => {
    expect(isDuplicate({ name: 'Sawdust City Music Festival 2027', url: 'https://elsewhere.com' }, existing)).toBe(true)
  })

  it('matches on host even when the name is written differently', () => {
    expect(isDuplicate({ name: 'Sawdust Fest — Artist Call', url: 'https://www.sawdustcity.com/apply' }, existing)).toBe(true)
  })

  it('lets a genuinely new find through', () => {
    expect(isDuplicate({ name: 'Northern Lights Festival', url: 'https://northernlights.ca' }, existing)).toBe(false)
  })
})

describe('gateCandidates', () => {
  it('drops what you already track, keeps what is new', () => {
    const { accepted, rejected } = gateCandidates(
      [candidate('Sawdust City Music Festival 2027', 'https://sawdustcity.com/apply'), candidate('Northern Lights', 'https://nl.ca')],
      [{ name: 'Sawdust City Music Festival 2026', url: 'https://sawdustcity.com/' }],
    )
    expect(accepted.map((c) => c.name)).toEqual(['Northern Lights'])
    expect(rejected).toEqual([{ name: 'Sawdust City Music Festival 2027', reason: 'already tracked' }])
  })

  it('filters weak fits rather than flooding the review queue', () => {
    const { accepted, rejected } = gateCandidates(
      [candidate('Great fit', 'https://a.com', 5), candidate('Weak fit', 'https://b.com', 2)],
      [],
    )
    expect(accepted.map((c) => c.name)).toEqual(['Great fit'])
    expect(rejected[0]).toEqual({ name: 'Weak fit', reason: 'fit 2/5' })
  })

  it('caps a run and keeps the best-scoring finds', () => {
    const many = Array.from({ length: MAX_NEW_PER_RUN + 4 }, (_, i) =>
      candidate(`Festival ${i}`, `https://f${i}.com`, i % 5 === 0 ? 5 : 3),
    )
    const { accepted, rejected } = gateCandidates(many, [])
    expect(accepted).toHaveLength(MAX_NEW_PER_RUN)
    expect(accepted[0].fitScore).toBe(5)
    expect(rejected.every((r) => r.reason === 'over the per-run cap')).toBe(true)
  })

  it('deduplicates within a single run', () => {
    const { accepted } = gateCandidates(
      [candidate('Northern Lights Festival', 'https://nl.ca'), candidate('Northern Lights Fest 2027', 'https://nl.ca/apply')],
      [],
    )
    expect(accepted).toHaveLength(1)
  })

  it('rejects anything without a name or a link', () => {
    const { accepted, rejected } = gateCandidates([{ name: 'No link', url: '', fitScore: 5 }], [])
    expect(accepted).toHaveLength(0)
    expect(rejected[0].reason).toBe('missing a name or link')
  })
})
