import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import {
  PopOutBlocked,
  mirrorAppearance,
  openAnswersWindow,
  popOutAvailable,
  popOutFloats,
} from '../popOutWindow'
import { AnswerSheet } from './AnswerSheet'
import { AnswersBody, useAnswers } from './AnswersPanel'
import { Button } from './ui/Button'

/**
 * The answers in a window of their own, above the form.
 *
 * The page that opened it keeps all the code and all the state: the window is
 * only somewhere to draw, reached through a portal, so it reads the same cache
 * the application panel does and an answer approved in one is approved in the
 * other. That is also why it lives in `Layout` and not in the panel that has the
 * button: a window that closed when you moved from the Gigs page to Review
 * would be a helper that goes away when you are most likely to want it.
 *
 * It holds exactly what the application panel already offers, laid out for
 * pasting: Copy, and approving an answer you have just read. It cannot submit
 * anything and has no way to reach the form.
 */

export type PopOutContent = { kind: 'application'; gigId: number } | { kind: 'answers' }

export interface PopOutControls {
  /** There is somewhere to put a window. */
  available: boolean
  /** It will float above the form; otherwise it is an ordinary pop-up. */
  floating: boolean
  /** What the window is showing, or null while there is none. */
  content: PopOutContent | null
  /** Why the last attempt did not open one, in a sentence. */
  error: string | null
  open: (content: PopOutContent) => void
  close: () => void
  showing: (content: PopOutContent) => boolean
}

const NO_POP_OUT: PopOutControls = {
  available: false,
  floating: false,
  content: null,
  error: null,
  open: () => {},
  close: () => {},
  showing: () => false,
}

const PopOutContext = createContext<PopOutControls>(NO_POP_OUT)

export const usePopOut = () => useContext(PopOutContext)

function same(a: PopOutContent | null, b: PopOutContent): boolean {
  if (!a || a.kind !== b.kind) return false
  return a.kind === 'application' && b.kind === 'application' ? a.gigId === b.gigId : true
}

interface Live {
  win: Window
  mount: HTMLElement
  stop: () => void
}

export function PopOutProvider({
  children,
  onNav,
  enabled = true,
}: {
  children: ReactNode
  /** Where "edit these on the Artist page" goes, in the page that opened the window. */
  onNav: (page: string) => void
  /** Off in admin mode, where the library the window shows is refused. */
  enabled?: boolean
}) {
  const [shown, setShown] = useState<{ content: PopOutContent; live: Live } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const live = useRef<Live | null>(null)
  const available = useMemo(() => enabled && popOutAvailable(), [enabled])
  const floating = useMemo(() => popOutFloats(), [])

  const gone = useCallback(() => {
    live.current?.stop()
    live.current = null
    setShown(null)
  }, [])

  const close = useCallback(() => {
    const win = live.current?.win
    gone()
    if (win && !win.closed) win.close()
  }, [gone])

  const open = useCallback(
    (content: PopOutContent) => {
      setError(null)
      const existing = live.current
      if (existing && !existing.win.closed) {
        setShown({ content, live: existing })
        existing.win.focus()
        return
      }
      // Asked for here, in the click that called this, and before anything is
      // awaited: the browser gives a window to a gesture and to nothing else.
      openAnswersWindow().then(
        (win) => {
          const mount = win.document.createElement('div')
          win.document.body.appendChild(mount)
          const next: Live = { win, mount, stop: mirrorAppearance(document, win.document) }
          live.current = next
          // Closing it from its own title bar says so here, so the button is
          // not left claiming a window that is gone.
          win.addEventListener('pagehide', gone)
          setShown({ content, live: next })
        },
        (err) =>
          setError(
            err instanceof PopOutBlocked
              ? 'Your browser blocked the window. Allow pop-ups for this site and try again.'
              : 'Your browser would not open the window.',
          ),
      )
    },
    [gone],
  )

  // A floating window ends with the page that made it. A pop-up does not, and
  // one left behind would be a window whose buttons no longer do anything.
  useEffect(() => {
    const onHide = () => live.current?.win.close()
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      live.current?.win.close()
    }
  }, [])

  const controls = useMemo<PopOutControls>(
    () => ({
      available,
      floating,
      content: shown?.content ?? null,
      error,
      open,
      close,
      showing: (c) => same(shown?.content ?? null, c),
    }),
    [available, floating, shown, error, open, close],
  )

  return (
    <PopOutContext.Provider value={controls}>
      {children}
      {shown &&
        createPortal(
          <PopOutShell
            key={shown.content.kind === 'application' ? `gig-${shown.content.gigId}` : 'answers'}
            content={shown.content}
            onNav={(page) => {
              onNav(page)
              window.focus()
            }}
          />,
          shown.live.mount,
        )}
    </PopOutContext.Provider>
  )
}

