import { describe, it, expect } from 'vitest'
import {
  PROBE_STALE_DAYS,
  STATE_LABELS,
  type CredentialHealth,
  type ProbeRecord,
  credentialHealth,
  credentialState,
  isProbeable,
  needsAttention,
} from '../shared/credentialHealth'
import { buildNotifications, type HealthInput } from '../shared/notifications'
import { buildReviewQueue, summariseQueue } from '../shared/reviewQueue'

const NOW = new Date('2026-09-16T12:00:00.000Z')

const probe = (outcome: ProbeRecord['outcome'], hoursAgo = 1, detail?: string): ProbeRecord => ({
  outcome,
  at: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
  detail,
})

describe('credentialState', () => {
  it('reports unconfigured when the secrets are missing, whatever a stale probe says', () => {
    // A probe result outliving the secret it tested must not claim the
    // credential works — "not set" is the stronger, current fact.
    expect(credentialState('gmail', { configured: false, probe: probe('working') })).toBe('unconfigured')
  })

  it('separates "nobody has checked" from "it is broken"', () => {
    expect(credentialState('gmail', { configured: true, probe: null })).toBe('unverified')
    expect(credentialState('gmail', { configured: true, probe: probe('rejected') })).toBe('rejected')
  })

  it('carries the probe outcome through when there is one', () => {
    expect(credentialState('calendar', { configured: true, probe: probe('working') })).toBe('working')
    expect(credentialState('calendar', { configured: true, probe: probe('unreachable') })).toBe('unreachable')
  })

  it('calls an unprobeable connection declared rather than pretending to verify it', () => {
    // Sending is a Worker binding and the only way to test one is to send
    // something. A tick here would mean less than it looks like it means.
    expect(isProbeable('email')).toBe(false)
    expect(credentialState('email', { configured: true, probe: null })).toBe('declared')
  })
})

describe('needsAttention', () => {
  it('raises only the two states the owner can act on', () => {
    expect(needsAttention('unconfigured')).toBe(true)
    expect(needsAttention('rejected')).toBe(true)
  })

  it('stays quiet about an absent check and about the network', () => {
    // The whole design rests on this. `unreachable` is a fact about the
    // network and none about the credential; alarming on it would put a
    // critical row on the bell every time a request lost a race.
    expect(needsAttention('unverified')).toBe(false)
    expect(needsAttention('unreachable')).toBe(false)
    expect(needsAttention('working')).toBe(false)
    expect(needsAttention('declared')).toBe(false)
  })
})

describe('staleness', () => {
  it('marks a passing probe stale once the daily check has plainly not run', () => {
    const fresh = credentialHealth('gmail', { configured: true, probe: probe('working', 2) }, NOW)
    expect(fresh.stale).toBe(false)

    const old = credentialHealth(
      'gmail',
      { configured: true, probe: probe('working', (PROBE_STALE_DAYS + 1) * 24) },
      NOW,
    )
    expect(old.stale).toBe(true)
    // Still working — a credential does not rot because nobody looked at it.
    expect(old.state).toBe('working')
  })

  it('never calls a failing state stale, because staleness is about the check', () => {
    const old = credentialHealth(
      'gmail',
      { configured: true, probe: probe('rejected', (PROBE_STALE_DAYS + 5) * 24) },
      NOW,
    )
    expect(old.stale).toBe(false)
    expect(old.state).toBe('rejected')
  })

  it('survives an unparseable timestamp rather than throwing at a screen', () => {
    const h = credentialHealth('gmail', { configured: true, probe: { outcome: 'working', at: 'not a date' } }, NOW)
    expect(h.stale).toBe(false)
  })
})

describe('what a card says', () => {
  it('has a label for every state, and none of them is a variable name', () => {
    for (const [state, label] of Object.entries(STATE_LABELS)) {
      expect(label.length).toBeGreaterThan(0)
      expect(label).not.toMatch(/[_A-Z]{2,}/)
      expect(state).not.toEqual(label)
    }
  })
})

// ── The condition the bell raises ────────────────────────────────────────────

const health = (credentials: CredentialHealth[]): HealthInput => ({
  calendarConfigured: true,
  gmailConfigured: true,
  emailConfigured: true,
  credentials,
})

const card = (id: CredentialHealth['id'], state: CredentialHealth['state']): CredentialHealth => ({
  id,
  state,
  checkedAt: NOW.toISOString(),
  detail: null,
  stale: false,
})

function build(input: HealthInput) {
  const items = buildReviewQueue({ today: '2026-09-16' })
  return buildNotifications({
    items,
    summary: summariseQueue(items, { orphanedReminders: 0 }),
    health: input,
    marks: [],
    now: NOW.toISOString(),
  })
}

describe('a rejected credential reaches the bell', () => {
  it('raises a critical row that is not the disconnected one', () => {
    const r = build(health([card('gmail', 'rejected')]))
    const keys = r.items.map((n) => n.key)

    // A separate key from `connection:gmail`, because a secret nobody set and
    // a secret that stopped working are different problems with different
    // fixes — and dismissing one must not dismiss the other.
    expect(keys).toContain('connection:gmail:rejected')
    expect(keys).not.toContain('connection:gmail')
    expect(r.items.find((n) => n.key === 'connection:gmail:rejected')?.tier).toBe('critical')
  })

  it('names the connection and says what stopped, never the variable', () => {
    const note = build(health([card('gmail', 'rejected')])).items.find(
      (n) => n.key === 'connection:gmail:rejected',
    )
    expect(note?.title).toContain('Gmail')
    expect(note?.title).not.toMatch(/GMAIL_REFRESH_TOKEN|gmail\.readonly/)
    expect(note?.body).toContain('replies')
  })

  it('says nothing for unverified, unreachable, working or declared', () => {
    for (const state of ['unverified', 'unreachable', 'working', 'declared'] as const) {
      const r = build(health([card('gmail', state)]))
      expect(r.items.map((n) => n.key)).toEqual([])
    }
  })

  it('raises nothing at all when no probe has ever run', () => {
    // Absent credentials means no probe result is available. The absence of a
    // check is not a failure.
    const r = build({ calendarConfigured: true, gmailConfigured: true, emailConfigured: true })
    expect(r.items).toEqual([])
  })

  it('reports each rejected credential separately, so each can be fixed', () => {
    const r = build(health([card('gmail', 'rejected'), card('calendar', 'rejected')]))
    expect(r.items.map((n) => n.key)).toEqual([
      'connection:calendar:rejected',
      'connection:gmail:rejected',
    ])
  })
})
