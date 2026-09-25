import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type InviteSummary } from '../api'
import { withConfirmation } from '../confirmIdentity'
import { Button } from './ui/Button'
import { FIELD } from './ui/Field'
import { shortDate } from '../format'
import { Explainer } from './ui/Explainer'
import { Card } from './ui/Surface'

/**
 * Inviting an artist, on the oversight surface.
 *
 * The link is **shown once and then never again**, because an invitation is a
 * credential — the largest one this app hands out, since it grants an account
 * rather than access to one — and it is stored hashed. Losing it means
 * withdrawing the invitation and issuing another, which is the correct cost.
 *
 * Scout can email it too, and does by default when a mail binding exists. The
 * binding no longer carries a one-address allowlist; the Worker refuses any
 * address that is not on an account or a live invitation instead, so the
 * address typed here is mailable for exactly as long as this invitation is.
 * The link is still shown once either way, because copying it is the fallback
 * that always works — and a send that failed must not cost the invitation.
 */
export function InvitesPanel() {
  const qc = useQueryClient()
  const invites = useQuery({ queryKey: ['admin', 'invites'], queryFn: api.admin.invites })

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mailIt, setMailIt] = useState(true)
  const [link, setLink] = useState<{ url: string; email: string; mailed: boolean; mailError: string | null } | null>(null)
  const canMail = invites.data?.canMail ?? false

  const issue = useMutation({
    mutationFn: () =>
      withConfirmation(() =>
        api.admin.invite({
          email: email.trim(),
          displayName: name.trim() || undefined,
          send: canMail && mailIt,
        }),
      ),
    onSuccess: (issued) => {
      setError(null)
      // Built here rather than by the server: the origin the owner is looking
      // at is the origin the invitee has to land on, and a base URL configured
      // somewhere else is one more thing that can be wrong.
      setLink({
        url: `${window.location.origin}/#join/${issued.token}`,
        email: email.trim(),
        mailed: issued.mailed,
        mailError: issued.mailError,
      })
      setEmail('')
      setName('')
      qc.invalidateQueries({ queryKey: ['admin', 'invites'] })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Could not issue an invitation'
      setError(/NotAllowedError|abort|cancel/i.test(message) ? null : message)
    },
  })

  const revoke = useMutation({
    mutationFn: (id: string) => api.admin.revokeInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'invites'] }),
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not withdraw it'),
  })

  const items = invites.data?.items ?? []
  const live = items.filter((i) => i.state === 'valid')
  const past = items.filter((i) => i.state !== 'valid')

  return (
    <section className="space-y-4">
      {/*
        Only the header converts. The two paragraphs further down stay put: one
        says the address cannot be changed once issued, which is an
        irreversibility notice on the input it sits beside, and the other says
        to copy the link and send it yourself, which is the next thing to do
        rather than background. Neither is the app teaching you how it works.
      */}
      <header>
        <Explainer as="h2" title="Invitations">
          An invitation creates an account when it is redeemed. It lasts thirty days, works
          once, and can be withdrawn until it is used.
        </Explainer>
      </header>

      <Card className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-body">Their email</span>
            <input
              className={FIELD}
              type="email"
              value={email}
              placeholder="name@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-body">Their name (optional)</span>
            <input
              className={FIELD}
              value={name}
              placeholder="Unnamed"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>

        <p className="text-xs text-muted">
          The address is fixed now and cannot be changed by whoever redeems the link. It becomes
          the account&rsquo;s recovery address.
        </p>

        {canMail && (
          <label className="flex items-center gap-2 text-sm text-body">
            <input type="checkbox" checked={mailIt} onChange={(e) => setMailIt(e.target.checked)} className="rounded border-line-strong" />
            Email the link to them as well
          </label>
        )}

        <Button
          variant="primary"
          onClick={() => issue.mutate()}
          disabled={issue.isPending || !email.trim()}
        >
          {issue.isPending ? 'Confirming…' : 'Create an invitation'}
        </Button>

        {error && <p className="text-sm text-danger-fg">{error}</p>}

        {link && (
          <IssuedLink
            url={link.url}
            email={link.email}
            mailed={link.mailed}
            mailError={link.mailError}
            onDone={() => setLink(null)}
          />
        )}
      </Card>

      {invites.isLoading && <div className="h-16 bg-sunken rounded-xl animate-pulse" />}

      {live.length > 0 && (
        <ul className="space-y-2">
          {live.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              onRevoke={() => revoke.mutate(invite.id)}
              busy={revoke.isPending}
            />
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <details className="rounded-lg border border-line bg-surface px-4 py-3">
          <summary className="text-sm text-body cursor-pointer">
            {past.length} finished {past.length === 1 ? 'invitation' : 'invitations'}
          </summary>
          <ul className="mt-3 space-y-2">
            {past.map((invite) => (
              <InviteRow key={invite.id} invite={invite} />
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

/**
 * The link, once.
 *
 * Copy rather than a mailto: the address it would open to is the one thing
 * this screen is careful about, and a compose window pre-filled with a
 * credential is a credential in a draft folder. Copy is also the fallback that
 * always works, which is the rule `DraftActions` already follows.
 */
function IssuedLink({
  url,
  email,
  mailed,
  mailError,
  onDone,
}: {
  url: string
  email: string
  mailed: boolean
  mailError: string | null
  onDone: () => void
}) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="rounded-lg border border-warn-fg/30 bg-warn-bg px-3 py-3 space-y-2">
      <p className="text-sm font-medium text-ink">
        {mailed ? `Emailed to ${email}` : `Send this to ${email}`}
      </p>
      <p className="text-xs text-body">
        This is the only time it is shown. It is stored hashed, so nothing here can print it
        again — if it is lost, withdraw the invitation and issue another.
      </p>
      <code className="block text-xs bg-surface text-body rounded px-2 py-1.5 break-all">{url}</code>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="neutral"
          onClick={() => {
            navigator.clipboard.writeText(url).then(
              () => setCopied(true),
              // A clipboard the browser refuses is not an error worth a red
              // box: the link is on screen and can be selected.
              () => setCopied(false),
            )
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <Button variant="quiet" onClick={onDone}>
          Done
        </Button>
      </div>
      {mailError && (
        <p className="text-xs text-danger-fg">
          The email did not go out ({mailError}). The invitation still works — copy the link and
          send it yourself.
        </p>
      )}
    </div>
  )
}

const STATE_LABELS: Record<InviteSummary['state'], string> = {
  valid: 'Waiting',
  redeemed: 'Accepted',
  revoked: 'Withdrawn',
  expired: 'Expired',
}

function InviteRow({
  invite,
  onRevoke,
  busy,
}: {
  invite: InviteSummary
  onRevoke?: () => void
  busy?: boolean
}) {
  return (
    <li className="rounded-lg border border-line bg-surface px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-ink truncate">
          {invite.displayName ? `${invite.displayName} · ` : ''}
          <span className="text-body">{invite.email}</span>
        </p>
        <p className="text-xs text-muted mt-0.5">
          {STATE_LABELS[invite.state]}
          {invite.state === 'valid' && ` · expires ${shortDate(invite.expiresAt)}`}
          {invite.state === 'redeemed' && invite.redeemedAt && ` ${shortDate(invite.redeemedAt)}`}
          {invite.state === 'revoked' && invite.revokedAt && ` ${shortDate(invite.revokedAt)}`}
        </p>
      </div>
      {onRevoke && (
        <Button variant="quiet" onClick={onRevoke} disabled={busy}>
          Withdraw
        </Button>
      )}
    </li>
  )
}
