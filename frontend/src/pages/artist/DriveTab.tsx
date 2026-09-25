import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type DriveFileRow } from '../../api'
import { Button } from '../../components/ui/Button'
import { Disclosure } from '../../components/ui/Disclosure'
import { Card } from '../../components/ui/Surface'
import { SUBFOLDERS } from '../../../../shared/driveOrganise'

/**
 * The folder of assets organisers and juries ask for, built in the artist's
 * own Google Drive.
 *
 * Scout made the folder when Drive was connected, and under `drive.file` it
 * is all Scout can reach — plus whatever the artist picks for it here. Adding
 * files is Google's own picker: upload from this device straight into the
 * folder, or choose files already in Drive, which Scout copies in. Picking a
 * *folder* would grant the folder and not what is in it, so the picker says
 * to open the folder and select the files.
 *
 * Sharing is one switch on the whole folder, and the screen says what it
 * means before it is pressed: anyone with the link can view and download.
 */

declare global {
  interface Window {
    gapi?: any
    google?: any
  }
}

let pickerLoaded: Promise<void> | null = null

/** Google's picker script, loaded once and only when somebody asks for it. */
function loadPicker(): Promise<void> {
  if (pickerLoaded) return pickerLoaded
  pickerLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://apis.google.com/js/api.js'
    s.onload = () => window.gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('The picker did not load')) })
    s.onerror = () => {
      pickerLoaded = null
      reject(new Error('The picker did not load'))
    }
    document.head.appendChild(s)
  })
  return pickerLoaded
}

async function openPicker(onPicked: (docs: Array<{ id: string; parentId?: string }>) => void) {
  const [{ accessToken, folderId, apiKey, appId }] = await Promise.all([api.drive.pickerToken(), loadPicker()])
  const g = window.google.picker
  const upload = new g.DocsUploadView().setParent(folderId).setIncludeFolders(true)
  const existing = new g.DocsView(g.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setMode(g.DocsViewMode.LIST)
  new g.PickerBuilder()
    .setAppId(appId)
    .setOAuthToken(accessToken)
    .setDeveloperKey(apiKey)
    .addView(upload)
    .addView(existing)
    .enableFeature(g.Feature.MULTISELECT_ENABLED)
    .setTitle('Add to your EPK folder — to use a folder you already have, open it and select the files')
    .setCallback((res: any) => {
      if (res.action === g.Action.PICKED) {
        const docs = (res.docs ?? []).map((d: any) => ({ id: d.id, parentId: d.parentId }))
        // Uploads land in the folder already; anything else was picked from
        // elsewhere in Drive and is copied in.
        onPicked(docs.filter((d: { parentId?: string }) => d.parentId !== folderId))
      }
    })
    .build()
    .setVisible(true)
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="quiet"
      size="sm"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => {
            setDone(true)
            setTimeout(() => setDone(false), 1500)
          },
          () => setDone(false),
        )
      }
    >
      {done ? 'Copied' : label}
    </Button>
  )
}

