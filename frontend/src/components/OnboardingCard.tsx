import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type OnboardingState } from '../api'
import type { OnboardingStep } from '../../../shared/onboarding'
import { Button } from './ui/Button'
import { Card, Caption } from './ui/Surface'
import type { FlowScreen } from './OnboardingFlow'

/** Set for the rest of the tab once the welcome questions have opened by themselves. */
const AUTOSTART_KEY = 'scout.onboarding.autostarted'

/**
 * Open the welcome questions by themselves, once per tab, for an account that
 * has never answered them.
 *
 * The page owns the flow rather than this card, because answering the goals
 * can complete the checklist — and a card that unmounts on completion would
 * take the questions with it, mid-answer.
 */
export function useOnboardingAutostart(state: OnboardingState | undefined, start: (s: FlowScreen) => void) {
  useEffect(() => {
    if (!state || state.goals !== null || state.hidden) return
    let seen = false
    try {
      seen = sessionStorage.getItem(AUTOSTART_KEY) === '1'
      sessionStorage.setItem(AUTOSTART_KEY, '1')
    } catch {
      // Storage refused: open anyway. Once more than intended is the safe
      // direction; a first-run screen that never appears is not.
    }
    if (!seen) start('welcome')
    // Decided on the first answer only; a later refetch must not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state === undefined])
}

/**
 * The first-run checklist, at the top of the Overview.
 *
 * A new account used to open on an empty deck and "All clear — nothing needs
 * attention", which is true and useless: nothing needs attention because
 * nothing is set up. This says what to set up, in the order that makes the
 * next step worth doing, and why each one matters in a sentence.
 *
 * Every tick is read off the account (shared/onboarding.ts), so a step done
 * from Settings or the Artist page ticks itself. It disappears once the
 * required steps are done, and **Hide** puts it away sooner — Help can bring
 * it back.
 *
 * The name and the goals are asked in `OnboardingFlow`, full screen, one
 * question at a time, which the page hosts; `onStart` opens it at a step. It
 * opens by itself **once per tab** for an account that has never answered
 * (`useOnboardingAutostart`), since that is the first thing a new artist
 * should see; Esc leaves it and the checklist offers it again.
 */
export function OnboardingCard({
  state,
  showDone = false,
  onStart,
}: {
  state: OnboardingState
  showDone?: boolean
  onStart: (screen: FlowScreen) => void
}) {
  const qc = useQueryClient()

  const hide = useMutation({
    mutationFn: api.onboarding.hide,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
  })

  const required = state.steps.filter((s) => !s.optional)
  const optional = state.steps.filter((s) => s.optional)
  const next = required.find((s) => !s.done)

  /** Where the welcome questions open for a step that is asked there. */
  const flowFor = (step: OnboardingStep): FlowScreen | null =>
    step.id === 'name' ? 'name' : step.id === 'goals' ? (step.done ? 'goals' : 'welcome') : null

  return (
    <Card pad="md" as="section" className="space-y-4" aria-labelledby="onboarding-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2 id="onboarding-title" className="text-base font-semibold text-ink">
            {state.complete ? 'You’re set up' : 'Get started with Scout'}
          </h2>
          <p className="text-sm text-body max-w-prose">
            {state.complete
              ? 'Everything Scout needs is in place. The optional steps below are still worth doing.'
              : 'Scout finds opportunities for you, drafts applications and pitches, and tracks who you’re waiting to hear from. It works from your profile, so start with these steps.'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted tabular-nums" aria-label={`${state.done} of ${state.total} done`}>
            {state.done} of {state.total} done
          </span>
          {!showDone && (
            <Button variant="quiet" size="sm" onClick={() => hide.mutate()} disabled={hide.isPending}>
              Hide
            </Button>
          )}
        </div>
      </div>

      <ol className="space-y-2">
        {required.map((step, i) => (
          <StepRow
            key={step.id}
            step={step}
            number={i + 1}
            current={step.id === next?.id}
            onOpen={(() => {
              const screen = flowFor(step)
              return screen ? () => onStart(screen) : undefined
            })()}
          />
        ))}
      </ol>

      {optional.length > 0 && (
        <div className="space-y-2">
          <Caption>Optional</Caption>
          <ul className="space-y-2">
            {optional.map((step) => (
              <StepRow key={step.id} step={step} current={false} />
            ))}
          </ul>
        </div>
      )}

      {state.next.length > 0 && (
        <div className="space-y-1.5 border-t border-line pt-4">
          <Caption>What happens next</Caption>
          <p className="text-sm text-body max-w-prose">
            New opportunities appear on the Overview as cards: apply or pass. You can add ones you
            already know about at any time.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {state.next.map((n) => (
              <li key={n.href}>
                <a href={n.href} className="text-sm text-accent hover:text-accent-hover underline underline-offset-2">
                  {n.label}
                </a>
              </li>
            ))}
            <li>
              <a href="#help" className="text-sm text-accent hover:text-accent-hover underline underline-offset-2">
                How Scout works
              </a>
            </li>
          </ul>
        </div>
      )}

      {hide.error && (
        <p className="text-xs text-danger-fg">
          {hide.error instanceof Error ? hide.error.message : 'Could not hide it'}
        </p>
      )}
    </Card>
  )
}

function StepMark({ done }: { done: boolean }) {
  return done ? (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-bg text-success-fg" aria-hidden>
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 8.4 6.4 12 13 4.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  ) : (
    <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-line-strong" aria-hidden />
  )
}

function StepRow({
  step,
  number,
  current,
  onOpen,
}: {
  step: OnboardingStep
  number?: number
  current: boolean
  /** Opens the welcome questions at this step, for the steps asked there. */
  onOpen?: () => void
}) {
  return (
    <li
      className={`rounded-lg border px-3 py-2.5 ${current ? 'border-line-strong bg-raised' : 'border-line'}`}
    >
      <div className="flex items-start gap-3">
        <StepMark done={step.done} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${step.done ? 'text-muted' : 'text-ink'}`}>
            <span className="sr-only">{step.done ? 'Done: ' : 'To do: '}</span>
            {number ? `${number}. ` : ''}
            {step.title}
          </p>
          {!step.done && <p className="text-xs text-muted mt-0.5 max-w-prose">{step.why}</p>}
        </div>
        <div className="shrink-0">
          {onOpen ? (
            <Button variant={step.done ? 'quiet' : current ? 'primary' : 'neutral'} size="sm" onClick={onOpen}>
              {step.done ? 'Change' : step.action}
            </Button>
          ) : step.href && !step.done ? (
            <a
              href={step.href}
              className={`inline-block rounded-md text-xs px-3 py-1.5 transition-colors ${
                current
                  ? 'bg-accent text-accent-fg hover:bg-accent-hover'
                  : 'border border-line-strong text-body hover:bg-sunken hover:text-ink'
              }`}
            >
              {step.action}
            </a>
          ) : null}
        </div>
      </div>
    </li>
  )
}
