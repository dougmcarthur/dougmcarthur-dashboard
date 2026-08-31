import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type AppNotification, type NotificationFeed } from '../api'
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

/** Poll only while the tab is visible; a backgrounded tab should cost nothing. */
const POLL_MS = 60_000

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

function tierIcon(tier: AppNotification['tier']): string {
  return tier === 'critical' ? 'alert' : 'clock'
}

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
      >
        <Icon name={tierIcon(note.tier)} className="h-3.5 w-3.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink leading-snug pr-6">
          {note.title}
        </span>
        <span className="block text-sm text-muted mt-0.5">{note.body}</span>
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

  const openItem = (n: AppNotification) => {
    markRead.mutate({ keys: [n.key] })
    setOpen(false)
    // Hash routes carry their own leading '#'; strip it for the router.
    onNav(n.href.replace(/^#/, ''))
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
          className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw-2rem))] z-40
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

          <ul className="max-h-[26rem] overflow-y-auto" aria-live="polite">
            {items.map((n) => (
              <Row key={n.key} note={n} onOpen={openItem} onDismiss={(k) => dismiss.mutate(k)} />
            ))}
          </ul>

          {items.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted">
              Nothing needs your attention.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
