import { describe, it, expect } from 'vitest'
import { buildRawMessage, encodeDraft, encodeHeader, planDrafts, subjectFor } from '../shared/gmailDraft'

const decode = (b64url: string) => {
  const p = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

describe('encodeHeader', () => {
  it('leaves a plain ASCII subject alone', () => {
    // An encoded-word around plain text is legal and renders as gibberish in
    // anything that does not decode it. No reason to spend that risk here.
    expect(encodeHeader('Sync licensing')).toBe('Sync licensing')
  })

  it('encodes a subject carrying an em dash', () => {
    // Every subject this app writes has one, because that is how everything
    // here is written. Raw in a header it is a malformed line.
    const encoded = encodeHeader('Sync licensing — Magic')
    expect(encoded.startsWith('=?UTF-8?B?')).toBe(true)
    expect(encoded.endsWith('?=')).toBe(true)
  })

  it('flattens a newline rather than injecting a header', () => {
    // A subject with a CRLF in it is header injection: everything after the
    // break would be read as a new header, To: included.
    expect(encodeHeader('Hello\r\nBcc: someone@evil.test')).toBe('Hello Bcc: someone@evil.test')
  })
})

describe('buildRawMessage', () => {
  const draft = { to: 'sync@example.com', from: 'doug@example.com', subject: 'Sync licensing — Magic', body: 'Hi there,\n\nA pitch.\n\nDoug' }

  it('writes the headers Gmail needs, blank line, then the body', () => {
    const raw = buildRawMessage(draft)
    expect(raw).toContain('To: sync@example.com')
    expect(raw).toContain('From: doug@example.com')
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(raw).toContain('Content-Transfer-Encoding: base64')
    expect(raw).toContain('\r\n\r\n')
  })

  it('round-trips a body with real punctuation in it', () => {
    const body = 'Doug’s single — “Magic” — is a one-stop clear.\nRegards,\nDoug'
    const raw = buildRawMessage({ ...draft, body })
    const encoded = raw.split('\r\n\r\n')[1].replace(/\r\n/g, '')
    const bin = atob(encoded)
    expect(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))).toBe(body)
  })

  it('wraps the encoded body at 76 characters', () => {
    const raw = buildRawMessage({ ...draft, body: 'x'.repeat(500) })
    const lines = raw.split('\r\n\r\n')[1].split('\r\n')
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(76)
  })

  it('omits From entirely when there is none, rather than writing null', () => {
    expect(buildRawMessage({ ...draft, from: null })).not.toContain('From:')
  })
})

describe('encodeDraft', () => {
  it('is base64url with no padding, which is what the API wants', () => {
    const encoded = encodeDraft({ to: 'a@b.test', subject: 'Hi', body: 'Body' })
    expect(encoded).not.toMatch(/[+/=]/)
    expect(decode(encoded)).toContain('To: a@b.test')
  })
})

describe('planDrafts', () => {
  // Read, and said nothing either way: not a green light, but not a refusal,
  // and nothing the bulk action holds back. The terms cases are below.
  const base = {
    id: 1,
    name: 'Marmoset Music',
    contactEmail: 'sync@marmoset.test',
    pitchDraft: 'Hello',
    status: 'draft_ready',
    policyCheckedAt: '2026-10-01T00:00:00.000Z',
  }

  it('readies a target that has both an address and a pitch', () => {
    const plan = planDrafts([base])
    expect(plan.ready).toHaveLength(1)
    expect(plan.ready[0].subject).toBe(subjectFor('Marmoset Music'))
    expect(plan.skipped).toEqual([])
  })

  it('says why each skipped target was skipped', () => {
    // A bulk action that silently drafts four of seven leaves you wondering
    // which three — and the three answers each want something different done.
    const plan = planDrafts([
      { ...base, id: 2, pitchDraft: '   ' },
      { ...base, id: 3, contactEmail: null },
      { ...base, id: 4, status: 'pitched' },
    ])
    expect(plan.ready).toEqual([])
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      'no pitch drafted',
      'no contact address',
      'already pitched',
    ])
  })

  it('refuses to redraft something already pitched, before anything else', () => {
    // Drafting a second copy of a pitch already sent is the one outcome here
    // that is actively embarrassing, so it outranks the other checks.
    const plan = planDrafts([{ ...base, status: 'pitched', pitchDraft: null, contactEmail: null }])
    expect(plan.skipped[0].reason).toBe('already pitched')
  })

  it('treats whitespace as absent', () => {
    expect(planDrafts([{ ...base, contactEmail: '  ' }]).skipped[0].reason).toBe('no contact address')
  })

  describe('what their own site says about pitches', () => {
    const closed = { ...base, submissionPolicy: 'closed' }

    it('leaves out a target that says it takes no unsolicited pitches', () => {
      const plan = planDrafts([closed])
      expect(plan.ready).toEqual([])
      expect(plan.skipped[0].reason).toBe('says no unsolicited pitches')
    })

    it('leaves out a target nobody has checked, rather than drafting on a guess', () => {
      const plan = planDrafts([{ ...base, policyCheckedAt: null }])
      expect(plan.ready).toEqual([])
      expect(plan.skipped[0].reason).toBe('terms not checked yet')
    })

    it('lets through a target that invites submissions, and one that said nothing', () => {
      const plan = planDrafts([{ ...base, id: 5, submissionPolicy: 'open' }, { ...base, id: 6 }])
      expect(plan.ready.map((r) => r.id)).toEqual([5, 6])
    })

    it('lets through a refusal the artist read and chose to override', () => {
      const plan = planDrafts([{ ...closed, policyOverriddenAt: '2026-10-07T12:00:00.000Z' }])
      expect(plan.ready).toHaveLength(1)
    })

    it('still says "already pitched" first, since that is the more useful answer', () => {
      expect(planDrafts([{ ...closed, status: 'pitched' }]).skipped[0].reason).toBe('already pitched')
    })

    it('does not draft for a refusal that has no address or pitch either, and says the refusal', () => {
      // The reason that matters is the one that cannot be fixed by filling
      // something in.
      const plan = planDrafts([{ ...closed, contactEmail: null, pitchDraft: null }])
      expect(plan.skipped[0].reason).toBe('says no unsolicited pitches')
    })
  })
})
