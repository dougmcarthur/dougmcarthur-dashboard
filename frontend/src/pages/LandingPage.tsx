import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { type PublicCategory, type PublicOpportunity } from '../../../shared/opportunityCatalog'
import { INVITE_REQUEST_LIMITS, UNHANDLED_RETENTION_DAYS } from '../../../shared/inviteRequests'
import { Button } from '../components/ui/Button'
import { FIELD } from '../components/ui/Field'
import { Card, Label } from '../components/ui/Surface'

/**
 * What a stranger sees: what Sun Dogs Music Scout is, a live sample of what it
 * finds, and a way to ask in.
 *
 * The sample is real — a few open calls from the shared catalog, mixed across
 * the categories — laid out the way the app lays them out, and faded at the
 * bottom so it reads as an example rather than a feed. It comes from
 * `/api/public/opportunities`, which reads a table with no column for anything
 * an artist decided.
 *
 * Scout is invite-only, so the call to action is a request rather than a
 * sign-up: a name, an address and why. It creates nothing. The owner reads it
 * and, if it fits, sends a real invitation.
 */

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const WHAT_IT_DOES: Array<{ title: string; body: string }> = [
  {
    title: 'Finds the opportunities',
    body: 'Festivals, showcases, grants and sync libraries, gathered from calls for submissions, arts councils and music associations across the country.',
  },
  {
    title: 'Tells you which are worth it',
    body: 'Every opportunity arrives as a card to apply to or pass on, with the deadline, the cost of getting there, and any paperwork that takes months — like a US work visa.',
  },
  {
    title: 'Drafts the paperwork',
    body: 'Application answers, pitches and replies are drafted from your artist profile. You read them, you send them. Scout never submits or emails anything for you.',
  },
  {
    title: 'Keeps track of the waiting',
    body: 'Deadlines, replies you owe and applications that have gone quiet surface when they matter, on your calendar or as tasks.',
  },
]

