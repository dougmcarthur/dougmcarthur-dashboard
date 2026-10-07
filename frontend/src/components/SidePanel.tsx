import { AnswersBody, useAnswers } from './AnswersPanel'
import { IconButton } from './notificationParts'
import { NotificationBody, useNotificationFeed } from './NotificationPanel'
import { SIDE_PANELS, SIDE_PANEL_LABELS, type SidePanelId } from '../sidePanel'
import type { SidePanelControls } from '../hooks/useSidePanel'

/**
 * The column on the right that stays while you move around the app.
 *
 * It holds one panel at a time and a switch between them: the notifications,
 * which are also what the bell opens as a dropdown, and the answers a form is
 * asking for. The next panel worth keeping in view is an entry in `SIDE_PANELS`
 * and a component handed to this frame, not another layout. See
 * `docs/side-panel-plan.md` for what else might go in it and why.
 *
 * It sits beside the page and not over it: the page reflows to the width that
 * is left, so nothing you are working on is ever behind it. It is sticky under
 * the header and scrolls inside itself, so a long list never makes the panel
 * taller than the screen.
 */

/**
 * The height of the header it hangs from: `min-h-14` plus its one-pixel rule.
 * On a screen wide enough to dock to, the header is one row, so this is exact.
 */
const HEADER_PX = 57

/** The first thing in the header, in the place the panel's own way out belongs. */
const WAY_OUT: Record<SidePanelId, { label: string; icon: string; page: string }> = {
  notifications: { label: 'Open the full History', icon: 'history', page: 'runs' },
  answers: { label: 'Open the Artist page', icon: 'user', page: 'artist' },
}

export function SideDock({
  side,
  onNav,
}: {
  side: SidePanelControls
  onNav: (page: string) => void
}) {
  // Reads what the bell keeps fresh; see `useNotificationFeed`.
  const notifications = useNotificationFeed({ poll: false })
  // Only the panel in view costs a request.
  const answers = useAnswers({ enabled: side.panel === 'answers' })
  const { unread, markRead } = notifications
  const out = WAY_OUT[side.panel]

  return (
    <aside
      id="side-panel"
      aria-label="Side panel"
      style={{ top: HEADER_PX, height: `calc(100dvh - ${HEADER_PX}px)` }}
      className="sticky flex w-[22rem] shrink-0 flex-col border-l border-line bg-surface print:hidden"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line pl-2.5 pr-2">
        <div
          role="tablist"
          aria-label="Side panel"
          className="inline-flex gap-0.5 rounded-lg border border-line bg-surface p-0.5"
        >
          {SIDE_PANELS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`side-tab-${id}`}
              aria-selected={side.panel === id}
              aria-controls={`side-panel-${id}`}
              onClick={() => side.select(id)}
              className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] transition-colors ${
                side.panel === id ? 'bg-raised font-semibold text-ink shadow-inset' : 'text-muted hover:text-ink'
              }`}
            >
              {SIDE_PANEL_LABELS[id]}
              {/* The bell is the other place this count lives, and it is in the
                  header whichever tab is showing. Here it says that the tab you
                  are not looking at has something for you. */}
              {id === 'notifications' && unread > 0 && (
                <span className="tabular-nums text-xs text-muted">
                  <span className="sr-only">, </span>
                  {unread}
                  <span className="sr-only"> unread</span>
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5">
          {/* First, and always here: the way to everything the panel cannot hold. */}
          <IconButton label={out.label} icon={out.icon} onClick={() => onNav(out.page)} />
          <IconButton label="Unpin, and go back to a dropdown" icon="pin-off" onClick={side.unpin} />
          <IconButton label="Hide the panel" icon="x" onClick={side.hide} />
        </div>
      </div>

      {side.panel === 'notifications' ? (
        <div
          role="tabpanel"
          id="side-panel-notifications"
          aria-labelledby="side-tab-notifications"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-line px-3.5 py-2">
            <span className="text-xs text-muted">{unread === 0 ? 'Nothing unread' : `${unread} unread`}</span>
            <button
              type="button"
              disabled={unread === 0 || markRead.isPending}
              onClick={() => markRead.mutate({ all: true })}
              className="py-0.5 text-xs font-semibold text-info-fg transition-colors disabled:text-faint"
            >
              Mark all read
            </button>
          </div>
          <NotificationBody feed={notifications} onNav={onNav} listClass="flex-1" />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="side-panel-answers"
          aria-labelledby="side-tab-answers"
          className="flex min-h-0 flex-1 flex-col"
        >
          <AnswersBody state={answers} onNav={onNav} />
        </div>
      )}
    </aside>
  )
}
