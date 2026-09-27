import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { Card } from '../components/ui/Surface'
import { Button } from '../components/ui/Button'
import { OnboardingCard } from '../components/OnboardingCard'
import { FeedbackModal } from '../components/FeedbackModal'

/**
 * How Scout works, written for the person using it.
 *
 * In the app rather than on a separate site, so it ships with the code it
 * describes and cannot describe a version that is not running. Short on
 * purpose: one paragraph per screen, and the rules Scout keeps that somebody
 * would otherwise have to discover — it never sends, never submits, and what
 * each Google permission is for.
 */
export function HelpPage() {
  const qc = useQueryClient()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: api.onboarding.read })
  const show = useMutation({
    mutationFn: api.onboarding.show,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
  })

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Help</h1>
        <p className="text-sm text-body">
          Scout finds opportunities for musicians — festivals, showcases, grants, sync briefs —
          helps you decide which are worth it, drafts the paperwork from your profile, and keeps
          track of what you are waiting on. It never sends or submits anything on your behalf.
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
      </header>

      {onboarding.data && <OnboardingCard state={onboarding.data} showDone />}

      <Section title="The screens">
        <Entry name="Overview">
          What needs you today. New opportunities are dealt as cards — apply or pass — beside
          upcoming deadlines and anything waiting on a reply from you.
        </Entry>
        <Entry name="Review">
          The whole queue, with filters: new, in progress, waiting on them, conflicts, and
          applications that have gone quiet.
        </Entry>
        <Entry name="Gigs">
          Every opportunity in one table. Add one you already know about with <em>New gig</em>.
        </Entry>
        <Entry name="Artist">
          Your profile: bio, links, photos, facts, and the documents they come from. Every draft
          and application answer is read from here, so this is the page that makes the rest work.
          Entries go stale on purpose — a follower count is worth re-checking every six months.
        </Entry>
        <Entry name="Sync">Music supervisors and briefs to pitch, with a short pitch drafted for each.</Entry>
        <Entry name="Promo">Promotion drafts, month by month.</Entry>
        <Entry name="History">What ran, when, and whether it worked.</Entry>
        <Entry name="Settings">Connections, reminders and the weekly digest, your account and passkeys, and how the app looks.</Entry>
      </Section>

      <Section title="How an opportunity moves">
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
      </Section>

      <Section title="What Scout will not do">
        <ul className="list-disc pl-5 space-y-1">
          <li>Submit an application. It stages an answer for each field; you copy them into the form.</li>
          <li>Send an email. Drafts are copied, or opened in your own mail with your Send button as the last step.</li>
          <li>Change a status because an email arrived. It suggests; you decide.</li>
        </ul>
      </Section>

      <Section title="Connecting Google">
        <p>
          One button in Settings connects Calendar, Tasks, Drive and — only if you choose —
          Gmail drafts. Scout explains each permission before Google asks, and you can connect
          without Gmail.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Calendar</strong> — Scout makes its own calendar and can only touch that one.</li>
          <li><strong>Tasks</strong> — deadlines and replies you owe become tasks on one list.</li>
          <li><strong>Drive</strong> — Scout sees only the folder it creates and files you pick.</li>
          <li>
            <strong>Gmail</strong> — puts drafts in your drafts folder. Google&rsquo;s permission
            would also allow sending; Scout has no code that sends.
          </li>
        </ul>
      </Section>

      <Section title="Signing in">
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
      </Section>

      <Section title="Feedback">
        <p>
          Something broken, confusing, or missing? <em>Send feedback</em> in the question-mark
          menu goes straight to the people who make Scout. It includes which page you were on and
          any error from the last half hour, and shows you exactly that before it sends, so you do
          not have to describe where you were.
        </p>
        <Button variant="neutral" onClick={() => setFeedbackOpen(true)}>
          Send feedback
        </Button>
      </Section>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card as="section" pad="md" className="space-y-3 text-sm text-body leading-relaxed">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children}
    </Card>
  )
}

function Entry({ name, children }: { name: string; children: ReactNode }) {
  return (
    <p>
      <a href={`#${name.toLowerCase() === 'history' ? 'runs' : name.toLowerCase()}`} className="font-medium text-ink hover:text-accent">
        {name}
      </a>{' '}
      — {children}
    </p>
  )
}
