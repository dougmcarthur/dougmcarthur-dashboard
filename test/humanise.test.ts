import { describe, it, expect } from 'vitest'
import { humanise } from '../shared/humanise'
import { taskLabel } from '../shared/taskLabels'

describe('humanise', () => {
  it('turns a stored value into sentence-case words', () => {
    expect(humanise('house_concert')).toBe('House concert')
    expect(humanise('draft_ready')).toBe('Draft ready')
    expect(humanise('gig-festival-scan')).toBe('Gig festival scan')
  })

  it('leaves the rest of the value as written, so an acronym survives', () => {
    expect(humanise('SXSW_showcase')).toBe('SXSW showcase')
  })

  it('says what it was told to for nothing at all', () => {
    expect(humanise('')).toBe('')
    expect(humanise('  _-  ', 'Unknown')).toBe('Unknown')
    expect(humanise(null, 'Unknown')).toBe('Unknown')
  })

  it('is what taskLabel falls back on', () => {
    expect(taskLabel('some-new-agent')).toBe('Some new agent')
    expect(taskLabel('')).toBe('An automated task')
  })
})
