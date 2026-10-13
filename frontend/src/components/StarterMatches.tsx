import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type StarterMatch } from '../api'
import { shortDate } from '../format'
import { Button } from './ui/Button'
import { Disclosure } from './ui/Disclosure'

const SKIP_LABEL: Record<string, string> = {
  yours: 'already on your list',
  closed: 'closed',
  residents: 'for residents of another province',
  sync_organisation: 'sync organisations, which belong on the Sync page',
  unclear_kind: 'Scout could not tell what kind of opportunity they are',
}

const GAP_LABEL: Record<string, string> = {
  genre: 'what music it is for',
  region: 'where it is',
  eligibility: 'who may apply',
  deadline: 'when it closes',
}

/**
 * What Scout found for this artist in the shared catalog, previewed before it
 * is added.
 *
 * Research is collected once for everybody and matched to each artist in the
 * Worker, so a new account has something to look at without anybody typing a
 * gig in. This is the one moment that is asked for: a preview of the best dozen,
 * with why each is there, what the listing does not say, and what was left out
 * and why. Nothing is added until they say so, and "not now" ends the asking.
 * After that, new matches arrive a few at a time with a note in the bell.
 *
 * Renders nothing when there is nothing to offer, when the artist has not told
 * Scout anything to match on, or once they have answered.
 */
export function StarterMatches() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const preview = useQuery({ queryKey: ['matching', 'starter'], queryFn: api.matching.starter })

  const done = () => {
    for (const key of ['matching', 'review', 'gigs', 'overview', 'notifications']) qc.invalidateQueries({ queryKey: [key] })
  }
  const add = useMutation({ mutationFn: api.matching.addStarter, onSuccess: () => { setOpen(false); done() } })
  const decline = useMutation({ mutationFn: api.matching.decline, onSuccess: () => { setOpen(false); done() } })

  const p = preview.data
  if (!p || !p.said || p.answered || p.off || p.willAdd.length === 0) return null

  const n = p.willAdd.length
  const gaps = Object.entries(p.unknowns).filter(([, count]) => count > 0)

  return (
    <Disclosure
      teaser={`Scout found ${n} ${n === 1 ? 'opportunity' : 'opportunities'} that ${n === 1 ? 'fits' : 'fit'} what you told it.`}
      hint="Nothing is added until you say so."
      openLabel="See them"
      title="Opportunities for you"
      subtitle="Picked from what Scout collects for every artist, in the order of what you asked for."
      loading={add.isPending || decline.isPending}
      error={
        add.error instanceof Error ? add.error.message
        : decline.error instanceof Error ? decline.error.message
        : null
      }
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    >
      <ul className="divide-y divide-line rounded-md border border-line">
        {p.willAdd.map((m) => (
          <Row key={m.id} match={m} />
        ))}
      </ul>

      {gaps.length > 0 && (
        <p className="text-xs text-muted">
          Where a listing does not say, Scout says so on the card:{' '}
          {gaps.map(([code, count]) => `${GAP_LABEL[code] ?? code} (${count})`).join(', ')}. Read the listing before you apply.
        </p>
      )}

      {(p.rest > 0 || p.skipped.length > 0 || p.held > 0) && (
        <div className="text-xs text-muted space-y-1">
          {p.rest > 0 && (
            <p>
              {p.rest} more matched, but sit beyond what you asked for or past the first {p.limit}. They stay in the shared
              list.
            </p>
          )}
          {p.skipped.length > 0 && (
            <p>
              Left out: {p.skipped.map((s) => `${s.count} ${SKIP_LABEL[s.reason] ?? s.reason}`).join('; ')}.
            </p>
          )}
          {p.held > 0 && <p>{p.held} more arrived in the last few days and are being checked first.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button variant="primary" size="md" disabled={add.isPending || decline.isPending} onClick={() => add.mutate()}>
          Add {n} to my list
        </Button>
        <Button variant="quiet" disabled={add.isPending || decline.isPending} onClick={() => decline.mutate()}>
          Not now
        </Button>
      </div>
    </Disclosure>
  )
}

function Row({ match }: { match: StarterMatch }) {
  return (
    <li className="px-3 py-2.5 space-y-1">
      <p className="text-sm text-ink">
        {match.url ? (
          <a href={match.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
            {match.name}
          </a>
        ) : (
          <span className="font-medium">{match.name}</span>
        )}
        <span className="text-muted">
          {match.kind ? ` · ${match.kind}` : ''}
          {match.location ? ` · ${match.location}` : ''}
          {match.deadline ? ` · closes ${shortDate(match.deadline)}` : ''}
        </span>
      </p>
      <p className="text-xs text-body leading-relaxed">{match.reasons.join(' ')}</p>
      {match.unknowns.length > 0 && (
        <p className="text-xs text-muted leading-relaxed">Not stated: {match.unknowns.join(' ')}</p>
      )}
    </li>
  )
}
