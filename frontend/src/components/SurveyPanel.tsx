import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type SurveyConfigView } from '../api'
import { relativeTime } from '../format'
import type { Estimate, RankingResult, Tally } from '../../../shared/surveyAnalysis'
import { Button } from './ui/Button'
import { Input } from './ui/Field'
import { Explainer } from './ui/Explainer'
import { Banner, Card } from './ui/Surface'
import { SurveyPublish } from './SurveyPublish'

/**
 * The artist survey, from the owner's side: whether it is open and who to
 * contact, who has answered, and what they said. The method is written down in
 * docs/artist-survey-questionnaire.md, and every rule it states shows up here:
 * a group under ten is never shown, every estimate carries its range, and a
 * result is not turned into dollars when it cannot be told from nothing.
 *
 * What it changes is whether the survey is open, who respondents are told to
 * contact and the spam check's public key. There is nothing here that opens a
 * response, because there is nobody to open: nothing identifies them.
 */

const money = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-CA')}`
const percent = (v: number) => `${(v * 100).toFixed(1)}%`

function minutes(seconds: number | null): string {
  if (seconds === null) return 'not yet known'
  const m = Math.round(seconds / 6) / 10
  return `${m} minutes`
}

function Count({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold text-ink">{value}</p>
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
  )
}

function Tallies({ rows }: { rows: Tally[] }) {
  return (
    <ul className="text-sm space-y-1">
      {rows.map((t) => (
        <li key={t.label} className="flex justify-between gap-3">
          <span className="text-body">{t.label}</span>
          <span className="text-ink tabular-nums">{t.n === null ? 'fewer than 10' : t.n}</span>
        </li>
      ))}
    </ul>
  )
}

