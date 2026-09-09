import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type GmailDraftResult } from '../api'
import { Disclosure } from './ui/Disclosure'
import { Button } from './ui/Button'

/**
 * Put every ready pitch into Gmail as a draft, in one go.
 *
 * The agent writes pitches into the database; this moves them into the
 * mailbox. Deliberately a person's click rather than something the agent
 * does — the agent runs headless and cannot hold a consent dialog, and
 * writing to somebody's mailbox is a thing they should be watching happen.
 *
 * `Disclosure` because this is the third bulk write in the app and the shell
 * exists so the preview is the path of least resistance. The preview matters
 * more here than in the other two: the interesting half is the **skipped**
 * list. "Drafted four of seven" without saying which three is a worse answer
 * than not drafting.
 *
 * Nothing here sends, and nothing here moves a target to `pitched` — a draft
 * sitting in your drafts folder is not a pitch that went out.
 */
export function GmailDraftsPanel() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<GmailDraftResult | null>(null)

  const preview = useQuery({
    queryKey: ['gmail', 'drafts'],
    queryFn: () => api.gmail.preview(),
    enabled: open,
  })

  const apply = useMutation({
    mutationFn: () => api.gmail.apply(),
    onSuccess: (r) => {
      setResult(r)
      qc.invalidateQueries({ queryKey: ['gmail'] })
      qc.invalidateQueries({ queryKey: ['sync'] })
    },
  })

  const disconnect = useMutation({
    mutationFn: () => api.gmail.disconnect(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gmail'] }),
  })

  const plan = preview.data
  const grant = plan?.grant
  const ready = plan?.ready ?? []

  return (
    <Disclosure
      teaser="Put pitch drafts into Gmail"
      hint="Drafts only — you still read and send them yourself."
      openLabel="Review drafts"
      title="Pitch drafts to Gmail"
      subtitle="Every target with an address and a written pitch, as a Gmail draft."
      loading={preview.isLoading || apply.isPending}
      error={
        preview.error instanceof Error ? preview.error.message
        : apply.error instanceof Error ? apply.error.message
        : null
      }
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => { setOpen(false); setResult(null) }}
    >
      {grant && !grant.configured && (
        <p className="text-xs text-warn-fg">
          Gmail is not available on this site yet — it still needs to be set up on the
          server side. Nothing you can fix from here.
        </p>
      )}

      {grant?.configured && !grant.connected && (
        <div className="space-y-2">
          <p className="text-sm text-body">
            Connecting asks Google for permission to <strong>create drafts</strong> in your mailbox.
          </p>
          {/* Said plainly because it is the honest version. Gmail's narrowest
              drafting scope also permits sending — there is no drafts-only
              one — so the promise that nothing goes out on its own is kept by
              this app rather than by the permission. */}
          <p className="text-xs text-muted">
            Google's narrowest drafting permission also allows sending, because it offers no
            drafts-only option. Scout never sends: there is no send button and no send code, and a
            test fails the build if either appears. You can withdraw access any time, here or from
            your Google account.
          </p>
          <a
            href={api.gmail.connectHref}
            className="inline-block text-xs px-3 py-1.5 rounded-md font-medium transition-colors
                       bg-accent text-accent-fg hover:bg-accent-hover"
          >
            Connect Gmail
          </a>
        </div>
      )}

      {grant?.connected && !grant.canDraft && (
        <p className="text-xs text-warn-fg">
          Connected as {grant.accountEmail ?? 'an unknown account'}, but the drafting permission
          was not granted. Connect again and accept it.
        </p>
      )}

      {grant?.connected && grant.canDraft && !result && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Writing to <span className="text-body">{grant.accountEmail ?? 'your account'}</span>.
          </p>

          {ready.length === 0 ? (
            <p className="text-sm text-muted">Nothing is ready to draft.</p>
          ) : (
            <ul className="divide-y divide-line">
              {ready.map((r) => (
                <li key={r.id} className="py-2">
                  <p className="text-sm text-ink">{r.name}</p>
                  <p className="text-xs text-muted">
                    {r.to} · {r.subject}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {plan && plan.skipped.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted">Not drafted</p>
              <ul className="mt-0.5 space-y-0.5">
                {plan.skipped.map((s) => (
                  <li key={s.id} className="text-xs text-faint">
                    {s.name} — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              disabled={ready.length === 0 || apply.isPending}
              onClick={() => apply.mutate()}
            >
              {apply.isPending ? 'Drafting…' : `Draft ${ready.length} in Gmail`}
            </Button>
            <Button variant="quiet" size="sm" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
              Disconnect
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <p className="text-sm text-ink">
            {result.created.length} draft{result.created.length === 1 ? '' : 's'} created.
          </p>
          <p className="text-xs text-muted">
            They are in your Gmail drafts folder. Nothing has been sent, and nothing here has
            marked any of these as pitched — do that once you actually send.
          </p>
          {result.failed.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-danger-fg">Failed</p>
              <ul className="mt-0.5 space-y-0.5">
                {result.failed.map((f) => (
                  <li key={f.id} className="text-xs text-faint">{f.name} — {f.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Disclosure>
  )
}
