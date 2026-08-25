import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

/**
 * The digest's switch, its recipient, and a preview of exactly what would go
 * out right now.
 *
 * The preview is the point. A weekly email is otherwise a thing you can only
 * evaluate weekly, and one you cannot check without either waiting or sending
 * yourself a real message. Previewing has no side effects — it does not write
 * the reporting marks — so looking at it twice cannot make the real send go
 * quiet.
 */
export function DigestSettingsCard() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const preview = useQuery({ queryKey: ['digest', 'preview'], queryFn: api.digest.preview })

  const patch = useMutation({
    mutationFn: (body: Parameters<typeof api.digest.patch>[0]) => api.digest.patch(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['digest'] }),
  })

  const send = useMutation({
    mutationFn: () => api.digest.send(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['digest'] }),
  })

  const d = preview.data
  const settings = d?.settings

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Weekly digest</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Monday morning, and only when something moved. Nothing is sent when there is
            nothing to say.
          </p>
        </div>
        <button
          onClick={() => settings && patch.mutate({ enabled: !settings.enabled })}
          disabled={!settings || patch.isPending}
          className={`shrink-0 text-xs px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-40 ${
            settings?.enabled
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {settings?.enabled ? 'On' : 'Off'}
        </button>
      </div>

      {d && !d.mailerConfigured && (
        <p className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          No email binding on this deploy — add <code>[[send_email]]</code> to wrangler.toml.
          Everything below still previews.
        </p>
      )}

      {settings && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-gray-400">To</dt>
          <dd className="text-gray-700 font-mono">{settings.recipient}</dd>
          <dt className="text-gray-400">From</dt>
          <dd className="text-gray-700 font-mono">{settings.sender}</dd>
        </dl>
      )}

      {d && (
        <div className="pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-600">
              {d.empty ? (
                <span className="text-gray-400">Nothing to report right now.</span>
              ) : (
                <>
                  Next send: <span className="font-medium text-gray-900">{d.subject}</span>
                  <span className="text-gray-400">
                    {' '}
                    · {d.groups.map((g) => `${g.lines.length} ${g.heading.toLowerCase()}`).join(', ')}
                  </span>
                </>
              )}
            </p>
            <div className="flex gap-1.5 shrink-0">
              {!d.empty && (
                <button
                  onClick={() => setOpen((o) => !o)}
                  className="text-xs px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {open ? 'Hide' : 'Preview'}
                </button>
              )}
              <button
                onClick={() => send.mutate()}
                disabled={d.empty || !d.mailerConfigured || send.isPending}
                className="text-xs px-2.5 py-1 rounded-md bg-gray-900 text-white disabled:opacity-30 transition-colors"
              >
                {send.isPending ? 'Sending…' : 'Send now'}
              </button>
            </div>
          </div>

          {open && (
            <div className="mt-3 space-y-3">
              {d.groups.map((g) => (
                <div key={g.id}>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{g.heading}</p>
                  <ul className="space-y-1.5">
                    {g.lines.map((l) => (
                      <li key={l.key} className="text-xs">
                        <span className="font-medium text-gray-900">{l.title}</span>
                        <span className="block text-gray-500 leading-relaxed">{l.rationale}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {send.isSuccess && (
            <p className="mt-2 text-xs text-green-700">
              {send.data.sent ? `Sent to ${send.data.to}.` : `Not sent — ${send.data.reason}.`}
            </p>
          )}
          {send.isError && (
            <p className="mt-2 text-xs text-red-600">Send failed — {(send.error as Error).message}</p>
          )}
        </div>
      )}
    </div>
  )
}
