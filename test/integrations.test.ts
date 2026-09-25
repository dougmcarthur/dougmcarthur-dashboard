import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  INTEGRATIONS,
  integrationSpec,
  isConnectable,
  rowNeedsAttention,
  stateNote,
  type IntegrationSpec,
} from '../shared/integrations'
import { STATE_NOTES } from '../shared/credentialHealth'

const text = (spec: IntegrationSpec) =>
  [spec.name, spec.purpose, spec.breaks, ...spec.access, ...spec.cannot].join(' ')

describe('what an integration says about itself', () => {
  it('gives every row a name, a purpose, what it can reach and what breaks', () => {
    for (const spec of INTEGRATIONS) {
      expect(spec.name.length, spec.id).toBeGreaterThan(0)
      expect(spec.purpose.length, spec.id).toBeGreaterThan(0)
      expect(spec.breaks.length, spec.id).toBeGreaterThan(0)
      expect(spec.access.length, spec.id).toBeGreaterThan(0)
    }
  })

  it('never prints a scope URL at a person', () => {
    // A scope is an identifier. "Create drafts in your mailbox" is the claim
    // somebody can actually check against what they expect.
    for (const spec of INTEGRATIONS) {
      expect(text(spec), spec.id).not.toMatch(/googleapis\.com|auth\/(gmail|calendar)/)
    }
  })

  it('never prints a variable name either', () => {
    for (const spec of INTEGRATIONS) {
      expect(text(spec), spec.id).not.toMatch(/[A-Z][A-Z_]{4,}/)
    }
  })

  it('reads as sentences rather than labels', () => {
    for (const spec of INTEGRATIONS) {
      for (const line of [...spec.access, ...spec.cannot]) {
        expect(line.trim().endsWith('.'), `${spec.id}: ${line}`).toBe(true)
      }
    }
  })
})

describe('the disclosures that must not quietly disappear', () => {
  it('says out loud that the drafting permission also allows sending', () => {
    // The narrowest scope Google offers for creating a draft permits sending
    // too, so the limit is this code rather than the permission. A screen that
    // implies otherwise protects less than the reader assumes — which is the
    // one thing CLAUDE.md says to write down rather than imply.
    const spec = integrationSpec('gmail.drafts')
    expect(spec.access.join(' ')).toMatch(/send/i)
    expect(spec.access.join(' ')).toMatch(/never|not/i)
  })

  it('says the calendar grant cannot read the rest of the calendar', () => {
    // The opposite case: here Google enforces it, so the promise is worth
    // making and worth keeping in front of somebody deciding to connect.
    const spec = integrationSpec('calendar')
    expect(spec.cannot.join(' ')).toMatch(/read the rest of your calendar/i)
  })

  it('says the send binding cannot reach anybody not on file, and whose check that is', () => {
    const cannot = integrationSpec('email.sending').cannot.join(' ')
    expect(cannot).toMatch(/anybody else/i)
    // The allowlist is gone, so the limit is ours rather than Cloudflare's —
    // and a promise that implied otherwise would protect less than it reads.
    expect(cannot).toMatch(/in this code/i)
  })

  it('says the mailbox credential is read-only', () => {
    expect(integrationSpec('gmail.mailbox').cannot.join(' ')).toMatch(/read-only/i)
  })

  it('says out loud that the Tasks permission reaches every other list', () => {
    // The `gmail.compose` trade again, and worse: Google offers `tasks` or
    // `tasks.readonly` and nothing between them, so there is no narrow scope
    // to hide behind. The limit is src/lib/googleTasks.ts naming one list.
    const spec = integrationSpec('tasks')
    expect(spec.access.join(' ')).toMatch(/every other task list/i)
    expect(spec.access.join(' ')).toMatch(/never|only ever/i)
  })

  it('makes no promise at all about the primary-calendar grant', () => {
    // The two grants that *can* promise something do. This one cannot, and an
    // empty list is the honest version — a reassuring line invented to fill
    // the space would protect less than the reader assumes.
    const spec = integrationSpec('calendar.primary')
    expect(spec.cannot).toEqual([])
    expect(spec.access.join(' ')).toMatch(/every calendar you own/i)
  })
})

describe('what a row may offer', () => {
  it('offers connecting only for the things a person can actually connect', () => {
    // A secret and a binding are set on the server. A Connect button beside
    // either is a button that cannot work, which is worse than no button.
    const connectable = INTEGRATIONS.filter(isConnectable).map((s) => s.id)
    expect(connectable.sort()).toEqual(['calendar', 'calendar.primary', 'gmail.drafts', 'tasks'])
  })

  it('gates exactly the one row whose permission is bigger than its purpose', () => {
    // Writing to the artist's own calendar needs read and write over every
    // calendar they own, to place a handful of all-day entries a year. That
    // trade is theirs to make, but it is not one to make by default and not
    // one to offer on a deployment that cannot complete it.
    expect(INTEGRATIONS.filter((s) => s.gated).map((s) => s.id)).toEqual(['calendar.primary'])
  })

  it('types each integration by how it is actually made', () => {
    expect(integrationSpec('gmail.mailbox').kind).toBe('secret')
    expect(integrationSpec('email.sending').kind).toBe('binding')
  })
})

describe('the card reads the spec rather than restating it', () => {
  const card = readFileSync('frontend/src/components/IntegrationsCard.tsx', 'utf8')

  it('names no scope of its own', () => {
    expect(card).not.toMatch(/googleapis\.com/)
  })

  it('takes its wording from the shared list', () => {
    // If the prose is in the component, the consent screen and this panel
    // drift the first time one of them is edited.
    expect(card).toContain('spec.access')
    expect(card).toContain('spec.cannot')
    expect(card).toContain('INTEGRATIONS')
  })
})

