import { describe, it, expect } from 'vitest'
import {
  isDigestDue,
  localParts,
  describeSchedule,
  nextRun,
  type Schedule,
} from '../shared/digestSchedule'

/** Monday 08:00 in Winnipeg, which is what the old hardcoded cron meant. */
const MON8: Schedule = { day: 'mon', hour: 8, timezone: 'America/Winnipeg' }

/** Winnipeg is UTC−5 in summer (CDT), so 13:00Z is 08:00 local. */
const monday8am = new Date('2026-08-31T13:00:00.000Z')

describe('localParts', () => {
  it('reads the local clock, not the server clock', () => {
    expect(localParts(monday8am, 'America/Winnipeg')).toMatchObject({
      day: 'mon',
      hour: 8,
      date: '2026-08-31',
    })
    // Same instant, a different day and hour somewhere else.
    expect(localParts(monday8am, 'Australia/Sydney')).toMatchObject({ day: 'mon', hour: 23 })
  })

  it('reads midnight as hour zero rather than 24', () => {
    expect(localParts(new Date('2026-09-01T05:00:00.000Z'), 'America/Winnipeg').hour).toBe(0)
  })
})

describe('isDigestDue', () => {
  it('sends on the configured day and hour', () => {
    expect(isDigestDue({ now: monday8am, schedule: MON8, lastSentAt: null })).toMatchObject({
      due: true,
      reason: 'due',
    })
  })

  it('stays quiet on the wrong day', () => {
    const tuesday = new Date('2026-09-01T13:00:00.000Z')
    expect(isDigestDue({ now: tuesday, schedule: MON8, lastSentAt: null }).reason).toBe('wrong-day')
  })

  it('stays quiet before the hour', () => {
    const monday7am = new Date('2026-08-31T12:00:00.000Z')
    expect(isDigestDue({ now: monday7am, schedule: MON8, lastSentAt: null }).reason).toBe('too-early')
  })

  it('still sends later that day when a tick is missed', () => {
    // An exact hour match means one cold start costs a whole week. A deploy
    // landing on the hour, or Cloudflare running the trigger late, must not
    // skip the digest.
    const monday2pm = new Date('2026-08-31T19:00:00.000Z')
    expect(isDigestDue({ now: monday2pm, schedule: MON8, lastSentAt: null }).due).toBe(true)
  })

  it('sends once a day, not every hour after the hour', () => {
    const sentAt = monday8am.toISOString()
    const monday9am = new Date('2026-08-31T14:00:00.000Z')
    expect(isDigestDue({ now: monday9am, schedule: MON8, lastSentAt: sentAt }).reason).toBe(
      'already-sent-today',
    )
  })

  it('sends again the following week', () => {
    const lastWeek = new Date('2026-08-24T13:00:00.000Z').toISOString()
    expect(isDigestDue({ now: monday8am, schedule: MON8, lastSentAt: lastWeek }).due).toBe(true)
  })

  it('does not double-send when the clocks go back', () => {
    // 2026-11-01 is the DST change in Winnipeg; 01:00–02:00 local happens
    // twice. Comparing local *dates* rather than elapsed hours is what keeps
    // that from being two sends.
    const dstSchedule: Schedule = { day: 'sun', hour: 1, timezone: 'America/Winnipeg' }
    const firstPass = new Date('2026-11-01T06:30:00.000Z')
    const secondPass = new Date('2026-11-01T07:30:00.000Z')
    expect(isDigestDue({ now: firstPass, schedule: dstSchedule, lastSentAt: null }).due).toBe(true)
    expect(
      isDigestDue({ now: secondPass, schedule: dstSchedule, lastSentAt: firstPass.toISOString() })
        .reason,
    ).toBe('already-sent-today')
  })

  it('holds the local hour across a daylight-saving change', () => {
    // The old cron was a fixed UTC hour, so 08:00 Winnipeg in summer became
    // 07:00 in winter. Applying the zone at comparison time fixes that.
    const winterMonday8am = new Date('2026-12-07T14:00:00.000Z') // CST, UTC−6
    expect(isDigestDue({ now: winterMonday8am, schedule: MON8, lastSentAt: null }).due).toBe(true)
    const winterMonday7am = new Date('2026-12-07T13:00:00.000Z')
    expect(isDigestDue({ now: winterMonday7am, schedule: MON8, lastSentAt: null }).reason).toBe(
      'too-early',
    )
  })
})

describe('describeSchedule', () => {
  it('reads as a sentence, with a padded hour', () => {
    expect(describeSchedule(MON8)).toBe('Mondays at 08:00')
    expect(describeSchedule({ ...MON8, day: 'fri', hour: 17 })).toBe('Fridays at 17:00')
  })
})

describe('nextRun', () => {
  it('finds the next firing within the week', () => {
    const wednesday = new Date('2026-09-02T15:00:00.000Z')
    const next = nextRun(wednesday, MON8, null)!
    expect(localParts(next, MON8.timezone)).toMatchObject({ day: 'mon', hour: 8 })
  })

  it('skips today once today has already sent', () => {
    const next = nextRun(monday8am, MON8, monday8am.toISOString())!
    expect(localParts(next, MON8.timezone).date).toBe('2026-09-07')
  })
})
