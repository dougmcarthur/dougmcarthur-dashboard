import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type OnboardingState } from '../api'
import { GOAL_NOTE_MAX, type GoalId, type ReachId } from '../../../shared/onboarding'
import { Button } from './ui/Button'
import {
  Continue,
  FLOW_INPUT,
  FLOW_TEXTAREA,
  FlowShell,
  Kbd,
  OptionList,
  Question,
} from './flow/QuestionFlow'

/**
 * The welcome questions, one per screen, full screen, driven from the keyboard
 * (the shell and its keys are `flow/QuestionFlow.tsx`).
 *
 * Four questions — name, goals, reach, anything else — and a last screen that
 * says what is left. One question at a time because the checklist's inline
 * form put eleven checkboxes and a textarea in front of somebody who had not
 * seen the product yet; one at a time, each is a sentence and a choice.
 *
 * Every answer is saved as the screen is left rather than at the end, so
 * leaving halfway keeps what was said. Nothing here is required to use the
 * app: the checklist offers the questions again until the goals are answered.
 */

export type FlowScreen = 'welcome' | 'name' | 'goals' | 'reach' | 'note' | 'done'
const ORDER: FlowScreen[] = ['welcome', 'name', 'goals', 'reach', 'note', 'done']
const QUESTIONS: FlowScreen[] = ['name', 'goals', 'reach', 'note']

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export function OnboardingFlow({
  state,
  startAt = 'welcome',
  onClose,
}: {
  state: OnboardingState
  startAt?: FlowScreen
  onClose: () => void
}) {
  const qc = useQueryClient()
  const profile = useQuery({ queryKey: ['profile'], queryFn: api.profile.read })

  const [screen, setScreen] = useState<FlowScreen>(startAt)
  const [name, setName] = useState('')
  const [goals, setGoals] = useState<Set<GoalId>>(new Set(state.goals?.goals ?? []))
  const [reach, setReach] = useState<Set<ReachId>>(new Set(state.goals?.reach ?? []))
  const [note, setNote] = useState(state.goals?.note ?? '')
  const [nudge, setNudge] = useState<string | null>(null)

  // Seeded once, when the server answers, so typing is never overwritten.
  const seeded = useRef(false)
  useEffect(() => {
    if (profile.data && !seeded.current) {
      seeded.current = true
      setName(profile.data.displayName ?? '')
    }
  }, [profile.data])

  const saveName = useMutation({
    mutationFn: (value: string) => api.profile.save(value || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['onboarding'] })
    },
  })
  const saveGoals = useMutation({
    mutationFn: () =>
      api.onboarding.saveGoals({ goals: [...goals], reach: [...reach], note: note.trim() || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
  })

  const index = ORDER.indexOf(screen)
  // What is left once the questions are answered. Name and goals are this
  // flow's own, so they never appear as "left" at its end.
  const remaining = state.steps.filter((s) => !s.optional && !s.done && s.id !== 'name' && s.id !== 'goals')
  const step = `${QUESTIONS.indexOf(screen) + 1} of ${QUESTIONS.length}`

  /** Save what the screen being left collected. Never blocks moving on. */
  const persist = useCallback(
    (leaving: FlowScreen) => {
      if (leaving === 'name') {
        const value = name.trim()
        if (value !== (profile.data?.displayName ?? '')) saveName.mutate(value)
      }
      if ((leaving === 'goals' || leaving === 'reach' || leaving === 'note') && goals.size > 0) {
        saveGoals.mutate()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, goals, reach, note, profile.data],
  )

  const go = useCallback(
    (to: FlowScreen) => {
      persist(screen)
      setNudge(null)
      setScreen(to)
    },
    [persist, screen],
  )

  const next = useCallback(() => {
    if (screen === 'goals' && goals.size === 0) {
      setNudge('Choose at least one to continue.')
      return
    }
    if (screen === 'done') {
      // Enter on the last screen takes the button it highlights.
      if (remaining[0]?.href) window.location.hash = remaining[0].href.slice(1)
      onClose()
      return
    }
    go(ORDER[index + 1])
  }, [screen, goals.size, go, index, onClose, remaining])

  const back = useCallback(() => {
    if (index > 0) go(ORDER[index - 1])
  }, [go, index])

  const close = useCallback(() => {
    persist(screen)
    onClose()
  }, [persist, screen, onClose])

  const options =
    screen === 'goals' ? state.options.goals : screen === 'reach' ? state.options.reach : []

  const choose = useCallback(
    (id: string) => {
      setNudge(null)
      if (screen === 'goals') setGoals((prev) => toggled(prev, id as GoalId))
      else if (screen === 'reach') setReach((prev) => toggled(prev, id as ReachId))
    },
    [screen],
  )

  const failed = saveName.error ?? saveGoals.error

  return (
    <FlowShell
      label="Welcome to Sun Dogs Music Scout"
      screenKey={screen}
      progress={Math.round((index / (ORDER.length - 1)) * 100)}
      closeLabel={screen === 'done' ? 'Close' : 'Finish later'}
      onClose={close}
      onNext={next}
      onBack={back}
      options={options}
      onChoose={choose}
      arrows={screen !== 'welcome' && screen !== 'done'}
    >
      {screen === 'welcome' && (
        <>
          <h1 className="text-3xl sm:text-4xl font-semibold text-ink tracking-tight">
            Welcome to Sun Dogs Music Scout
          </h1>
          <ul className="space-y-2 text-lg text-body">
            <li>Scout gathers gigs, grants and sync opportunities in one place.</li>
            <li>It drafts your applications and pitches from your profile.</li>
            <li>It keeps track of deadlines and who you’re waiting to hear from.</li>
          </ul>
          <p className="text-body">
            Four quick questions help it decide what to show you first. It takes about a minute.
          </p>
          <Continue label="Start" onClick={next} />
        </>
      )}

      {screen === 'name' && (
        <>
          <Question step={step} title="What name do you perform or release music under?">
            Your artist or band name. You can change it later in Settings.
          </Question>
          <label className="block">
            <span className="sr-only">Artist name</span>
            <input
              data-autofocus
              value={name}
              maxLength={80}
              placeholder="Type your name here"
              onChange={(e) => setName(e.target.value)}
              className={FLOW_INPUT}
            />
          </label>
          <Continue onClick={next} />
        </>
      )}

      {(screen === 'goals' || screen === 'reach') && (
        <>
          {screen === 'goals' ? (
            <Question step={step} title="What do you want Scout to help with?">
              Choose as many as you like.
            </Question>
          ) : (
            <Question step={step} title="How far would you travel for the right opportunity?">
              Choose all that apply, or skip if you’re not sure yet.
            </Question>
          )}
          <OptionList
            label={screen === 'goals' ? 'Goals' : 'Travel'}
            options={options}
            selected={screen === 'goals' ? goals : reach}
            onChoose={choose}
          />
          <Continue
            label={screen === 'reach' && reach.size === 0 ? 'Skip' : 'OK'}
            onClick={next}
            hint={<>Press a letter to choose, <Kbd>Enter</Kbd> to continue</>}
          />
          {nudge && <p className="text-sm text-danger-fg">{nudge}</p>}
        </>
      )}

      {screen === 'note' && (
        <>
          <Question step={step} title="Anything else Scout should know?">
            A release coming up, a tour you’re planning, what hasn’t worked before. Optional.
          </Question>
          <label className="block">
            <span className="sr-only">Anything else</span>
            <textarea
              data-autofocus
              rows={3}
              value={note}
              maxLength={GOAL_NOTE_MAX}
              placeholder="Type your answer here"
              onChange={(e) => setNote(e.target.value)}
              className={FLOW_TEXTAREA}
            />
          </label>
          <Continue
            label={note.trim() ? 'OK' : 'Skip'}
            onClick={next}
            hint={<><Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> for a new line</>}
          />
        </>
      )}

      {screen === 'done' && (
        <>
          <h1 className="text-3xl font-semibold text-ink tracking-tight">
            {remaining.length === 0 ? 'You’re all set.' : 'Thanks — that’s everything we need to ask.'}
          </h1>
          {remaining.length === 0 ? (
            <p className="text-lg text-body">Everything Scout needs is in place.</p>
          ) : (
            <>
              <p className="text-lg text-body">
                {remaining.length === 1 ? 'One thing left' : `${remaining.length} things left`} to
                finish setting up. You can do {remaining.length === 1 ? 'it' : 'them'} now, or later
                from the checklist on the Overview.
              </p>
              <ul className="space-y-3">
                {remaining.map((s) => (
                  <li key={s.id} className="rounded-lg border border-line-strong px-4 py-3">
                    <p className="font-medium text-ink">{s.title}</p>
                    <p className="text-sm text-muted mt-0.5">{s.why}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {remaining[0]?.href ? (
              <a
                href={remaining[0].href}
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-md bg-accent text-accent-fg hover:bg-accent-hover px-4 py-2 text-sm font-medium transition-colors"
              >
                {remaining[0].action}
              </a>
            ) : null}
            <Button variant={remaining.length ? 'neutral' : 'primary'} onClick={onClose}>
              Done
            </Button>
          </div>
        </>
      )}

      {failed && (
        <p className="text-sm text-danger-fg">
          An answer didn’t save ({failed instanceof Error ? failed.message : 'unknown error'}). Go
          back and press Enter to try again.
        </p>
      )}
    </FlowShell>
  )
}
