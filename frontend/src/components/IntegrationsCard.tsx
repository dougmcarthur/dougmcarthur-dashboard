import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type CalendarGrant, type CredentialHealth, type CredentialState } from '../api'
import {
  INTEGRATIONS,
  isConnectable,
  type IntegrationId,
  type IntegrationSpec,
} from '../../../shared/integrations'
import { STATE_LABELS, STATE_NOTES, needsAttention } from '../../../shared/credentialHealth'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'

/**
 * One list instead of a card each.
 *
 * Three separate cards said three different kinds of thing in three different
 * shapes, and the question a person actually arrives with — "what is this
 * connected to, and is any of it broken" — needed all three read together. A
 * row per integration answers it in one glance, and the detail nobody needs
 * until they need it moves behind the status.
 */

function StatusPill({ state }: { state: CredentialState }) {
  const tone =
    state === 'working'
      ? 'bg-success-bg text-success-fg'
      : needsAttention(state)
        ? 'bg-warn-bg text-warn-fg'
        : 'bg-sunken text-muted'
  const dot =
    state === 'working' ? 'bg-success-solid' : needsAttention(state) ? 'bg-warn-fg' : 'bg-muted'

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${dot}`} />
      {STATE_LABELS[state]}
    </span>
  )
}

/** "2 March 2026", because a timestamp is not a thing anybody reads. */
function onDate(iso: string | null): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

interface RowState {
  spec: IntegrationSpec
  state: CredentialState
  grant: CalendarGrant | null
  detail: string | null
  checkedAt: string | null
}

/**
 * What each row knows about itself.
 *
 * A grant answers from the grant; the other two answer from the credential
 * probe. Keeping the resolution in one function rather than in the markup is
 * what stops a row inventing a fourth way to be connected.
 */
function resolveRows(
  health: { credentials?: CredentialHealth[]; calendarGrant?: CalendarGrant; gmailGrant?: CalendarGrant } | undefined,
): RowState[] {
  const byId = new Map((health?.credentials ?? []).map((c) => [c.id, c]))

  return INTEGRATIONS.map((spec): RowState => {
    if (spec.id === 'calendar') {
      const grant = health?.calendarGrant ?? null
      if (grant?.connected) {
        return { spec, state: grant.canDraft ? 'working' : 'rejected', grant, detail: null, checkedAt: grant.grantedAt }
      }
      const cred = byId.get('calendar')
      // No grant: the server-secret path is the only other way in, and when it
      // is not configured either the honest answer is "not connected".
      return {
        spec,
        state: cred?.state === 'working' ? 'working' : 'unconfigured',
        grant,
        detail: cred?.detail ?? null,
        checkedAt: cred?.checkedAt ?? null,
      }
    }

    if (spec.id === 'gmail.drafts') {
      const grant = health?.gmailGrant ?? null
      return {
        spec,
        state: grant?.connected ? (grant.canDraft ? 'working' : 'rejected') : 'unconfigured',
        grant: grant ?? null,
        detail: null,
        checkedAt: grant?.grantedAt ?? null,
      }
    }

    const cred = byId.get(spec.id === 'gmail.mailbox' ? 'gmail' : 'email')
    return {
      spec,
      state: cred?.state ?? 'unverified',
      grant: null,
      detail: cred?.detail ?? null,
      checkedAt: cred?.checkedAt ?? null,
    }
  })
}

function DetailModal({ row, onClose }: { row: RowState | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const disconnect = useMutation({
    mutationFn: async (id: IntegrationId) =>
      id === 'calendar' ? api.calendar.disconnect() : api.gmail.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      onClose()
    },
  })

  if (!row) return null
  const { spec, grant, state } = row

  return (
    <Modal open onClose={onClose} title={spec.name} subtitle={spec.purpose}>
      <div className="space-y-4">
        <div className="flex flex-col items-start gap-1.5">
          <StatusPill state={state} />
          <p className="text-xs text-muted">{STATE_NOTES[state]}</p>
          {/*
            Google's own words, but only where they are about *this* state. An
            unconfigured row can still carry the detail of an older probe
            against the server credential, and showing it under "the secrets
            are not set" is two contradictory claims in one panel.
          */}
          {row.detail && (state === 'rejected' || state === 'unreachable') ? (
            <p className="text-xs text-muted break-words">{row.detail}</p>
          ) : null}
        </div>

        {grant?.connected ? (
          <dl className="space-y-1.5 text-xs">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-faint">Account</dt>
              <dd className="min-w-0 break-words text-body">{grant.accountEmail ?? 'Not reported by Google'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-faint">Connected</dt>
              <dd className="text-body">{onDate(grant.grantedAt) ?? 'Unknown'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-faint">Last used</dt>
              <dd className="text-body">{onDate(grant.lastUsedAt) ?? 'Not used yet'}</dd>
            </div>
          </dl>
        ) : row.checkedAt ? (
          <p className="text-xs text-faint">Last checked {onDate(row.checkedAt)}</p>
        ) : null}

        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold text-ink">What it can do</h3>
          <ul className="space-y-1">
            {spec.access.map((line) => (
              <li key={line} className="flex gap-2 text-xs text-body">
                <span aria-hidden className="text-muted">•</span>
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {spec.cannot.length ? (
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-ink">What it cannot do</h3>
            <ul className="space-y-1">
              {spec.cannot.map((line) => (
                <li key={line} className="flex gap-2 text-xs text-muted">
                  <span aria-hidden className="text-muted">•</span>
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-xs text-faint">{spec.breaks}</p>

        {isConnectable(spec) && grant?.connected ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <Button
              variant="quiet"
              onClick={() => disconnect.mutate(spec.id)}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
            <p className="min-w-0 flex-1 text-xs text-faint">
              {spec.id === 'calendar'
                ? 'The calendar stays in your account with everything already in it.'
                : 'Drafts already written stay in your mailbox.'}
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

function Row({ row, onOpen }: { row: RowState; onOpen: () => void }) {
  const connectHref = row.spec.id === 'calendar' ? api.calendar.connectUrl : api.gmail.connectHref
  const connectable = isConnectable(row.spec)
  const connected = row.grant?.connected ?? false

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-ink">{row.spec.name}</h3>
        <p className="text-xs text-muted">{row.spec.purpose}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {connectable && !connected ? (
          <Button variant="primary" className="whitespace-nowrap" onClick={() => { window.location.href = connectHref }}>
            Connect
          </Button>
        ) : null}
        {/*
          The status is the way in to the detail, for connectable rows and for
          the two that are not: "what can this reach" is worth answering about
          a server credential too, and a row you cannot click is a row that
          looks broken.
        */}
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label={`${row.spec.name} — connection details`}
        >
          <StatusPill state={row.state} />
        </button>
      </div>
    </div>
  )
}

export function IntegrationsCard() {
  const [openId, setOpenId] = useState<IntegrationId | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 })

  const check = useMutation({
    mutationFn: api.checkCredentials,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      // A credential that just came back rejected is a condition the bell
      // raises, so the feed is no longer accurate either.
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  if (isLoading) return <div className="h-48 bg-sunken rounded-xl animate-pulse" />

  const rows = resolveRows(data)
  const attention = rows.filter((r) => needsAttention(r.state)).length

  return (
    <div className="bg-surface border border-line rounded-xl shadow-card p-4">
      <div className="flex flex-col items-start gap-1.5 border-b border-line pb-3">
        <h2 className="text-sm font-semibold text-ink">Integrations</h2>
        <p className="text-xs text-muted">
          {attention === 0
            ? 'Everything Scout talks to is working.'
            : `${attention} of ${rows.length} ${attention === 1 ? 'needs' : 'need'} attention.`}
        </p>
      </div>

      <div className="divide-y divide-line">
        {rows.map((row) => (
          <Row key={row.spec.id} row={row} onOpen={() => setOpenId(row.spec.id)} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <Button
          variant="neutral"
          className="whitespace-nowrap"
          onClick={() => check.mutate()}
          disabled={check.isPending}
        >
          {check.isPending ? 'Checking…' : 'Check connections'}
        </Button>
        <p className="min-w-0 flex-1 text-xs text-faint">
          Asks Google whether each credential is still accepted. Runs once a day on its own.
        </p>
      </div>
      {check.isError ? (
        <p className="pt-2 text-xs text-danger-fg">
          The check could not be run. That is about this request, not the credentials.
        </p>
      ) : null}

      <DetailModal row={rows.find((r) => r.spec.id === openId) ?? null} onClose={() => setOpenId(null)} />
    </div>
  )
}
