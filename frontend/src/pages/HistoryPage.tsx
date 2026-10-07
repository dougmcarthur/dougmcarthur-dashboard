import { useMemo, useState } from 'react'
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  api,
  KIND_LABELS,
  type AppNotification,
  type HistoryEntry,
  type NotificationKind,
  type RunReport,
} from '../api'
import { NOTIFICATION_KINDS } from '../../../shared/notifications'
import { groupByDay } from '../../../shared/history'
import { isOkRun } from '../../../shared/runSummary'
import { clockTime, dayHeading, localDay, localToday, relativeTime } from '../format'
import { FilterChip, Icon, KindIcon } from '../components/notificationParts'
import { StatusBadge } from '../components/StatusBadge'
import { SkeletonList } from '../components/Skeleton'
import { Button } from '../components/ui/Button'
import { Banner, Card, EmptyState } from '../components/ui/Surface'

/**
 * History: the bell, expanded.
 *
 * The bell shows the newest twenty and the page its "See all" opens used to be
 * the run log, a column of agent prose with a status pill beside each. This is
 * the same list, drawn the same way, with the cap off and a timeline in place of
 * the pile: what needs you now at the top, then everything that happened by
 * day, newest first, filterable by type.
 *
 * Two things sit on the page that are not alike, and the page keeps them
 * apart. A **condition** (a connection that is down, a deadline closing in) is
 * a fact about today and stops being listed when it stops being true, so it is
 * not history and is not in the timeline. An **event** happened at a moment and
 * is there from then on. See `shared/history.ts`.
 */

/** How many standing items show before the rest fold away. */
const ATTENTION_SHOWN = 5

function asKind(value: string | null): NotificationKind | null {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value ?? '') ? (value as NotificationKind) : null
}

// ── The report ────────────────────────────────────────────────────────────────

/**
 * What the agent wrote, laid out.
 *
 * The words are the agent's own, unchanged; only the layout is ours. When the
 * report had a list the list is a list, and when it had none the paragraphs are
 * simply shown, because inventing structure for prose that has none is how a
 * summary ends up saying something the report did not.
 */
