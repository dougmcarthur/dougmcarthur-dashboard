import { useState, type ReactNode } from 'react'
import type { NoteAlert, DraftedField } from '../lib/reviewParse'
import type { ReviewFlag, ReviewKind } from '../lib/reviewQueue'

export type PanelTone = 'neutral' | 'danger' | 'warn' | 'info' | 'accent'

const PANEL_TONES: Record<PanelTone, { box: string; head: string }> = {
  neutral: { box: 'bg-white border-gray-200', head: 'text-gray-500' },
  danger: { box: 'bg-red-50 border-red-200', head: 'text-red-700' },
  warn: { box: 'bg-amber-50 border-amber-200', head: 'text-amber-700' },
  info: { box: 'bg-blue-50/60 border-blue-200', head: 'text-blue-700' },
  accent: { box: 'bg-purple-50/50 border-purple-200', head: 'text-purple-700' },
}

/** One titled container. Every parsed fact type gets its own. */
export function Panel({
  title,
  tone = 'neutral',
  count,
  action,
  children,
}: {
  title: string
  tone?: PanelTone
  count?: number
  action?: ReactNode
  children: ReactNode
}) {
  const styles = PANEL_TONES[tone]
  return (
    <section className={`rounded-lg border ${styles.box}`}>
      <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <h3 className={`text-xs font-semibold uppercase tracking-wider ${styles.head}`}>
          {title}
          {count !== undefined && count > 0 && (
            <span className="ml-2 font-normal opacity-60">{count}</span>
          )}
        </h3>
        {action}
      </header>
      <div className="px-4 pb-4">{children}</div>
    </section>
  )
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          setCopied(false)
        }
      }}
      className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-white hover:text-gray-800 transition-colors"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

const SEVERITY_STYLES = {
  danger: 'bg-red-100 text-red-800 border-red-200',
  warn: 'bg-amber-100 text-amber-800 border-amber-200',
  info: 'bg-gray-100 text-gray-600 border-gray-200',
} as const

export function FlagChip({ flag }: { flag: ReviewFlag }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[flag.severity]}`}
    >
      {flag.label}
    </span>
  )
}

const KIND_STYLES: Record<ReviewKind, string> = {
  gig: 'bg-sky-100 text-sky-800',
  sync: 'bg-purple-100 text-purple-800',
  promo: 'bg-teal-100 text-teal-800',
}

export function KindTag({ kind }: { kind: ReviewKind }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_STYLES[kind]}`}>
      {kind}
    </span>
  )
}

export function AlertList({ alerts }: { alerts: NoteAlert[] }) {
  return (
    <ul className="space-y-2">
      {alerts.map((alert, i) => (
        <li
          key={i}
          className={`rounded-md border px-3 py-2 text-sm leading-relaxed ${
            alert.severity === 'danger'
              ? 'bg-white border-red-200 text-red-800'
              : alert.severity === 'warn'
              ? 'bg-white border-amber-200 text-amber-800'
              : 'bg-white border-gray-200 text-gray-600'
          }`}
        >
          {alert.flaggedAt && (
            <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-500">
              {alert.flaggedAt}
            </span>
          )}
          {alert.text}
        </li>
      ))}
    </ul>
  )
}

/** The drafted application values, as a copyable label/value table. */
export function FieldTable({ fields }: { fields: DraftedField[] }) {
  return (
    <dl className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
      {fields.map((field, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-2">
          <dt className="w-40 shrink-0 text-xs font-medium text-gray-500 pt-0.5">
            {field.label || <span className="text-gray-300">—</span>}
          </dt>
          <dd
            className={`min-w-0 flex-1 text-sm break-words ${
              field.needsDoug ? 'text-amber-700 font-medium' : 'text-gray-800'
            }`}
          >
            {field.value}
          </dd>
          <div className="shrink-0 pt-0.5">
            <CopyButton text={field.value} />
          </div>
        </div>
      ))}
    </dl>
  )
}

export function BulletList({ items, tone = 'gray' }: { items: string[]; tone?: 'gray' | 'amber' }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li
          key={i}
          className={`flex gap-2 text-sm leading-relaxed ${tone === 'amber' ? 'text-amber-900' : 'text-gray-700'}`}
        >
          <span className={tone === 'amber' ? 'text-amber-400' : 'text-gray-300'}>•</span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** Collapsible original note, so the parse never hides the source text. */
export function RawNote({ note }: { note: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
      >
        <span>{open ? 'Hide' : 'Show'} original note text</span>
        <span className="font-mono">{note.length} chars</span>
      </button>
      {open && (
        <pre className="whitespace-pre-wrap break-words border-t border-gray-100 px-4 py-3 text-xs leading-relaxed text-gray-600 font-sans">
          {note}
        </pre>
      )}
    </div>
  )
}