function size(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`
}

function OrganisePanel({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const preview = useQuery({ queryKey: ['drive-organise'], queryFn: () => api.driveOrganise.preview(), enabled: open })
  const apply = useMutation({
    mutationFn: () => api.driveOrganise.apply(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drive-files'] })
      qc.invalidateQueries({ queryKey: ['drive-organise'] })
      onDone()
    },
  })
  const changes = preview.data?.changes ?? []

  return (
    <Disclosure
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      teaser="Give every file a predictable name and a subfolder."
      hint="A juror who downloads everything gets DougMcArthur_Photo_01.jpg, not IMG_4471.JPG."
      openLabel="Tidy the folder"
      title="Tidy the folder"
      subtitle="Nothing is renamed or moved until you say so. Files stay in your Drive; only their names and subfolders change."
      loading={preview.isLoading}
      error={apply.isError ? (apply.error as Error).message : preview.isError ? (preview.error as Error).message : null}
    >
      {preview.data && changes.length === 0 && <p className="text-sm text-body">Everything is already named and filed.</p>}
      {changes.length > 0 && (
        <>
          <ul className="divide-y divide-line border-y border-line">
            {changes.map((ch) => (
              <li key={ch.id} className="py-2 text-sm flex flex-wrap gap-x-2 gap-y-0.5">
                <span className="text-muted truncate min-w-0 basis-full sm:basis-auto">{ch.from.name}</span>
                <span className="text-faint">→</span>
                <span className="text-ink">
                  {ch.to.folder}/{ch.to.name}
                </span>
              </li>
            ))}
          </ul>
          <Button variant="primary" disabled={apply.isPending} onClick={() => apply.mutate()}>
            {apply.isPending ? 'Tidying…' : `Rename and file ${changes.length}`}
          </Button>
        </>
      )}
    </Disclosure>
  )
}

export function DriveTab({ outcome }: { outcome: string | null }) {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ['drive-status'], queryFn: api.drive.status })
  const files = useQuery({ queryKey: ['drive-files'], queryFn: api.drive.files, enabled: Boolean(status.data?.connected) })
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['drive-files'] })
    qc.invalidateQueries({ queryKey: ['drive-organise'] })
  }

  const adopt = useMutation({
    mutationFn: (ids: string[]) => api.drive.adopt(ids),
    onSuccess: (r) => {
      setNote(r.failed.length ? `Copied ${r.copied}; ${r.failed.length} could not be copied.` : `Copied ${r.copied} into the folder.`)
      refresh()
    },
    onError: (e) => setError((e as Error).message),
  })

  const share = useMutation({
    mutationFn: (on: boolean) => api.drive.share(on),
    onSuccess: refresh,
    onError: (e) => setError((e as Error).message),
  })

  const disconnect = useMutation({
    mutationFn: api.drive.disconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drive-status'] }),
  })

  const s = status.data
  if (status.isLoading) return <p className="text-sm text-muted">Checking Google Drive…</p>
  if (!s) return null

  if (!s.connected) {
    return (
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">A folder of your assets, in your Google Drive</h2>
        <p className="text-sm text-body">
          Organisers and juries often ask for a folder they can open with a link. Connect Drive and Scout makes one
          in your account, with subfolders for photos, audio, video, tech and press. You add files; Scout names them
          predictably and hands you the links.
        </p>
        <p className="text-xs text-muted">
          Scout asks for the narrowest Drive permission there is: it can see only the folder it makes and files you
          choose for it, never the rest of your Drive.
        </p>
        {outcome && outcome !== 'connected' && <p className="text-xs text-danger-fg">Connecting did not finish ({outcome}).</p>}
        {s.configured ? (
          <a
            href={api.drive.connectHref}
            className="inline-flex items-center h-10 px-4 rounded-md bg-accent text-accent-fg font-medium hover:bg-accent-hover transition-colors"
          >
            Connect Google Drive
          </a>
        ) : (
          <p className="text-xs text-muted">This deployment has no Google client configured.</p>
        )}
      </Card>
    )
  }

  const data = files.data && files.data.connected ? files.data : null
  const bySub = SUBFOLDERS.map((sub) => ({
    sub,
    rows: (data?.files ?? []).filter((f: DriveFileRow) => f.folder === sub),
  })).filter((g) => g.rows.length > 0)
  const loose = (data?.files ?? []).filter((f) => f.folder === null)

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">Your EPK folder</h2>
            <p className="text-xs text-muted">
              In {s.accountEmail ?? 'your'} Google Drive.{' '}
              {s.folderUrl && (
                <a href={s.folderUrl} target="_blank" rel="noreferrer" className="text-info-fg underline">
                  Open in Drive
                </a>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.picker.available ? (
              <Button
                variant="primary"
                onClick={() => {
                  setError(null)
                  openPicker((docs) => docs.length ? adopt.mutate(docs.map((d) => d.id)) : refresh()).catch((e) => setError((e as Error).message))
                }}
              >
                Add files
              </Button>
            ) : (
              <span className="text-xs text-muted">
                Adding files needs GOOGLE_PICKER_API_KEY and GOOGLE_CLOUD_PROJECT_NUMBER on this deployment.
              </span>
            )}
          </div>
        </div>

        {data && (
          <div className="rounded-lg border border-line bg-sunken p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink">
                {data.shared ? 'Anyone with the link can view and download.' : 'Private — only you can open it.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {data.shared && <CopyButton text={data.folderUrl} label="Copy folder link" />}
                <Button
                  variant={data.shared ? 'neutral' : 'primary'}
                  size="sm"
                  disabled={share.isPending}
                  onClick={() => {
                    if (data.shared) share.mutate(false)
                    else if (confirm('Anyone with the link will be able to view and download everything in this folder, and pass the link on. Turn link sharing on?')) share.mutate(true)
                  }}
                >
                  {data.shared ? 'Stop sharing' : 'Share with a link'}
                </Button>
              </div>
            </div>
            {!data.shared && (
              <p className="text-xs text-muted">The download links below work once link sharing is on.</p>
            )}
          </div>
        )}

        {error && <p className="text-xs text-danger-fg bg-danger-bg rounded-md px-3 py-2">{error}</p>}
        {note && !error && <p className="text-xs text-success-fg">{note}</p>}
        {files.isError && <p className="text-xs text-danger-fg">{(files.error as Error).message}</p>}
      </Card>

      {data && data.files.length > 0 && <OrganisePanel onDone={() => setNote('Tidied.')} />}

      {files.isLoading && <p className="text-sm text-muted">Reading the folder…</p>}
      {data && data.files.length === 0 && <p className="text-sm text-muted">The folder is empty. Add files to start.</p>}

      {[...(loose.length ? [{ sub: 'Not filed yet', rows: loose }] : []), ...bySub].map((g) => (
        <Card key={g.sub} as="section" pad="none" clip>
          <header className="px-4 py-2.5 bg-sunken border-b border-line text-xs font-semibold uppercase tracking-wide text-muted">
            {g.sub}
          </header>
          <ul className="divide-y divide-line">
            {g.rows.map((f) => (
              <li key={f.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{f.name}</p>
                  <p className="text-xs text-muted">
                    {[size(f.size), f.width && f.height ? `${f.width}×${f.height}` : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {f.viewUrl && (
                    <a href={f.viewUrl} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-md text-body hover:text-ink hover:bg-sunken transition-colors">
                      Open
                    </a>
                  )}
                  {f.downloadUrl && data?.shared && <CopyButton text={f.downloadUrl} label="Copy download link" />}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <p className="text-xs text-muted">
        Disconnecting leaves the folder in your Drive.{' '}
        <button
          className="underline hover:text-ink"
          onClick={() => {
            if (confirm('Disconnect Google Drive? The folder stays in your Drive; Scout just stops managing it.')) disconnect.mutate()
          }}
        >
          Disconnect
        </button>
      </p>
    </div>
  )
}
