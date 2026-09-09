import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  api,
  KIND_LABELS,
  type AppNotification,
  type NotificationFeed,
  type NotificationKind,
  type NotificationTier,
} from '../api'
import { relativeTime } from '../format'

/**
 * The bell.
 *
 * Two rules do most of the work here. The badge counts *unread*, never
 * unresolved — a badge that cannot reach zero is worse than no badge, because
 * it teaches you to stop looking. And opening the panel does not mark anything
 * read: a badge that clears on a glance clears before you have read anything.
 * Reading happens when you open an item, or when you say so.
 */

/**
 * Poll only while the tab is visible; a backgrounded tab should cost nothing.
 *
 * Five minutes rather than one, and the reason is what a poll costs rather
 * than what it shows. `composeFeed` reads every gig, every sync target and
 * every promo draft to answer — about 155 rows on this database — so a tab
 * left open for eight hours spent roughly 74,000 D1 row reads a day on a bell
 * that almost never changed. Nothing in the feed is minute-sensitive: the
 * conditions are derived from deadlines measured in days, and the events are
 * cron runs that happen hourly at most.
 *
 * `refetchOnWindowFocus` below is what actually keeps it feeling live — coming
 * back to the tab refetches immediately, whatever the interval says — so the
 * five minutes is the floor for a tab you are already looking at, not the
 * delay before you see anything.
 */
const POLL_MS = 300_000

function Icon({ name, className }: { name: string; className?: string }) {
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
const KIND_ICON: Record<NotificationKind, string> = {
  connection: 'plug',
  health: 'pulse',
  timing: 'clock',
  snooze: 'moon',
  automation: 'bolt',
  digest: 'mail',
  reconcile: 'swap',
}

const TIER_ICON: Record<NotificationTier, string> = {
  critical: 'alert',
  attention: 'clock',
  info: 'info',
}

/** Same colours the row icons use, so the bar and the list agree. */
const TIER_CHIP_TINT: Record<NotificationTier, string> = {
  critical: 'text-danger-fg',
  attention: 'text-ink',
  info: 'text-muted',
}

const TIER_LABELS: Record<NotificationTier, string> = {
  critical: 'Critical',
  attention: 'Attention',
  info: 'Info',
}

const TIER_ORDER: NotificationTier[] = ['critical', 'attention', 'info']

// ── Filters ───────────────────────────────────────────────────────────────────

interface Filters {
  unreadOnly: boolean
  tier: NotificationTier | null
  kind: NotificationKind | null
}

const NO_FILTERS: Filters = { unreadOnly: false, tier: null, kind: null }

/**
 * Three independent axes, deliberately not one.
 *
 * "Unread and critical" is a real thing to want; folding state and severity
 * into one mutually-exclusive control would make it unaskable.
 */
function matches(n: AppNotification, f: Filters): boolean {
  if (f.unreadOnly && n.read) return false
  if (f.tier && n.tier !== f.tier) return false
  if (f.kind && n.kind !== f.kind) return false
  return true
}

function Chip({
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
  children?: React.ReactNode
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
      {icon && (
        <Icon name={icon} className={`h-3.5 w-3.5 ${active ? '' : (iconClass ?? '')}`} />
      )}
      {children}
      <span className={`tabular-nums ${active ? '' : 'text-muted'}`}>{count}</span>
    </button>
  )
}

/**
 * One row, deliberately.
 *
 * The obvious build — a chip per tier and a chip per kind — came out as ten
 * chips over four rows, taller than the notifications underneath it. A filter
 * bar that costs more attention than the list it filters is not a feature.
 *
 * So: the severities are icon-and-count, because there are only ever three of
 * them and the icons already appear on every row below; the kinds go in a
 * select, because there can be seven and they are the axis you reach for least.
 * Every count is what clicking would actually leave you looking at, with the
 * other filters already applied.
 */
function FilterBar({
  items,
  filters,
  onChange,
}: {
  items: AppNotification[]
  filters: Filters
  onChange: (f: Filters) => void
}) {
  const countIf = (patch: Partial<Filters>) =>
    items.filter((n) => matches(n, { ...filters, ...patch })).length

  const kinds = useMemo(() => {
    const present = new Set(items.map((n) => n.kind))
    return (Object.keys(KIND_LABELS) as NotificationKind[]).filter((k) => present.has(k))
  }, [items])

  const tiers = useMemo(() => {
    const present = new Set(items.map((n) => n.tier))
    return TIER_ORDER.filter((t) => present.has(t))
  }, [items])

  // Controls that cannot change anything are worse than no controls.
  const useful = kinds.length > 1 || tiers.length > 1 || items.some((n) => !n.read)
  if (!useful) return null

  const dirty = filters.unreadOnly || filters.tier !== null || filters.kind !== null

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3.5 py-2.5 border-b border-line bg-sunken/50">
      <Chip
        label="Unread only"
        active={filters.unreadOnly}
        count={countIf({ unreadOnly: true })}
        onClick={() => onChange({ ...filters, unreadOnly: !filters.unreadOnly })}
      >
        Unread
      </Chip>

      {tiers.length > 1 &&
        tiers.map((t) => (
          <Chip
            key={t}
            icon={TIER_ICON[t]}
            iconClass={TIER_CHIP_TINT[t]}
            label={TIER_LABELS[t]}
            active={filters.tier === t}
            count={countIf({ tier: t })}
            onClick={() => onChange({ ...filters, tier: filters.tier === t ? null : t })}
          />
        ))}

      {kinds.length > 1 && (
        <select
          value={filters.kind ?? ''}
          aria-label="Filter by type"
          onChange={(e) =>
            onChange({ ...filters, kind: (e.target.value || null) as NotificationKind | null })
          }
          className="h-7 rounded-lg border border-line bg-surface text-xs font-semibold text-body
                     px-1.5 focus:outline-none focus:ring-2 focus:ring-accent transition"
        >
          <option value="">All types</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]} ({countIf({ kind: k })})
            </option>
          ))}
        </select>
      )}

      {dirty && (
        <button
          type="button"
          onClick={() => onChange(NO_FILTERS)}
          className="ml-auto text-xs font-semibold text-muted hover:text-ink transition-colors px-1"
        >
          Clear
        </button>
      )}
    </div>
  )
}

