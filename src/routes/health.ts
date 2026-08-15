import { Hono } from 'hono'
import { calendarConfigured } from '../lib/googleCalendar'
import { gmailConfigured, gmailSendConfigured } from '../lib/gmail'
import type { Env } from '../types'

const health = new Hono<{ Bindings: Env }>()

health.get('/', (c) => {
  const cal = calendarConfigured(c.env)
  const gmail = gmailConfigured(c.env)
  const gmailSend = gmailSendConfigured(c.env)

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

  const sendMissing: string[] = []
  if (!gmailSend) {
    if (!c.env.GOOGLE_CLIENT_ID) sendMissing.push('GOOGLE_CLIENT_ID')
    if (!c.env.GOOGLE_CLIENT_SECRET) sendMissing.push('GOOGLE_CLIENT_SECRET')
    if (!c.env.GMAIL_SEND_REFRESH_TOKEN && !c.env.GMAIL_REFRESH_TOKEN) {
      sendMissing.push('GMAIL_SEND_REFRESH_TOKEN')
    }
    if (!c.env.NOTIFY_EMAIL) sendMissing.push('NOTIFY_EMAIL')
  }

  return c.json({
    calendarConfigured: cal,
    calendarMissingSecrets: calMissing,
    gmailConfigured: gmail,
    gmailMissingSecrets: gmailMissing,
    // Reminder emails
    emailConfigured: gmailSend,
    emailMissingSecrets: sendMissing,
    // Application-answer drafting (falls back to profile matching without it)
    answerDraftingConfigured: !!c.env.ANTHROPIC_API_KEY,
  })
})

export default health
