import { Hono } from 'hono'
import { calendarConfigured } from '../lib/googleCalendar'
import { gmailConfigured } from '../lib/gmail'
import { mailerConfigured } from '../lib/mailer'
import { readCredentialHealth, runCredentialChecks } from '../lib/credentialCheck'
import { readGrant } from '../lib/googleGrant'
import { tenantOf, type AppEnv } from '../context'

const health = new Hono<AppEnv>()

/**
 * What is configured, and what is known about whether it works.
 *
 * The read is cheap on purpose: it touches `app_settings` and never Google.
 * Probing on every render would put a network call behind a screen that is
 * opened to *look* at things, and would spend a refresh on every glance. The
 * probe runs on the cron, and on the button below.
 *
 * The `*Configured` booleans stay exactly as they were. They still mean "the
 * secrets are set", which is the right answer to the question they ask and the
 * wrong answer to "does it work" — `credentials` is where the second question
 * is answered now.
 */
health.get('/', async (c) => {
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
    // The digest sender is a binding, not a secret — it is either declared in
    // wrangler.toml or it is not, so there is no list of missing keys.
    emailConfigured: mailerConfigured(c.env),
    credentials: await readCredentialHealth(c.env, new Date()),
    // The calendar has two possible ways in and they answer differently. The
    // secrets above are a deployment fact; this is the artist's own grant, and
    // when it exists it is the one that gets used. Reported separately rather
    // than folded together, because "you connected this" and "somebody set a
    // secret on the server" are different claims and the card says which.
    calendarGrant: await readGrant(c.env, tenantOf(c), 'calendar'),
  })
})

/**
 * Check now.
 *
 * A write rather than a read because it spends a refresh token and records the
 * answer, and because a GET that has side effects is one something will
 * pre-fetch. It needs no passkey touch: it changes nothing about who can sign
 * in, and the worst it can do is tell you the truth about a credential you
 * already hold.
 */
health.post('/check', async (c) => {
  return c.json({ credentials: await runCredentialChecks(c.env, new Date()) })
})

export default health
