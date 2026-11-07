import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * The phone's navigation: five tabs along the bottom edge and a More tab for
 * the rest.
 *
 * A menu behind a button in the top corner is the one place on a phone a thumb
 * cannot reach, and it put every destination one tap away from where it was
 * wanted. The five pages used daily are always on screen; everything opened
 * occasionally is under More. Decided with the owner on 2026-10-31.
 *
 * Below `md` only, and not in admin mode, which has its own list of pages. The
 * header's own menu button is hidden there, since this holds everything it did.
 */

export const TAB_LINKS = [
  { id: 'overview', label: 'Overview', icon: 'home' },
  { id: 'review', label: 'Review', icon: 'inbox' },
  { id: 'gigs', label: 'Gigs', icon: 'calendar' },
  { id: 'artist', label: 'Artist', icon: 'person' },
  { id: 'sync', label: 'Sync', icon: 'note' },
] as const

/** Under More, in this order. Settings and History are the desktop menu's too. */
export const MORE_PAGES = [
  { id: 'promo', label: 'Promo' },
  { id: 'settings', label: 'Settings' },
  { id: 'runs', label: 'History' },
] as const

const PATHS: Record<string, string> = {
  home: 'M3 9.5 10 3l7 6.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1V9.5Z',
  inbox: 'M3 11l2-6h10l2 6v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5ZM3 11h4l1 2h4l1-2h4',
  calendar: 'M4 5h12v12H4V5ZM4 8.5h12M7 3v3M13 3v3',
  person: 'M10 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 17c0-3 2.7-5 6-5s6 2 6 5',
  note: 'M8 15V5l8-2v10M8 15a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM16 13a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  more: 'M4.5 10h.01M10 10h.01M15.5 10h.01',
}

function TabIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} strokeWidth={name === 'more' ? 2.6 : 1.6} />
    </svg>
  )
}

const TAB =
  'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-0.5 py-1.5 min-h-14 ' +
  'text-[11px] font-medium leading-tight transition-colors focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-accent'

const tone = (active: boolean) =>
  active ? 'bg-raised text-ink shadow-inset' : 'text-muted hover:text-ink hover:bg-sunken'

const ITEM = 'block w-full text-left rounded-md px-3.5 py-3 text-sm font-medium transition-colors'

export interface PhoneTabBarProps {
  /** The top-level page now showing: `settings/profile` is `settings`. */
  here: string
  /** Set once a name is saved, and never guessed. */
  accountName: string | null
  /** Where the answers cannot sit beside the page, so they open as a dialog. */
  offerAnswers: boolean
  onAnswers: () => void
  onFeedback: () => void
  signOut: { mutate: () => void; isPending: boolean; isError: boolean }
}

export function PhoneTabBar({ here, accountName, offerAnswers, onAnswers, onFeedback, signOut }: PhoneTabBarProps) {
  const [open, setOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)

  // The page changing closes it, as the header's menu does: a sheet left open
  // over the page you just chose is the classic menu bug.
  useEffect(() => setOpen(false), [here])

  useEffect(() => {
    if (!open) return
    // Into the sheet on open, so a keyboard or a screen reader lands on it
    // rather than on whatever followed the tab; back to More on Escape.
    sheetRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      moreRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const inMore = MORE_PAGES.some((p) => p.id === here) || here === 'help'
  const close = () => setOpen(false)

  const link = (id: string, label: string): ReactNode => (
    <a
      key={id}
      href={`#${id}`}
      aria-current={here === id ? 'page' : undefined}
      onClick={close}
      className={`${ITEM} ${tone(here === id)}`}
    >
      {label}
    </a>
  )

  return (
    <>
      {open && (
        // Under the bar and over the page: a tap anywhere else puts it away.
        <div className="fixed inset-0 z-30 bg-scrim/40 md:hidden print:hidden" onClick={close} aria-hidden="true" />
      )}
      {open && (
        <div
          ref={sheetRef}
          id="more-sheet"
          role="group"
          aria-label="More"
          className="fixed inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 max-h-[70vh] overflow-y-auto
                     rounded-xl border border-line bg-surface p-1 shadow-pop md:hidden print:hidden"
        >
          {accountName && (
            <p className="mb-1 truncate border-b border-line px-3 pb-2 pt-2 text-xs text-muted" title={accountName}>
              Signed in as <span className="text-body">{accountName}</span>
            </p>
          )}
          {MORE_PAGES.map((p) => link(p.id, p.label))}
          {offerAnswers && (
            <button type="button" className={`${ITEM} ${tone(false)}`} onClick={() => { close(); onAnswers() }}>
              Answers at hand
            </button>
          )}
          <hr className="my-1 border-line" />
          {link('help', 'Help')}
          <button type="button" className={`${ITEM} ${tone(false)}`} onClick={() => { close(); onFeedback() }}>
            Send feedback
          </button>
          <hr className="my-1 border-line" />
          {/* Last, and apart from the destinations: the one item here that is
              not a place to go. No confirmation, since it ends this browser's
              session and leaves every passkey enrolled. */}
          <button
            type="button"
            disabled={signOut.isPending}
            className={`${ITEM} ${tone(false)} disabled:opacity-60`}
            onClick={() => signOut.mutate()}
          >
            {signOut.isPending ? 'Signing out…' : 'Sign out'}
          </button>
          {signOut.isError && (
            <p role="alert" className="px-3.5 py-1.5 text-xs text-danger-fg">
              Could not sign out. Try again.
            </p>
          )}
        </div>
      )}

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md
                   pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
      >
        <div className="flex items-stretch gap-0.5 px-1 pt-1">
          {TAB_LINKS.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              aria-current={here === t.id ? 'page' : undefined}
              onClick={close}
              className={`${TAB} ${tone(here === t.id)}`}
            >
              <TabIcon name={t.icon} />
              {t.label}
            </a>
          ))}
          <button
            ref={moreRef}
            type="button"
            aria-expanded={open}
            aria-controls="more-sheet"
            onClick={() => setOpen((o) => !o)}
            className={`${TAB} ${tone(open || inMore)}`}
          >
            <TabIcon name="more" />
            More
          </button>
        </div>
      </nav>
    </>
  )
}
