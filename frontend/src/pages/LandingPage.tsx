import { useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { PUBLIC_CATEGORIES, type PublicOpportunity } from '../../../shared/opportunityCatalog'
import { INVITE_REQUEST_LIMITS, UNHANDLED_RETENTION_DAYS } from '../../../shared/inviteRequests'
import { Button } from '../components/ui/Button'
import { FIELD } from '../components/ui/Field'
import { Card, Label } from '../components/ui/Surface'

/**
 * What a stranger sees: what Sun Dogs Music Scout is, a live sample of what it
 * finds, and a way to ask in.
 *
 * The lists are the real catalog — the most recent calls in each category that
 * have not closed — because "we find opportunities" is a claim, and ten of
 * them is the evidence. They come from `/api/public/opportunities`, which reads
 * a table with no column for anything an artist decided.
 *
 * Scout is invite-only, so the call to action is a request rather than a
 * sign-up: a name, an address and why. It creates nothing. The owner reads it
 * and, if it fits, sends a real invitation.
 */

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function closes(o: PublicOpportunity): string | null {
  if (o.deadline) {
    const [, m, d] = o.deadline.split('-').map(Number)
    return `Closes ${MONTH[m - 1]} ${d}`
  }
  return o.deadlineNote
}

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
              See what it’s found
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

        <FoundLists />

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

function FoundLists() {
  const listings = useQuery({ queryKey: ['public', 'opportunities'], queryFn: api.publicSite.opportunities })

  return (
    <section id="found" aria-labelledby="found-title" className="space-y-6 scroll-mt-6">
      <div className="space-y-1">
        <h2 id="found-title" className="text-2xl font-semibold text-ink tracking-tight">
          Recently found
        </h2>
        <p className="text-sm text-muted">
          The latest open calls Scout has gathered, ten in each category. Each links to the organiser’s own page.
        </p>
      </div>

      {listings.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {PUBLIC_CATEGORIES.map((c) => (
            <div key={c.id} className="h-64 rounded-xl border border-line bg-surface animate-pulse" />
          ))}
        </div>
      ) : listings.error ? (
        <p className="text-sm text-muted">The list couldn’t be loaded just now. Try again in a minute.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {PUBLIC_CATEGORIES.map((c) => (
            <CategoryList key={c.id} title={c.label} items={listings.data?.categories[c.id] ?? []} sync={c.id === 'sync'} />
          ))}
        </div>
      )}
    </section>
  )
}

function CategoryList({ title, items, sync }: { title: string; items: PublicOpportunity[]; sync: boolean }) {
  return (
    <Card as="section" pad="none" clip>
      <h3 className="px-4 py-3 text-sm font-semibold text-ink border-b border-line bg-sunken">{title}</h3>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">Nothing new here yet — check back soon.</p>
      ) : (
        <ol className="divide-y divide-line">
          {items.map((o, i) => (
            <li key={`${o.name}-${i}`} className="px-4 py-2.5">
              <Row o={o} sync={sync} />
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function Row({ o, sync }: { o: PublicOpportunity; sync: boolean }) {
  // A date goes in the right-hand column; prose about the deadline ("rolling
  // intake") joins the line under the name, where it can wrap without
  // squeezing the title.
  const meta = sync
    ? [o.kind ? o.kind[0].toUpperCase() + o.kind.slice(1) : null]
    : [o.organizer && o.organizer !== o.name ? o.organizer : null, o.location, o.deadline ? null : o.deadlineNote]
  const when = sync || !o.deadline ? null : closes(o)
  const name: ReactNode = o.url ? (
    <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-ink hover:text-accent underline-offset-2 hover:underline">
      {o.name}
    </a>
  ) : (
    <span className="text-ink">{o.name}</span>
  )
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        {meta.some(Boolean) && <p className="text-xs text-muted line-clamp-2">{meta.filter(Boolean).join(' · ')}</p>}
      </div>
      {when && <p className="shrink-0 text-xs text-muted whitespace-nowrap">{when}</p>}
    </div>
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
