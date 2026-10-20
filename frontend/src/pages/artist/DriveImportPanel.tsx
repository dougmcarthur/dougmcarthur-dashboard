import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AssetProposal } from '../../api'
import { Button } from '../../components/ui/Button'
import { Disclosure } from '../../components/ui/Disclosure'
import { OrganisePanel } from './DriveTab'

/**
 * Building the artist library from the files in the Google Drive folder, and
 * then prompting the artist to tidy and share that folder as their EPK folder.
 *
 * Preview first, then write — the same shape `SourcePanel` and
 * `AssociationPanel` keep: nothing is added until the artist looks over what
 * was found, and every imported entry lands as `never reviewed`.
 */
export function DriveImportPanel({
  onDone,
  defaultOpen = false,
  onOpenDriveTab,
}: {
  onDone: () => void
  defaultOpen?: boolean
  onOpenDriveTab?: () => void
}) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(defaultOpen)
  const [copiedLink, setCopiedLink] = useState(false)

  const status = useQuery({ queryKey: ['drive-status'], queryFn: api.drive.status })
  const files = useQuery({
    queryKey: ['drive-files'],
    queryFn: api.drive.files,
    enabled: Boolean(status.data?.connected),
  })

  const preview = useQuery({
    queryKey: ['drive-import'],
    queryFn: () => api.driveImport.preview(),
    enabled: open && Boolean(status.data?.connected),
  })

  const apply = useMutation({
    mutationFn: () => api.driveImport.apply(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['artist'] })
      qc.invalidateQueries({ queryKey: ['artist-epk'] })
      qc.invalidateQueries({ queryKey: ['drive-import'] })
      qc.invalidateQueries({ queryKey: ['drive-files'] })
      qc.invalidateQueries({ queryKey: ['drive-organise'] })
      onDone()
    },
  })

  const share = useMutation({
    mutationFn: (shared: boolean) => api.drive.share(shared),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drive-files'] })
      qc.invalidateQueries({ queryKey: ['drive-import'] })
    },
  })

  if (!status.data?.connected) return null
  if (!files.data || !files.data.connected || files.data.files.length === 0) return null

  const data = preview.data
  const showFollowUp = Boolean(
    data && (apply.isSuccess || (data.wouldAdd === 0 && (data.needsOrganise > 0 || !data.shared))),
  )

  return (
    <Disclosure
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      teaser="Your Google Drive folder holds files for your library."
      hint="Read its bio, EPK, photos, audio samples and stage plot into the library, then tidy and share the folder."
      openLabel="Read the folder"
      title="From your Google Drive folder"
      subtitle="Nothing is written until you say so, and everything added lands as never reviewed — a file in Drive is a suggestion until you check it here."
      loading={preview.isLoading}
      error={
        apply.isError
          ? 'Could not add them. Nothing was written.'
          : preview.isError
            ? (preview.error as Error).message
            : null
      }
    >
      {data && data.wouldAdd === 0 && (
        <p className="text-sm text-body">
          {apply.isSuccess
            ? `Added to your library as never reviewed.`
            : data.existing > 0
              ? `Nothing new. All ${data.existing} entries this folder offers are already in your library.`
              : 'This folder holds nothing new this library can file yet.'}
        </p>
      )}

      {data && data.wouldAdd > 0 && (
        <>
          <ul className="divide-y divide-line border-y border-line">
            {data.proposals.map((p: AssetProposal) => (
              <li key={p.source} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                <span className="text-xs text-muted w-16 shrink-0">{p.kind}</span>
                <span className="text-ink font-medium shrink-0">{p.label}</span>
                {p.variant && <span className="text-xs text-muted shrink-0">{p.variant}</span>}
                <span className="text-muted truncate min-w-0 basis-full sm:basis-auto sm:flex-1">{p.value}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={apply.isPending} onClick={() => apply.mutate()}>
              {apply.isPending ? 'Adding…' : `Add ${data.wouldAdd} to the library`}
            </Button>
            {data.existing > 0 && (
              <span className="text-xs text-muted">{data.existing} already on file, left alone.</span>
            )}
          </div>
        </>
      )}

      {data && data.skipped.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer hover:text-ink transition-colors">
            {data.skipped.length} {data.skipped.length === 1 ? 'item' : 'items'} left in Drive without filing
          </summary>
          <ul className="mt-1.5 space-y-0.5 pl-3">
            {data.skipped.map((s) => (
              <li key={s.heading}>
                <span className="text-body">{s.heading}</span> — {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {showFollowUp && data && (
        <div className="rounded-lg border border-line bg-surface p-3.5 space-y-3 mt-2">
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink">
              Organise these assets into a tidy, shareable EPK folder
            </p>
            <p className="text-xs text-muted">
              Give every file a clean name and subfolder (Photos, Audio, Video, Tech, Press) and turn on link sharing
              so festivals and juries can view and download from one link.
            </p>
          </div>

          {data.needsOrganise > 0 && (
            <OrganisePanel
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['drive-import'] })
                onDone()
              }}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-xs text-body">
              {data.shared
                ? 'Anyone with the link can view and download.'
                : 'Folder is private — turn on link sharing when you are ready to hand the link out.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {data.shared ? (
                <Button
                  variant="neutral"
                  size="sm"
                  onClick={() =>
                    navigator.clipboard.writeText(data.folderUrl).then(
                      () => {
                        setCopiedLink(true)
                        setTimeout(() => setCopiedLink(false), 1500)
                      },
                      () => setCopiedLink(false),
                    )
                  }
                >
                  {copiedLink ? 'Copied' : 'Copy folder link'}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={share.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        'Anyone with the link will be able to view and download everything in this folder, and pass the link on. Turn link sharing on?',
                      )
                    ) {
                      share.mutate(true)
                    }
                  }}
                >
                  {share.isPending ? 'Sharing…' : 'Share with a link'}
                </Button>
              )}
              {onOpenDriveTab && (
                <Button variant="quiet" size="sm" onClick={onOpenDriveTab}>
                  Open Drive folder tab
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Disclosure>
  )
}
