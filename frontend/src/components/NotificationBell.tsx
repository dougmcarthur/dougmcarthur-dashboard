import { useEffect, useRef, useState } from 'react'
import { Icon, IconButton } from './notificationParts'
import { NotificationBody, useNotificationFeed } from './NotificationPanel'
import type { SidePanelControls } from '../hooks/useSidePanel'

/**
 * The bell: a badge in the header and a dropdown behind it.
 *
 * What is in the dropdown, and the rules it keeps, are in `NotificationPanel`,
 * because the pinned side panel shows the same list. This is the frame for the
 * first way of seeing it, plus the one decision only a frame can make: once the
 * list is pinned, the bell stops being a dropdown and becomes the switch for
 * the panel.
 */

export function NotificationBell({
  onNav,
  side,
}: {
  onNav: (page: string) => void
  side: SidePanelControls
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // The one place that polls: the bell is on every page, so it keeps the feed
  // fresh for the pinned panel too.
  const feed = useNotificationFeed({ poll: true })
  const { unread, critical, markRead } = feed

  // Pinned on a screen wide enough to hold it. Pinned on a narrow one is still
  // a dropdown, because there is nowhere to dock to.
  const pinnedHere = side.pinned && side.wide

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

  // A dropdown left open while the panel docks would be two copies of one list.
  useEffect(() => {
    if (pinnedHere) setOpen(false)
  }, [pinnedHere])

  const pin = () => {
    setOpen(false)
    side.pin()
  }

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'

  // Positioned only from `sm` up. Below that the panel anchors to the sticky
  // header instead and spans it inside the page gutters: right-aligned to the
  // bell, which sits 87px in from the edge, it ran 55px off the left of a
  // 320px phone.
  return (
    <div className="sm:relative" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (pinnedHere ? side.toggle('notifications') : setOpen((o) => !o))}
        aria-expanded={pinnedHere ? side.showing('notifications') : open}
        aria-controls={pinnedHere ? 'side-panel' : undefined}
        aria-haspopup={pinnedHere ? undefined : 'dialog'}
        aria-label={label}
        title={
          pinnedHere
            ? side.showing('notifications')
              ? 'Hide the notifications panel'
              : 'Show the notifications panel'
            : undefined
        }
        className={`relative p-2 rounded-md transition-colors hover:text-ink hover:bg-sunken ${
          side.showing('notifications') ? 'text-ink bg-sunken' : 'text-muted'
        }`}
      >
        <Icon name="bell" className="h-4 w-4" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className={`absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 grid place-items-center
                        rounded-full text-[10px] font-bold leading-none border-2 border-surface
                        ${critical ? 'bg-danger-fg text-surface' : 'bg-ink text-surface'}`}
          >
            {unread}
          </span>
        )}
      </button>

      {open && !pinnedHere && (
        <div
          role="dialog"
          aria-label="Notifications"
          // A column capped at the screen below the header, with the list the
          // part that gives way. It hangs off a sticky header, so whatever
          // runs past the bottom of the screen cannot be scrolled to: on a
          // phone held sideways the History footer ended below the glass.
          className="absolute inset-x-4 top-full mt-2 sm:left-auto sm:right-0 sm:w-[min(26rem,calc(100vw-2rem))] z-40
                     flex flex-col max-h-[calc(100dvh-5rem)]
                     rounded-xl border border-line bg-surface shadow-pop overflow-hidden"
        >
          <div className="shrink-0 flex items-center justify-between gap-3 px-3.5 py-3 border-b border-line">
            <h2 className="text-sm font-bold text-ink">Notifications</h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={unread === 0 || markRead.isPending}
                onClick={() => markRead.mutate({ all: true })}
                className="-my-1 py-1 text-xs font-semibold text-info-fg disabled:text-faint transition-colors"
              >
                Mark all read
              </button>
              {/* Only where there is room to dock to. */}
              {side.wide && (
                <IconButton
                  label="Pin to the side of the screen"
                  icon="pin"
                  onClick={pin}
                  className="-my-1 -mr-1"
                />
              )}
            </div>
          </div>

          <NotificationBody feed={feed} onNav={onNav} onLeave={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
