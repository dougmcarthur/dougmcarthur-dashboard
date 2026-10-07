import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type SurveyStatus } from '../../api'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { TurnstileBox } from './TurnstileBox'
import { ChoiceScreen, HEADING, IntroScreen, QuestionScreen, RankScreen } from './SurveyScreens'
import { checkAnswer, type AnswerMap } from '../../../../shared/surveyAnswers'
import { consentSteps } from '../../../../shared/surveyConsent'
import { partOf, screenKind, type Plan } from '../../../../shared/surveyDesign'
import {
  answerFromDraft,
  canContinue,
  canSkip,
  draftFromAnswer,
  resumeAt,
  sourceFromHash,
  taskPosition,
  type Draft,
} from '../../../../shared/surveyDraft'
import { CONSENT, PART_NAMES, THANKS, tx } from '../../../../shared/surveyInstrument'

/**
 * The artist survey: a public, anonymous page that anybody with the link can
 * take, signed in or not. The questionnaire and the reasoning are in
 * docs/artist-survey-questionnaire.md.
 *
 * A courtesy layer over the server. The Worker builds the plan, checks every
 * answer and decides whether the survey is open; this renders what it is told
 * and invents nothing, so nothing here can make the data say something the
 * plan did not.
 *
 * What it keeps in the browser is one random code (the response id), so a
 * refresh or a later visit can pick up where somebody left off, and a note that
 * this browser has finished. The notice says so. It never keeps an answer.
 */

const KEY = 'sdm-survey'

interface Stored {
  id?: string
  done?: boolean
}

function readStored(): Stored {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Stored
  } catch {
    return {}
  }
}
function writeStored(s: Stored) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Storage can be blocked. The survey still works; it just cannot be resumed.
  }
}
function clearStored() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // As above.
  }
}

interface Run {
  id: string
  plan: Plan
  answers: AnswerMap
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'closed' }
  | { kind: 'consent' }
  | { kind: 'returning'; run: Run }
  | { kind: 'running'; run: Run; at: string }
  | { kind: 'done' }
  | { kind: 'already' }
  | { kind: 'screened' }
  | { kind: 'deleted' }

/**
 * The page around every survey screen. `wide` is for the results, which have
 * charts to lay out; a question is read in a narrow column and should stay in one.
 */
export function Shell({ children, contact, wide = false }: { children: ReactNode; contact?: string | null; wide?: boolean }) {
  const width = wide ? 'max-w-4xl sm:px-6' : 'max-w-xl'
  return (
    <div className="min-h-screen bg-canvas text-body">
      <header className="border-b border-line bg-surface">
        <div className={`mx-auto ${width} px-4 py-3 text-sm font-semibold text-ink`}>Sun Dogs Music</div>
      </header>
      <main className={`mx-auto ${width} px-4 ${wide ? 'py-10 sm:py-14' : 'py-6'} space-y-6`}>{children}</main>
      {contact && (
        <footer className={`mx-auto ${width} px-4 pb-10 text-xs text-muted`}>
          Questions about this survey: <a className="underline" href={`mailto:${contact}`}>{contact}</a>
        </footer>
      )}
    </div>
  )
}

export function Message({ title, body, children }: { title: string; body: string[]; children?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <div className="space-y-3">
      <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold text-ink tracking-tight focus:outline-none">
        {title}
      </h1>
      {body.map((p) => (
        <p key={p} className="text-sm text-body leading-relaxed">
          {p}
        </p>
      ))}
      {children}
    </div>
  )
}

// ── Consent ───────────────────────────────────────────────────────────────────

/**
 * The welcome, one paragraph to a screen (shared/surveyConsent.ts decides which),
 * with the age confirmation on the last. The checkbox, the spam check and the
 * field a person never sees all live in `Agreement`, so they mount together when
 * it is reached: a spam token lasts five minutes, and somebody reading five
 * screens carefully can take longer than that. Going Back from it and returning
 * starts the check again, and the box has to be ticked again, which is right for
 * a consent.
 */
