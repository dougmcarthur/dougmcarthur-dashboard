import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AssociationIdentity, type AssociationSummary } from '../api'
import { Button } from './ui/Button'
import { FIELD } from './ui/Field'
import { relativeTime } from '../format'
import { Explainer } from './ui/Explainer'
import { Card } from './ui/Surface'

/**
 * Connecting a member profile on a provincial music association's site —
 * Manitoba Music, SaskMusic, MusicOntario and the rest.
 *
 * Two steps, and the first writes nothing: paste the address, and the card
 * shows the name and photo on that page and asks whether it is you. Scout
 * never looks a profile up by name, because a search finds the wrong person
 * on the day there are two. An address already in the library's links is
 * read straight away — it is one the artist gave — but still waits for the
 * yes. See `shared/musicAssociations.ts` for which sites have profiles to
 * read and why the others do not.
 */
export function AssociationsCard() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['associations'], queryFn: api.associations.list })
  const [url, setUrl] = useState('')
  const [found, setFound] = useState<AssociationIdentity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const check = useMutation({
    mutationFn: (address: string) => api.associations.check(address.trim()),
    onSuccess: (identity) => {
      setError(null)
      setFound(identity)
    },
    onError: (err) => {
      setFound(null)
      setError(err instanceof Error ? err.message : 'Could not read that page')
    },
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['associations'] })
    qc.invalidateQueries({ queryKey: ['association-import'] })
    qc.invalidateQueries({ queryKey: ['shows'] })
  }

  const save = useMutation({
    mutationFn: () => api.associations.save(found!.url),
    onSuccess: () => {
      setFound(null)
      setUrl('')
      setAdding(false)
      refresh()
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not connect'),
  })

  const remove = useMutation({ mutationFn: (id: string) => api.associations.remove(id), onSuccess: refresh })

  const scan = useMutation({
    mutationFn: api.associations.scan,
    onSuccess: () => {
      refresh()
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const connected = list.data?.connected ?? []
  const offer = list.data?.fromLibrary[0] ?? null
  const directory = list.data?.directory ?? []

  // The address is already in the library: read it and ask "Is this you?"
  // straight away rather than asking the artist to paste it a second time.
  const [offered, setOffered] = useState<string | null>(null)
  useEffect(() => {
    if (!offer || offered === offer.url || found) return
    setOffered(offer.url)
    setUrl(offer.url)
    check.mutate(offer.url)
  }, [offer, offered, found, check])

  const showForm = adding || (connected.length === 0 && !list.isLoading)

  return (
    <Card className="space-y-3">
      <Explainer as="h2" title="Music association profiles">
        Your member profile on your provincial music association’s site. Scout reads the bio, links,
        videos and photos on it into your artist library, as suggestions for you to check. It never
        copies your contact details and never changes the profile.
      </Explainer>

      {connected.length > 0 && (
        <ul className="divide-y divide-line">
          {connected.map((a: AssociationSummary) => (
            <li key={a.id} className="py-2 space-y-1.5">
              <p className="text-sm text-body">
                <span className="text-ink font-medium">{a.name}</span>
                {a.profileName && <> · {a.profileName}</>}
                {a.checkedAt && <span className="text-muted"> · read {relativeTime(a.checkedAt)}</span>}
              </p>
              {a.status !== 'working' && a.statusNote && <p className="text-xs text-warn-fg">Last read failed: {a.statusNote}</p>}
              <div className="flex flex-wrap gap-2">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors border border-line-strong text-body hover:bg-sunken hover:text-ink"
                >
                  Open the profile
                </a>
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`Disconnect ${a.name}? What is already in your library stays.`)) remove.mutate(a.id)
                  }}
                >
                  Disconnect
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {connected.length > 0 && !adding && !found && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted">
            Scout re-reads {connected.length === 1 ? 'this profile' : 'these profiles'} every morning and tells you
            when something new appears on {connected.length === 1 ? 'it' : 'them'}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="neutral" size="sm" disabled={scan.isPending} onClick={() => scan.mutate()}>
              {scan.isPending ? 'Reading…' : 'Check for changes now'}
            </Button>
            <Button variant="quiet" size="sm" onClick={() => setAdding(true)}>
              Add another association
            </Button>
          </div>
          {scan.data && (
            <p className="text-xs text-body">
              {scan.data.announced > 0
                ? `${scan.data.announced} new — see the bell.`
                : scan.data.read > 0
                  ? 'Nothing new since the last read.'
                  : 'Could not read the profile just now; the reason is shown above.'}
            </p>
          )}
        </div>
      )}

      {showForm && !found && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (url.trim()) check.mutate(url)
          }}
        >
          <label className="block">
            <span className="text-xs font-medium text-body">Your profile’s address</span>
            <input
              className={FIELD}
              value={url}
              inputMode="url"
              autoComplete="off"
              placeholder="https://www.manitobamusic.com/yourname"
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted">
            Open your profile on your association’s site and copy the address from the browser.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={check.isPending || !url.trim()}>
              {check.isPending ? 'Reading…' : 'Find my profile'}
            </Button>
            {adding && (
              <Button variant="quiet" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            )}
          </div>
          {directory.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer hover:text-ink transition-colors">Which associations Scout can read</summary>
              <ul className="mt-1.5 space-y-0.5 pl-3">
                {directory.map((d) => (
                  <li key={d.id}>
                    <span className="text-body">{d.name}</span> ({d.region}) —{' '}
                    {d.profiles ? d.note ?? 'member profiles' : d.note ?? 'no public profiles'}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </form>
      )}

      {found && (
        <div className="rounded-lg border border-line bg-sunken p-3 space-y-3">
          <p className="text-sm font-medium text-ink">Is this you?</p>
          <p className="text-xs text-muted">
            On {found.association.name}
            {url === offer?.url ? ' · found in your library’s links' : ''}
          </p>
          <div className="flex gap-3 items-start">
            {found.photo && (
              <img
                src={found.photo}
                alt=""
                referrerPolicy="no-referrer"
                // Some association sites refuse image requests from other
                // sites. A missing thumbnail is not a reason to doubt the name
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
            <Button
              variant="quiet"
              onClick={() => {
                setFound(null)
                setAdding(true)
              }}
            >
              No, try another address
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger-fg bg-danger-bg rounded-md px-3 py-2">{error}</p>}
    </Card>
  )
}
