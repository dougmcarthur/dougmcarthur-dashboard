import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Answer, type AnswersFeed } from '../api'
import { filterAnswers } from '../../../shared/answersAtHand'
import { localToday } from '../format'
import { CopyButton } from './CopyButton'
import { FilterChip, Icon } from './notificationParts'
import { Button } from './ui/Button'
import { Input } from './ui/Field'
import { Modal } from './ui/Modal'

/**
 * Answers at hand: what a form is asking for, one tap from the clipboard.
 *
 * The same list in two frames, like the notifications: a column that stays
 * beside the page while an application is open, and a dialog on a screen too
 * narrow for a column. See `shared/answersAtHand.ts` for what is on it and why
 * it is ordered the way it is.
 *
 * Nothing here edits the library. Fixing a photo credit is the Artist page's
 * job, and a second place to edit the same entry is a second place for it to be
 * wrong. The panel says what is wrong and where to go.
 */

/**
 * The feed, read for today on the reader's own calendar.
 *
 * `enabled` is for the column: it holds both panels, and the one that is not
 * showing should not cost a request. The key sits under `['artist']`, so the
 * invalidation the Artist page already does after any edit reaches it.
 */
export function useAnswers({ enabled }: { enabled: boolean }) {
  const today = localToday()
  return useQuery<AnswersFeed>({
    queryKey: ['artist', 'answers', today],
    queryFn: () => api.artist.answers(today),
    enabled,
    // A copy button that offers yesterday's answer is worse than a spinner, but
    // the library changes when somebody edits it, which invalidates this. Within
    // a session, a minute is the right amount of caching for something opened
    // and closed all afternoon.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
}

export type AnswersState = ReturnType<typeof useAnswers>

function asked(n: number): string {
  return n === 1 ? 'Asked once on your applications' : `Asked ${n} times on your applications`
}

function AnswerRow({ answer }: { answer: Answer }) {
  const quiet = [answer.note, answer.asked > 0 ? asked(answer.asked) : null].filter(Boolean)

  return (
    <li className="px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold text-ink leading-snug break-words">
          {answer.label}
          {answer.words !== null && (
            <span className="ml-1.5 text-xs font-normal text-muted tabular-nums">{answer.words} words</span>
          )}
        </p>
        <CopyButton text={answer.copy} label={`Copy ${answer.label}`} />
      </div>

      <p className="mt-0.5 text-xs text-muted line-clamp-2 break-words">{answer.preview}</p>

      {answer.warning && (
        <p className="mt-1.5 flex gap-1.5 text-xs text-danger-fg">
          <Icon name="alert" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{answer.warning.text}</span>
        </p>
      )}

      {answer.extras.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {answer.extras.map((extra) => (
            <CopyButton
              key={extra.label}
              text={extra.copy}
              label={`Copy ${extra.label.toLowerCase()} for ${answer.label}`}
            >
              {`Copy ${extra.label.toLowerCase()}`}
            </CopyButton>
          ))}
        </div>
      )}

      {quiet.length > 0 && <p className="mt-1 text-xs text-muted">{quiet.join(' · ')}</p>}
    </li>
  )
}

/**
 * The search, the list and the way to the library.
 *
 * `onLeave` runs before any navigation, so the dialog can close on the way to
 * the Artist page; the column has nothing to close and passes none.
 */
export function AnswersBody({
  state,
  onNav,
  onLeave,
  listClass = 'flex-1',
}: {
  state: AnswersState
  onNav: (page: string) => void
  onLeave?: () => void
  /** What bounds the list's height: the column in the panel, a cap in the dialog. */
  listClass?: string
}) {
  const [query, setQuery] = useState('')
  const [needsLookOnly, setNeedsLookOnly] = useState(false)
  const feed = state.data

  const sections = useMemo(
    () => (feed ? filterAnswers(feed, { query, needsLookOnly }) : []),
    [feed, query, needsLookOnly],
  )

  const goArtist = () => {
    onLeave?.()
    onNav('artist')
  }

  if (state.isLoading) {
    return (
      <div className="space-y-3 p-3.5 animate-pulse" aria-label="Loading your answers" role="status">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-4 w-40 rounded bg-sunken" />
            <div className="h-3 w-56 rounded bg-sunken" />
          </div>
        ))}
      </div>
    )
  }

  if (state.error || !feed) {
    return (
      <p className="m-3.5 rounded-md border border-danger-line bg-danger-bg px-3 py-2 text-xs text-danger-fg">
        Your answers could not be loaded. {state.error instanceof Error ? state.error.message : ''}
      </p>
    )
  }

  if (feed.total === 0 && feed.missing.length === 0) {
    return (
      <div className="flex-1 px-4 py-10 text-center">
        <p className="text-sm text-muted">
          Nothing is on file yet. Add your bio, links and the facts forms ask for, and they will be
          here to copy.
        </p>
        <Button className="mt-3" variant="neutral" onClick={goArtist}>
          Open the Artist page
        </Button>
      </div>
    )
  }

  const searching = query.trim() !== '' || needsLookOnly
  const showMissing = !searching && feed.missing.length > 0

  return (
    <>
      <div className="shrink-0 space-y-2 border-b border-line bg-sunken/50 px-3.5 py-2.5">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search your answers"
          placeholder="Search your answers"
        />
        {feed.needsLook > 0 && (
          <div className="flex items-center gap-2">
            <FilterChip
              label="Needs a look"
              active={needsLookOnly}
              count={feed.needsLook}
              onClick={() => setNeedsLookOnly((v) => !v)}
            >
              Needs a look
            </FilterChip>
            <span className="text-xs text-muted">
              {feed.needsLook === 1 ? 'One answer has' : `${feed.needsLook} answers have`} something
              wrong with {feed.needsLook === 1 ? 'it' : 'them'}.
            </span>
          </div>
        )}
      </div>

      <div className={`min-h-0 overflow-y-auto ${listClass}`}>
        {sections.map((section) => (
          <section key={section.id} aria-labelledby={`answers-${section.id}`}>
            <h3 id={`answers-${section.id}`} className="px-3.5 pb-1 pt-3 text-sm font-semibold text-ink">
              {section.title}
            </h3>
            <ul className="divide-y divide-line border-y border-line">
              {section.answers.map((answer) => (
                <AnswerRow key={answer.id} answer={answer} />
              ))}
            </ul>
          </section>
        ))}

        {sections.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted">Nothing matches that.</p>
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setNeedsLookOnly(false)
              }}
              className="mt-2 text-xs font-semibold text-info-fg"
            >
              Clear the search
            </button>
          </div>
        )}

        {showMissing && (
          <section aria-labelledby="answers-missing">
            <h3 id="answers-missing" className="px-3.5 pb-1 pt-4 text-sm font-semibold text-ink">
              {feed.missing.length === 1
                ? 'Your applications ask for 1 thing that is not on file'
                : `Your applications ask for ${feed.missing.length} things that are not on file`}
            </h3>
            <ul className="divide-y divide-line border-y border-line">
              {feed.missing.map((m) => (
                <li key={m.key} className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                  <span className="text-sm text-body">{m.label}</span>
                  <span className="shrink-0 text-xs text-muted">{asked(m.asked)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <button
        type="button"
        onClick={goArtist}
        className="w-full shrink-0 border-t border-line px-3.5 py-2.5 text-xs font-semibold text-info-fg transition-colors hover:bg-sunken"
      >
        Edit these on the Artist page
      </button>
    </>
  )
}

/**
 * The same panel as a dialog, for a screen with no room for the column.
 *
 * Its own component, so the request lives and dies with the dialog: the layout
 * that opens it does not re-render when the answers arrive, which would hand a
 * fresh `onClose` to the modal and pull focus out of the search box.
 */
export function AnswersDialog({
  onClose,
  onNav,
}: {
  onClose: () => void
  onNav: (page: string) => void
}) {
  const state = useAnswers({ enabled: true })
  return (
    <Modal open onClose={onClose} title="Answers at hand" subtitle="Copy what a form is asking for.">
      <div className="flex max-h-[65vh] min-h-[12rem] flex-col overflow-hidden rounded-lg border border-line">
        <AnswersBody state={state} onNav={onNav} onLeave={onClose} />
      </div>
    </Modal>
  )
}
