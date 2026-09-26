import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type CalendarGrant, type CredentialHealth, type CredentialState, type GoogleAccount } from '../api'
import {
  GOOGLE_PURPOSE_OF,
  connectNotice,
  listServices,
  type ConnectNotice,
  INTEGRATIONS,
  isConnectable,
  rowNeedsAttention,
  stateNote,
  type IntegrationId,
  type IntegrationSpec,
} from '../../../shared/integrations'
import { STATE_LABELS, STATE_NOTES, needsAttention } from '../../../shared/credentialHealth'
import { GoogleConsentModal, type GoogleConsentMode } from './GoogleConsentModal'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { Explainer, InfoGlyph } from './ui/Explainer'
import { useAppearance } from '../hooks/useAppearance'
import { Banner, Card } from './ui/Surface'

/**
 * One list instead of a card each.
 *
 * Three separate cards said three different kinds of thing in three different
 * shapes, and the question a person actually arrives with — "what is this
 * connected to, and is any of it broken" — needed all three read together. A
 * row per integration answers it in one glance, and the detail nobody needs
 * until they need it moves behind the status.
 */

function StatusPill({ state, calm = false }: { state: CredentialState; calm?: boolean }) {
  // `calm` is a grant nobody has connected yet: a choice not yet made, which
  // the warn tone made look like six faults on the day the account is new.
  const tone =
    state === 'working'
      ? 'bg-success-bg text-success-fg'
      : needsAttention(state) && !calm
        ? 'bg-warn-bg text-warn-fg'
        : 'bg-sunken text-muted'
  const dot =
    state === 'working' ? 'bg-success-solid' : needsAttention(state) && !calm ? 'bg-warn-fg' : 'bg-muted'

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
  /**
   * Whether this deployment could complete a consent at all.
   *
   * False means a Worker secret every grant needs is not set, which is a
   * different thing from "nobody has connected this yet" and wants the
   * opposite treatment: no Connect button, and it *does* count as needing
   * attention, because nobody can fix it by pressing anything here.
   *
   * `readGrant` has returned this since the grant table existed and this card
   * ignored it, so Connect was offered on a deployment that answers the
   * consent route with a 503. Pressing it is how it was found.
   */
  serverReady: boolean
}

/** Everything the rows read, which is one query's worth. */
type HealthLike =
  | {
      credentials?: CredentialHealth[]
      grantMissingSecrets?: string[]
      calendarGrant?: CalendarGrant
      gmailGrant?: CalendarGrant
      tasksGrant?: CalendarGrant
      primaryCalendarGrant?: CalendarGrant
      driveGrant?: CalendarGrant
      primaryCalendarOffered?: boolean
    }
  | undefined

/**
 * Which grant answers for which row.
 *
 * A table rather than a chain of ifs, because the chain is what let the
 * calendar row and the drafting row drift into two different ways of saying
 * "connected". The three rows that are not here answer from something else —
 * `calendar` has a secrets fallback, and the last two are a server credential
 * and a binding, which no grant describes.
 */
const GRANT_ROWS: Partial<Record<IntegrationId, (h: HealthLike) => CalendarGrant | undefined>> = {
  'gmail.drafts': (h) => h?.gmailGrant,
  tasks: (h) => h?.tasksGrant,
  'calendar.primary': (h) => h?.primaryCalendarGrant,
  drive: (h) => h?.driveGrant,
}

/** A grant is working when it exists and Google gave it the scope asked for. */
function fromGrant(spec: IntegrationSpec, grant: CalendarGrant | undefined): RowState {
  return {
    spec,
    state: grant?.connected ? (grant.canDraft ? 'working' : 'rejected') : 'unconfigured',
    grant: grant ?? null,
    detail: null,
    checkedAt: grant?.grantedAt ?? null,
    // `configured` is the deployment's answer, identical on every grant row,
    // and false only when a Worker secret is missing.
    serverReady: grant?.configured ?? false,
  }
}

/**
 * What each row knows about itself.
 *
 * A grant answers from the grant; the server credential and the binding answer
 * from the probe. Keeping the resolution in one function rather than in the
 * markup is what stops a row inventing a fifth way to be connected.
 */
