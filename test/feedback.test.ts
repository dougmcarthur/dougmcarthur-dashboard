import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describeBrowser, describeContext, routeLabel, safePath, type FeedbackContext } from '../shared/feedback'
import { FeedbackSchema } from '../src/routes/feedback'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const CONTEXT: FeedbackContext = {
  page: 'review',
  section: 'conflict',
  trail: ['overview', 'gigs'],
  errors: [{ at: '2026-09-26T12:00:00.000Z', what: 'PATCH /gigs/41', status: 400, message: 'refused' }],
  build: 'abc1234',
  viewport: '1440×900',
  theme: 'dark',
  timeZone: 'America/Winnipeg',
  browser: 'Firefox on macOS',
}

describe('feedback context', () => {
  it('names the page rather than printing its route id', () => {
    const [page] = describeContext(CONTEXT)
    expect(page).toEqual({ label: 'Page', value: 'Review — Conflict' })
    expect(routeLabel('#runs')).toBe('History')
    expect(routeLabel('#some-new-page')).toBe('Some new page')
  })

  // A query string is where OAuth puts its code, and `#settings?google=…` is
  // where the connect round trip lands. Neither belongs in a message.
  it('drops query strings from routes and paths', () => {
    expect(routeLabel('#settings/connections?google=connected')).toBe('Settings — Connections')
    expect(safePath('/gmail/callback?code=4/0Asecret&state=x')).toBe('/gmail/callback')
  })

  it('says there were no errors rather than leaving the line out', () => {
    const lines = describeContext({ ...CONTEXT, errors: [] })
    expect(lines.find((l) => l.label === 'Recent errors')?.value).toBe('None in this tab')
  })

  it('reduces a user-agent string to a browser and a platform', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    expect(describeBrowser(ua)).toBe('Safari on macOS')
  })

  it('refuses a context carrying anything the form did not show', () => {
    const ok = FeedbackSchema.safeParse({ kind: 'broken', message: 'The button did nothing', context: CONTEXT })
    expect(ok.success).toBe(true)
    const extra = FeedbackSchema.safeParse({
      kind: 'broken',
      message: 'x',
      context: { ...CONTEXT, errors: Array(6).fill(CONTEXT.errors[0]) },
    })
    expect(extra.success).toBe(false)
  })
})

/**
 * Source-level, like test/uiConsistency.test.ts: these typecheck and render
 * whichever way they go.
 */
describe('feedback stays a form, not telemetry', () => {
  // The rule the whole feature rests on: what the owner reads is the list the
  // sender read. Two renderings would drift.
  it('renders the context through describeContext on both sides of the send', () => {
    expect(read('frontend/src/components/FeedbackModal.tsx')).toMatch(/describeContext\(context\)/)
    expect(read('frontend/src/components/FeedbackInbox.tsx')).toMatch(/describeContext\(item\.context\)/)
  })

  it('keeps the error log in memory, never in storage or on the wire by itself', () => {
    const diagnostics = read('frontend/src/diagnostics.ts')
    expect(diagnostics).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(|sendBeacon/)
  })

  it('is opened on request only — nothing opens the form on its own', () => {
    const layout = read('frontend/src/components/Layout.tsx')
    const opens = [...layout.matchAll(/setFeedbackOpen\(true\)/g)]
    // The header menu's callback and the drawer's button; both are clicks.
    expect(opens.length).toBeLessThanOrEqual(2)
    expect(read('frontend/src/components/FeedbackModal.tsx')).not.toMatch(/setTimeout|setInterval/)
  })
})