function ConsentScreen({
  status,
  starting,
  error,
  onStart,
}: {
  status: SurveyStatus
  starting: boolean
  error: string | null
  onStart: (token: string | null, honeypot: string) => void
}) {
  const [step, setStep] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const steps = consentSteps(CONSENT.points.length)
  const current = steps[step]

  // Each step is a new screen to a screen reader: put focus on its heading, and
  // the top in view.
  useEffect(() => {
    heading.current?.focus()
    window.scrollTo(0, 0)
  }, [step])

  const results = status.resultsUrl ? ` at ${status.resultsUrl}` : ''
  const where = <span className="ml-auto text-xs text-muted">{step + 1} of {steps.length}</span>
  const back = step > 0 && (
    <Button size="lg" onClick={() => setStep(step - 1)}>
      Back
    </Button>
  )

  if (current.kind === 'agree') {
    return (
      <Agreement
        status={status}
        starting={starting}
        error={error}
        onStart={onStart}
        headingRef={heading}
        back={back}
        where={where}
      />
    )
  }

  const point = current.kind === 'point' ? CONSENT.points[current.index] : null
  return (
    <div className="space-y-5">
      {point ? (
        <div className="space-y-3">
          <h1 ref={heading} tabIndex={-1} className={HEADING}>
            {tx(point.lead)}
          </h1>
          <p className="text-base text-body leading-relaxed">{tx(point.body).replace('{results}', results)}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold text-ink tracking-tight focus:outline-none">
              {tx(CONSENT.title)}
            </h1>
            <p className="text-sm text-muted">{tx(CONSENT.lede)}</p>
          </div>
          <p className="text-base text-body leading-relaxed">{tx(CONSENT.intro)}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {back}
        <Button variant="primary" size="lg" onClick={() => setStep(step + 1)}>
          Continue
        </Button>
        {where}
      </div>
    </div>
  )
}

function Agreement({
  status,
  starting,
  error,
  onStart,
  headingRef,
  back,
  where,
}: {
  status: SurveyStatus
  starting: boolean
  error: string | null
  onStart: (token: string | null, honeypot: string) => void
  headingRef: Ref<HTMLHeadingElement>
  back: ReactNode
  where: ReactNode
}) {
  const [agreed, setAgreed] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [honeypot, setHoneypot] = useState('')

  const ready = agreed && (!status.siteKey || !!token)

  return (
    <div className="space-y-5">
      <h1 ref={headingRef} tabIndex={-1} className={HEADING}>
        {tx(CONSENT.confirm)}
      </h1>

      {/* A field no person sees. Anything in it is a form-filling bot. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </label>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-line bg-surface px-3 py-3 cursor-pointer focus-within:ring-2 focus-within:ring-accent">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
        />
        <span className="text-sm text-ink">{tx(CONSENT.agree)}</span>
      </label>

      {status.siteKey && <TurnstileBox siteKey={status.siteKey} onToken={setToken} />}

      {error && (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {back}
        <Button variant="primary" size="lg" disabled={!ready || starting} onClick={() => onStart(token, honeypot)}>
          {starting ? 'Starting…' : 'Start'}
        </Button>
        {where}
      </div>
    </div>
  )
}

// ── Running ───────────────────────────────────────────────────────────────────

function Progress({ plan, at }: { plan: Plan; at: string }) {
  const part = partOf(plan, at)
  const pos = taskPosition(plan, at)
  if (!part) return null
  return (
    <div className="space-y-1.5" aria-label={`Part ${part.number} of ${part.of}`}>
      <p className="text-xs text-muted">
        Part {part.number} of {part.of} · {tx(PART_NAMES[part.part])}
        {pos ? ` · ${pos.n} of ${pos.of}` : ''}
      </p>
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: part.of }, (_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < part.number ? 'bg-accent' : 'bg-line'}`} />
        ))}
      </div>
    </div>
  )
}

function Runner({
  run,
  at,
  onMove,
  onFinished,
  onScreened,
  onDiscarded,
}: {
  run: Run
  at: string
  onMove: (to: string, answers: AnswerMap) => void
  onFinished: () => void
  onScreened: () => void
  onDiscarded: () => void
}) {
  const { plan } = run
  const index = plan.screens.indexOf(at)
  const kind = screenKind(at)
  const [draft, setDraft] = useState<Draft>(() => draftFromAnswer(run.answers[at]))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const started = useRef(Date.now())
  const heading = useRef<HTMLHeadingElement>(null)

  // Each screen is a fresh Runner (keyed by the screen), so this runs once per
  // screen: put focus on its heading for a screen reader, and the top in view.
  useEffect(() => {
    heading.current?.focus()
    window.scrollTo(0, 0)
  }, [])

  const last = index === plan.screens.length - 1

  async function submit(skip: boolean) {
    setBusy(true)
    setError(null)
    const answer = skip ? { skipped: true } : answerFromDraft(at, draft)
    try {
      const res = await api.survey.answer({
        id: run.id,
        screen: at,
        answer,
        seconds: (Date.now() - started.current) / 1000,
      })
      if (res.status === 'screened_out') {
        clearStored()
        onScreened()
        return
      }
      // The same normalisation the server did, so Back shows what was stored.
      const checked = checkAnswer(plan, at, answer)
      const answers: AnswerMap = checked.ok ? { ...run.answers, [at]: checked.answer } : run.answers
      if (last) {
        await api.survey.complete(run.id)
        writeStored({ done: true })
        onFinished()
      } else {
        onMove(plan.screens[index + 1], answers)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function discard() {
    setBusy(true)
    try {
      await api.survey.discard(run.id)
    } catch {
      // Gone already, or unreachable: either way there is nothing more to do here.
    }
    clearStored()
    onDiscarded()
  }

  return (
    <div className="space-y-5">
      <Progress plan={plan} at={at} />

      {kind === 'intro' && <IntroScreen id={at.slice(6) as 'B' | 'C' | 'D' | 'E'} headingRef={heading} />}
      {kind === 'rank' && (
        <RankScreen task={plan.rank.find((t) => t.id === at)!} draft={draft} onChange={setDraft} headingRef={heading} />
      )}
      {kind === 'choice' && (
        <ChoiceScreen
          task={plan.choice.find((t) => t.id === at)!}
          plan={plan}
          draft={draft}
          onChange={setDraft}
          headingRef={heading}
        />
      )}
      {kind === 'question' && <QuestionScreen id={at} plan={plan} draft={draft} onChange={setDraft} headingRef={heading} />}

      {error && (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {index > 0 && (
          <Button size="lg" disabled={busy} onClick={() => onMove(plan.screens[index - 1], run.answers)}>
            Back
          </Button>
        )}
        <Button variant="primary" size="lg" disabled={busy || !canContinue(plan, at, draft)} onClick={() => submit(false)}>
          {last ? 'Finish' : kind === 'intro' ? 'Continue' : 'Next'}
        </Button>
        {canSkip(at) && (
          <Button variant="quiet" size="lg" disabled={busy} onClick={() => submit(true)}>
            Skip this question
          </Button>
        )}
      </div>

      <div className="border-t border-line pt-4">
        {confirming ? (
          <div className="space-y-2" role="alertdialog" aria-label="Close without saving">
            <p className="text-sm text-body">This deletes what you have answered so far. You can start again later.</p>
            <div className="flex gap-2">
              <Button variant="danger" size="lg" disabled={busy} onClick={discard}>
                Delete and close
              </Button>
              <Button size="lg" onClick={() => setConfirming(false)}>
                Keep going
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="quiet" onClick={() => setConfirming(true)}>
            Close without saving
          </Button>
        )}
      </div>
    </div>
  )
}

// ── The page ──────────────────────────────────────────────────────────────────

export function SurveyPage() {
  const status = useQuery({ queryKey: ['survey', 'status'], queryFn: api.survey.status, staleTime: 0, retry: 1 })
  const source = useMemo(() => sourceFromHash(window.location.hash), [])
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const previous = document.title
    document.title = 'Artist survey · Sun Dogs Music'
    // A survey link is for sharing with people, not for a search engine to list.
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex'
    document.head.appendChild(robots)
    return () => {
      document.title = previous
      robots.remove()
    }
  }, [])

  useEffect(() => {
    if (status.isError) {
      setPhase({ kind: 'error', message: 'The survey could not load. Please check your connection and try again.' })
      return
    }
    const s = status.data
    if (!s) return

    const stored = readStored()
    if (stored.done) {
      setPhase({ kind: 'already' })
      return
    }
    // Somebody partway through can still finish after the survey closes to new
    // people, so a saved response is looked for before the closed screen is shown.
    if (stored.id) {
      api.survey
        .resume(stored.id)
        .then((r) => {
          if (r.status === 'in_progress') setPhase({ kind: 'returning', run: { id: stored.id!, plan: r.plan, answers: r.answers } })
          else {
            if (r.status === 'complete') writeStored({ done: true })
            else clearStored()
            setPhase(r.status === 'complete' ? { kind: 'already' } : s.open ? { kind: 'consent' } : { kind: 'closed' })
          }
        })
        .catch(() => {
          clearStored()
          setPhase(s.open ? { kind: 'consent' } : { kind: 'closed' })
        })
      return
    }
    setPhase(s.open ? { kind: 'consent' } : { kind: 'closed' })
  }, [status.data, status.isError])

  async function start(token: string | null, honeypot: string) {
    setStarting(true)
    setStartError(null)
    try {
      const res = await api.survey.start({
        source,
        device: window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640 ? 'phone' : 'computer',
        token: token ?? undefined,
        website: honeypot || undefined,
      })
      writeStored({ id: res.id })
      setPhase({ kind: 'running', run: { id: res.id, plan: res.plan, answers: {} }, at: res.plan.screens[0] })
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'The survey could not start. Please try again.')
    } finally {
      setStarting(false)
    }
  }

  const contact = status.data?.contact

  if (phase.kind === 'loading') return <div className="min-h-screen bg-canvas" />

  return (
    <Shell contact={contact}>
      {phase.kind === 'error' && <Message title="Something went wrong" body={[phase.message]} />}

      {phase.kind === 'closed' && <Message title={tx(THANKS.closed.title)} body={THANKS.closed.body.map((b) => tx(b))} />}

      {phase.kind === 'consent' && status.data && (
        <ConsentScreen status={status.data} starting={starting} error={startError} onStart={start} />
      )}

      {phase.kind === 'returning' && (
        <Message title="Welcome back" body={['You started this survey earlier. You can carry on where you left off.']}>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="lg"
              onClick={() => setPhase({ kind: 'running', run: phase.run, at: resumeAt(phase.run.plan, phase.run.answers) })}
            >
              Continue
            </Button>
            <Button
              size="lg"
              onClick={async () => {
                await api.survey.discard(phase.run.id).catch(() => undefined)
                clearStored()
                setPhase({ kind: 'deleted' })
              }}
            >
              Delete it and start again
            </Button>
          </div>
        </Message>
      )}

      {phase.kind === 'running' && (
        <Runner
          key={phase.at}
          run={phase.run}
          at={phase.at}
          onMove={(to, answers) => setPhase({ kind: 'running', run: { ...phase.run, answers }, at: to })}
          onFinished={() => setPhase({ kind: 'done' })}
          onScreened={() => setPhase({ kind: 'screened' })}
          onDiscarded={() => setPhase({ kind: 'deleted' })}
        />
      )}

      {phase.kind === 'screened' && (
        <Message title={tx(THANKS.screenedOut.title)} body={THANKS.screenedOut.body.map((b) => tx(b))} />
      )}

      {phase.kind === 'deleted' && (
        <Message title="Your answers have been deleted" body={['Nothing from this visit was kept. Thank you for looking.']}>
          {status.data?.open && (
            <Button size="lg" onClick={() => setPhase({ kind: 'consent' })}>
              Start again
            </Button>
          )}
        </Message>
      )}

      {phase.kind === 'already' && (
        <Message title="You have already taken this survey" body={['Thank you. Each person only needs to take it once.']}>
          <Button
            variant="quiet"
            onClick={() => {
              clearStored()
              setPhase(status.data?.open ? { kind: 'consent' } : { kind: 'closed' })
            }}
          >
            This was not me. Start a new response.
          </Button>
        </Message>
      )}

      {phase.kind === 'done' && (
        <Message title={tx(THANKS.done.title)} body={THANKS.done.body.map((b) => tx(b))}>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              readOnly
              aria-label="Link to share"
              value={`${window.location.origin}${window.location.pathname}#survey?src=share`}
              className="flex-1 min-w-0"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              size="lg"
              onClick={() =>
                navigator.clipboard
                  .writeText(`${window.location.origin}${window.location.pathname}#survey?src=share`)
                  .then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  })
                  .catch(() => undefined)
              }
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        </Message>
      )}
    </Shell>
  )
}
