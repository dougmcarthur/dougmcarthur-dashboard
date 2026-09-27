import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type OnboardingState } from '../api'
import { GOAL_NOTE_MAX, type GoalId, type ReachId } from '../../../shared/onboarding'
import { Button } from './ui/Button'
import { Textarea } from './ui/Field'
import { Caption } from './ui/Surface'

/**
 * What somebody wants from Scout, asked as checkboxes rather than a survey.
 *
 * Two questions and a free-text box, all skippable, because a first-run form
 * that interrogates you before you have seen the product is the one you close.
 * The answers decide which optional steps the checklist offers and what it
 * suggests next; they are stored on the artist's own account and change
 * nothing else.
 */
export function GoalsForm({
  state,
  onSaved,
  onCancel,
}: {
  state: OnboardingState
  onSaved?: () => void
  onCancel?: () => void
}) {
  const qc = useQueryClient()
  const [goals, setGoals] = useState<Set<GoalId>>(new Set(state.goals?.goals ?? []))
  const [reach, setReach] = useState<Set<ReachId>>(new Set(state.goals?.reach ?? []))
  const [note, setNote] = useState(state.goals?.note ?? '')

  const save = useMutation({
    mutationFn: () =>
      api.onboarding.saveGoals({ goals: [...goals], reach: [...reach], note: note.trim() || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding'] })
      onSaved?.()
    },
  })

  const toggle = <T,>(set: Set<T>, value: T, apply: (next: Set<T>) => void) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next)
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <fieldset className="space-y-1.5">
        <legend>
          <Caption spaced>What are you hoping Scout helps with?</Caption>
        </legend>
        {state.options.goals.map((g) => (
          <label key={g.id} className="flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              className="rounded border-line-strong"
              checked={goals.has(g.id)}
              onChange={() => toggle(goals, g.id, setGoals)}
            />
            {g.label}
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend>
          <Caption spaced>Where would you go for the right opportunity?</Caption>
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {state.options.reach.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                className="rounded border-line-strong"
                checked={reach.has(r.id)}
                onChange={() => toggle(reach, r.id, setReach)}
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1">
        <Caption>Anything else? (optional)</Caption>
        <Textarea
          rows={2}
          maxLength={GOAL_NOTE_MAX}
          value={note}
          placeholder="A release coming up, a tour you are planning, what has not worked before…"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={save.isPending || goals.size === 0}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        {onCancel && (
          <Button type="button" variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {goals.size === 0 && <span className="text-xs text-muted">Pick at least one.</span>}
        {save.error && (
          <span className="text-xs text-danger-fg">
            {save.error instanceof Error ? save.error.message : 'Could not save'}
          </span>
        )}
      </div>
    </form>
  )
}
