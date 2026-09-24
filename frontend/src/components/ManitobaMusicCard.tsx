import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type MmIdentity } from '../api'
import { Button } from './ui/Button'
import { FIELD } from './ui/Field'
import { relativeTime } from '../format'
import { Explainer } from './ui/Explainer'
import { Card } from './ui/Surface'

/**
 * Connecting a Manitoba Music profile.
 *
 * Two steps, and the first writes nothing: paste the address, and the card
 * shows the name and photo on that page and asks whether it is you. Scout
 * never looks a profile up by name, because a search finds the wrong person
 * on the day there are two. Once connected, the Artist page's library can
 * read it in. See `shared/manitobaMusic.ts`.
 */
export function ManitobaMusicCard() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['connectors'], queryFn: api.connectors.list })
  const [url, setUrl] = useState('')
  const [found, setFound] = useState<MmIdentity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const check = useMutation({
    mutationFn: () => api.connectors.checkManitobaMusic(url.trim()),
    onSuccess: (identity) => {
      setError(null)
      setFound(identity)
    },
    onError: (err) => {
      setFound(null)
      setError(err instanceof Error ? err.message : 'Could not read that page')
    },
  })

  const save = useMutation({
    mutationFn: () => api.connectors.saveManitobaMusic(found!.url),
    onSuccess: () => {
      setFound(null)
      setUrl('')
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['connectors'] })
      qc.invalidateQueries({ queryKey: ['mm-import'] })
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not connect'),
  })

  const remove = useMutation({
    mutationFn: api.connectors.removeManitobaMusic,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connectors'] })
      qc.invalidateQueries({ queryKey: ['mm-import'] })
    },
  })

  const current = list.data?.manitobaMusic ?? null
  const showForm = editing || (!current && !list.isLoading)

  return (
    <Card className="space-y-3">
      <Explainer as="h2" title="Manitoba Music">
        Your member profile on manitobamusic.com. Scout reads the bio, links, videos, releases,
        downloads and photos on it into your artist library, as suggestions for you to check. It
        never copies your contact details and never changes the profile.
      </Explainer>

      {current && !editing && (
        <div className="space-y-2">
          <p className="text-sm text-body">
            Reading the profile of <span className="text-ink font-medium">{current.statusNote ?? 'your profile'}</span>
            {current.checkedAt && <span className="text-muted"> · read {relativeTime(current.checkedAt)}</span>}
          </p>
          {current.status !== 'working' && current.statusNote && (
            <p className="text-xs text-warn-fg">Last read failed: {current.statusNote}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <a
              href={current.account}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors border border-line-strong text-body hover:bg-sunken hover:text-ink"
            >
              Open the profile
            </a>
            <Button variant="quiet" size="sm" onClick={() => setEditing(true)}>
              Use a different profile
            </Button>
            <Button
              variant="quiet"
              size="sm"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm('Disconnect Manitoba Music? What is already in your library stays.')) remove.mutate()
              }}
            >
              Disconnect
            </Button>
          </div>
        </div>
      )}

      {showForm && !found && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (url.trim()) check.mutate()
          }}
        >
          <label className="block">
            <span className="text-xs font-medium text-body">Your profile’s address</span>
            <input
              className={FIELD}
              value={url}
              inputMode="url"
              autoComplete="off"
              placeholder="https://www.manitobamusic.com/profiles/view,499/yourname"
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted">
            Open your profile on manitobamusic.com and copy the address from the browser — it has
            /profiles/view in it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={check.isPending || !url.trim()}>
              {check.isPending ? 'Reading…' : 'Find my profile'}
            </Button>
            {editing && (
              <Button variant="quiet" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}

      {found && (
        <div className="rounded-lg border border-line bg-sunken p-3 space-y-3">
          <p className="text-sm font-medium text-ink">Is this you?</p>
          <div className="flex gap-3 items-start">
            {found.photo && (
              <img
                src={found.photo}
                alt=""
                referrerPolicy="no-referrer"
                // Manitoba Music refuses some image requests from other sites.
                // A missing thumbnail is not a reason to doubt the name
                // beside it, so it goes rather than showing a broken box.
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
                className="w-16 h-16 rounded-md object-cover shrink-0 bg-raised"
              />
            )}
            <div className="min-w-0 space-y-0.5">
              <p className="text-base text-ink font-semibold">{found.name}</p>
              {found.genres.length > 0 && <p className="text-xs text-muted">{found.genres.join(' · ')}</p>}
              <p className="text-xs text-muted">
                {[
                  found.counts.bio ? 'a bio' : null,
                  found.counts.links ? `${found.counts.links} links` : null,
                  found.counts.videos ? `${found.counts.videos} videos` : null,
                  found.counts.releases ? `${found.counts.releases} releases` : null,
                  found.counts.files ? `${found.counts.files} downloads` : null,
                  found.counts.photos ? `${found.counts.photos} photos` : null,
                ]
                  .filter(Boolean)
                  .join(', ') || 'Nothing Scout can read yet'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Connecting…' : 'Yes, this is me'}
            </Button>
            <Button variant="quiet" onClick={() => setFound(null)}>
              No, try another address
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger-fg bg-danger-bg rounded-md px-3 py-2">{error}</p>}
    </Card>
  )
}
