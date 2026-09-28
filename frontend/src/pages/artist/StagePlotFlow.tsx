import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import {
  INSTRUMENT_IDS,
  INSTRUMENTS,
  MAX_GEAR,
  MAX_PERFORMERS,
  NOTE_MAX,
  emptyPlot,
  performerName,
  performerRole,
  type ActShape,
  type InstrumentId,
  type Monitors,
  type Performer,
  type StagePlot,
} from '../../../../shared/stagePlot'
import type { StagePlotClues } from '../../../../shared/stagePlotClues'
import {
  Continue,
  FLOW_INPUT,
  FLOW_TEXTAREA,
  FlowShell,
  Kbd,
  OptionList,
  Question,
  type FlowOption,
} from '../../components/flow/QuestionFlow'

/**
 * The stage-plot survey: how the artist performs, one question at a time.
 *
 * Solo, duo or band; how many; then for each person their name, what they
 * play and sing, and any gear worth naming; then monitors, playback and a
 * note for the sound tech. Everything a tech needs beyond that — channels,
 * stands, phantom power, where the drops go — is derived by
 * `shared/stagePlot.ts`, so the survey never asks a musician for a console
 * number.
 *
 * What the documents already say is offered, never filled in silently: a
 * line-up size is pre-selected with the sentence that said it, a band
 * member's name is a suggestion to click, found gear is an option to tick.
 *
 * The whole plot is saved as each screen is left, so Esc keeps what is done.
 */

type Screen =
  | { id: 'intro' }
  | { id: 'act' }
  | { id: 'size' }
  | { id: 'name'; i: number }
  | { id: 'play'; i: number }
  | { id: 'gear'; i: number }
  | { id: 'monitors' }
  | { id: 'playback' }
  | { id: 'notes' }
  | { id: 'done' }

const ACT_OPTIONS: FlowOption[] = [
  { id: 'solo', label: 'Solo', hint: 'Just me' },
  { id: 'duo', label: 'Duo', hint: 'Two of us' },
  { id: 'band', label: 'Band', hint: 'Three or more' },
]

const MONITOR_OPTIONS: FlowOption[] = [
  { id: 'wedges', label: 'Floor wedges' },
  { id: 'iem', label: 'In-ear monitors' },
  { id: 'both', label: 'A mix of both' },
  { id: 'none', label: 'No monitors needed' },
]

const PLAYBACK_OPTIONS: FlowOption[] = [
  { id: 'yes', label: 'Yes', hint: 'Adds a stereo playback line' },
  { id: 'no', label: 'No' },
]

const VOCAL_OPTIONS: FlowOption[] = [
  { id: 'vocals:lead', label: 'Lead vocals' },
  { id: 'vocals:backing', label: 'Backing vocals' },
]

function screensFor(plot: StagePlot): Screen[] {
  const out: Screen[] = [{ id: 'intro' }, { id: 'act' }]
  if (plot.act === 'band') out.push({ id: 'size' })
  plot.performers.forEach((_, i) => {
    out.push({ id: 'name', i }, { id: 'play', i }, { id: 'gear', i })
  })
  out.push({ id: 'monitors' }, { id: 'playback' }, { id: 'notes' }, { id: 'done' })
  return out
}

function keyOf(s: Screen): string {
  return 'i' in s ? `${s.id}:${s.i}` : s.id
}

/** Resize the line-up, keeping everybody already described. */
function resize(plot: StagePlot, act: ActShape, count: number): StagePlot {
  const fresh = emptyPlot(act, count, plot.performers[0]?.name ?? '')
  return {
    ...plot,
    act,
    performers: fresh.performers.map((p, i) => plot.performers[i] ?? { ...p, vocals: 'none' }),
  }
}

