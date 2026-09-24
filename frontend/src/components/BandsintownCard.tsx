import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ConnectorSummary } from '../api'
import { Button } from './ui/Button'
import { FIELD } from './ui/Field'
import { relativeTime } from '../format'
import { Explainer } from './ui/Explainer'
import { Card } from './ui/Surface'

/**
 * Bandsintown, connected with the artist's own key.
 *
 * The key is per artist, so every artist fetches their own — and the hard part
 * of that is finding the page it lives on. So the card links straight to it
 * (Bandsintown for Artists → Settings → General) and says in three steps what
 * to do there. The link opens in a new tab and the form stays filled in here.
 *
 * Saving checks the key with Bandsintown first; a key it refuses is not saved,
 * and its own sentence says why. The key is never shown again once saved.
 */

const KEY_PAGE = 'https://artists.bandsintown.com/artist/settings/general'

const STATUS: Record<string, { label: string; tone: string; dot: string }> = {
  working: { label: 'Working', tone: 'bg-success-bg text-success-fg', dot: 'bg-success-solid' },
  rejected: { label: 'Refused', tone: 'bg-warn-bg text-warn-fg', dot: 'bg-warn-fg' },
  unreachable: { label: 'No answer', tone: 'bg-sunken text-muted', dot: 'bg-muted' },
  unverified: { label: 'Not checked', tone: 'bg-sunken text-muted', dot: 'bg-muted' },
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.unverified
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${s.tone}`}>
      <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

export function BandsintownCard() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['connectors'], queryFn: api.connectors.list })
  const [editing, setEditing] = useState(false)
  const [account, setAccount] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const done = () => {
    qc.invalidateQueries({ queryKey: ['connectors'] })
    qc.invalidateQueries({ queryKey: ['shows'] })
  }

  const save = useMutation({
    mutationFn: () => api.connectors.saveBandsintown({ account: account.trim(), apiKey: apiKey.trim() }),
    onSuccess: (res) => {
      setError(null)
      setApiKey('')
      setEditing(false)
      setSaved(
        res.upcoming === 1 ? 'Connected. Bandsintown lists one upcoming show.' : `Connected. Bandsintown lists ${res.upcoming} upcoming shows.`,
      )
      done()
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not connect'),
  })

  const check = useMutation({
    mutationFn: api.connectors.checkBandsintown,
    onSuccess: done,
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not check'),
  })

  const remove = useMutation({
    mutationFn: api.connectors.removeBandsintown,
    onSuccess: () => {
      setSaved(null)
      done()
    },
  })

  const current: ConnectorSummary | null = list.data?.bandsintown ?? null
  const showForm = editing || (!current && !list.isLoading)

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <Explainer as="h2" title="Bandsintown">
          Your shows, read from Bandsintown so they appear on your profile without typing them in
          twice. Scout reads your listings with your own key and never changes them.
        </Explainer>
        {current && <StatusPill status={current.status} />}
      </div>

      {current && !editing && (
        <div className="space-y-2">
          <p className="text-sm text-body">
            Reading shows for <span className="text-ink font-medium">{current.account}</span>
            {current.checkedAt && <span className="text-muted"> · checked {relativeTime(current.checkedAt)}</span>}
          </p>
          {current.statusNote && current.status !== 'working' && (
            <p className="text-xs text-warn-fg">Bandsintown said: {current.statusNote}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="neutral" size="sm" disabled={check.isPending} onClick={() => check.mutate()}>
              {check.isPending ? 'Checking…' : 'Check now'}
            </Button>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setAccount(current.account)
                setEditing(true)
              }}
            >
              Change key
            </Button>
            <Button
              variant="quiet"
              size="sm"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm('Disconnect Bandsintown? Your shows stop appearing in Scout; nothing changes on Bandsintown.')) {
                  remove.mutate()
                }
              }}
            >
              Disconnect
            </Button>
          </div>
        </div>
      )}

      {list.data && !list.data.canStore && (
        <p className="text-xs text-muted">
          This deployment has no <code>TOKEN_ENCRYPTION_KEY</code>, so it cannot store a key yet.
        </p>
      )}

      {showForm && list.data?.canStore && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (account.trim() && apiKey.trim()) save.mutate()
          }}
        >
          <ol className="text-sm text-body space-y-1 list-decimal pl-5">
            <li>
              <a href={KEY_PAGE} target="_blank" rel="noreferrer" className="text-info-fg underline">
                Open your Bandsintown for Artists settings
              </a>{' '}
              and sign in if it asks.
            </li>
            <li>
              Under <span className="text-ink">General</span>, press <span className="text-ink">Get API Key</span>, or{' '}
              <span className="text-ink">Copy API Key</span> if you already have one.
            </li>
            <li>Paste it below, with your artist name exactly as Bandsintown shows it.</li>
          </ol>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-body">Artist name on Bandsintown</span>
              <input
                className={FIELD}
                value={account}
                maxLength={120}
                placeholder="Your artist name"
                autoComplete="off"
                onChange={(e) => setAccount(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-body">API key</span>
              <input
                className={FIELD}
                type="password"
                value={apiKey}
                maxLength={200}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" disabled={save.isPending || !account.trim() || !apiKey.trim()}>
              {save.isPending ? 'Checking with Bandsintown…' : 'Connect'}
            </Button>
            {editing && (
              <Button variant="quiet" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}

      {error && <p className="text-xs text-danger-fg bg-danger-bg rounded-md px-3 py-2">{error}</p>}
      {saved && !error && <p className="text-xs text-success-fg">{saved}</p>}
    </Card>
  )
}
