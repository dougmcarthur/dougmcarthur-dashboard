import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { slugFor } from '../shared/slug'

/**
 * Settings is four tabs, and every link into it still lands where it meant to.
 * Connections is the default because that is where Google's consent round trip
 * and the bell's connection alerts point; the digest's opt-out names its own
 * section. Source-level, because these are routing facts spread across the
 * Worker and the frontend.
 */
describe('Settings sections', () => {
  const page = readFileSync('frontend/src/pages/SettingsPage.tsx', 'utf8')

  it('opens on Connections unless the address names another section', () => {
    expect(page).toMatch(/isSettingsSection\(initialTab\) \? initialTab : 'connections'/)
    expect(readFileSync('frontend/src/App.tsx', 'utf8')).toContain('<SettingsPage initialTab={arg} />')
  })

  it('sends the digest opt-out to the section that switches it off', () => {
    expect(readFileSync('src/lib/digestMail.ts', 'utf8')).toContain('#settings/reminders')
  })

  it('no longer carries reference documents, which moved to the Artist page', () => {
    expect(page).not.toMatch(/referenceDocs/)
    expect(readFileSync('frontend/src/pages/ArtistPage.tsx', 'utf8')).toContain('<DocumentsTab />')
  })
})

describe('a document key made from its title', () => {
  it('is readable, and never asks anybody to invent it', () => {
    expect(slugFor('Artist Bio', [])).toBe('artist-bio')
    expect(slugFor('Café one-sheet (2026)', [])).toBe('cafe-one-sheet-2026')
  })

  it('does not collide with one that exists', () => {
    expect(slugFor('Artist Bio', ['artist-bio'])).toBe('artist-bio-2')
    expect(slugFor('Artist Bio', ['artist-bio', 'artist-bio-2'])).toBe('artist-bio-3')
  })

  it('still produces a key from a title with no letters in it', () => {
    expect(slugFor('—', [])).toBe('document')
  })
})
