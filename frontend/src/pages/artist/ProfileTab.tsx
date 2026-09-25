import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type EpkAudience, type EpkShare, type PublicEpk } from '../../api'
import { EpkView } from '../../components/epk/EpkView'
import { Button } from '../../components/ui/Button'
import { FIELD } from '../../components/ui/Field'
import { Card } from '../../components/ui/Surface'
import { relativeTime, shortDate } from '../../format'
import { WITHHELD_REASONS, type WithheldReason } from '../../../../shared/publicEpk'

/**
 * The EPK as the page a share link opens, and the links themselves.
 *
 * The preview is exactly what a stranger sees — the same component, the same
 * data, from the same rules — plus the one thing they do not: what was left
 * out and why. "Why is my bio not on the page?" should be answered here, not
 * by support; usually it is "you have not marked it right yet".
 *
 * A link is shown once, like an invitation: it is stored hashed, and a
 * withdrawn link stops working for whoever holds it.
 */

const AUDIENCES: Array<{ id: EpkAudience; label: string }> = [
  { id: 'festival', label: 'Festivals and venues' },
  { id: 'sync', label: 'Sync and licensing' },
  { id: 'press', label: 'Press' },
]

function audienceLabel(a: string) {
  return AUDIENCES.find((x) => x.id === a)?.label ?? a
}

function IssuedLink({ url, onDone }: { url: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-lg border border-warn-line bg-warn-bg px-3 py-3 space-y-2">
      <p className="text-sm font-medium text-ink">Your link</p>
      <p className="text-xs text-body">
        Shown once — Scout stores it hashed. Anyone holding it can read this page until you withdraw it.
      </p>
      <code className="block text-xs bg-surface text-body rounded px-2 py-1.5 break-all">{url}</code>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="neutral"
          onClick={() =>
            navigator.clipboard.writeText(url).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <Button variant="quiet" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}

function ShareLinks({ audience }: { audience: EpkAudience }) {
  const qc = useQueryClient()
  const shares = useQuery({ queryKey: ['epk-shares'], queryFn: api.epk.shares })
  const [label, setLabel] = useState('')
  const [issued, setIssued] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => api.epk.share({ label: label.trim(), audience }),
    onSuccess: (s) => {
      setIssued(`${window.location.origin}/#epk/${s.token}`)
      setLabel('')
      qc.invalidateQueries({ queryKey: ['epk-shares'] })
    },
  })
  const revoke = useMutation({
    mutationFn: (id: string) => api.epk.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['epk-shares'] }),
  })

  const items = shares.data?.items ?? []
  const live = items.filter((s) => !s.revokedAt)
  const withdrawn = items.filter((s) => s.revokedAt)

  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold text-ink">Share links</h2>
      <p className="text-xs text-muted">
        One link per place you send it, so you can see who opened it and withdraw one without the others. This
        link shows the {audienceLabel(audience).toLowerCase()} version.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (label.trim()) create.mutate()
        }}
      >
        <label className="block flex-1 min-w-[12rem]">
          <span className="text-xs font-medium text-body">Who is it for</span>
          <input className={FIELD} value={label} maxLength={80} placeholder="Winnipeg Folk Festival 2027" onChange={(e) => setLabel(e.target.value)} />
        </label>
        <Button type="submit" variant="primary" disabled={create.isPending || !label.trim()}>
          {create.isPending ? 'Making…' : 'Make a link'}
        </Button>
      </form>
      {create.isError && <p className="text-xs text-danger-fg">{(create.error as Error).message}</p>}
      {issued && <IssuedLink url={issued} onDone={() => setIssued(null)} />}

      {live.length > 0 && (
        <ul className="divide-y divide-line">
          {live.map((s: EpkShare) => (
            <li key={s.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-ink truncate">{s.label}</p>
                <p className="text-xs text-muted">
                  {audienceLabel(s.audience)} · made {shortDate(s.createdAt)} ·{' '}
                  {s.lastViewedAt ? `last opened ${relativeTime(s.lastViewedAt)}` : 'not opened yet'}
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => {
                  if (confirm(`Withdraw the link for "${s.label}"? Whoever has it will see a "not active" page.`)) revoke.mutate(s.id)
                }}
              >
                Withdraw
              </Button>
            </li>
          ))}
        </ul>
      )}
      {withdrawn.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">{withdrawn.length} withdrawn</summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {withdrawn.map((s) => (
              <li key={s.id}>
                {s.label} — withdrawn {shortDate(s.revokedAt!)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}

/**
 * What the page is missing, in the order a programmer would notice. Only the
 * artist sees this; the page itself never apologises for an empty section.
 */
function pageGaps(epk: PublicEpk, audience: EpkAudience): string[] {
  const out: string[] = []
  if (epk.photos.length === 0) out.push('A press photo with the photographer credited — the page opens on it.')
  if (audience !== 'sync' && epk.videos.length === 0) out.push('A live video — the first thing a programmer watches.')
  if (audience === 'sync' && epk.audio.length === 0) out.push('Recordings — a supervisor listens before reading anything.')
  if (epk.bios.length === 0) out.push('A bio you have marked right.')
  return out
}

export function ProfileTab() {
  const [audience, setAudience] = useState<EpkAudience>('festival')
  const preview = useQuery({ queryKey: ['epk-preview', audience], queryFn: () => api.epk.preview(audience) })
  const withheld = preview.data?.epk.withheld ?? []
  const gaps = preview.data ? pageGaps(preview.data.epk, audience) : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Version</span>
        <div role="group" aria-label="Version" className="flex flex-wrap gap-1 p-1 rounded-lg border border-line bg-surface">
          {AUDIENCES.map((a) => (
            <button
              key={a.id}
              onClick={() => setAudience(a.id)}
              aria-pressed={a.id === audience}
              className={`h-9 px-3 rounded-md text-sm transition-colors ${a.id === audience ? 'bg-raised text-ink font-semibold' : 'text-body hover:text-ink'}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <ShareLinks audience={audience} />

      {preview.data && (gaps.length > 0 || withheld.length > 0) && (
        <Card className="space-y-3">
          {gaps.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink">What would make this page stronger</p>
              <ul className="text-xs text-body space-y-0.5 list-disc pl-4">
                {gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          {withheld.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-sm text-ink">
                {withheld.length === 1 ? 'One thing in your library is' : `${withheld.length} things in your library are`} not
                on this page
              </summary>
              <ul className="mt-2 space-y-1.5">
                {(Object.keys(WITHHELD_REASONS) as WithheldReason[])
                  .filter((r) => withheld.some((w) => w.reason === r))
                  .map((r) => (
                    <li key={r}>
                      <span className="text-body">
                        {withheld
                          .filter((w) => w.reason === r)
                          .map((w) => w.label)
                          .join(', ')}
                      </span>
                      <span className="text-muted"> — {WITHHELD_REASONS[r]}</span>
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      {preview.isLoading && <p className="text-sm text-muted">Building the page…</p>}
      {preview.data && (
        <div className="rounded-xl border border-line overflow-hidden">
          <p className="relative z-10 px-4 py-2 text-xs text-muted bg-sunken border-b border-line">
            This is what a share link shows.
          </p>
          <EpkView page={preview.data} />
        </div>
      )}
    </div>
  )
}
