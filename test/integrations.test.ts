import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  INTEGRATIONS,
  integrationSpec,
  isConnectable,
  type IntegrationSpec,
} from '../shared/integrations'

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

  it('says the send binding cannot reach anybody but the one address', () => {
    expect(integrationSpec('email.sending').cannot.join(' ')).toMatch(/allowlist|anybody else/i)
  })

  it('says the mailbox credential is read-only', () => {
    expect(integrationSpec('gmail.mailbox').cannot.join(' ')).toMatch(/read-only/i)
  })
})

describe('what a row may offer', () => {
  it('offers connecting only for the two things a person can actually connect', () => {
    // A secret and a binding are set on the server. A Connect button beside
    // either is a button that cannot work, which is worse than no button.
    const connectable = INTEGRATIONS.filter(isConnectable).map((s) => s.id)
    expect(connectable.sort()).toEqual(['calendar', 'gmail.drafts'])
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