function resolveRows(health: HealthLike): RowState[] {
  const byId = new Map((health?.credentials ?? []).map((c) => [c.id, c]))

  return INTEGRATIONS.flatMap((spec): RowState[] => {
    // A gated row is hidden rather than shown disabled. A row you cannot use
    // reads as broken, and on a deployment that has not declared the scope,
    // pressing Connect would end at a Google error page rather than a consent
    // screen — so there is nothing useful behind it to show.
    if (spec.gated && !health?.primaryCalendarOffered) return []

    const grantOf = GRANT_ROWS[spec.id]
    if (grantOf) return [fromGrant(spec, grantOf(health))]

    if (spec.id === 'calendar') {
      const grant = health?.calendarGrant
      if (grant?.connected) return [fromGrant(spec, grant)]
      const cred = byId.get('calendar')
      // No grant: the server-secret path is the only other way in, and when it
      // is not configured either the honest answer is "not connected".
      return [
        {
          spec,
          state: cred?.state === 'working' ? 'working' : 'unconfigured',
          grant: null,
          detail: cred?.detail ?? null,
          checkedAt: cred?.checkedAt ?? null,
          // From the grant, not `true`. This branch is still a grant row — it
          // is only here because the calendar has a second way in, the older
          // Worker secrets — and hardcoding it left Calendar as the one row
          // still offering a Connect that cannot complete.
          serverReady: health?.calendarGrant?.configured ?? false,
        },
      ]
    }

    const cred = byId.get(spec.id === 'gmail.mailbox' ? 'gmail' : 'email')
    return [
      {
        spec,
        state: cred?.state ?? 'unverified',
        grant: null,
        detail: cred?.detail ?? null,
        checkedAt: cred?.checkedAt ?? null,
        // A secret and a binding are set on the server either way; there is no
        // consent for a missing client credential to block.
        serverReady: true,
      },
    ]
  })
}

/**
 * Where a row's Connect button goes, and what Disconnect calls.
 *
 * Tables rather than ternaries for the reason the resolution above is one: a
 * fourth grant turned a two-way ternary into a nested one, and the nesting is
 * where a row ends up pointed at the wrong consent screen.
 */
const CONNECT_HREF: Partial<Record<IntegrationId, string>> = {
  calendar: api.calendar.connectUrl,
  'calendar.primary': api.calendar.primaryConnectUrl,
  tasks: api.tasks.connectUrl,
  'gmail.drafts': api.gmail.connectHref,
  drive: api.drive.connectHref,
}

const DISCONNECT: Partial<Record<IntegrationId, () => Promise<{ ok: boolean }>>> = {
  calendar: () => api.calendar.disconnect(),
  'calendar.primary': () => api.calendar.disconnectPrimary(),
  tasks: () => api.tasks.disconnect(),
  'gmail.drafts': () => api.gmail.disconnect(),
  drive: () => api.drive.disconnect(),
}

/** What each grant leaves behind when it is disconnected. */
const LEAVES_BEHIND: Partial<Record<IntegrationId, string>> = {
  calendar: 'The calendar stays in your account with everything already in it.',
  'calendar.primary':
    'Entries Scout already wrote stay in your calendar. Removing them would mean reaching into a calendar you have just said Scout may not touch.',
  tasks: 'The list and everything on it stay in your account.',
  'gmail.drafts': 'Drafts already written stay in your mailbox.',
  drive: 'The folder and everything in it stay in your Drive.',
}

/**
 * Rows that one press of "Connect Google account" covers. They get no Connect
 * button of their own: four buttons that each open the same Google screen was
 * the thing this replaced. Their own consent is still offered — at the bottom,
 * for the person who keeps mail on one account and a calendar on another.
 */
const IN_BUNDLE = new Set<IntegrationId>(['calendar', 'tasks', 'gmail.drafts', 'drive'])

