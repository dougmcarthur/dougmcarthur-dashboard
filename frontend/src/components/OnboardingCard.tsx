import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type OnboardingState } from '../api'
import type { OnboardingStep } from '../../../shared/onboarding'
import { Button } from './ui/Button'
import { Card, Caption } from './ui/Surface'
import { GoalsForm } from './GoalsForm'

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
 * it back. It never pops up, never counts down, and never blocks a page.
 */
export function OnboardingCard({ state, showDone = false }: { state: OnboardingState; showDone?: boolean }) {
  const qc = useQueryClient()
  const [editingGoals, setEditingGoals] = useState(false)

  const hide = useMutation({
    mutationFn: api.onboarding.hide,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
  })

  const required = state.steps.filter((s) => !s.optional)
  const optional = state.steps.filter((s) => s.optional)
  const next = required.find((s) => !s.done)

  return (
    <Card pad="md" as="section" className="space-y-4" aria-labelledby="onboarding-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2 id="onboarding-title" className="text-base font-semibold text-ink">
            {state.complete ? 'You’re set up' : 'Getting started with Scout'}
          </h2>
          <p className="text-sm text-body max-w-prose">
            {state.complete
              ? 'Everything Scout needs is in place. The optional steps below are still worth a look.'
              : 'Scout finds opportunities, drafts the paperwork, and keeps track of what you are waiting on. It works from your profile, so a few things need setting up first.'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted tabular-nums" aria-label={`${state.done} of ${state.total} done`}>
            {state.done} of {state.total}
          </span>
          {!showDone && (
            <Button variant="quiet" size="sm" onClick={() => hide.mutate()} disabled={hide.isPending}>
              Hide
            </Button>
          )}
        </div>
      </div>

      <ol className="space-y-2">
        {required.map((step, i) => {
          const formOpen = step.id === 'goals' && (editingGoals || (step.id === next?.id && !step.done))
          return (
          <StepRow
            key={step.id}
            step={step}
            number={i + 1}
            current={step.id === next?.id}
            onEditGoals={() => setEditingGoals(true)}
            formOpen={formOpen}
          >
            {formOpen && (
              <div className="mt-3">
                <GoalsForm
                  state={state}
                  onSaved={() => setEditingGoals(false)}
                  onCancel={editingGoals ? () => setEditingGoals(false) : undefined}
                />
              </div>
            )}
          </StepRow>
          )
        })}
      </ol>

      {optional.length > 0 && (
        <div className="space-y-2">
          <Caption>Worth doing</Caption>
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
            New opportunities show up on the Overview as cards to decide on — apply or pass. They
            come from research run for your account, or from anything you add yourself.
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
  onEditGoals,
  children,
  formOpen = false,
}: {
  step: OnboardingStep
  number?: number
  current: boolean
  onEditGoals?: () => void
  children?: ReactNode
  formOpen?: boolean
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
          {step.href && !step.done ? (
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
          ) : step.id === 'goals' && onEditGoals && !formOpen ? (
            <Button variant={step.done ? 'quiet' : 'neutral'} size="sm" onClick={onEditGoals}>
              {step.done ? 'Change' : step.action}
            </Button>
          ) : null}
        </div>
      </div>
      {children}
    </li>
  )
}
