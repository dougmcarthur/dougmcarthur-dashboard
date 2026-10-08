import { describe, expect, it } from 'vitest'
import { flagTone } from '../shared/flagTone'

describe('flagTone', () => {
  it('paints the flags that mean waiting as waiting, at every severity', () => {
    for (const id of ['reply_due', 'no_reply', 'due_soon', 'blocked'] as const) {
      for (const severity of ['info', 'warn', 'danger'] as const) {
        expect(flagTone({ id, severity }), `${id} at ${severity}`).toBe('waiting')
      }
    }
  })

  it('leaves a missed deadline, a conflict and a flagged issue as broken', () => {
    for (const id of ['overdue', 'conflict', 'issue'] as const) {
      expect(flagTone({ id, severity: 'danger' }), id).toBe('danger')
    }
  })

  it('does not call an entry fee waiting', () => {
    expect(flagTone({ id: 'paid', severity: 'warn' })).toBe('warn')
  })

  it('keeps a state a state', () => {
    expect(flagTone({ id: 'window', severity: 'info' })).toBe('info')
  })
})