function DetailModal({
  row,
  missing,
  onClose,
}: {
  row: RowState | null
  /** Worker secrets every grant needs, named because this is a config screen. */
  missing: string[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const disconnect = useMutation({
    mutationFn: async (id: IntegrationId) => DISCONNECT[id]?.() ?? Promise.resolve({ ok: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['google', 'accounts'] })
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
          <p className="text-xs text-muted">{stateNote(spec, state, STATE_NOTES[state])}</p>
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

        {/*
          The one row whose permission is bigger than its purpose says so
          before the consent rather than after it. Warn rather than danger: it
          is a trade somebody may legitimately want to make, not a mistake.
        */}
        {!row.serverReady ? (
          <Banner tone="warn" size="sm">
            Connecting is not possible on this deployment yet
            {missing.length ? <> — {missing.join(' and ')} {missing.length > 1 ? 'are' : 'is'} not set on the server</> : null}. Nothing
            you can fix from here.
          </Banner>
        ) : null}

        {spec.gated ? (
          <Banner tone="warn" size="sm">
            {spec.gated.reason}
          </Banner>
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
            <p className="min-w-0 flex-1 text-xs text-faint">{LEAVES_BEHIND[spec.id]}</p>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

function Row({ row, onOpen }: { row: RowState; onOpen: () => void }) {
  const { appearance } = useAppearance()
  const showHints = appearance.showHints
  const connectHref = CONNECT_HREF[row.spec.id]
  const connectable = isConnectable(row.spec) && connectHref !== undefined
  const connected = row.grant?.connected ?? false
  // A Connect button already says the thing is not connected, so the pill
  // beside it repeated it in two words and a colour. The button is the
  // stronger signal — it is the thing you can act on — so the pill goes and
  // the button stands alone.
  // Not offered when the server side is not set up. A button that answers with
  // "Google client credentials are not configured" is worse than no button:
  // there is nothing the person pressing it can do about it.
  const offeringConnect = connectable && !connected && row.serverReady && !IN_BUNDLE.has(row.spec.id)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      {/*
        The name is the way in to the detail now. It used to be the pill, which
        worked until the pill stopped always being there — and "what can this
        reach, and what can it not" is most worth reading *before* connecting,
        which is exactly when there is no pill to click.

        The one-line purpose that used to sit under the name is gone from the
        row rather than tucked behind its own icon: the modal already opens
        with that exact sentence as its subtitle, so a second disclosure on
        one row would have led to the same words. It carries the same glyph as
        every other explanation on this screen, because it is the same promise
        — press this, read why — even though this one opens a panel with four
        lists in it instead of a sentence.
      */}
      <button
        type="button"
        onClick={onOpen}
        className="group min-w-0 flex-1 flex items-center gap-1.5 text-left rounded-md
                   focus:outline-none focus:ring-2 focus:ring-accent"
        aria-label={`${row.spec.name} — what it can reach`}
      >
        <h3 className="text-sm font-medium text-ink">{row.spec.name}</h3>
        {/*
          Hidden with the rest when explanations are off. The name still opens
          the detail — what goes is the glyph offering it, exactly as the other
          rows lose their icon and keep their sentence behind it.
        */}
        {showHints ? (
          <span className="shrink-0 text-faint transition-colors group-hover:text-body">
            <InfoGlyph />
          </span>
        ) : null}
      </button>

      <div className="flex min-w-0 items-center gap-2">
        {/*
          Which account, on the row itself. With one Google account this
          repeats what the account panel above says; with two it is the only
          place that says which one a service writes to.
        */}
        {connected && row.grant?.accountEmail ? (
          <span className="hidden sm:inline min-w-0 truncate text-xs text-muted" title={row.grant.accountEmail}>
            {row.grant.accountEmail}
          </span>
        ) : null}
        {offeringConnect ? (
          <Button
            variant="primary"
            className="whitespace-nowrap"
            onClick={() => { window.location.href = connectHref }}
          >
            Connect
          </Button>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="rounded-full transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label={`${row.spec.name} — connection details`}
          >
            <StatusPill state={row.state} calm={!rowNeedsAttention(row.spec, row.state)} />
          </button>
        )}
      </div>
    </div>
  )
}


/** The first letter, as an avatar. Google's own photo would need a scope. */
function Initial({ email }: { email: string | null }) {
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-ink"
    >
      {(email ?? '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

/**
 * Google, as the accounts a person connected.
 *
 * One primary button when nothing is connected, because most people keep
 * calendar, mail and files under one account and should not have to press
 * Connect four times to find that out. Once something is connected the
 * button goes and the account takes its place — who it is and what it
 * covers, which is what a connected-accounts screen is for — with Disconnect
 * beside it and, if Google's screen left anything unticked, a quiet way to
 * add it.
 */
function GoogleAccounts({ serverReady }: { serverReady: boolean }) {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['google', 'accounts'], queryFn: api.google.accounts })
  const [confirming, setConfirming] = useState<string | null>(null)
  const [consent, setConsent] = useState<GoogleConsentMode | null>(null)
  const disconnect = useMutation({
    mutationFn: (email: string | null) => api.google.disconnect(email),
    onSuccess: () => {
      setConfirming(null)
      queryClient.invalidateQueries({ queryKey: ['google', 'accounts'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
    },
  })

  if (!data) return null
  const bundle = data.bundle
  const covered = new Set(data.accounts.flatMap((a) => a.purposes))
  const missing = bundle.filter((p) => !covered.has(p))
  // Anything that would ask Google for Gmail goes through the disclosure
  // first. A reconnect that only adds Calendar, Tasks or Drive does not ask
  // for Gmail at all, so it goes straight to Google — and leaves a Gmail grant
  // that is already there exactly as it was.
  const connect = () => {
    if (missing.includes('gmail.compose')) setConsent('bundle')
    else window.location.href = api.google.connectWithoutGmailHref
  }
  const consentModal = <GoogleConsentModal mode={consent} onClose={() => setConsent(null)} />

  if (data.accounts.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-medium text-ink">Google account</h3>
          <p className="text-xs text-muted">
            One connection for {listServices(bundle)}. Gmail is optional: before Google asks, Scout
            shows exactly what it would allow, and you can connect everything else without it.
          </p>
        </div>
        {serverReady ? (
          <Button variant="primary" className="whitespace-nowrap" onClick={connect}>
            Connect Google account
          </Button>
        ) : null}
        {consentModal}
      </div>
    )
  }

  return (
    <div className="space-y-3 border-b border-line py-4">
      {data.accounts.map((account: GoogleAccount) => {
        const key = account.email ?? ''
        return (
          <div key={key} className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Initial email={account.email} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{account.email ?? 'Google account'}</p>
                <p className="text-xs text-muted">
                  Connected for {listServices(account.purposes)}
                  {account.connectedAt ? ` · since ${onDate(account.connectedAt)}` : ''}
                </p>
              </div>
            </div>
            {confirming === key ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-body">
                  Disconnect from {listServices(account.purposes)}?
                </span>
                <Button variant="danger" size="sm" onClick={() => disconnect.mutate(account.email)} disabled={disconnect.isPending}>
                  {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
                </Button>
                <Button variant="quiet" size="sm" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="quiet" size="sm" onClick={() => setConfirming(key)}>
                Disconnect
              </Button>
            )}
          </div>
        )
      })}
      {confirming !== null ? (
        <p className="text-xs text-faint">
          The calendar, task list, Drive folder and drafts Scout made stay in the account.
          Google also stops listing Scout under the account’s third-party access.
        </p>
      ) : null}
      {missing.length && serverReady ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted">Not connected: {listServices(missing)}.</p>
          <Button variant="neutral" size="sm" onClick={connect}>
            Add {missing.length === 1 ? 'it' : 'them'}
          </Button>
        </div>
      ) : null}
      {consentModal}
    </div>
  )
}

/**
 * The edge case, kept quiet: a different Google account for one service.
 * Each link is that service's own consent, and Google asks which account.
 * Connecting one here replaces whatever account that service had — and a later
 * "Connect Google account" leaves it where it is.
 */
function OtherAccounts({ rows }: { rows: RowState[] }) {
  const offered = rows.filter((r) => IN_BUNDLE.has(r.spec.id) && CONNECT_HREF[r.spec.id] && r.serverReady)
  // Gmail on a second account is still Gmail: the same disclosure first.
  const [consent, setConsent] = useState<GoogleConsentMode | null>(null)
  if (!offered.length) return null
  return (
    <details className="group pt-3">
      <summary className="cursor-pointer text-xs text-muted hover:text-ink">
        Use a different Google account for one service
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-xs text-faint">
          For keeping, say, your calendar on one account and your mail on another. Google asks which
          account to use; the service switches to it and everything else stays as it is.
        </p>
        <div className="flex flex-wrap gap-2">
          {offered.map((r) => (
            <Button
              key={r.spec.id}
              variant="neutral"
              size="sm"
              onClick={() => {
                if (r.spec.id === 'gmail.drafts') setConsent('gmail')
                else window.location.href = CONNECT_HREF[r.spec.id] as string
              }}
            >
              {r.spec.name}
            </Button>
          ))}
        </div>
        <GoogleConsentModal mode={consent} gmailHref={api.gmail.connectHref} onClose={() => setConsent(null)} />
      </div>
    </details>
  )
}

/**
 * How the last trip to Google went, read once from the address it came back
 * to and then cleared, so a reload does not announce it twice.
 */
function useConnectNotice(): [ConnectNotice | null, () => void] {
  const [notice, setNotice] = useState<ConnectNotice | null>(null)
  useEffect(() => {
    const hash = window.location.hash
    const at = hash.indexOf('?')
    if (at < 0) return
    const found = connectNotice(new URLSearchParams(hash.slice(at + 1)))
    if (!found) return
    setNotice(found)
    window.history.replaceState(null, '', `${window.location.pathname}${hash.slice(0, at)}`)
  }, [])
  return [notice, () => setNotice(null)]
}

export function IntegrationsCard() {
  const [openId, setOpenId] = useState<IntegrationId | null>(null)
  const [notice, dismissNotice] = useConnectNotice()
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
  // Not `needsAttention`: on a grant row, `unconfigured` means nobody has
  // pressed Connect, which is a choice not yet made rather than a fault. See
  // `rowNeedsAttention`.
  const attention = rows.filter(
    (r) => !r.serverReady || rowNeedsAttention(r.spec, r.state),
  ).length
  // Counted separately, because "nothing is broken" and "everything is
  // connected" are different claims and the summary used to make the second
  // when it could only support the first.
  const unconnected = rows.filter((r) => r.state === 'unconfigured').length
  const blocked = data?.grantMissingSecrets ?? []

  return (
    <Card>
      <div className="flex flex-col items-start gap-1.5 border-b border-line pb-3">
        <h2 className="text-sm font-semibold text-ink">Integrations</h2>
        <p className="text-xs text-muted">
          {attention > 0
            ? `${attention} of ${rows.length} ${attention === 1 ? 'needs' : 'need'} attention.`
            : unconnected > 0
              ? `${rows.length - unconnected} of ${rows.length} connected, and nothing is broken.`
              : 'Everything Scout talks to is working.'}
        </p>
      </div>

      {/*
        Said once at the top rather than three times down the list. One missing
        Worker secret blocks every grant, so it is a fact about the deployment
        and not about any row — and naming the variable is the actionable part.
        This is the one place developer-speak stays, for exactly that reason.
      */}
      {blocked.length ? (
        <p className="mt-3 rounded-md border border-warn-line bg-warn-bg/60 px-3 py-2 text-xs text-warn-fg">
          Connecting is switched off on this deployment:{' '}
          {blocked.map((name, i) => (
            <span key={name}>
              {i > 0 ? (i === blocked.length - 1 ? ' and ' : ', ') : ''}
              <code className="font-mono">{name}</code>
            </span>
          ))}{' '}
          {blocked.length > 1 ? 'are' : 'is'} not set on the server. Everything already connected
          keeps working.
        </p>
      ) : null}

      {notice ? (
        <div className="mt-3 space-y-1">
          <Banner tone={notice.tone} size="sm">
            {notice.lines.map((line, i) => (
              <span key={line} className={i === 0 ? 'block font-medium' : 'mt-1 block'}>
                {line}
              </span>
            ))}
          </Banner>
          <button type="button" className="text-xs text-muted hover:text-ink" onClick={dismissNotice}>
            Dismiss
          </button>
        </div>
      ) : null}

      <GoogleAccounts serverReady={blocked.length === 0} />

      <div className="divide-y divide-line">
        {rows.map((row) => (
          <Row key={row.spec.id} row={row} onOpen={() => setOpenId(row.spec.id)} />
        ))}
      </div>

      <OtherAccounts rows={rows} />

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <Explainer
          as="div"
          titleClassName=""
          titleText="checking connections"
          title={
            <Button
              variant="neutral"
              className="whitespace-nowrap"
              onClick={() => check.mutate()}
              disabled={check.isPending}
            >
              {check.isPending ? 'Checking…' : 'Check connections'}
            </Button>
          }
        >
          Asks Google whether each credential is still accepted. Runs once a day on its own, which
          is what makes a credential that quietly stopped working findable at all.
        </Explainer>
      </div>
      {check.isError ? (
        <p className="pt-2 text-xs text-danger-fg">
          The check could not be run. That is about this request, not the credentials.
        </p>
      ) : null}

      <DetailModal
        row={rows.find((r) => r.spec.id === openId) ?? null}
        missing={data?.grantMissingSecrets ?? []}
        onClose={() => setOpenId(null)}
      />
    </Card>
  )
}
