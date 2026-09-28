import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type OnboardingState } from '../api'
import { GOAL_NOTE_MAX, type GoalId, type ReachId } from '../../../shared/onboarding'
import { Button } from './ui/Button'

/**
 * The welcome questions, one per screen, full screen, driven from the keyboard.
 *
 * Four questions — name, goals, reach, anything else — and a last screen that
 * says what is left. One question at a time because the checklist's inline
 * form put eleven checkboxes and a textarea in front of somebody who had not
 * seen the product yet; one at a time, each is a sentence and a choice.
 *
 * Keys, shown on screen as they apply:
 *  - **Enter** moves on (Shift+Enter is a new line in the last box)
 *  - **A, B, C…** toggle an option
 *  - **↑ / ↓** move between questions when not typing
 *  - **Esc** leaves; answers already given are kept
 *
 * Every answer is saved as the screen is left rather than at the end, so
 * leaving halfway keeps what was said. Nothing here is required to use the
 * app: the checklist offers the questions again until the goals are answered.
 */

export type FlowScreen = 'welcome' | 'name' | 'goals' | 'reach' | 'note' | 'done'
const ORDER: FlowScreen[] = ['welcome', 'name', 'goals', 'reach', 'note', 'done']
const QUESTIONS: FlowScreen[] = ['name', 'goals', 'reach', 'note']
const LETTERS = 'ABCDEFGHIJ'

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
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

  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

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
  const questionNumber = QUESTIONS.indexOf(screen) + 1

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

  // Focus follows the question, so the keys work without a click: the text
  // box when there is one, otherwise the screen itself.
  useEffect(() => {
    if (screen === 'name') input.current?.focus()
    else if (screen === 'note') textarea.current?.focus()
    else panel.current?.focus({ preventScroll: true })
  }, [screen])

  // The page underneath does not scroll, and focus goes back where it was.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])

  const options =
    screen === 'goals' ? state.options.goals : screen === 'reach' ? state.options.reach : []

  const toggle = useCallback(
    (id: string) => {
      setNudge(null)
      if (screen === 'goals') {
        setGoals((prev) => {
          const s = new Set(prev)
          if (s.has(id as GoalId)) s.delete(id as GoalId)
          else s.add(id as GoalId)
          return s
        })
      } else if (screen === 'reach') {
        setReach((prev) => {
          const s = new Set(prev)
          if (s.has(id as ReachId)) s.delete(id as ReachId)
          else s.add(id as ReachId)
          return s
        })
      }
    },
    [screen],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      const typing = isTyping(e.target)
      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // A focused button answers Enter itself; letting this run too would
        // press it and then move on.
        // Option buttons are the exception: Enter moves on from them, as it
        // does everywhere else in the questions, and Space toggles.
        const isOption = e.target instanceof HTMLElement && e.target.getAttribute('role') === 'checkbox'
        if (!isOption && (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) return
        e.preventDefault()
        next()
        return
      }
      if (typing) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        back()
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
        const i = LETTERS.indexOf(e.key.toUpperCase())
        if (i >= 0 && i < options.length) {
          e.preventDefault()
          toggle(options[i].id)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close, next, back, toggle, options])

  const progress = Math.round((index / (ORDER.length - 1)) * 100)
  const failed = saveName.error ?? saveGoals.error

  // Portalled to the body: an ancestor with a transform or filter would make
  // `fixed` relative to it rather than the viewport, and the first version
  // sat 16px down the page with the header showing through above it.
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Sun Dogs Music Scout"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-canvas outline-none overflow-y-auto"
    >
      <div className="h-1 w-full bg-sunken shrink-0" aria-hidden>
        <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex items-center justify-between px-4 sm:px-8 py-3 shrink-0">
        <p className="text-sm font-semibold text-ink">
          Scout <span className="text-faint font-normal">— Sun Dogs Music</span>
        </p>
        <Button variant="quiet" size="sm" onClick={close}>
          {screen === 'done' ? 'Close' : 'Finish later'} <Kbd>Esc</Kbd>
        </Button>
      </div>

      <div className="flex-1 flex items-center">
        <div key={screen} className="w-full max-w-xl mx-auto px-6 py-10 space-y-6">
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
              <Question n={questionNumber} title="What name do you perform or release music under?">
                Your artist or band name. You can change it later in Settings.
              </Question>
              <label className="block">
                <span className="sr-only">Artist name</span>
                <input
                  ref={input}
                  value={name}
                  maxLength={80}
                  placeholder="Type your name here"
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent border-0 border-b-2 border-line-strong focus:border-accent
                             focus:outline-none text-2xl text-ink py-2 placeholder:text-faint"
                />
              </label>
              <Continue onClick={next} />
            </>
          )}

          {(screen === 'goals' || screen === 'reach') && (
            <>
              {screen === 'goals' ? (
                <Question n={questionNumber} title="What do you want Scout to help with?">
                  Choose as many as you like.
                </Question>
              ) : (
                <Question n={questionNumber} title="How far would you travel for the right opportunity?">
                  Choose all that apply, or skip if you’re not sure yet.
                </Question>
              )}
              <div role="group" aria-label={screen === 'goals' ? 'Goals' : 'Travel'} className="space-y-2">
                {options.map((o, i) => {
                  const on = screen === 'goals' ? goals.has(o.id as GoalId) : reach.has(o.id as ReachId)
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(o.id)}
                      className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-base transition-colors
                                  focus:outline-none focus:ring-2 focus:ring-accent ${
                                    on
                                      ? 'border-accent bg-accent-soft text-ink'
                                      : 'border-line-strong text-body hover:bg-sunken hover:text-ink'
                                  }`}
                    >
                      <span
                        aria-hidden
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs font-semibold ${
                          on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong text-muted'
                        }`}
                      >
                        {LETTERS[i]}
                      </span>
                      <span className="flex-1">{o.label}</span>
                      {on && (
                        <svg viewBox="0 0 16 16" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M3 8.4 6.4 12 13 4.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
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
              <Question n={questionNumber} title="Anything else Scout should know?">
                A release coming up, a tour you’re planning, what hasn’t worked before. Optional.
              </Question>
              <label className="block">
                <span className="sr-only">Anything else</span>
                <textarea
                  ref={textarea}
                  rows={3}
                  value={note}
                  maxLength={GOAL_NOTE_MAX}
                  placeholder="Type your answer here"
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full resize-none bg-transparent border-0 border-b-2 border-line-strong focus:border-accent
                             focus:outline-none text-xl text-ink py-2 placeholder:text-faint"
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
                    {remaining.map((step) => (
                      <li key={step.id} className="rounded-lg border border-line-strong px-4 py-3">
                        <p className="font-medium text-ink">{step.title}</p>
                        <p className="text-sm text-muted mt-0.5">{step.why}</p>
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
        </div>
      </div>

      {screen !== 'welcome' && screen !== 'done' && (
        // Keyboard companions, so not on a phone, where they sat over the
        // last option.
        <div className="fixed bottom-4 right-4 hidden sm:flex gap-1">
          <button
            type="button"
            onClick={back}
            aria-label="Previous question"
            className="h-9 w-9 rounded-md border border-line-strong text-muted hover:text-ink hover:bg-sunken transition-colors"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next question"
            className="h-9 w-9 rounded-md border border-line-strong text-muted hover:text-ink hover:bg-sunken transition-colors"
          >
            ↓
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border border-line-strong bg-raised px-1.5 text-[11px] font-medium text-muted">
      {children}
    </kbd>
  )
}

function Question({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-accent">
        {n} of {QUESTIONS.length}
      </p>
      <h1 className="text-2xl sm:text-3xl font-semibold text-ink tracking-tight">{title}</h1>
      <p className="text-body">{children}</p>
    </div>
  )
}

function Continue({
  label = 'OK',
  onClick,
  hint = (
    <>
      press <Kbd>Enter ↵</Kbd>
    </>
  ),
}: {
  label?: string
  onClick: () => void
  hint?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="primary" size="md" onClick={onClick}>
        {label}
      </Button>
      <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted">{hint}</span>
    </div>
  )
}