function RankingTable({ ranking }: { ranking: RankingResult }) {
  const rows = [...ranking.rows].sort((a, b) => b.share - a.share)
  const top = Math.max(...rows.map((r) => r.share))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted border-b border-line">
            <th className="py-1 pr-3 font-medium">Factor</th>
            <th className="py-1 pr-3 font-medium">Share of preference</th>
            <th className="py-1 pr-3 font-medium text-right">Best − worst</th>
            <th className="py-1 font-medium text-right">Shown</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line align-top">
              <td className="py-1.5 pr-3 text-body">{r.text}</td>
              <td className="py-1.5 pr-3 w-44">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-line">
                    <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(r.share / top) * 100}%` }} />
                  </div>
                  <span className="tabular-nums text-ink w-12 text-right">{percent(r.share)}</span>
                </div>
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{r.score.toFixed(2)}</td>
              <td className="py-1.5 text-right tabular-nums text-muted">{r.shown}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Estimates({ rows, unit }: { rows: Estimate[]; unit: 'dollars' | 'ratio' }) {
  const show = (v: number) => (unit === 'dollars' ? money(v) : v.toFixed(2))
  return (
    <ul className="text-sm space-y-1.5">
      {rows.map((e) => (
        <li key={e.key} className="flex justify-between gap-3">
          <span className="text-body">{e.label}</span>
          <span className="text-ink tabular-nums text-right">
            {show(e.value)} <span className="text-muted">({show(e.lo)} to {show(e.hi)})</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The switch, and the two settings it depends on.
 *
 * Opening is refused until there is a contact address, because the notice every
 * respondent reads promises one — the Worker enforces that, and the button says
 * why it is waiting rather than failing. The spam check warns and does not block:
 * the survey runs without it, which is a decision for the owner and not
 * something to take away.
 *
 * Mounted once the settings have loaded, so the fields start from what is saved.
 */
function SurveyAccess({ config }: { config: SurveyConfigView }) {
  const qc = useQueryClient()
  const [contact, setContact] = useState(config.contact ?? '')
  const [siteKey, setSiteKey] = useState(config.siteKey ?? '')
  const [tag, setTag] = useState('')
  const [copied, setCopied] = useState(false)

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof api.admin.setSurvey>[0]) => api.admin.setSurvey(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'survey'] }),
  })

  const dirty = contact.trim() !== (config.contact ?? '') || siteKey.trim() !== (config.siteKey ?? '')
  const link = `${window.location.origin}${window.location.pathname}#survey${/^[a-zA-Z0-9._-]{1,40}$/.test(tag) ? `?src=${tag}` : ''}`

  const needsContact = !config.asked && !config.contact
  const blocker = dirty
    ? 'Save your changes first.'
    : needsContact
      ? 'Add a contact address first. The notice promises one.'
      : null

  const spamCheck = config.botCheck
    ? null
    : config.siteKey && !config.secretSet
      ? 'The spam check has its site key but not its secret, so it is off.'
      : !config.siteKey && config.secretSet
        ? 'The spam check has its secret but not its site key, so it is off.'
        : 'The spam check is not set up.'

  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">
          {config.open ? 'Open: anyone with the link can take it.' : 'Closed: nobody can start it.'}
        </p>
        {config.changedAt && <p className="text-xs text-muted">Changed {relativeTime(config.changedAt)}.</p>}
      </div>

      {config.open && spamCheck && (
        <Banner tone="warn" size="sm">
          {spamCheck} Anyone with a script can fill the survey in, the hourly limit is all that slows them down, and the
          notice tells respondents the page runs a Cloudflare check, which it would not be.
        </Banner>
      )}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          {config.asked ? (
            <Button disabled={save.isPending || dirty} onClick={() => save.mutate({ open: false })}>
              Close the survey
            </Button>
          ) : (
            <Button variant="primary" disabled={save.isPending || !!blocker} onClick={() => save.mutate({ open: true })}>
              Open the survey
            </Button>
          )}
          {!config.asked && blocker && <p className="text-xs text-muted">{blocker}</p>}
        </div>
        <p className="text-xs text-muted">
          {config.asked
            ? 'Closing stops anyone new from starting. People partway through can still finish.'
            : 'Opening makes the link below work for anybody who has it.'}
        </p>
        {save.isError && (
          <p role="alert" className="text-sm text-danger-fg">
            {save.error instanceof Error ? save.error.message : 'That did not save.'}
          </p>
        )}
      </div>

      <form
        className="space-y-3 border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate({ contact: contact.trim() || null, siteKey: siteKey.trim() || null })
        }}
      >
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted" htmlFor="survey-contact">
            Contact address. Shown to every respondent for questions, so it should be a mailbox somebody reads.
          </label>
          <Input
            id="survey-contact"
            type="email"
            value={contact}
            placeholder="hello@example.com"
            onChange={(e) => setContact(e.target.value)}
            className="max-w-sm"
          />
          {config.asked && !contact.trim() && (
            <p className="text-xs text-warn-fg">Close the survey before removing its contact address.</p>
          )}
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted" htmlFor="survey-sitekey">
            Spam check site key. The public half of the Turnstile widget.
          </label>
          <Input
            id="survey-sitekey"
            value={siteKey}
            placeholder="0x4AAAAAAA…"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setSiteKey(e.target.value)}
            className="max-w-sm"
          />
          <p className="text-xs text-muted">
            The secret half is not saved here, because a secret cannot be kept safely on a screen like this one. Add it in the
            Cloudflare dashboard under the Worker’s Settings, Variables and Secrets, as a secret named{' '}
            <code>TURNSTILE_SECRET_KEY</code>. Status: {config.secretSet ? 'set' : 'not set'}.
          </p>
        </div>
        <Button type="submit" disabled={save.isPending || !dirty}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </form>

      <p className="border-t border-line pt-3 text-xs text-muted">
        The notice tells respondents the summary will be posted at{' '}
        <a className="underline" href={config.resultsUrl} target="_blank" rel="noreferrer">
          {config.resultsUrl}
        </a>
        . What is there is whatever you publish under Publish the summary, below.
      </p>

      <div className="space-y-1.5 border-t border-line pt-3">
        <label className="block text-xs font-medium text-muted" htmlFor="survey-tag">
          Link for a channel. Tag it so you can tell where responses came from (letters, numbers, dots, dashes).
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input id="survey-tag" value={tag} placeholder="manitoba-music-newsletter" onChange={(e) => setTag(e.target.value)} className="max-w-xs" />
          <Button
            onClick={() =>
              navigator.clipboard
                .writeText(link)
                .then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                })
                .catch(() => undefined)
            }
          >
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
        <p className="text-xs text-faint break-all">{link}</p>
      </div>
    </Card>
  )
}

