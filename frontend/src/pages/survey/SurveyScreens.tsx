import type { ReactNode, Ref } from 'react'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { chooseOption, pickRank, toggleOption, type Draft } from '../../../../shared/surveyDraft'
import type { ChoiceTask, Plan, RankTask } from '../../../../shared/surveyDesign'
import {
  ATTRIBUTES,
  FACTORS,
  INTROS,
  optionOf,
  questionOf,
  tx,
  type ChoiceQuestion,
  type TextQuestion,
} from '../../../../shared/surveyInstrument'
import { OTHER_MAX } from '../../../../shared/surveyAnswers'

/**
 * The screens a respondent sees. Thin on purpose: each renders a draft and
 * reports a tap, and `shared/surveyDraft.ts` decides what the tap means.
 *
 * Built for a phone first. One question to a screen, a tap target at least
 * forty pixels tall, no grid, and nothing that depends on colour alone — a
 * chosen option is bordered, tinted and ticked, and the native radio or
 * checkbox carries the state for a screen reader.
 */

const HEADING = 'text-xl font-semibold text-ink tracking-tight focus:outline-none'

/** A single option row. The native control carries the state; the border and tint repeat it. */
function Row({
  type,
  name,
  checked,
  disabled,
  onChange,
  children,
}: {
  type: 'radio' | 'checkbox'
  name: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
  children: ReactNode
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border px-3 py-3 transition-colors cursor-pointer
        focus-within:ring-2 focus-within:ring-accent
        ${checked ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-sunken'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
      />
      <span className="text-sm text-ink leading-snug">{children}</span>
    </label>
  )
}

export function IntroScreen({ id, headingRef }: { id: 'B' | 'C' | 'D' | 'E'; headingRef: Ref<HTMLHeadingElement> }) {
  const intro = INTROS[id]
  return (
    <div className="space-y-3">
      <h1 ref={headingRef} tabIndex={-1} className={HEADING}>
        {tx(intro.title)}
      </h1>
      {intro.body.map((p, i) => (
        <p key={i} className="text-sm text-body leading-relaxed">
          {tx(p)}
        </p>
      ))}
    </div>
  )
}

export function QuestionScreen({
  id,
  plan,
  draft,
  onChange,
  headingRef,
}: {
  id: string
  plan: Plan
  draft: Draft
  onChange: (d: Draft) => void
  headingRef: Ref<HTMLHeadingElement>
}) {
  const question = questionOf(id)
  if (!question) return null

  const head = (
    <>
      <h1 ref={headingRef} tabIndex={-1} className={HEADING}>
        {tx(question.prompt)}
      </h1>
      {question.help && <p className="text-sm text-muted">{tx(question.help)}</p>}
    </>
  )

  if (question.kind === 'text') {
    const q = question as TextQuestion
    const text = draft.text ?? ''
    return (
      <div className="space-y-3">
        {head}
        <Textarea
          rows={5}
          maxLength={q.maxLength}
          value={text}
          onChange={(e) => onChange({ ...draft, text: e.target.value })}
          aria-label={tx(q.prompt)}
          className="text-base"
        />
        <p className="text-xs text-faint" aria-live="polite">
          {text.length} of {q.maxLength} characters
        </p>
      </div>
    )
  }

  const q = question as ChoiceQuestion
  const order = (plan.options[id] ?? q.options.map((o) => o.id)).map((oid) => optionOf(q, oid)!).filter(Boolean)
  const chosen = Array.isArray(draft.value) ? draft.value : draft.value ? [draft.value] : []
  const other = order.find((o) => o.other && chosen.includes(o.id))

  const otherBox = other && (
    <div className="pl-8">
      <label className="block text-xs text-muted mb-1" htmlFor={`${id}-other`}>
        {other.id === 'E2.self' ? 'In your own words (optional)' : 'Please specify (optional)'}
      </label>
      <Input
        id={`${id}-other`}
        maxLength={OTHER_MAX}
        value={draft.other ?? ''}
        onChange={(e) => onChange({ ...draft, other: e.target.value })}
        className="text-base"
      />
    </div>
  )

  if (q.kind === 'select') {
    return (
      <div className="space-y-3">
        {head}
        <Select
          aria-label={tx(q.prompt)}
          value={typeof draft.value === 'string' ? draft.value : ''}
          onChange={(e) => onChange(e.target.value ? chooseOption(q, draft, e.target.value) : { ...draft, value: undefined })}
          className="text-base"
        >
          <option value="">Choose one…</option>
          {order.map((o) => (
            <option key={o.id} value={o.id}>
              {tx(o.text)}
            </option>
          ))}
        </Select>
        {otherBox}
      </div>
    )
  }

  const multi = q.kind === 'multi'
  return (
    <div className="space-y-3">
      {head}
      <fieldset className="space-y-2" aria-label={tx(q.prompt)}>
        {order.map((o) => (
          <Row
            key={o.id}
            type={multi ? 'checkbox' : 'radio'}
            name={id}
            checked={chosen.includes(o.id)}
            onChange={() => onChange(multi ? toggleOption(q, draft, o.id) : chooseOption(q, draft, o.id))}
          >
            {tx(o.text)}
          </Row>
        ))}
      </fieldset>
      {otherBox}
    </div>
  )
}

export function RankScreen({
  task,
  draft,
  onChange,
  headingRef,
}: {
  task: RankTask
  draft: Draft
  onChange: (d: Draft) => void
  headingRef: Ref<HTMLHeadingElement>
}) {
  return (
    <div className="space-y-3">
      <h1 ref={headingRef} tabIndex={-1} className={HEADING}>
        Which matters most, and which matters least?
      </h1>
      <p className="text-sm text-muted">
        When you are deciding whether an opportunity is worth your time to apply. Choose one of each.
      </p>
      <ul className="space-y-3">
        {task.items.map((itemId) => {
          const factor = FACTORS.find((f) => f.id === itemId)!
          const label = tx(factor.text)
          return (
            <li key={itemId} className="rounded-lg border border-line bg-surface p-3 space-y-2">
              <p className="text-sm text-ink leading-snug">{label}</p>
              <div className="grid grid-cols-2 gap-2">
                <Row
                  type="radio"
                  name={`${task.id}-most`}
                  checked={draft.best === itemId}
                  onChange={() => onChange(pickRank(draft, 'best', itemId))}
                >
                  <span className="sr-only">{label}: </span>Most
                </Row>
                <Row
                  type="radio"
                  name={`${task.id}-least`}
                  checked={draft.worst === itemId}
                  onChange={() => onChange(pickRank(draft, 'worst', itemId))}
                >
                  <span className="sr-only">{label}: </span>Least
                </Row>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * The two opportunities as one table, a row per attribute, rather than two
 * stacked cards. On a phone a card each means scrolling between the two things
 * being compared, which is the whole of the question; three columns fit in
 * the width of a screen and put the trade-off in one view.
 */
function Comparison({ task, plan }: { task: ChoiceTask; plan: Plan }) {
  return (
    <div className="rounded-lg border border-line bg-surface overflow-hidden">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Opportunity A and Opportunity B, compared</caption>
        <thead>
          <tr className="border-b border-line bg-sunken">
            <td className="w-[34%] p-2" />
            <th scope="col" className="p-2 font-semibold text-ink">Opportunity A</th>
            <th scope="col" className="p-2 font-semibold text-ink">Opportunity B</th>
          </tr>
        </thead>
        <tbody>
          {plan.attributeOrder.map((attrId) => {
            const index = ATTRIBUTES.findIndex((a) => a.id === attrId)
            const attr = ATTRIBUTES[index]
            return (
              <tr key={attrId} className="border-b border-line last:border-b-0 align-top">
                <th scope="row" className="p-2 text-xs font-normal text-muted">{tx(attr.label)}</th>
                <td className="p-2 font-medium text-ink">{tx(attr.levels[task.a[index]].text)}</td>
                <td className="p-2 font-medium text-ink">{tx(attr.levels[task.b[index]].text)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ChoiceScreen({
  task,
  plan,
  draft,
  onChange,
  headingRef,
}: {
  task: ChoiceTask
  plan: Plan
  draft: Draft
  onChange: (d: Draft) => void
  headingRef: Ref<HTMLHeadingElement>
}) {
  return (
    <div className="space-y-3">
      <h1 ref={headingRef} tabIndex={-1} className={HEADING}>
        Which would you rather apply to?
      </h1>
      <p className="text-sm text-muted">Everything not shown is the same. If neither appeals to you, choose Neither.</p>
      <Comparison task={task} plan={plan} />
      <fieldset className="space-y-2" aria-label="Your choice">
        {(
          [
            ['a', 'Opportunity A'],
            ['b', 'Opportunity B'],
            ['none', 'Neither'],
          ] as const
        ).map(([value, label]) => (
          <Row key={value} type="radio" name={`${task.id}-choice`} checked={draft.choice === value} onChange={() => onChange({ ...draft, choice: value })}>
            {label}
          </Row>
        ))}
      </fieldset>
    </div>
  )
}
