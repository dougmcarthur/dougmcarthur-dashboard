import { Hono } from 'hono'
import { calendarConfigured } from '../lib/googleCalendar'
import { gmailConfigured } from '../lib/gmail'
import type { Env } from '../types'

const health = new Hono<{ Bindings: Env }>()

health.get('/', (c) => {
  const cal = calendarConfigured(c.env)
  const gmail = gmailConfigured(c.env)

  const calMissing = cal
    ? []
    : (['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_CALENDAR_ID'] as const).filter(
        (k) => !c.env[k],
      )

  const gmailMissing = gmail
    ? []
    : (['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'] as const).filter(
        (k) => !c.env[k],
      )

  return c.json({
    calendarConfigured: cal,
    calendarMissingSecrets: calMissing,
    gmailConfigured: gmail,
    gmailMissingSecrets: gmailMissing,
  })
})

export default health