type Tab = 'form' | 'answers'

const TAB_LABELS: Record<Tab, string> = { form: 'This application', answers: 'Answers at hand' }

/** What is drawn inside the window. */
function PopOutShell({ content, onNav }: { content: PopOutContent; onNav: (page: string) => void }) {
  const gigId = content.kind === 'application' ? content.gigId : null
  const packet = useQuery({
    queryKey: ['application', gigId ?? 0],
    queryFn: () => api.application.get(gigId as number),
    enabled: gigId !== null,
  })
  const [picked, setPicked] = useState<Tab | null>(null)

  // A form Scout could not read has no questions to line up, so the window
  // opens on what there is: the answers on file.
  const defaultTab: Tab = content.kind === 'answers' || (packet.data && packet.data.fields.length === 0) ? 'answers' : 'form'
  const tab = picked ?? defaultTab
  const answers = useAnswers({ enabled: tab === 'answers' })

  const name = packet.data?.gig.name
  // The title bar of a floating window is the only label it has. Set on the
  // window's own document: `document` here is the app's, and its title is the
  // tab's.
  const mountRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const doc = mountRef.current?.ownerDocument
    if (doc) doc.title = name ? `Answers for ${name}` : 'Answers'
  }, [name])

  return (
    // Positioned and clipped on purpose: the copy buttons carry screen-reader
    // text that is absolutely positioned, and with no positioned ancestor it is
    // placed against the whole document and stretches it, which draws a second
    // scrollbar and lets a scroll move the header out of view. The side panel
    // never showed this because its column is positioned.
    <div ref={mountRef} className="relative flex h-dvh flex-col overflow-hidden bg-canvas text-body">
      <div className="shrink-0 border-b border-line bg-surface px-3 pb-2 pt-2.5">
        <p className="truncate text-sm font-semibold text-ink">{name ?? 'Answers at hand'}</p>
        {content.kind === 'application' && (
          <div
            role="tablist"
            aria-label="What the window shows"
            className="mt-2 inline-flex gap-0.5 rounded-lg border border-line bg-surface p-0.5"
          >
            {(['form', 'answers'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setPicked(id)}
                className={`inline-flex h-7 items-center whitespace-nowrap rounded-md px-2.5 text-[13px] transition-colors ${
                  tab === id ? 'bg-raised font-semibold text-ink shadow-inset' : 'text-muted hover:text-ink'
                }`}
              >
                {TAB_LABELS[id]}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'form' ? (
        <div role="tabpanel" className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {packet.isLoading &&<p className="p-3 text-sm text-muted">Loading the application…</p>}
          {packet.error && (
            <p role="alert" className="p-3 text-sm text-danger-fg">
              {(packet.error as Error).message}
            </p>
          )}
          {packet.data && packet.data.fields.length > 0 && (
            <AnswerSheet packet={packet.data} gigId={packet.data.gigId} />
          )}
          {packet.data && packet.data.fields.length === 0 && (
            <div className="p-3 text-sm text-body">
              <p>
                Scout has not read this form, so there are no questions to line up here.
                {packet.data.prepNote ? ` ${packet.data.prepNote}` : ''}
              </p>
              <Button className="mt-3" variant="neutral" onClick={() => setPicked('answers')}>
                Show my answers at hand
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div role="tabpanel" className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <AnswersBody state={answers} onNav={onNav} />
        </div>
      )}
    </div>
  )
}

/**
 * The button that opens it, wherever an application is on screen.
 *
 * Draws nothing where there is nowhere to put a window, so a phone is not
 * offered a button that does not work.
 */
export function PopOutButton({
  content,
  className = '',
}: {
  content: PopOutContent
  className?: string
}) {
  const popOut = usePopOut()
  if (!popOut.available) return null
  const here = popOut.showing(content)
  return (
    <span className={`inline-flex flex-col items-end gap-1 ${className}`}>
      <Button variant="neutral" size="sm" aria-pressed={here} onClick={() => (here ? popOut.close() : popOut.open(content))}>
        {here ? 'Close the pop-out' : 'Pop out answers'}
      </Button>
      {popOut.error && (
        <span role="alert" className="max-w-[16rem] text-right text-xs text-danger-fg">
          {popOut.error}
        </span>
      )}
    </span>
  )
}
