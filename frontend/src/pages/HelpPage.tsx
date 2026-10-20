import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { Caption, Card } from '../components/ui/Surface'
import { Button } from '../components/ui/Button'
import { OnboardingCard } from '../components/OnboardingCard'
import { OnboardingFlow, type FlowScreen } from '../components/OnboardingFlow'
import { FeedbackModal } from '../components/FeedbackModal'
import { themeCredit } from '../../../shared/themes'

/**
 * How Scout works, written for the person using it.
 *
 * In the app rather than on a separate site, so it ships with the code it
 * describes and cannot describe a version that is not running. Short on
 * purpose: organized into thematic sections, and the rules Scout keeps that
 * somebody would otherwise have to discover — it never sends, never submits,
 * and what each Google permission is for.
 */
export function HelpPage() {
  const qc = useQueryClient()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [flow, setFlow] = useState<FlowScreen | null>(null)
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: api.onboarding.read })
  const show = useMutation({
    mutationFn: api.onboarding.show,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
  })

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Help</h1>
        <p className="text-sm text-body leading-relaxed">
          Scout finds opportunities for independent Canadian musicians: festivals, showcases,
          grants, sync briefs. It helps you decide which are worth it, drafts the paperwork from
          your profile, and keeps track of what you are waiting on. It never sends or submits
          anything on your behalf.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="primary" onClick={() => setFeedbackOpen(true)}>
            Send feedback
          </Button>
          {onboarding.data?.hidden && (
            <Button variant="neutral" onClick={() => show.mutate()} disabled={show.isPending}>
              Show the checklist on the Overview again
            </Button>
          )}
        </div>
        <nav aria-label="Quick jump" className="flex flex-wrap gap-1.5 pt-2 border-t border-line">
          <button
            type="button"
            onClick={() => scrollTo('canadian-artists')}
            className="text-xs px-2.5 py-1 rounded-md bg-raised border border-line text-muted hover:text-ink hover:bg-hover transition-colors"
          >
            Canadian artists
          </button>
          <button
            type="button"
            onClick={() => scrollTo('the-screens')}
            className="text-xs px-2.5 py-1 rounded-md bg-raised border border-line text-muted hover:text-ink hover:bg-hover transition-colors"
          >
            The screens
          </button>
          <button
            type="button"
            onClick={() => scrollTo('workflow')}
            className="text-xs px-2.5 py-1 rounded-md bg-raised border border-line text-muted hover:text-ink hover:bg-hover transition-colors"
          >
            Workflow & rules
          </button>
          <button
            type="button"
            onClick={() => scrollTo('connections-and-security')}
            className="text-xs px-2.5 py-1 rounded-md bg-raised border border-line text-muted hover:text-ink hover:bg-hover transition-colors"
          >
            Connections & display
          </button>
          <button
            type="button"
            onClick={() => scrollTo('privacy-and-terms')}
            className="text-xs px-2.5 py-1 rounded-md bg-raised border border-line text-muted hover:text-ink hover:bg-hover transition-colors"
          >
            Privacy & terms
          </button>
        </nav>
      </header>

      {onboarding.data && <OnboardingCard state={onboarding.data} showDone onStart={setFlow} />}
      {flow && onboarding.data && (
        <OnboardingFlow state={onboarding.data} startAt={flow} onClose={() => setFlow(null)} />
      )}

      {/* Section 1: Canadian Focus & Invariants */}
      <Card id="canadian-artists" as="section" pad="md" className="space-y-4 text-sm text-body leading-relaxed">
        <h2 className="text-base font-semibold text-ink">Made for Canadian artists</h2>
        <p>
          Scout looks first at what Canadian artists apply for: provincial and federal funding,
          the music associations in each province, and festivals and showcases across the country.
          Costs are in Canadian dollars, and a date abroad comes with the paperwork it needs,
          like a US work permit for a paid booking.
        </p>
        <p>
          Playing abroad is welcome. Opportunities outside Canada are never left out; they are
          shown with what it takes to get there.
        </p>
        <p>
          What you told Scout in the welcome questions decides the order, and nothing else. What you
          asked it to help with comes first, and within that, what is inside the reach you chose,
          counting from the place you set as home in Settings. A call beyond your reach is marked
          and comes after the rest. Nothing is ever hidden because of it, and a deadline that is
          close still outranks both.
        </p>
        <div className="pt-2 border-t border-line space-y-2">
          <Caption>What Scout will not do</Caption>
          <ul className="list-disc pl-5 space-y-1 text-xs text-muted">
            <li>Submit an application. It stages an answer for each field; you copy them into the form.</li>
            <li>Send an email. Drafts are copied, or opened in your own mail with your Send button as the last step.</li>
            <li>Change a status because an email arrived. It suggests; you decide.</li>
          </ul>
        </div>
      </Card>

      {/* Section 2: Screens & Workflow */}
      <Card id="the-screens" as="section" pad="md" className="space-y-5 text-sm text-body leading-relaxed">
        <div>
          <h2 className="text-base font-semibold text-ink mb-3">The screens</h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <ScreenCard name="Overview" href="#overview">
              What needs you today. New opportunities dealt as cards beside upcoming deadlines and replies.
            </ScreenCard>
            <ScreenCard name="Review" href="#review">
              The full queue with filters: new, in progress, waiting on them, conflicts, and quiet calls.
            </ScreenCard>
            <ScreenCard name="Gigs" href="#gigs">
              Every opportunity in one table. Add one you already know about with <em>New gig</em>.
            </ScreenCard>
            <ScreenCard name="Artist" href="#artist">
              Your profile: bio, links, photos, facts, and documents. Powers every draft and application.
            </ScreenCard>
            <ScreenCard name="Sync" href="#sync">
              Music supervisors and briefs to pitch, with a short pitch drafted for each.
            </ScreenCard>
            <ScreenCard name="Promo" href="#promo">
              Promotion drafts, month by month, ready to copy into your outreach channels.
            </ScreenCard>
            <ScreenCard name="History" href="#runs">
              Everything that happened, by day: research run findings, digests, and mail replies.
            </ScreenCard>
            <ScreenCard name="Settings" href="#settings">
              Connections, reminders, weekly digest, passkeys, account security, and appearance.
            </ScreenCard>
          </div>
        </div>

        <div id="workflow" className="pt-3 border-t border-line space-y-3">
          <h3 className="text-sm font-semibold text-ink">How an opportunity moves</h3>
          <p>
            Every opportunity is in one of four stages. <strong>New</strong> — decide whether to
            apply. <strong>In progress</strong> — you said yes and are preparing it.{' '}
            <strong>Applied</strong> — it went out and you are waiting; if they ask for more, or make
            an offer, it is flagged so the ball is visibly back with you. <strong>Closed</strong> —
            accepted, not selected, passed, missed or withdrawn.
          </p>
          <p>
            An offer is not a booking. Nothing reaches your calendar until it is accepted — a signed
            contract, or a written confirmation for a grant.
          </p>
          <p>
            Passing is about that one intake, not the programme. When a grant or call you passed on
            or missed opens again, Scout adds it as a new opportunity and tells you in the bell.
            Delete the row if you never want to see it again.
          </p>
        </div>
      </Card>

      {/* Section 3: Connections, Security & Display */}
      <Card id="connections-and-security" as="section" pad="md" className="space-y-5 text-sm text-body leading-relaxed">
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-ink">Connecting Google</h2>
          <p>
            One button in Settings connects Calendar, Tasks, Drive and — only if you choose —
            Gmail drafts. Scout explains each permission before Google asks, and you can connect
            without Gmail.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-xs text-muted">
            <li><strong>Calendar</strong> — Scout makes its own calendar and can only touch that one.</li>
            <li><strong>Tasks</strong> — deadlines and replies you owe become tasks on one list.</li>
            <li><strong>Drive</strong> — Scout sees only the folder it creates and files you pick.</li>
            <li>
              <strong>Gmail</strong> — puts drafts in your drafts folder. Google&rsquo;s permission
              would also allow sending; Scout has no code that sends.
            </li>
          </ul>
        </div>

        <div className="pt-3 border-t border-line space-y-2">
          <h3 className="text-sm font-semibold text-ink">Signing in</h3>
          <p>
            Scout uses passkeys — Touch ID, Face ID, your screen lock or a password manager — rather
            than passwords. Add a second one on another device from Settings → Account, so losing a
            phone is not a problem.
          </p>
          <p>
            If you lose every passkey, the sign-in screen can email a setup code to the address on
            your account. The code only adds a new passkey; it is never a login on its own. A few
            actions — adding or removing a passkey, issuing an agent token — ask for your passkey
            again, because they change who can get into your account.
          </p>
        </div>

        <div id="display-and-themes" className="pt-3 border-t border-line space-y-2">
          <h3 className="text-sm font-semibold text-ink">Looking after your eyes</h3>
          <p>
            Settings, then Appearance, holds a colour theme, light or dark, text size, a typeface,
            higher contrast and reduced motion. The themes under the first heading are a matter of
            taste. The four under Accessible themes are made for a need: High contrast, with the
            strongest text and firm lines; Colour-blind safe, which uses blue, gold and rose in
            place of green, ochre and clay so that the three stay apart for every kind of colour
            blindness; Greyscale, with no colour at all, where go, waiting and broken differ in
            lightness; and Low glare, a dim, warm page with no white and no stark text, for light
            sensitivity and migraine.
          </p>
          <p>
            A device that asks for more contrast gets High contrast until you choose a theme of your
            own. The colour theme follows your account onto every device you sign in from; light or
            dark, text size and the other settings are kept on each device.
          </p>
          <p className="text-xs text-muted">{themeCredit()}</p>
        </div>
      </Card>

      {/* Section 4: Privacy & Terms */}
      <Card id="privacy-and-terms" as="section" pad="md" className="space-y-3 text-sm text-body leading-relaxed">
        <h2 className="text-base font-semibold text-ink">Your information, privacy and terms</h2>
        <p>
          The privacy policy says what Sun Dogs Music Scout collects, which other companies handle
          it, how long it is kept, and how to see, correct or delete yours.{' '}
          <a href="/privacy/" className="font-medium text-ink underline hover:text-accent">
            Read the privacy policy
          </a>
          .
        </p>
        <p>
          The terms of service say what you can expect from the service and what it expects of
          you, including that it never sends anything for you and can be wrong, so check before you
          rely on it.{' '}
          <a href="/terms-of-service/" className="font-medium text-ink underline hover:text-accent">
            Read the terms of service
          </a>
          .
        </p>
      </Card>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  )
}

function ScreenCard({ name, href, children }: { name: string; href: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface/50 p-3 space-y-1">
      <div className="flex items-center gap-2">
        <a
          href={href}
          className="text-xs font-semibold px-2 py-0.5 rounded bg-raised border border-line-strong text-ink hover:text-accent hover:border-accent transition-colors"
        >
          {name}
        </a>
      </div>
      <p className="text-xs text-muted leading-relaxed">{children}</p>
    </div>
  )
}