function ReportView({ report }: { report: RunReport }) {
  return (
    <div className="mt-3 rounded-lg border border-line bg-sunken/60 px-3.5 py-3 space-y-3 text-sm">
      {report.intro.map((paragraph, i) => (
        <p key={`i${i}`} className="text-body leading-relaxed">
          {paragraph}
        </p>
      ))}

      {report.entries.length > 0 && (
        <ol className="space-y-2.5">
          {report.entries.map((entry, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="shrink-0 w-5 pt-0.5 text-right text-xs font-semibold text-muted tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{entry.label}</span>
                {entry.note && <span className="block text-muted leading-relaxed">{entry.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      {report.closing.map((paragraph, i) => (
        <p key={`c${i}`} className="text-muted leading-relaxed">
          {paragraph}
        </p>
      ))}
    </div>
  )
}

// ── One entry ─────────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  onOpen,
  onRead,
}: {
  entry: HistoryEntry
  onOpen: (entry: HistoryEntry) => void
  onRead: (entry: HistoryEntry) => void
}) {
  const [open, setOpen] = useState(false)
  // A run that came back fine says so in its title. Only the ones that did not
  // wear a badge, so the badge means something when it is there.
  const worrying = entry.status !== null && !isOkRun(entry.status)

  const toggle = () => {
    // Reading it is reading it, however it was done. Opening the report is the
    // one way to read a run, so it counts.
    if (!open) onRead(entry)
    setOpen((o) => !o)
  }

  return (
    <li className={`flex gap-3 px-4 py-3 ${entry.read ? '' : 'bg-accent-soft'}`}>
      <KindIcon kind={entry.kind} tier={entry.tier} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink leading-snug">
            {entry.title}
            {!entry.read && <span className="sr-only"> (unread)</span>}
          </h3>
          <time
            dateTime={entry.at}
            className="shrink-0 pt-0.5 text-xs text-muted tabular-nums whitespace-nowrap"
          >
            {clockTime(entry.at)}
          </time>
        </div>

        {entry.body && <p className="mt-0.5 text-sm text-muted">{entry.body}</p>}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {worrying && <StatusBadge status={entry.status!} />}
          <span className="text-xs text-muted">{KIND_LABELS[entry.kind]}</span>

          {entry.report && (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              className="inline-flex items-center gap-1 text-xs font-semibold text-info-fg hover:text-ink transition-colors"
            >
              <Icon
                name="chevron"
                className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
              />
              {open ? 'Hide the report' : 'Read the report'}
            </button>
          )}

          {entry.href && entry.action && (
            <Button size="sm" variant="neutral" onClick={() => onOpen(entry)}>
              {entry.action}
            </Button>
          )}
        </div>

        {open && entry.report && <ReportView report={entry.report} />}
      </div>
    </li>
  )
}

// ── What needs you now ────────────────────────────────────────────────────────

function AttentionRow({ note, onOpen }: { note: AppNotification; onOpen: (n: AppNotification) => void }) {
  return (
    <li className={`flex gap-3 px-4 py-3 ${note.read ? '' : 'bg-accent-soft'}`}>
      <KindIcon kind={note.kind} tier={note.tier} />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-ink leading-snug">
          {note.title}
          {!note.read && <span className="sr-only"> (unread)</span>}
        </h3>
        {note.body && <p className="mt-0.5 text-sm text-muted">{note.body}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-xs text-muted">
            Noticed {relativeTime(note.firstSeen).toLowerCase()} &middot; {KIND_LABELS[note.kind]}
          </span>
          {note.action && (
            <Button size="sm" variant="neutral" onClick={() => onOpen(note)}>
              {note.action}
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

function Attention({ items, onOpen }: { items: AppNotification[]; onOpen: (n: AppNotification) => void }) {
  const [all, setAll] = useState(false)
  if (items.length === 0) return null

  const shown = all ? items : items.slice(0, ATTENTION_SHOWN)
  const folded = items.length - shown.length

  return (
    <section aria-labelledby="attention-heading" className="space-y-2">
      <h2 id="attention-heading" className="text-sm font-semibold text-ink">
        {items.length === 1
          ? '1 thing needs your attention now'
          : `${items.length} things need your attention now`}
      </h2>
      <Card pad="none" clip>
        <ul className="divide-y divide-line">
          {shown.map((n) => (
            <AttentionRow key={n.key} note={n} onOpen={onOpen} />
          ))}
        </ul>
        {folded > 0 && (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="w-full px-4 py-2.5 border-t border-line text-xs font-semibold text-info-fg hover:bg-sunken transition-colors"
          >
            Show the other {folded}
          </button>
        )}
      </Card>
      <p className="text-xs text-muted">
        These are true today. They leave this list when they stop being true, so they are not part of
        the timeline below.
      </p>
    </section>
  )
}

// ── The page ──────────────────────────────────────────────────────────────────

export function HistoryPage({
  initialKind,
  onNav,
}: {
  /** The route's argument: `#runs/automation` opens on that type. */
  initialKind: string | null
  onNav: (page: string) => void
}) {
  const qc = useQueryClient()
  const [kind, setKind] = useState<NotificationKind | null>(() => asKind(initialKind))

  const feed = useInfiniteQuery({
    queryKey: ['history', kind],
    queryFn: ({ pageParam }) => api.notifications.history({ kind, before: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    // Keeps the page on screen while a type is switched, so the chips do not
    // jump to a skeleton and back under the cursor.
    placeholderData: keepPreviousData,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['history'] })
  }
  const markRead = useMutation({ mutationFn: api.notifications.read, onSuccess: invalidate })

  const first = feed.data?.pages[0]
  const counts = first?.counts ?? {}
  const attention = first?.attention ?? []
  const unread = first?.unread ?? 0

  const entries = useMemo(() => {
    const seen = new Set<string>()
    return (feed.data?.pages ?? [])
      .flatMap((p) => p.entries)
      .filter((e) => (seen.has(e.key) ? false : (seen.add(e.key), true)))
  }, [feed.data])
  const days = useMemo(() => groupByDay(entries, localDay), [entries])
  const today = localToday()

  const kinds = NOTIFICATION_KINDS.filter((k) => (counts[k] ?? 0) > 0 || k === kind)
  const total = NOTIFICATION_KINDS.reduce((sum, k) => sum + (counts[k] ?? 0), 0)

  const go = (href: string) => onNav(href.replace(/^#/, ''))

  const openEntry = (entry: HistoryEntry) => {
    if (!entry.read && entry.readKey) markRead.mutate({ keys: [entry.readKey] })
    if (entry.href) go(entry.href)
  }
  const readEntry = (entry: HistoryEntry) => {
    if (!entry.read && entry.readKey) markRead.mutate({ keys: [entry.readKey] })
  }
  const openNote = (n: AppNotification) => {
    markRead.mutate({ keys: [n.key] })
    go(n.href)
  }

  if (feed.error) {
    return <Banner>Failed to load History. {(feed.error as Error).message}</Banner>
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">History</h1>
          <p className="mt-1 text-sm text-muted">Everything the app did or noticed, newest first.</p>
        </div>
        <Button
          variant="neutral"
          disabled={unread === 0 || markRead.isPending}
          onClick={() => markRead.mutate({ all: true })}
        >
          Mark all read
        </Button>
      </header>

      {feed.isLoading ? (
        <SkeletonList rows={8} />
      ) : (
        <>
          {total > 0 && (
            <div role="group" aria-label="Filter by type" className="flex flex-wrap items-center gap-1.5">
              <FilterChip label="All types" active={kind === null} count={total} onClick={() => setKind(null)}>
                All
              </FilterChip>
              {kinds.map((k) => (
                <FilterChip
                  key={k}
                  label={KIND_LABELS[k]}
                  active={kind === k}
                  count={counts[k] ?? 0}
                  onClick={() => setKind(kind === k ? null : k)}
                >
                  {KIND_LABELS[k]}
                </FilterChip>
              ))}
            </div>
          )}

          <Attention items={attention} onOpen={openNote} />

          {days.length > 0 ? (
            <div className="space-y-5">
              {days.map((group) => (
                <section key={group.day} aria-label={dayHeading(group.day, today)} className="space-y-2">
                  <h2 className="text-sm font-semibold text-ink">{dayHeading(group.day, today)}</h2>
                  <Card pad="none" clip>
                    <ul className="divide-y divide-line">
                      {group.entries.map((entry) => (
                        <EntryRow key={entry.key} entry={entry} onOpen={openEntry} onRead={readEntry} />
                      ))}
                    </ul>
                  </Card>
                </section>
              ))}
            </div>
          ) : (
            attention.length === 0 && (
              <Card pad="none">
                <EmptyState>
                  {kind ? (
                    <>
                      <p>Nothing of this type has happened in the time History keeps.</p>
                      <Button className="mt-3" variant="neutral" onClick={() => setKind(null)}>
                        Show every type
                      </Button>
                    </>
                  ) : (
                    <p>
                      Nothing has happened yet. Research runs, digests and replies from your mail will
                      show up here as they arrive.
                    </p>
                  )}
                </EmptyState>
              </Card>
            )
          )}

          {feed.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="neutral"
                disabled={feed.isFetchingNextPage}
                onClick={() => feed.fetchNextPage()}
              >
                {feed.isFetchingNextPage ? 'Loading' : 'Show older activity'}
              </Button>
            </div>
          )}

          <p className="text-xs text-muted">
            Notifications are kept for 30 days. Automation reports are kept in full. Dismissing a
            notification in the bell hides it there and leaves it here.
          </p>
        </>
      )}
    </div>
  )
}
