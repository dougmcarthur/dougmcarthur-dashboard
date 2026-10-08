import type { ReactElement, ReactNode } from 'react'
import { KIND_LABELS, type NotificationKind, type NotificationTier } from '../api'

/**
 * The pieces the bell and the History page share.
 *
 * History is the bell with the cap taken off, so the two have to agree on what
 * a kind looks like: the same icon, the same tint for a critical, the same
 * filter chip. They were one file's private business until the second screen
 * needed them, and a second copy of an icon table is how a type ends up with
 * two faces.
 */

export function Icon({ name, className }: { name: string; className?: string }) {
  const paths: Record<string, ReactElement> = {
    bell: (
      <>
        <path d="M4.2 6.6a3.8 3.8 0 0 1 7.6 0c0 3 1.2 4 1.2 4H3s1.2-1 1.2-4z" />
        <path d="M6.6 13a1.6 1.6 0 0 0 2.8 0" />
      </>
    ),
    alert: (
      <>
        <path d="M8 2.8 14 13H2z" />
        <path d="M8 6.6v2.6" />
      </>
    ),
    clock: (
      <>
        <circle cx="8" cy="8" r="6" />
        <path d="M8 4.8V8l2.2 1.6" />
      </>
    ),
    info: (
      <>
        <circle cx="8" cy="8" r="6" />
        <path d="M8 7.4v3.4M8 5.2v.1" />
      </>
    ),
    plug: (
      <>
        <path d="M6 2.5v3M10 2.5v3" />
        <path d="M4 5.5h8v2a4 4 0 0 1-8 0z" />
        <path d="M8 11.5v2" />
      </>
    ),
    pulse: <path d="M1.5 8h3l2-4.5 3 9 2-4.5h3" />,
    moon: <path d="M13 9.4A5.6 5.6 0 0 1 6.6 3 5.6 5.6 0 1 0 13 9.4z" />,
    bolt: <path d="M9 1.8 3.8 9h3.4l-.6 5.2L12.2 7H8.8z" />,
    mail: (
      <>
        <rect x="1.8" y="3.5" width="12.4" height="9" rx="1.5" />
        <path d="m2.4 4.6 5.6 4 5.6-4" />
      </>
    ),
    swap: (
      <>
        <path d="M2.5 5.5h9l-2-2M13.5 10.5h-9l2 2" />
      </>
    ),
    x: <path d="M4.5 4.5l7 7m0-7l-7 7" />,
    chevron: <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />,
    // A clock with its hand run backwards: what happened, not what is due.
    history: (
      <>
        <path d="M2.4 8a5.6 5.6 0 1 0 1.7-4" />
        <path d="M2.4 2.6v3h3" />
        <path d="M8 5v3.2l2 1.3" />
      </>
    ),
    // An open book: the answers that are kept ready.
    book: (
      <>
        <path d="M2 3.5h4.2c1 0 1.8.8 1.8 1.8V13c0-.8-.7-1.5-1.5-1.5H2z" />
        <path d="M14 3.5H9.8C8.8 3.5 8 4.3 8 5.3V13c0-.8.7-1.5 1.5-1.5H14z" />
      </>
    ),
    user: (
      <>
        <circle cx="8" cy="5.5" r="2.5" />
        <path d="M3 13.5c.5-2.5 2.5-4 5-4s4.5 1.5 5 4" />
      </>
    ),
    // A drawing pin, and the same with a line through it for taking it out.
    pin: (
      <>
        <path d="M9.6 2.4 13.6 6.4" />
        <path d="M10.4 3.6 6.6 7.2 3.8 7.4l4.8 4.8.2-2.8 3.6-3.8" />
        <path d="M6.2 9.8 2.6 13.4" />
      </>
    ),
    'pin-off': (
      <>
        <path d="M9.6 2.4 13.6 6.4" />
        <path d="M10.4 3.6 6.6 7.2 3.8 7.4l4.8 4.8.2-2.8 3.6-3.8" />
        <path d="M6.2 9.8 2.6 13.4" />
        <path d="M2 2l12 12" />
      </>
    ),
  }
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

/**
 * Icon carries the *kind*, colour carries the tier.
 *
 * Two channels for two facts, rather than both saying severity twice and
 * neither saying what the thing is about.
 */
export const KIND_ICON: Record<NotificationKind, string> = {
  connection: 'plug',
  health: 'pulse',
  timing: 'clock',
  snooze: 'moon',
  automation: 'bolt',
  digest: 'mail',
  reconcile: 'swap',
  feedback: 'mail',
  signup: 'mail',
}

export const TIER_ICON: Record<NotificationTier, string> = {
  critical: 'alert',
  attention: 'clock',
  info: 'info',
}

/** Same colours the row icons use, so the bar and the list agree. */
export const TIER_CHIP_TINT: Record<NotificationTier, string> = {
  critical: 'text-danger-fg',
  attention: 'text-ink',
  info: 'text-muted',
}

export const TIER_LABELS: Record<NotificationTier, string> = {
  critical: 'Critical',
  attention: 'Attention',
  info: 'Info',
}

/** The bordered square a row opens with. */
export function KindIcon({ kind, tier }: { kind: NotificationKind; tier: NotificationTier }) {
  return (
    <span
      className={`mt-0.5 shrink-0 grid place-items-center h-7 w-7 rounded-lg border ${
        tier === 'critical' ? 'text-danger-fg border-danger-line' : 'text-muted border-line'
      }`}
      title={`${KIND_LABELS[kind]} · ${TIER_LABELS[tier]}`}
    >
      <Icon name={KIND_ICON[kind] ?? TIER_ICON[tier]} className="h-3.5 w-3.5" />
    </span>
  )
}

/**
 * A filter chip: a label or an icon, and the number that clicking would leave
 * you looking at.
 */
export function FilterChip({
  active,
  count,
  onClick,
  icon,
  iconClass,
  label,
  children,
}: {
  active: boolean
  count: number
  onClick: () => void
  icon?: string
  iconClass?: string
  /** Accessible name, for the chips that show only an icon and a number. */
  label: string
  children?: ReactNode
}) {
  // A chip that would leave you looking at nothing is shown, not hidden —
  // removing it would make the row reflow under the cursor mid-click — but it
  // is disabled, so the count and the affordance agree.
  const empty = count === 0
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty && !active}
      aria-pressed={active}
      aria-label={children ? undefined : `${label}, ${count}`}
      title={children ? undefined : label}
      className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-lg border text-xs font-semibold
                  transition-colors whitespace-nowrap disabled:opacity-40 ${
                    active
                      ? 'bg-accent text-accent-fg border-accent'
                      : 'bg-surface text-body border-line enabled:hover:bg-sunken'
                  }`}
    >
      {icon && <Icon name={icon} className={`h-3.5 w-3.5 ${active ? '' : (iconClass ?? '')}`} />}
      {children}
      <span className={`tabular-nums ${active ? '' : 'text-muted'}`}>{count}</span>
    </button>
  )
}

/**
 * A square icon-only button, named for assistive technology and for the mouse.
 *
 * The side panel's header has four things to offer in a space that fits about
 * three words, so they are icons; an icon with no name is a guess, so every one
 * carries its label twice.
 */
export function IconButton({
  label,
  icon,
  onClick,
  className = '',
}: {
  label: string
  icon: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid place-items-center h-7 w-7 shrink-0 rounded-md text-muted hover:text-ink hover:bg-sunken transition-colors ${className}`}
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  )
}