// ── Rows ──────────────────────────────────────────────────────────────────────

function Row({
  note,
  onOpen,
  onDismiss,
}: {
  note: AppNotification
  onOpen: (n: AppNotification) => void
  onDismiss: (key: string) => void
}) {
  return (
    <li
      className={`group relative flex gap-3 px-3.5 py-3 border-b border-line last:border-b-0 ${
        note.read ? '' : 'bg-accent-soft'
      }`}
    >
      <span
        className={`mt-0.5 shrink-0 grid place-items-center h-7 w-7 rounded-lg border ${
          note.tier === 'critical'
            ? 'text-danger-fg border-danger-line'
            : 'text-muted border-line'
        }`}
        title={`${KIND_LABELS[note.kind]} · ${TIER_LABELS[note.tier]}`}
      >
        <Icon name={KIND_ICON[note.kind] ?? TIER_ICON[note.tier]} className="h-3.5 w-3.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink leading-snug pr-6">
          {note.title}
        </span>
        {note.body && <span className="block text-sm text-muted mt-0.5">{note.body}</span>}
        <span className="flex items-center gap-2.5 mt-2">
          <span className="text-xs text-faint">{relativeTime(note.firstSeen)}</span>
          {note.action && (
            <button
              type="button"
              onClick={() => onOpen(note)}
              className="text-xs font-semibold px-2.5 py-1 rounded-md border border-line text-ink hover:bg-sunken transition-colors"
            >
              {note.action}
            </button>
          )}
        </span>
      </span>

      {/* Revealed on hover, but always reachable by keyboard. */}
      <button
        type="button"
        onClick={() => onDismiss(note.key)}
        aria-label={`Dismiss: ${note.title}`}
        className="absolute top-2 right-2 grid place-items-center h-6 w-6 rounded-md text-faint
                   opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                   hover:text-ink hover:bg-sunken transition-opacity"
      >
        <Icon name="x" className="h-3 w-3" />
      </button>
    </li>
  )
}

