import { useMemo, useState } from 'react'
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
import {
  FilterChip,
  Icon,
  KindIcon,
  TIER_CHIP_TINT,
  TIER_ICON,
  TIER_LABELS,
} from './notificationParts'

/**
 * What the bell and the pinned side panel both show.
 *
 * The same list in two frames: a dropdown that goes away when you click off it,
 * and a panel that stays beside the page while you work. The frames differ in
 * their headers and nothing else, so the list, its filters and its rules live
 * here once.
 *
 * Two rules do most of the work. The badge counts *unread*, never unresolved:
 * a badge that cannot reach zero is worse than no badge, because it teaches you
 * to stop looking. And showing the list does not mark anything read: a badge
 * that clears on a glance clears before you have read anything. Reading happens
 * when you open an item, or when you say so.
 *
 * It is a window onto the newest twenty and nothing more. A row is a headline,
 * one line of context and what to do about it; anything that needs a paragraph
 * is on the History page, which is this list with the cap taken off.
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

/**
 * The feed, its totals and the two things you can do to a row.
 *
 * `poll` is for the one caller that is always on screen. The bell is mounted on
 * every page and the pinned panel beside it, both reading this query, and two
 * observers each with their own interval would fetch twice per period for one
 * list. The panel reads what the bell keeps fresh.
 */
export function useNotificationFeed({ poll }: { poll: boolean }) {
  const qc = useQueryClient()

  const { data } = useQuery<NotificationFeed>({
    queryKey: ['notifications'],
    queryFn: api.notifications.list,
    // Refetch on focus as well as on the interval: the interesting case is
    // coming back to a tab that has been open for an hour.
    refetchOnWindowFocus: true,
    refetchInterval: poll ? () => (document.visibilityState === 'visible' ? POLL_MS : false) : false,
  })

  // History reads the same unread marks, so a change here has to reach it too.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['history'] })
  }
  const markRead = useMutation({ mutationFn: api.notifications.read, onSuccess: invalidate })
  const dismiss = useMutation({ mutationFn: api.notifications.dismiss, onSuccess: invalidate })

  const items = data?.items ?? []
  const total = data?.total ?? items.length
  return {
    items,
    unread: data?.unread ?? 0,
    critical: (data?.unreadCritical ?? 0) > 0,
    total,
    // Everything the feed holds, including what is past the pane's cap.
    hidden: Math.max(0, total - items.length),
    markRead,
    dismiss,
  }
}

export type NotificationFeedState = ReturnType<typeof useNotificationFeed>

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
      <FilterChip
        label="Unread only"
        active={filters.unreadOnly}
        count={countIf({ unreadOnly: true })}
        onClick={() => onChange({ ...filters, unreadOnly: !filters.unreadOnly })}
      >
        Unread
      </FilterChip>

      {tiers.length > 1 &&
        tiers.map((t) => (
          <FilterChip
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

/**
 * A headline, one line of context, and when it was and what to do.
 *
 * The title may take two lines and the context takes one, whatever the writer
 * sent: `shared/notifications.ts` already cuts a body to a sentence's worth,
 * and the clamp here is the second lock on the same door. The row used to run
 * to six lines when an agent's report was its body, which made twenty of them
 * a page nobody scrolled.
 */
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
      className={`group relative flex gap-3 px-3.5 py-2.5 border-b border-line last:border-b-0 ${
        note.read ? '' : 'bg-accent-soft'
      }`}
    >
      <KindIcon kind={note.kind} tier={note.tier} />

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink leading-snug pr-6 line-clamp-2">
          {note.title}
        </span>
        {note.body && <span className="block text-xs text-muted mt-0.5 truncate">{note.body}</span>}
        <span className="flex items-center gap-2 mt-1.5 min-w-0">
          <span className="min-w-0 truncate text-xs text-muted">
            {relativeTime(note.firstSeen)} &middot; {KIND_LABELS[note.kind]}
          </span>
          {note.action && (
            <button
              type="button"
              onClick={() => onOpen(note)}
              className="ml-auto shrink-0 text-xs font-semibold px-2.5 py-1 rounded-md border border-line text-ink hover:bg-sunken transition-colors"
            >
              {note.action}
            </button>
          )}
        </span>
      </span>

      {/* Revealed on hover, reachable by keyboard, and always shown on a
          touch screen. `row-actions` gates the hiding on `(hover: hover)`;
          the Tailwind `opacity-0 group-hover:` it replaces hid the button on
          every phone, where there is no hover to reveal it. */}
      <button
        type="button"
        onClick={() => onDismiss(note.key)}
        aria-label={`Dismiss: ${note.title}`}
        className="row-actions absolute top-2 right-2 grid place-items-center h-6 w-6 rounded-md text-faint
                   hover:text-ink hover:bg-sunken"
      >
        <Icon name="x" className="h-3 w-3" />
      </button>
    </li>
  )
}

// ── The list ──────────────────────────────────────────────────────────────────

/**
 * Filters, rows, the empty state and the way into History.
 *
 * `onLeave` runs before any navigation, so the dropdown can close itself on the
 * way out; the pinned panel has nothing to close and passes none.
 */
export function NotificationBody({
  feed,
  onNav,
  onLeave,
  listClass = 'max-h-[min(30rem,55vh)]',
}: {
  feed: NotificationFeedState
  onNav: (page: string) => void
  onLeave?: () => void
  /** What bounds the list's height: a cap in the dropdown, the column in the panel. */
  listClass?: string
}) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const { items, total, hidden, markRead, dismiss } = feed

  const visible = items.filter((n) => matches(n, filters))
  const filtered = visible.length !== items.length

  const openItem = (n: AppNotification) => {
    markRead.mutate({ keys: [n.key] })
    onLeave?.()
    // Hash routes carry their own leading '#'; strip it for the router.
    onNav(n.href.replace(/^#/, ''))
  }

  // History opens on the type being filtered, so the select here and the
  // chips there say the same thing. The other two filters are about this
  // twenty and do not carry over, which the label does not pretend otherwise.
  const goHistory = () => {
    onLeave?.()
    onNav(filters.kind ? `runs/${filters.kind}` : 'runs')
  }

  const historyLabel = filters.kind
    ? `See all ${KIND_LABELS[filters.kind].toLowerCase()} in History`
    : hidden > 0
      ? `See all ${total} in History`
      : 'Open History'

  return (
    <>
      {items.length > 0 && <FilterBar items={items} filters={filters} onChange={setFilters} />}

      {/* The height rule applies only while there are rows. An empty list that
          kept `flex-1` in the panel would push its own empty message to the
          bottom of the column, beside the footer. */}
      <ul className={`min-h-0 overflow-y-auto ${visible.length > 0 ? listClass : ''}`} aria-live="polite">
        {visible.map((n) => (
          <Row key={n.key} note={n} onOpen={openItem} onDismiss={(k) => dismiss.mutate(k)} />
        ))}
      </ul>

      {visible.length === 0 && (
        <div className="flex-1 px-4 py-8 text-center">
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

      {/* Always here, not only when something is past the cap. History is a
          page worth opening in its own right now (a timeline of everything
          that happened, by type), and a link that appeared only once the pane
          overflowed hid it from anyone with a quiet week. */}
      <button
        type="button"
        onClick={goHistory}
        className="shrink-0 w-full px-3.5 py-2.5 border-t border-line text-xs font-semibold
                   text-info-fg hover:bg-sunken transition-colors"
      >
        {historyLabel}
      </button>
    </>
  )
}
