import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { relativeTime } from '../format'
import { Button } from './ui/Button'
import { Disclosure } from './ui/Disclosure'
import { Banner } from './ui/Surface'
import { ResultsView } from '../pages/survey/results/ResultsView'

/**
 * The survey's summary, from the owner's side: look at it, then publish it.
 *
 * What goes public is a stored snapshot and never a live view, because the
 * notice promises that a small group is never reported and a page computed on
 * every visit would break that the moment the tenth person in a category had
 * not yet answered. So publishing is an act: this shows the page as it would
 * read, built just now by the Worker from an allow-list, in the same component
 * the public page uses. Pressing Publish sends a digest of what was looked at
 * and nothing else. If responses have come in since, the Worker refuses and the
 * new version is shown to be looked at again.
 *
 * It uses the exclusions chosen on the panel above, so the page that is
 * published is the page the owner has been reading.
 */
export function SurveyPublish({
  failedCheck,
  speeders,
  resultsUrl,
  contact,
  surveyOpen,
}: {
  failedCheck: boolean
  speeders: boolean
  resultsUrl: string
  contact: string | null
  surveyOpen: boolean
}) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const flags = { failedCheck, speeders }

  const state = useQuery({
    queryKey: ['admin', 'survey', 'publication', failedCheck, speeders],
    queryFn: () => api.admin.surveyPublication(flags),
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'survey', 'publication'] })
    qc.invalidateQueries({ queryKey: ['survey', 'results'] })
  }

  const publish = useMutation({
    mutationFn: (fingerprint: string) => api.admin.publishSurvey({ fingerprint, ...flags }),
    onSettled: refresh,
  })
  const takeDown = useMutation({ mutationFn: () => api.admin.unpublishSurvey(), onSettled: refresh })

  const s = state.data
  const published = s?.published ?? null
  const since = published && s?.preview ? s.preview.n - published.n : null

  const teaser = published
    ? `Published ${relativeTime(published.publishedAt)}, from ${published.n} artists.`
    : 'Not published. The results page says the results have not been posted yet.'
  const hint = published?.outOfDate
    ? since && since > 0
      ? `${since} newer ${since === 1 ? 'response has' : 'responses have'} come in since.`
      : 'It no longer matches the responses.'
    : published
      ? 'It matches the responses.'
      : s && s.blockers.length > 0
        ? s.blockers[0]
        : undefined

  // Nothing to publish when the page already matches the responses: pressing it would change only the date.
  const current = !!published && !published.outOfDate
  const controls = s?.preview && s.fingerprint && (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" disabled={publish.isPending || current} onClick={() => publish.mutate(s.fingerprint!)}>
        {publish.isPending ? 'Publishing…' : current ? 'Published, and up to date' : published ? 'Publish this update' : 'Publish this'}
      </Button>
      {published && (
        <Button variant="neutral" disabled={takeDown.isPending} onClick={() => takeDown.mutate()}>
          {takeDown.isPending ? 'Taking it down…' : 'Take it down'}
        </Button>
      )}
      <p className="text-xs text-muted">
        It will be public at{' '}
        <a className="underline transition-colors hover:text-ink" href={resultsUrl} target="_blank" rel="noreferrer">
          {resultsUrl}
        </a>
        , and you can take it down at any time.
      </p>
    </div>
  )

  const message = publish.isError
    ? publish.error instanceof Error
      ? publish.error.message
      : 'That did not publish.'
    : takeDown.isError
      ? 'That did not come down.'
      : null

  return (
    <Disclosure
      teaser={teaser}
      hint={hint}
      openLabel={published ? 'Review and update' : 'Review what would be published'}
      title="Publish the summary"
      subtitle="This is the page exactly as it will read. It carries no response, no channel and no free-text answer, and nothing for any group under ten."
      loading={state.isLoading}
      error={message ?? (state.isError ? 'Could not build the summary.' : null)}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    >
      {s && s.blockers.length > 0 && (
        <Banner tone="info" size="sm">
          {s.blockers.map((b) => (
            <span key={b} className="block">
              {b}
            </span>
          ))}
        </Banner>
      )}

      {publish.isSuccess && !publish.isPending && <p className="text-sm text-success-fg">Published. Anyone with the link can read it now.</p>}

      {(failedCheck || speeders) && s?.preview && (
        <p className="text-xs text-muted">
          This uses the choices above, so it leaves out {[failedCheck && 'those who failed the attention check', speeders && 'the fastest'].filter(Boolean).join(' and ')}.
        </p>
      )}

      {controls}

      {s?.preview && (
        <div className="max-h-[80vh] overflow-y-auto rounded-lg border border-line bg-canvas p-4 sm:p-8">
          <ResultsView results={s.preview} contact={contact} open={surveyOpen} />
        </div>
      )}

      {s?.preview && controls}
    </Disclosure>
  )
}