export function StagePlotFlow({
  initial,
  clues,
  displayName,
  onClose,
}: {
  initial: StagePlot | null
  clues: StagePlotClues
  displayName: string | null
  onClose: (saved: boolean) => void
}) {
  const qc = useQueryClient()
  const [plot, setPlot] = useState<StagePlot>(() => {
    if (initial) return initial
    const act = clues.act?.act ?? 'solo'
    return emptyPlot(act, clues.act?.size ?? 4, displayName ?? '')
  })
  const [touched, setTouched] = useState(initial !== null)
  const [at, setAt] = useState(initial ? 1 : 0)
  const [advance, setAdvance] = useState(0)
  const [nudge, setNudge] = useState<string | null>(null)

  const screens = useMemo(() => screensFor(plot), [plot])
  const screen = screens[Math.min(at, screens.length - 1)]

  const save = useMutation({
    mutationFn: (p: StagePlot) => {
      const { updatedAt: _, ...body } = p
      return api.stagePlot.save(body)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stage-plot'] }),
  })

  const persist = useCallback(() => {
    if (touched) save.mutate(plot)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touched, plot])

  const update = (fn: (p: StagePlot) => StagePlot) => {
    setTouched(true)
    setNudge(null)
    setPlot(fn)
  }
  const updatePerformer = (i: number, fn: (p: Performer) => Performer) =>
    update((p) => ({ ...p, performers: p.performers.map((x, k) => (k === i ? fn(x) : x)) }))

  const next = useCallback(() => {
    if (screen.id === 'play') {
      const p = plot.performers[screen.i]
      if (p.instruments.length === 0 && p.vocals === 'none') {
        setNudge('Choose at least one thing they play or sing.')
        return
      }
    }
    if (screen.id === 'done') {
      onClose(true)
      return
    }
    persist()
    setNudge(null)
    setAt((a) => Math.min(a + 1, screens.length - 1))
  }, [screen, plot, persist, screens.length, onClose])

  const back = useCallback(() => {
    persist()
    setNudge(null)
    setAt((a) => Math.max(0, a - 1))
  }, [persist])

  const close = useCallback(() => {
    persist()
    onClose(touched)
  }, [persist, onClose, touched])

  // Choosing a single answer moves on by itself, once the choice has rendered.
  useEffect(() => {
    if (advance > 0) next()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advance])

  // ── Options on this screen, for the letter keys ─────────────────────────
  const clueFor = (id: InstrumentId) => clues.instruments.find((c) => c.instrument === id)
  const playOptions: FlowOption[] = [
    ...VOCAL_OPTIONS,
    ...INSTRUMENT_IDS.map((id) => {
      const clue = clueFor(id)
      return { id, label: INSTRUMENTS[id].label, hint: clue ? `Mentioned in ${clue.source}` : undefined }
    }),
  ]
  const gearOptions: FlowOption[] = clues.gear.map((g) => ({ id: g.item, label: g.item, hint: `From ${g.source}` }))

  const options: FlowOption[] =
    screen.id === 'act'
      ? ACT_OPTIONS
      : screen.id === 'play'
        ? playOptions
        : screen.id === 'gear'
          ? gearOptions
          : screen.id === 'monitors'
            ? MONITOR_OPTIONS
            : screen.id === 'playback'
              ? PLAYBACK_OPTIONS
              : []

  const choose = useCallback(
    (id: string) => {
      if (screen.id === 'act') {
        update((p) => resize(p, id as ActShape, p.act === 'band' ? p.performers.length : clues.act?.size ?? 4))
        setAdvance((n) => n + 1)
      } else if (screen.id === 'monitors') {
        update((p) => ({ ...p, monitors: id as Monitors }))
        setAdvance((n) => n + 1)
      } else if (screen.id === 'playback') {
        update((p) => ({ ...p, playback: id === 'yes' }))
        setAdvance((n) => n + 1)
      } else if (screen.id === 'play') {
        const i = screen.i
        if (id.startsWith('vocals:')) {
          const v = id.slice('vocals:'.length) as 'lead' | 'backing'
          updatePerformer(i, (p) => ({ ...p, vocals: p.vocals === v ? 'none' : v }))
        } else {
          const inst = id as InstrumentId
          updatePerformer(i, (p) => ({
            ...p,
            instruments: p.instruments.includes(inst) ? p.instruments.filter((x) => x !== inst) : [...p.instruments, inst],
          }))
        }
      } else if (screen.id === 'gear') {
        updatePerformer(screen.i, (p) => ({
          ...p,
          gear: p.gear.includes(id) ? p.gear.filter((g) => g !== id) : [...p.gear, id],
        }))
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [screen, clues],
  )

  // ── Rendering ──────────────────────────────────────────────────────────
  const index = screens.indexOf(screen)
  const who = (i: number) => (plot.act === 'solo' ? 'You' : `Performer ${i + 1} of ${plot.performers.length}`)
  const usedNames = new Set(plot.performers.map((p) => p.name.trim().toLowerCase()).filter(Boolean))

  let body: ReactNode = null
  switch (screen.id) {
    case 'intro':
      body = (
        <>
          <h1 className="text-3xl sm:text-4xl font-semibold text-ink tracking-tight">Build your stage plot</h1>
          <p className="text-lg text-body">
            A few questions about how you perform, and Scout draws a stage plot and input list you can send to
            any venue or festival.
          </p>
          {(clues.act || clues.members.length > 0 || clues.gear.length > 0 || clues.instruments.length > 0) && (
            <div className="rounded-lg border border-line-strong px-4 py-3 space-y-1">
              <p className="font-medium text-ink">Scout read your documents and library first</p>
              <p className="text-sm text-body">
                It found{' '}
                {[
                  clues.act ? 'your line-up' : null,
                  clues.members.length ? `${clues.members.length} band ${clues.members.length === 1 ? 'member' : 'members'}` : null,
                  clues.instruments.length ? `${clues.instruments.length} ${clues.instruments.length === 1 ? 'instrument' : 'instruments'}` : null,
                  clues.gear.length ? `${clues.gear.length} pieces of gear` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
                . You’ll see them as suggestions along the way — nothing is filled in without you.
              </p>
            </div>
          )}
          <p className="text-body">It takes two or three minutes. You can stop and pick up later.</p>
          <Continue label="Start" onClick={next} />
        </>
      )
      break

    case 'act':
      body = (
        <>
          <Question title="How do you perform?" />
          <OptionList label="Line-up" options={ACT_OPTIONS} selected={new Set([plot.act])} onChoose={choose} multiple={false} />
          {clues.act && (
            <p className="text-sm text-muted">
              Your {clues.act.source} says: “{clues.act.quote}”
            </p>
          )}
          <Continue onClick={next} hint={<>Press <Kbd>A</Kbd>, <Kbd>B</Kbd> or <Kbd>C</Kbd></>} />
        </>
      )
      break

    case 'size':
      body = (
        <>
          <Question title="How many people are on stage?">Count everyone who plays or sings.</Question>
          <input
            data-autofocus
            type="number"
            min={3}
            max={MAX_PERFORMERS}
            value={plot.performers.length}
            onChange={(e) => {
              const n = Math.max(3, Math.min(MAX_PERFORMERS, Number(e.target.value) || 3))
              update((p) => resize(p, 'band', n))
            }}
            className={`${FLOW_INPUT} max-w-[8rem]`}
            aria-label="Number of performers"
          />
          <Continue onClick={next} />
        </>
      )
      break

    case 'name': {
      const i = screen.i
      const p = plot.performers[i]
      const suggestions = clues.members.filter(
        (m) => !usedNames.has(m.name.toLowerCase()) || m.name.toLowerCase() === p.name.trim().toLowerCase(),
      )
      body = (
        <>
          <Question step={who(i)} title={plot.act === 'solo' ? 'What name should the plot show?' : 'What’s their name?'}>
            {plot.act === 'solo' ? 'Your name or stage name.' : 'As the sound tech should call them.'}
          </Question>
          <input
            data-autofocus
            value={p.name}
            maxLength={80}
            placeholder="Type a name"
            onChange={(e) => updatePerformer(i, (x) => ({ ...x, name: e.target.value }))}
            className={FLOW_INPUT}
            aria-label="Name"
          />
          {suggestions.length > 0 && plot.act !== 'solo' && (
            <div className="space-y-2">
              <p className="text-sm text-muted">From your documents — click to use</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() => {
                      updatePerformer(i, (x) => ({
                        ...x,
                        name: m.name,
                        instruments: x.instruments.length ? x.instruments : m.instruments,
                        vocals: x.vocals !== 'none' ? x.vocals : m.vocals ? 'backing' : 'none',
                      }))
                      // Back to the name box, so the next Enter moves on
                      // rather than pressing this suggestion again.
                      document.querySelector<HTMLElement>('[role="dialog"] [data-autofocus]')?.focus()
                    }}
                    title={`${m.source}: “${m.quote}”`}
                    className="rounded-full border border-line-strong px-3 py-1 text-sm text-body hover:bg-sunken hover:text-ink transition-colors"
                  >
                    {m.name}
                    {m.instruments.length > 0 && (
                      <span className="text-muted"> · {m.instruments.map((x) => INSTRUMENTS[x].label.toLowerCase()).join(', ')}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Continue label={p.name.trim() ? 'OK' : 'Skip'} onClick={next} />
        </>
      )
      break
    }

    case 'play': {
      const i = screen.i
      const p = plot.performers[i]
      const selected = new Set<string>([
        ...(p.vocals !== 'none' ? [`vocals:${p.vocals}`] : []),
        ...p.instruments,
      ])
      body = (
        <>
          <Question
            step={who(i)}
            title={plot.act === 'solo' ? 'What do you play and sing?' : `What does ${performerName(p, i)} play and sing?`}
          >
            Choose everything they use on stage.
          </Question>
          <OptionList label="Instruments" options={playOptions} selected={selected} onChoose={choose} />
          <Continue onClick={next} hint={<>Press a letter to choose, <Kbd>Enter</Kbd> to continue</>} />
          {nudge && <p className="text-sm text-danger-fg">{nudge}</p>}
        </>
      )
      break
    }

    case 'gear': {
      const i = screen.i
      const p = plot.performers[i]
      const clueItems = new Set(clues.gear.map((g) => g.item))
      const extras = p.gear.filter((g) => !clueItems.has(g))
      body = (
        <>
          <Question step={who(i)} title={`Any gear the sound tech should know about?`}>
            Amps, pedalboards, a particular DI or mic{' '}
            {plot.act === 'solo' ? 'you bring' : `${performerName(p, i)} brings`}. Optional.
          </Question>
          {gearOptions.length > 0 && (
            <>
              <p className="text-sm text-muted">Found in your documents</p>
              <OptionList label="Gear found" options={gearOptions} selected={new Set(p.gear)} onChoose={choose} />
            </>
          )}
          <label className="block">
            <span className="text-sm text-muted">{gearOptions.length ? 'Anything else, one per line' : 'One item per line'}</span>
            <textarea
              rows={3}
              value={extras.join('\n')}
              placeholder="For example: Fender Deluxe Reverb"
              onChange={(e) => {
                const lines = e.target.value.split('\n').map((l) => l.slice(0, 120))
                updatePerformer(i, (x) => ({
                  ...x,
                  gear: [...x.gear.filter((g) => clueItems.has(g)), ...lines].slice(0, MAX_GEAR),
                }))
              }}
              onBlur={() =>
                updatePerformer(i, (x) => ({ ...x, gear: x.gear.map((g) => g.trim()).filter(Boolean) }))
              }
              className={FLOW_TEXTAREA}
            />
          </label>
          <Continue
            label={p.gear.some((g) => g.trim()) ? 'OK' : 'Skip'}
            onClick={next}
            hint={<><Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> for a new line</>}
          />
        </>
      )
      break
    }

    case 'monitors':
      body = (
        <>
          <Question title="How do you hear yourselves on stage?" />
          <OptionList label="Monitors" options={MONITOR_OPTIONS} selected={new Set([plot.monitors])} onChoose={choose} multiple={false} />
          <Continue onClick={next} />
        </>
      )
      break

    case 'playback':
      body = (
        <>
          <Question title="Do you play with backing tracks or a click?" />
          <OptionList
            label="Playback"
            options={PLAYBACK_OPTIONS}
            selected={new Set([plot.playback ? 'yes' : 'no'])}
            onChoose={choose}
            multiple={false}
          />
          <Continue onClick={next} />
        </>
      )
      break

    case 'notes':
      body = (
        <>
          <Question title="Anything else the sound tech should know?">
            A riser for the drums, a chair, a stool, a guest who joins for one song. Optional.
          </Question>
          <textarea
            data-autofocus
            rows={3}
            value={plot.notes ?? ''}
            maxLength={NOTE_MAX}
            placeholder="Type your answer here"
            onChange={(e) => update((p) => ({ ...p, notes: e.target.value || null }))}
            className={FLOW_TEXTAREA}
            aria-label="Notes for the sound tech"
          />
          <Continue
            label={plot.notes?.trim() ? 'OK' : 'Skip'}
            onClick={next}
            hint={<><Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> for a new line</>}
          />
        </>
      )
      break

    case 'done':
      body = (
        <>
          <h1 className="text-3xl font-semibold text-ink tracking-tight">Your stage plot is ready.</h1>
          <ul className="space-y-2">
            {plot.performers.map((p, i) => (
              <li key={p.id} className="rounded-lg border border-line-strong px-4 py-2.5">
                <p className="font-medium text-ink">{performerName(p, i)}</p>
                <p className="text-sm text-muted">{performerRole(p)}</p>
              </li>
            ))}
          </ul>
          <Continue label="See the stage plot" onClick={next} />
        </>
      )
      break
  }

  return (
    <FlowShell
      label="Stage plot questions"
      screenKey={keyOf(screen)}
      progress={Math.round((index / (screens.length - 1)) * 100)}
      closeLabel={screen.id === 'done' ? 'Close' : 'Finish later'}
      onClose={close}
      onNext={next}
      onBack={back}
      options={options}
      onChoose={choose}
      arrows={screen.id !== 'intro' && screen.id !== 'done'}
    >
      {body}
      {save.error && (
        <p className="text-sm text-danger-fg">
          An answer didn’t save ({save.error instanceof Error ? save.error.message : 'unknown error'}). Press Enter to
          try again.
        </p>
      )}
    </FlowShell>
  )
}
