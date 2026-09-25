import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AgentTokenSummary, type IssuedAgentToken } from '../api'
import { withConfirmation } from '../confirmIdentity'
import { Button } from './ui/Button'
import { FIELD } from './ui/Field'
import { relativeTime, shortDate } from '../format'
import { Explainer } from './ui/Explainer'
import { Card } from './ui/Surface'

/**
 * The research agents' credentials, one row per token.
 *
 * Issuing had only a terminal script until this card, which meant the agents
 * stayed on `API_TOKEN` — a secret with no tenant and no route limit — because
 * moving them needed somebody at a shell. This is the same three routes behind
 * a button.
 *
 * The token is **shown once**, like an invitation link: it is stored hashed,
 * so the list cannot print it and neither can anything else. It lives in this
 * component's state and nowhere in the query cache, so leaving the page is
 * the end of it.
 *
 * Issuing and revoking both go through `withConfirmation`. Issuing mints a
 * credential that writes to your account, which is squarely "changes who can
 * get in"; revoking asks too because the route does, and a burst of
 * revocations costs one touch.
 */
export function AgentTokensCard() {
  const qc = useQueryClient()
  const tokens = useQuery({ queryKey: ['agentTokens'], queryFn: api.agentTokens.list })

  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<IssuedAgentToken | null>(null)

  const issue = useMutation({
    mutationFn: () => withConfirmation(() => api.agentTokens.issue(label.trim())),
    onSuccess: (result) => {
      setError(null)
      setIssued(result)
      setLabel('')
      qc.invalidateQueries({ queryKey: ['agentTokens'] })
    },
    // Cancelling the authenticator prompt is a decision, not a failure.
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Could not issue a token'
      setError(/NotAllowedError|abort|cancel/i.test(message) ? null : message)
    },
  })

  const revoke = useMutation({
    mutationFn: (id: string) => withConfirmation(() => api.agentTokens.revoke(id)),
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: ['agentTokens'] })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Could not revoke that token'
      setError(/NotAllowedError|abort|cancel/i.test(message) ? null : message)
    },
  })

  const items = tokens.data?.items ?? []
  const live = items.filter((t) => !t.revokedAt)
  const revoked = items.filter((t) => t.revokedAt)

  return (
    <Card className="space-y-3">
      <Explainer as="h2" title="Agent tokens">
        What the research agents sign in with. A token can read your gigs, sync targets and
        reference docs, add new gigs, sync targets and promo drafts, and log its runs — it cannot
        edit or delete anything. Issuing or revoking one asks for a passkey first.
      </Explainer>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (label.trim()) issue.mutate()
        }}
      >
        <label className="block flex-1 min-w-[12rem]">
          <span className="text-xs font-medium text-body">What will use it</span>
          <input
            className={FIELD}
            value={label}
            maxLength={80}
            placeholder="Research routines"
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <Button
          type="submit"
          variant="primary"
          className="shrink-0 whitespace-nowrap"
          disabled={issue.isPending || !label.trim()}
        >
          {issue.isPending ? 'Confirming…' : 'Issue a token'}
        </Button>
      </form>

      {error && <p className="text-xs text-danger-fg bg-danger-bg rounded-md px-3 py-2">{error}</p>}

      {issued && <IssuedToken issued={issued} onDone={() => setIssued(null)} />}

      {tokens.isLoading ? (
        <div className="h-16 bg-sunken rounded-lg animate-pulse" />
      ) : live.length === 0 ? (
        <p className="text-sm text-muted">
          None issued. Agents still using the deployment&rsquo;s shared token keep working, but
          that one cannot be revoked from here and is not limited to the agents&rsquo; routes.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {live.map((token) => (
            <TokenRow
              key={token.id}
              token={token}
              busy={revoke.isPending}
              onRevoke={() => {
                if (confirm(`Revoke "${token.label}"? Anything using it will stop being able to file.`)) {
                  revoke.mutate(token.id)
                }
              }}
            />
          ))}
        </ul>
      )}

      {revoked.length > 0 && (
        <details className="pt-1 border-t border-line">
          <summary className="text-xs text-muted cursor-pointer pt-2">
            {revoked.length} revoked {revoked.length === 1 ? 'token' : 'tokens'}
          </summary>
          <ul className="mt-1 divide-y divide-line">
            {revoked.map((token) => (
              <TokenRow key={token.id} token={token} />
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}

/**
 * The token, once.
 *
 * Says where it goes, because a token with no instructions is copied into a
 * notes app and forgotten: the agents run in a cloud environment whose API
 * credential attaches it as a bearer header on the way out.
 */
function IssuedToken({ issued, onDone }: { issued: IssuedAgentToken; onDone: () => void }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="rounded-lg border border-warn-line bg-warn-bg px-3 py-3 space-y-2">
      <p className="text-sm font-medium text-ink">Token for {issued.label}</p>
      <p className="text-xs text-body">
        This is the only time it is shown. It is stored hashed, so nothing here can print it
        again — if it is lost, revoke it and issue another.
      </p>
      <code className="block text-xs bg-surface text-body rounded px-2 py-1.5 break-all">
        {issued.token}
      </code>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="neutral"
          onClick={() => {
            navigator.clipboard.writeText(issued.token).then(
              () => setCopied(true),
              // A refused clipboard is not worth a red box: the token is on
              // screen and can be selected.
              () => setCopied(false),
            )
          }}
        >
          {copied ? 'Copied' : 'Copy token'}
        </Button>
        <Button variant="quiet" onClick={onDone}>
          Done
        </Button>
      </div>
      <p className="text-xs text-muted">
        Add it to the agents&rsquo; cloud environment as an API credential for this site: header{' '}
        <code>Authorization</code>, prefix <code>Bearer</code>. Keep a copy in your password
        manager.
      </p>
    </div>
  )
}

function TokenRow({
  token,
  onRevoke,
  busy,
}: {
  token: AgentTokenSummary
  onRevoke?: () => void
  busy?: boolean
}) {
  return (
    <li className="py-2.5 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-ink truncate">{token.label}</p>
        <p className="text-xs text-muted">
          Issued {shortDate(token.createdAt)}
          {token.revokedAt
            ? ` · revoked ${shortDate(token.revokedAt)}`
            : token.lastUsedAt
              ? ` · last used ${relativeTime(token.lastUsedAt)}`
              : ' · never used'}
        </p>
      </div>
      {onRevoke && (
        <Button variant="danger" size="sm" disabled={busy} onClick={onRevoke}>
          Revoke
        </Button>
      )}
    </li>
  )
}
