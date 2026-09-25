import { describe, expect, it } from 'vitest'
import { parseHash } from '../frontend/src/hooks/useHashRoute'

describe('hash routes', () => {
  it('reads a page and its argument', () => {
    expect(parseHash('#review/conflict', 'overview')).toEqual(['review', 'conflict'])
    expect(parseHash('', 'overview')).toEqual(['overview', null])
  })

  it('ignores the message a consent round trip leaves after ?', () => {
    // It used to become a page called "settings?calendar=connected" — a blank
    // screen at the end of every Google connect.
    expect(parseHash('#settings?calendar=connected', 'overview')).toEqual(['settings', null])
    expect(parseHash('#artist/drive?drive=connected', 'overview')).toEqual(['artist', 'drive'])
  })
})
