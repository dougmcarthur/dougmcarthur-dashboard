import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AssociationIdentity } from '../../api'
import { Button } from '../../components/ui/Button'
import { FIELD } from '../../components/ui/Field'
import { Card } from '../../components/ui/Surface'
import { openDrivePicker } from './DriveTab'

/**
 * Shown on the Artist Library tab when the library is still empty.
 *
 * Replaces a dead-end "Nothing here yet" line with the three fastest ways to
 * fill the library without re-typing everything from scratch:
 * 1. Point Scout at a Google Drive folder (bio, EPK, photos, music samples)
 *    and then organise those files into a tidy, shareable folder.
 * 2. Read an existing provincial music association member profile.
 * 3. Add the three essentials (short bio, live video, press photo) by hand.
 */
export function LibraryStarter({
  onStartAdd,
  onOpenDriveTab,
  onDriveFilesAdded,
}: {
  onStartAdd: (kind: string, label: string) => void
  onOpenDriveTab: () => void
  onDriveFilesAdded: () => void
}) {
  const qc = useQueryClient()
  const driveStatus = useQuery({ queryKey: ['drive-status'], queryFn: api.drive.status })
  const driveFiles = useQuery({
    queryKey: ['drive-files'],
    queryFn: api.drive.files,
    enabled: Boolean(driveStatus.data?.connected),
  })
  const associations = useQuery({ queryKey: ['associations'], queryFn: api.associations.list })

  const [driveError, setDriveError] = useState<string | null>(null)
  const [driveNote, setDriveNote] = useState<string | null>(null)

  const [url, setUrl] = useState('')
  const [found, setFound] = useState<AssociationIdentity | null>(null)
  const [assocError, setAssocError] = useState<string | null>(null)

  const refreshDrive = () => {
    qc.invalidateQueries({ queryKey: ['drive-files'] })
    qc.invalidateQueries({ queryKey: ['drive-organise'] })
    qc.invalidateQueries({ queryKey: ['drive-import'] })
    onDriveFilesAdded()
  }

  const adopt = useMutation({
    mutationFn: (ids: string[]) => api.drive.adopt(ids),
    onSuccess: (r) => {
      setDriveNote(
        r.failed.length
          ? `Copied ${r.copied} into your EPK folder (${r.failed.length} could not be copied). Open "Read the folder" above to add them to your library.`
          : `Copied ${r.copied} into your EPK folder. Open "Read the folder" above to add them to your library.`,
      )
      refreshDrive()
    },
    onError: (e) => setDriveError((e as Error).message),
  })

  const checkAssoc = useMutation({
    mutationFn: (address: string) => api.associations.check(address.trim()),
    onSuccess: (identity) => {
      setAssocError(null)
      setFound(identity)
    },
    onError: (err) => {
      setFound(null)
      setAssocError(err instanceof Error ? err.message : 'Could not read that page')
    },
  })

  const saveAssoc = useMutation({
    mutationFn: () => api.associations.save(found!.url),
    onSuccess: () => {
      setFound(null)
      setUrl('')
      qc.invalidateQueries({ queryKey: ['associations'] })
      qc.invalidateQueries({ queryKey: ['association-import'] })
    },
    onError: (err) => setAssocError(err instanceof Error ? err.message : 'Could not connect'),
  })

  const s = driveStatus.data
  const hasDriveFiles = Boolean(driveFiles.data && driveFiles.data.connected && driveFiles.data.files.length > 0)
  const hasConnectedAssoc = (associations.data?.connected ?? []).length > 0

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-ink">
            Build your library from a Google Drive folder
          </h2>
          <p className="text-sm text-body">
            Already have a folder in Google Drive with your bio, EPK, press photos, audio samples, or stage plot?
            Select those files in Google’s picker — Scout reads them into your library and then helps you organise
            them into a tidy, shareable EPK folder for festivals and juries.
          </p>
        </div>

        {!s ? (
          <p className="text-xs text-muted">Checking Google Drive…</p>
        ) : !s.connected ? (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Scout asks only for the narrowest Drive permission: it can see only the EPK folder it creates and the
              files you pick for it, never the rest of your Drive.
            </p>
            {s.configured ? (
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={api.drive.connectHref}
                  className="inline-flex items-center h-9 px-3.5 rounded-lg text-xs bg-accent text-accent-fg font-semibold hover:bg-accent-hover transition-colors"
                >
                  Connect Google Drive
                </a>
              </div>
            ) : (
              <p className="text-xs text-muted">This deployment has no Google client configured yet.</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {s.picker.available ? (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={adopt.isPending}
                  onClick={() => {
                    setDriveError(null)
                    openDrivePicker((docs) =>
                      docs.length ? adopt.mutate(docs.map((d) => d.id)) : refreshDrive(),
                    ).catch((e) => setDriveError((e as Error).message))
                  }}
                >
                  {adopt.isPending
                    ? 'Copying into your EPK folder…'
                    : hasDriveFiles
                      ? 'Pick more files from Google Drive'
                      : 'Pick files from Google Drive'}
                </Button>
              ) : null}
              <Button variant="neutral" size="sm" onClick={onOpenDriveTab}>
                Open Drive folder tab
              </Button>
            </div>
            <p className="text-xs text-muted">
              To use a folder you already have in Drive, open that folder inside the picker and select the files inside it.
            </p>
          </div>
        )}

        {driveError && <p className="text-xs text-danger-fg bg-danger-bg rounded-md px-3 py-2">{driveError}</p>}
        {driveNote && !driveError && <p className="text-xs text-success-fg">{driveNote}</p>}
      </Card>

      {!hasConnectedAssoc && (
        <Card className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-ink">
              Or read your provincial music association profile
            </h2>
            <p className="text-sm text-body">
              Have a member page on Manitoba Music, SaskMusic, MusicOntario, Music BC, or another provincial
              association? Paste its address and Scout will read your bio, links, videos, and photos into your library.
            </p>
          </div>

          {!found ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (url.trim()) checkAssoc.mutate(url)
              }}
            >
              <label className="block flex-1 min-w-[220px]">
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
              <Button type="submit" variant="neutral" disabled={checkAssoc.isPending || !url.trim()}>
                {checkAssoc.isPending ? 'Reading…' : 'Find my profile'}
              </Button>
            </form>
          ) : (
            <div className="rounded-lg border border-line bg-sunken p-3 space-y-2.5">
              <p className="text-sm font-medium text-ink">
                Is this you on {found.association.name}?
              </p>
              <p className="text-sm text-body font-semibold">{found.name}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" disabled={saveAssoc.isPending} onClick={() => saveAssoc.mutate()}>
                  {saveAssoc.isPending ? 'Connecting…' : 'Yes, connect my profile'}
                </Button>
                <Button variant="quiet" size="sm" onClick={() => setFound(null)}>
                  No, try another address
                </Button>
              </div>
            </div>
          )}

          {assocError && <p className="text-xs text-danger-fg bg-danger-bg rounded-md px-3 py-2">{assocError}</p>}
        </Card>
      )}

      <Card className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-ink">Or add your three essentials one by one</h2>
          <p className="text-sm text-muted">
            Add a short bio, a live video, and a press photo and your EPK builds itself.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="neutral" size="sm" onClick={() => onStartAdd('bio', 'Short bio')}>
            + Short bio
          </Button>
          <Button variant="neutral" size="sm" onClick={() => onStartAdd('video', 'Live video')}>
            + Live video
          </Button>
          <Button variant="neutral" size="sm" onClick={() => onStartAdd('photo', 'Press photo')}>
            + Press photo
          </Button>
        </div>
      </Card>
    </div>
  )
}
