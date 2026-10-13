import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type OnboardingState } from '../api'
import { CITY_MAX, GOAL_NOTE_MAX, type GenreId, type GoalId, type ReachId, type RegionId } from '../../../shared/onboarding'
import { Button, buttonClass } from './ui/Button'
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
 * Six questions — name, where you are, what you play, goals, reach, anything else —
 * and a last screen that says what is left. One question at a time because the checklist's inline
 * form put eleven checkboxes and a textarea in front of somebody who had not
 * seen the product yet; one at a time, each is a sentence and a choice.
 *
 * Every answer is saved as the screen is left rather than at the end, so
 * leaving halfway keeps what was said. Nothing here is required to use the
 * app: the checklist offers the questions again until the goals are answered.
 */

export type FlowScreen = 'welcome' | 'name' | 'where' | 'play' | 'goals' | 'reach' | 'note' | 'done'
const ORDER: FlowScreen[] = ['welcome', 'name', 'where', 'play', 'goals', 'reach', 'note', 'done']
const QUESTIONS: FlowScreen[] = ['name', 'where', 'play', 'goals', 'reach', 'note']

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
  const [region, setRegion] = useState<RegionId | null>(state.profile?.region ?? null)
  const [city, setCity] = useState(state.profile?.city ?? '')
  const [genres, setGenres] = useState<Set<GenreId>>(new Set(state.profile?.genres ?? []))
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

  const saveProfile = useMutation({
    mutationFn: () =>
      api.onboarding.saveProfile({ region, city: city.trim() || null, genres: [...genres] }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
  })

  const index = ORDER.indexOf(screen)
  // What is left once the questions are answered. Name and goals are this
  // flow's own, so they never appear as "left" at its end.
  const remaining = state.steps.filter(
    (s) => !s.optional && !s.done && s.id !== 'name' && s.id !== 'goals' && s.id !== 'about',
  )
  const step = `${QUESTIONS.indexOf(screen) + 1} of ${QUESTIONS.length}`

  /** Save what the screen being left collected. Never blocks moving on. */
  const persist = useCallback(
    (leaving: FlowScreen) => {
      if (leaving === 'name') {
        const value = name.trim()
        if (value !== (profile.data?.displayName ?? '')) saveName.mutate(value)
      }
      if ((leaving === 'where' || leaving === 'play') && (region !== null || city.trim() || genres.size > 0)) {
        saveProfile.mutate()
      }
      if ((leaving === 'goals' || leaving === 'reach' || leaving === 'note') && goals.size > 0) {
        saveGoals.mutate()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, goals, reach, note, region, city, genres, profile.data],
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
    screen === 'goals'
      ? state.options.goals
      : screen === 'reach'
        ? state.options.reach
        : screen === 'where'
          ? state.options.regions
          : screen === 'play'
            ? state.options.genres
            : []

  const choose = useCallback(
    (id: string) => {
      setNudge(null)
      if (screen === 'goals') setGoals((prev) => toggled(prev, id as GoalId))
      else if (screen === 'reach') setReach((prev) => toggled(prev, id as ReachId))
      else if (screen === 'where') setRegion((prev) => (prev === id ? null : (id as RegionId)))
      else if (screen === 'play') {
        setGenres((prev) => {
          if (!prev.has(id as GenreId) && prev.size >= state.options.maxGenres) {
            setNudge(`Choose up to ${state.options.maxGenres}. Untick one to pick another.`)
            return prev
          }
          return toggled(prev, id as GenreId)
        })
      }
    },
    [screen, state.options.maxGenres],
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
            <li>
              It’s built for Canadian artists: funding, music associations and costs are Canadian, and
              playing abroad is welcome.
            </li>
          </ul>
          <p className="text-body">
            A few quick questions help it decide what to show you first. It takes about a minute.
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

      {screen === 'where' && (
        <>
          <Question step={step} title="Where are you based?">
            Your province or territory, and your city if you like. Scout uses it to tell which
            opportunities are close and which are a trip. It is never shown to anyone else.
          </Question>
          <OptionList
            label="Province or territory"
            options={state.options.regions}
            selected={new Set(region ? [region] : [])}
            onChoose={choose}
            multiple={false}
          />
          <label className="block">
            <span className="sr-only">City</span>
            <input
              value={city}
              maxLength={CITY_MAX}
              placeholder="City (optional)"
              onChange={(e) => setCity(e.target.value)}
              className={FLOW_INPUT}
            />
          </label>
          <Continue
            label={region === null && !city.trim() ? 'Skip' : 'OK'}
            onClick={next}
            hint={<>Press a letter to choose, <Kbd>Enter</Kbd> to continue</>}
          />
        </>
      )}

      {screen === 'play' && (
        <>
          <Question step={step} title="What do you play?">
            Up to {state.options.maxGenres}. It helps Scout tell which opportunities suit your music.
          </Question>
          <OptionList label="Genres" options={state.options.genres} selected={genres} onChoose={choose} />
          <Continue
            label={genres.size === 0 ? 'Skip' : 'OK'}
            onClick={next}
            hint={<>Press a letter to choose, <Kbd>Enter</Kbd> to continue</>}
          />
          {nudge && <p className="text-sm text-danger-fg">{nudge}</p>}
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
              Choose all that apply, or skip if you’re not sure yet. Nothing is hidden: opportunities beyond
              what you choose still appear, after the ones within it.
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
              {/*
                Every task is its own link. It used to be a plain box with one
                button underneath for the first, so the second — Connect Google
                — said what to do and gave no way to do it.
              */}
              <ul className="space-y-3">
                {remaining.map((s, i) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line-strong px-4 py-3"
                  >
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="font-medium text-ink">{s.title}</p>
                      <p className="text-sm text-muted mt-0.5">{s.why}</p>
                    </div>
                    {s.href && (
                      <a
                        href={s.href}
                        onClick={(e) => {
                          // Navigate before the questions unmount, so the move
                          // does not depend on a removed link still being
                          // followed.
                          e.preventDefault()
                          window.location.hash = s.href!.slice(1)
                          onClose()
                        }}
                        className={`shrink-0 ${buttonClass(i === 0 ? 'primary' : 'neutral', 'lg')}`}
                      >
                        {s.action}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={remaining.length ? 'neutral' : 'primary'} onClick={onClose}>
              {remaining.length ? 'Not now' : 'Done'}
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