export function SurveyPanel() {
  const [failedCheck, setFailedCheck] = useState(false)
  const [speeders, setSpeeders] = useState(false)
  const results = useQuery({
    queryKey: ['admin', 'survey', failedCheck, speeders],
    queryFn: () => api.admin.survey({ failedCheck, speeders }),
  })

  if (results.isLoading) return <div className="h-24 bg-sunken rounded-xl animate-pulse" />
  if (results.error || !results.data) {
    return (
      <p className="text-sm text-danger-fg">
        {results.error instanceof Error ? results.error.message : 'Could not read the survey.'}
      </p>
    )
  }

  const { config, summary: s, truncated } = results.data
  const done = s.counts.complete

  return (
    <section className="space-y-4">
      <header>
        <Explainer as="h2" title="Artist survey">
          A public, anonymous survey of how artists decide which opportunities are worth their time. Nothing identifies a
          respondent, so there is nobody here to open. Any group of fewer than ten is hidden, and every estimate carries a
          range. The questionnaire and the method are written down in the project documents.
        </Explainer>
      </header>

      <SurveyAccess config={config} />

      <Card className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Count label="Completed" value={done} hint={`of ${s.target.completes} wanted for an overall result`} />
          <Count label="Started" value={s.counts.started} hint={`${s.counts.inProgress} still in progress`} />
          <Count label="Not the artist" value={s.counts.screenedOut} />
          <Count
            label="Finished, of those who began"
            value={s.counts.completionRate === null ? '—' : percent(s.counts.completionRate)}
            hint={`median ${minutes(s.timing.medianSeconds)}`}
          />
        </div>
        {!s.target.reached && (
          <p className="text-xs text-muted">
            Under {s.target.completes} completed responses the ranking is indicative at best, and a comparison between
            groups is out of reach.
          </p>
        )}
        {truncated && <p className="text-xs text-warn-fg">There are more responses than this page reads. The newest are shown.</p>}
      </Card>

      <Card className="space-y-3">
        <p className="text-sm font-medium text-ink">Quality</p>
        <p className="text-sm text-body">
          {s.quality.attentionFailed} failed the attention check, {s.quality.attentionPassed} passed, and{' '}
          {s.timing.speeders} took under a third of the median time. They are flagged, not removed.
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2 text-body">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={failedCheck} onChange={(e) => setFailedCheck(e.target.checked)} />
            Leave out those who failed the check
          </label>
          <label className="flex items-center gap-2 text-body">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={speeders} onChange={(e) => setSpeeders(e.target.checked)} />
            Leave out the fastest
          </label>
        </div>
        <p className="text-xs text-muted">
          Order of the two preference parts, among those who finished: {s.order.rankFirst} ranking first and{' '}
          {s.order.choiceFirst} choices first. A large difference in answers between the two orders would be an order effect.
        </p>
      </Card>

      {s.ranking ? (
        <Card className="space-y-3">
          <p className="text-sm font-medium text-ink">What matters most and least</p>
          <p className="text-xs text-muted">
            From {s.ranking.respondents} respondents and {s.ranking.screens} screens. Share of preference adds to 100% across
            the thirteen factors; best minus worst is the plain count, from −1 to 1.
          </p>
          <RankingTable ranking={s.ranking} />
        </Card>
      ) : (
        <p className="text-sm text-muted">No ranking answers yet.</p>
      )}

      {s.choices ? (
        <Card className="space-y-3">
          <p className="text-sm font-medium text-ink">What artists trade, in dollars of pay</p>
          <p className="text-xs text-muted">
            From {s.choices.respondents} respondents and {s.choices.tasks} paired comparisons.{' '}
            {percent(s.choices.neither)} of them were answered Neither.
          </p>
          {s.choices.reliable ? (
            <>
              <Estimates rows={s.choices.values} unit="dollars" />
              <p className="text-xs text-muted pt-1">
                How many dollars of pay one dollar of cost counts for. Close to 1 would mean a dollar is a dollar.
              </p>
              <Estimates rows={s.choices.costRatios} unit="ratio" />
            </>
          ) : (
            <p className="text-sm text-warn-fg">
              The effect of pay cannot yet be told from zero, so nothing is converted to dollars. A dollar value is a ratio
              to pay, and a ratio to nothing is the most confident-looking wrong number a survey can produce. More
              responses are needed.
            </p>
          )}
        </Card>
      ) : (
        <p className="text-sm text-muted">No paired-choice answers yet.</p>
      )}

      <Card className="space-y-3">
        <p className="text-sm font-medium text-ink">Who answered</p>
        <p className="text-xs text-muted">
          Whoever the link reached, which is not the same as artists in general. Groups under ten are combined, and hidden if
          the combination is still under ten.
        </p>
        <div>
          <p className="text-xs font-medium text-muted mb-1">Where they came from</p>
          <Tallies rows={s.channels} />
        </div>
        {s.composition ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(s.composition).map(([q, rows]) => (
              <div key={q}>
                <p className="text-xs font-medium text-muted mb-1">{QUESTION_LABELS[q] ?? q}</p>
                <Tallies rows={rows} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Nothing is described until ten responses are complete.</p>
        )}
      </Card>

      {s.openAnswers.length > 0 && (
        <Card className="space-y-2">
          <details>
            <summary className="text-sm font-medium text-ink cursor-pointer">
              What they said was missing ({s.openAnswers.length})
            </summary>
            <ul className="mt-2 space-y-2 text-sm text-body">
              {s.openAnswers.map((text, i) => (
                <li key={i} className="whitespace-pre-wrap border-l-2 border-line pl-3">
                  {text}
                </li>
              ))}
            </ul>
          </details>
        </Card>
      )}

      <SurveyPublish
        failedCheck={failedCheck}
        speeders={speeders}
        resultsUrl={config.resultsUrl}
        contact={config.contact}
        surveyOpen={config.open}
      />

      <div>
        <Button onClick={() => window.location.assign('/api/admin/survey/export')}>Download every response (CSV)</Button>
        <p className="text-xs text-muted mt-1">
          The raw rows, one per response. Unlike this page it is not suppressed, so treat it as yours alone.
        </p>
      </div>
    </section>
  )
}

const QUESTION_LABELS: Record<string, string> = {
  A1: 'Where they live',
  A2: 'Years performing',
  A3: 'How they perform',
  A4: 'Genre',
  A5: 'Place of music in their work',
  A6: 'Shows in the last year',
  E1: 'Age',
  E3: 'Identity (select all)',
  E4: 'Music income',
}
