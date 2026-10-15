import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type DrivePickerView } from '../api'
import { Button } from './ui/Button'
import { Input } from './ui/Field'
import { Explainer } from './ui/Explainer'
import { Banner, Card } from './ui/Surface'

/**
 * The two public values Google's file picker needs, from the owner's side.
 *
 * Without them an artist can connect Drive and see the folder but cannot add
 * files, and the Drive tab says so. They are settings and not deployment
 * configuration because they are public by nature (the picker runs in the
 * artist's browser) and because changing one should not wait on a build.
 *
 * Both are shown back in full. There is nothing to hide: every signed-in artist's
 * browser is handed them already.
 *
 * Mounted once the settings have loaded, so the fields start from what is saved.
 */
function DrivePickerForm({ config }: { config: DrivePickerView }) {
  const qc = useQueryClient()
  const [apiKey, setApiKey] = useState(config.apiKey ?? '')
  // With nothing saved the field starts from the number the Google client ID
  // names. It is a starting point the owner confirms with Save, not a value
  // written for them.
  const [appId, setAppId] = useState(config.appId ?? config.clientProjectNumber ?? '')

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof api.admin.setDrivePicker>[0]) => api.admin.setDrivePicker(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'drive-picker'] })
      qc.invalidateQueries({ queryKey: ['drive-status'] })
    },
  })

  const dirty = apiKey.trim() !== (config.apiKey ?? '') || appId.trim() !== (config.appId ?? '')
  const mismatch =
    config.appId && config.clientProjectNumber && config.appId !== config.clientProjectNumber
      ? config.clientProjectNumber
      : null

  return (
    <Card className="space-y-4">
      <p className="text-sm font-medium text-ink">
        {config.available
          ? 'Ready: artists can add files to their Drive folder.'
          : 'Not set up: artists can see their Drive folder but cannot add files to it.'}
      </p>

      {mismatch && (
        <Banner tone="warn" size="sm">
          The Google client ID this deployment uses belongs to project {mismatch}, and the project number saved here is{' '}
          {config.appId}. The picker will open, but the files picked in it will not be readable. Use {mismatch}, unless you
          know the key is from another project.
        </Banner>
      )}

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate({ apiKey: apiKey.trim() || null, appId: appId.trim() || null })
        }}
      >
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted" htmlFor="picker-apikey">
            API key. A browser key restricted to the Picker API and to this site.
          </label>
          <Input
            id="picker-apikey"
            value={apiKey}
            placeholder="AIza…"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setApiKey(e.target.value)}
            className="max-w-md"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted" htmlFor="picker-appid">
            Project number. The digits on the project’s dashboard, not its name.
          </label>
          <Input
            id="picker-appid"
            inputMode="numeric"
            value={appId}
            placeholder="123456789012"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setAppId(e.target.value)}
            className="max-w-xs"
          />
          {!config.appId && config.clientProjectNumber && (
            <p className="text-xs text-muted">
              Filled in from this deployment’s Google client ID, which starts with the project number. Save to keep it.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={save.isPending || !dirty}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
          {save.isSuccess && !dirty && <p className="text-xs text-success-fg">Saved.</p>}
        </div>
        {save.isError && (
          <p role="alert" className="text-sm text-danger-fg">
            {save.error instanceof Error ? save.error.message : 'That did not save.'}
          </p>
        )}
      </form>
    </Card>
  )
}

export function DrivePickerPanel() {
  const picker = useQuery({ queryKey: ['admin', 'drive-picker'], queryFn: api.admin.drivePicker })

  return (
    <section className="space-y-3">
      <header>
        <Explainer as="h2" title="Google Drive file picker">
          Adding files to an EPK folder uses Google’s own picker, which needs an API key and the number of the Google
          Cloud project that owns this deployment’s sign-in. In that project, turn on the Google Drive API and the Google
          Picker API, add the drive.file scope on the consent screen, then create an API key under Credentials and
          restrict it to the Picker API and to this site’s address. The project number is on the project’s dashboard.
        </Explainer>
      </header>
      {picker.isLoading ? (
        <div className="h-24 bg-sunken rounded-xl animate-pulse" />
      ) : picker.error || !picker.data ? (
        <p className="text-sm text-danger-fg">
          {picker.error instanceof Error ? picker.error.message : 'Could not read the picker settings.'}
        </p>
      ) : (
        <DrivePickerForm config={picker.data} />
      )}
    </section>
  )
}