export function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <p className="font-semibold text-ink text-sm tracking-tight">
            Scout <span className="text-faint font-normal">— Sun Dogs Music</span>
          </p>
          <Button variant="neutral" onClick={onSignIn}>
            Sign in
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-16">
        <section className="space-y-5 max-w-3xl">
          <p className="inline-flex items-center rounded-full border border-line-strong px-3 py-1 text-xs font-medium text-muted">
            Invite-only, while we test it
          </p>
          <h1 className="text-4xl sm:text-5xl font-semibold text-ink tracking-tight leading-tight">
            Sun Dogs Music Scout finds the gigs, grants and sync calls worth your time.
          </h1>
          <p className="text-lg text-body max-w-2xl">
            A research assistant and application desk for independent musicians. It gathers opportunities, helps
            you decide which to go after, drafts the paperwork from your profile, and keeps track of what you’re
            waiting to hear back on.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <a
              href="#request"
              onClick={(e) => {
                e.preventDefault()
                document.getElementById('request')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="inline-flex items-center rounded-md bg-accent text-accent-fg hover:bg-accent-hover px-4 py-2 text-sm font-semibold transition-colors"
            >
              Request an invitation
            </a>
            <a
              href="#found"
              onClick={(e) => {
                e.preventDefault()
                document.getElementById('found')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="inline-flex items-center rounded-md border border-line-strong text-body hover:bg-sunken hover:text-ink px-4 py-2 text-sm transition-colors"
            >
              See an example
            </a>
          </div>
        </section>

        <section aria-labelledby="what" className="space-y-6">
          <h2 id="what" className="text-2xl font-semibold text-ink tracking-tight">
            What it does
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {WHAT_IT_DOES.map((w) => (
              <Card key={w.title} pad="md" className="space-y-2">
                <h3 className="text-base font-semibold text-ink">{w.title}</h3>
                <p className="text-sm text-body leading-relaxed">{w.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <SamplePreview />

        <RequestInvitation />
      </main>

      <footer className="border-t border-line">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <p>Sun Dogs Music Scout</p>
          <p>Questions: hello@sundogsmusic.ca</p>
        </div>
      </footer>
    </div>
  )
}

const CATEGORY: Record<PublicCategory, { label: string; className: string }> = {
  festival: { label: 'Festival', className: 'bg-cat-violet-bg text-cat-violet-fg border-cat-violet-line' },
  showcase: { label: 'Showcase', className: 'bg-cat-sky-bg text-cat-sky-fg border-cat-sky-line' },
  funding: { label: 'Funding', className: 'bg-cat-teal-bg text-cat-teal-fg border-cat-teal-line' },
  sync: { label: 'Sync', className: 'bg-cat-orange-bg text-cat-orange-fg border-cat-orange-line' },
}

function CategoryPill({ category }: { category: PublicCategory }) {
  const c = CATEGORY[category]
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${c.className}`}>
      {c.label}
    </span>
  )
}

/**
 * The fee as the listing stated it — "$1,200 USD" — or a dash. Never "Free":
 * nothing stated is not the same as nothing charged, and which way a stated
 * fee flows is not something the catalog claims to know.
 */
function feeText(o: PublicOpportunity): string {
  if (o.feeAmount === null) return '—'
  const amount = o.feeAmount.toLocaleString('en-CA', { maximumFractionDigits: 2 })
  return `$${amount}${o.feeCurrency ? ` ${o.feeCurrency}` : ''}`
}

/** "Nov 7", with the year when it is not this year; the prose note when there is no date. */
function closesText(o: PublicOpportunity, asOf: string): { text: string; note: boolean } {
  if (o.deadline) {
    const [y, m, d] = o.deadline.split('-').map(Number)
    return { text: `${MONTH[m - 1]} ${d}${String(y) !== asOf.slice(0, 4) ? `, ${y}` : ''}`, note: false }
  }
  if (o.deadlineNote) return { text: o.deadlineNote, note: true }
  return { text: 'Open', note: true }
}

/**
 * A few real entries, in a small version of the app's own table — category,
 * fee and closing date beside each name — faded at the bottom so it reads as
 * an example of what members see rather than the list itself.
 */
function SamplePreview() {
  const listings = useQuery({ queryKey: ['public', 'opportunities'], queryFn: api.publicSite.opportunities })
  const rows = listings.data?.sample ?? []
  const asOf = listings.data?.asOf ?? ''

  return (
    <section id="found" aria-labelledby="found-title" className="space-y-6 scroll-mt-6">
      <div className="space-y-1">
        <h2 id="found-title" className="text-2xl font-semibold text-ink tracking-tight">
          A look inside
        </h2>
        <p className="text-sm text-muted">
          A sample of real open calls Scout has gathered. Members see the whole list, sorted by what needs them first.
        </p>
      </div>

      {listings.isLoading ? (
        <div className="h-80 rounded-xl border border-line bg-surface animate-pulse" />
      ) : listings.error || rows.length === 0 ? (
        <p className="text-sm text-muted">The example couldn’t be loaded just now.</p>
      ) : (
        <div className="relative rounded-xl border border-line bg-surface shadow-raised overflow-hidden" aria-label="Example of Scout’s opportunity list">
          {/* The window's top bar: enough chrome to say "this is the app". */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-line bg-sunken">
            <div className="flex items-center gap-2">
              <span className="flex gap-1.5" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              </span>
              <span className="ml-2 text-xs font-medium text-body">Opportunities</span>
            </div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Example</span>
          </div>

          {/* A phone gets two fixed lines per entry rather than the table: the
              name and when it closes, then the category, place and fee. Folding
              the table's columns into a wrapping line put the fee wherever it
              happened to land. */}
          <ul className="sm:hidden divide-y divide-line">
            {rows.map((o, i) => {
              const closes = closesText(o, asOf)
              const fee = feeText(o)
              return (
                <li key={`${o.name}-${i}`} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium text-sm text-ink truncate min-w-0">{o.name}</p>
                    <p className={`shrink-0 max-w-[7rem] truncate text-right ${closes.note ? 'text-xs text-muted' : 'text-sm text-body'}`}>
                      {closes.text}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted">
                    <div className="flex items-center gap-2 min-w-0">
                      <CategoryPill category={o.category} />
                      {o.location && <span className="truncate">{o.location}</span>}
                    </div>
                    {fee !== '—' && <span className="shrink-0 text-body tabular-nums">{fee}</span>}
                  </div>
                </li>
              )
            })}
          </ul>

          <table className="hidden sm:table w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-line">
                <th scope="col" className="px-4 py-2 font-medium">Opportunity</th>
                <th scope="col" className="px-3 py-2 font-medium">Category</th>
                <th scope="col" className="px-3 py-2 font-medium">Fee</th>
                <th scope="col" className="px-4 py-2 font-medium text-right">Closes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((o, i) => {
                const closes = closesText(o, asOf)
                const where = [o.organizer && o.organizer !== o.name ? o.organizer : null, o.location].filter(Boolean).join(' · ')
                return (
                  <tr key={`${o.name}-${i}`}>
                    <td className="px-4 py-2.5 align-top">
                      <p className="font-medium text-ink leading-snug">{o.name}</p>
                      {where && <p className="text-xs text-muted mt-0.5">{where}</p>}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <CategoryPill category={o.category} />
                    </td>
                    <td className="px-3 py-2.5 align-top text-body whitespace-nowrap">{feeText(o)}</td>
                    <td className={`px-4 py-2.5 align-top text-right ${closes.note ? 'text-xs text-muted' : 'text-body whitespace-nowrap'}`}>
                      <span className="inline-block max-w-[12rem] truncate align-top" title={closes.text}>
                        {closes.text}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* The fade: the list keeps going, and this is where the example stops. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-b from-surface/0 via-surface/80 to-surface flex items-end justify-center pb-5"
            aria-hidden
          >
            <span className="text-xs font-medium text-muted">An example — members see the full list</span>
          </div>
        </div>
      )}
    </section>
  )
}

function RequestInvitation() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  // Never shown. A person leaves it empty; a form-filling script does not.
  const [website, setWebsite] = useState('')

  const send = useMutation({
    mutationFn: () => api.publicSite.requestInvite({ name: name.trim(), email: email.trim(), message: message.trim(), website }),
  })

  const tooShort = message.trim().length < INVITE_REQUEST_LIMITS.messageMin

  return (
    <section id="request" aria-labelledby="request-title" className="scroll-mt-6">
      <Card pad="md" className="max-w-2xl space-y-5">
        <div className="space-y-2">
          <h2 id="request-title" className="text-2xl font-semibold text-ink tracking-tight">
            Request an invitation
          </h2>
          <p className="text-sm text-body">
            Scout is invite-only while we test it with a small group of artists. Tell us a little about yourself and
            we’ll reply by email.
          </p>
        </div>

        {send.isSuccess ? (
          <div className="rounded-lg border border-success-line bg-success-bg px-4 py-3 space-y-1" role="status">
            <p className="text-sm font-medium text-success-fg">Thanks, {name.trim().split(' ')[0] || 'friend'} — your request is in.</p>
            <p className="text-sm text-body">We’ll reply to {email.trim()}.</p>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!tooShort) send.mutate()
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="req-name">Your name</Label>
                <input
                  id="req-name"
                  className={FIELD}
                  required
                  autoComplete="name"
                  maxLength={INVITE_REQUEST_LIMITS.name}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="req-email">Email</Label>
                <input
                  id="req-email"
                  type="email"
                  className={FIELD}
                  required
                  autoComplete="email"
                  maxLength={INVITE_REQUEST_LIMITS.email}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="req-message">Why do you want to try Scout?</Label>
              <textarea
                id="req-message"
                className={FIELD}
                required
                rows={4}
                maxLength={INVITE_REQUEST_LIMITS.message}
                placeholder="What you play, where you’re based, and what you’re hoping it helps with."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            {/* The honeypot: off-screen, out of the tab order, ignored by screen readers. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" size="md" disabled={send.isPending || !name.trim() || !email.trim() || tooShort}>
                {send.isPending ? 'Sending…' : 'Request an invitation'}
              </Button>
              {send.error && (
                <p className="text-sm text-danger-fg">
                  {send.error instanceof Error ? send.error.message : 'That didn’t go through. Please try again.'}
                </p>
              )}
            </div>
            <p className="text-xs text-muted">
              We use this only to reply to you. Requests are deleted within {Math.round(UNHANDLED_RETENTION_DAYS / 30)} months,
              sooner once we’ve answered.
            </p>
          </form>
        )}
      </Card>
    </section>
  )
}