describe('the sentence under the status pill', () => {
  it('never tells somebody to go and set a secret for a grant', () => {
    // `STATE_NOTES` is written for the credential probe, where every state is
    // about a value somebody set on the server. On a grant row it sends the
    // reader looking for a Worker secret when the thing to do is press
    // Connect — the same two-contradictory-claims defect as the panel that
    // once showed "the secrets are not set" beside an `invalid_client` error.
    for (const spec of INTEGRATIONS.filter((s) => s.kind === 'grant')) {
      const note = stateNote(spec, 'unconfigured', STATE_NOTES.unconfigured)
      expect(note, spec.id).not.toMatch(/secret/i)
      expect(note, spec.id).toMatch(/connect/i)
    }
  })

  it('leaves the probe\'s own wording alone on a secret or a binding', () => {
    // A second copy of a sentence is a second place for it to drift, so only
    // the states that genuinely differ are overridden.
    for (const spec of INTEGRATIONS.filter((s) => s.kind !== 'grant')) {
      for (const state of Object.keys(STATE_NOTES) as Array<keyof typeof STATE_NOTES>) {
        expect(stateNote(spec, state, STATE_NOTES[state]), spec.id).toBe(STATE_NOTES[state])
      }
    }
  })

  it('says nothing of its own about a state both kinds agree on', () => {
    const grant = integrationSpec('calendar')
    for (const state of ['working', 'unverified', 'unreachable', 'declared'] as const) {
      expect(stateNote(grant, state, STATE_NOTES[state])).toBe(STATE_NOTES[state])
    }
  })
})

describe('what counts as needing attention', () => {
  it('does not call an unconnected grant a problem', () => {
    // A Connect button is not a fault report. Counting these told a new
    // account that several things were broken on the day it was set up
    // correctly, which is how a summary line stops being read.
    for (const spec of INTEGRATIONS.filter((s) => s.kind === 'grant')) {
      expect(rowNeedsAttention(spec, 'unconfigured'), spec.id).toBe(false)
    }
  })

  it('still calls a missing server credential a problem', () => {
    // Same state, different meaning: nobody can press a button to fix this
    // one, and something that was supposed to work is not working.
    for (const spec of INTEGRATIONS.filter((s) => s.kind !== 'grant')) {
      expect(rowNeedsAttention(spec, 'unconfigured'), spec.id).toBe(true)
    }
  })

  it('raises a refused credential whatever kind of row it is on', () => {
    // `rejected` means it was connected and has stopped, which is the state
    // the whole probe exists to surface. A grant is not exempt from that.
    for (const spec of INTEGRATIONS) {
      expect(rowNeedsAttention(spec, 'rejected'), spec.id).toBe(true)
    }
  })

  it('stays quiet about the states the shared rule is quiet about', () => {
    for (const spec of INTEGRATIONS) {
      for (const state of ['working', 'unverified', 'unreachable', 'declared'] as const) {
        expect(rowNeedsAttention(spec, state), `${spec.id} ${state}`).toBe(false)
      }
    }
  })
})

describe('the row does not say the same thing twice', () => {
  const card = readFileSync('frontend/src/components/IntegrationsCard.tsx', 'utf8')

  it('shows the status pill only when there is no Connect button', () => {
    // "Not connected" beside a Connect button is the button's own message in
    // two words and a colour. The button is the stronger signal because it is
    // the thing you can act on, so the pill steps aside for it.
    expect(card).toMatch(/offeringConnect\s*\?/)
    expect(card).toContain('offeringConnect')
  })

  it('keeps a way into the detail when the pill is gone', () => {
    // The pill used to be the only way in. "What can this reach, and what can
    // it not" is most worth reading *before* connecting — exactly when there
    // is now no pill — so the row's name opens it too.
    const opens = card.match(/onClick=\{onOpen\}/g) ?? []
    expect(opens.length).toBeGreaterThanOrEqual(2)
  })
})

describe('a Connect button is a claim that connecting will work', () => {
  const card = readFileSync('frontend/src/components/IntegrationsCard.tsx', 'utf8')

  it('reads the deployment answer the grant has always returned', () => {
    // `readGrant` has returned `configured` since the grant table existed and
    // this card ignored it, so Connect was offered on a deployment whose
    // consent route answers 503. Pressing it in production is how it was
    // found — the same class of mistake as a button naming a status the PATCH
    // route refuses.
    expect(card).toContain('serverReady')
    expect(card).toMatch(/offeringConnect\s*=\s*connectable && !connected && row\.serverReady/)
  })

  it('takes it from the grant on every grant row, including the calendar', () => {
    // The calendar has a second way in — the older Worker secrets — so it has
    // a branch of its own, and that branch hardcoded `serverReady: true`. It
    // was then the one row still offering a Connect that could not complete.
    expect(card).not.toMatch(/serverReady:\s*true,\s*\n\s*\},\s*\n\s*\]\s*\n\s*\}\s*\n\s*const cred/)
    const hardcoded = [...card.matchAll(/serverReady:\s*true/g)].length
    // Exactly one: the secret-and-binding rows, which have no consent to block.
    expect(hardcoded).toBe(1)
  })

  it('names the missing variable rather than listing all three', () => {
    // On a configuration screen the variable name is the actionable fact —
    // the one place developer-speak stays. "Google client credentials or
    // TOKEN_ENCRYPTION_KEY are not configured" made the reader check three.
    expect(card).toContain('grantMissingSecrets')
  })
})