export function NotificationBell({ onNav }: { onNav: (page: string) => void }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const { data } = useQuery<NotificationFeed>({
    queryKey: ['notifications'],
    queryFn: api.notifications.list,
    // Refetch on focus as well as on the interval: the interesting case is
    // coming back to a tab that has been open for an hour.
    refetchOnWindowFocus: true,
    refetchInterval: () => (document.visibilityState === 'visible' ? POLL_MS : false),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] })
  const markRead = useMutation({ mutationFn: api.notifications.read, onSuccess: invalidate })
  const dismiss = useMutation({ mutationFn: api.notifications.dismiss, onSuccess: invalidate })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const items = data?.items ?? []
  const unread = data?.unread ?? 0
  const critical = (data?.unreadCritical ?? 0) > 0
  // Everything the feed holds, including what is past the pane's cap.
  const hidden = Math.max(0, (data?.total ?? items.length) - items.length)

  const visible = items.filter((n) => matches(n, filters))
  const filtered = visible.length !== items.length

  const openItem = (n: AppNotification) => {
    markRead.mutate({ keys: [n.key] })
    setOpen(false)
    // Hash routes carry their own leading '#'; strip it for the router.
    onNav(n.href.replace(/^#/, ''))
  }

  const goHistory = () => {
    setOpen(false)
    onNav('runs')
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative p-2 rounded-md text-muted hover:text-ink hover:bg-sunken transition-colors"
      >
        <Icon name="bell" className="h-4 w-4" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className={`absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 grid place-items-center
                        rounded-full text-[10px] font-bold leading-none border-2 border-surface
                        ${critical ? 'bg-danger-solid text-white' : 'bg-ink text-surface'}`}
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full mt-2 w-[min(26rem,calc(100vw-2rem))] z-40
                     rounded-xl border border-line bg-surface shadow-pop overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-3.5 py-3 border-b border-line">
            <h2 className="text-sm font-bold text-ink">Notifications</h2>
            <button
              type="button"
              disabled={unread === 0 || markRead.isPending}
              onClick={() => markRead.mutate({ all: true })}
              className="text-xs font-semibold text-info-fg disabled:text-faint transition-colors"
            >
              Mark all read
            </button>
          </div>

          {items.length > 0 && (
            <FilterBar items={items} filters={filters} onChange={setFilters} />
          )}

          <ul className="max-h-[min(30rem,55vh)] overflow-y-auto" aria-live="polite">
            {visible.map((n) => (
              <Row key={n.key} note={n} onOpen={openItem} onDismiss={(k) => dismiss.mutate(k)} />
            ))}
          </ul>

          {visible.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted">
                {filtered ? 'Nothing matches these filters.' : 'Nothing needs your attention.'}
              </p>
              {filtered && (
                <button
                  type="button"
                  onClick={() => setFilters(NO_FILTERS)}
                  className="mt-2 text-xs font-semibold text-info-fg"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* The pane is capped; History is where everything that happened lives.
              The wording changes when a filter is on because the filter runs on
              the rows the server sent, not on the whole feed — claiming
              otherwise would be the pane quietly hiding matches. */}
          {hidden > 0 && (
            <button
              type="button"
              onClick={goHistory}
              className="w-full px-3.5 py-2.5 border-t border-line text-xs font-semibold
                         text-info-fg hover:bg-sunken transition-colors"
            >
              {filters.unreadOnly || filters.tier || filters.kind
                ? `Filtered within the 20 newest — ${hidden} more in History`
                : `View all — ${hidden} more in History`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
