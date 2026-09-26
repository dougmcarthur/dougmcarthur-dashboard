/**
 * Turning a Digest into an email.
 *
 * Kept apart from shared/digest.ts on purpose: that module decides what is
 * worth saying and is pure; this one decides how it looks and is allowed to
 * know about HTML and URLs. Changing the wording of a heading should not risk
 * changing who gets reported.
 *
 * The shape is deliberately top-heavy. Five items get a number, a name and a
 * sentence; everything else gets one line and a link. An email that lists sixty
 * items has not prioritised them, it has just moved the dashboard into your
 * inbox — and the dashboard is better at being the dashboard.
 *
 * The header, footer, palette and the Outlook-proofing all come from
 * emailTemplate.ts, which every outgoing email shares. The digest is a
 * `notification`: something the account holder switched on, so its footer
 * says when it is sent and links to where it is switched off.
 */

import type { Digest, DigestGroup, DigestLine, DigestRollup } from '../../shared/digest'
import { describeSchedule, type Schedule } from '../../shared/digestSchedule'
import {
  button,
  escapeHtml,
  paragraph,
  renderEmail,
  rule,
  sectionLabel,
  type,
  EMAIL_COLOURS as C,
  type RenderedEmail,
  type SenderIdentity,
} from './emailTemplate'

/** Names in the change section before it stops naming and starts counting. */
const NAME_LIMIT = 4

const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"'

/** Subject names the size of the ask, not the size of the backlog. */
export function subjectFor(digest: Digest): string {
  if (digest.focus.length > 0) {
    return `${digest.focus.length} to act on this week`
  }
  const total = digest.groups.reduce((n, g) => n + g.lines.length, 0)
  return `${total} ${total === 1 ? 'update' : 'updates'}`
}

/**
 * The change section, as counts with a few names.
 *
 * A group of sixty is reported as sixty, not printed as sixty — the first
 * digest after a cold start would otherwise be the entire queue rendered
 * twice, once ranked and once alphabetically.
 */
function changeSummary(g: DigestGroup): { heading: string; detail: string } {
  const names = g.lines.slice(0, NAME_LIMIT).map((l) => l.title)
  const rest = g.lines.length - names.length
  const detail = rest > 0 ? `${names.join(', ')}, and ${rest} more` : names.join(', ')
  return { heading: `${g.heading} (${g.lines.length})`, detail }
}

/** "America/Winnipeg" → "Winnipeg time". A zone id is an identifier, not a name. */
function zoneName(timezone: string): string {
  const city = timezone.split('/').pop() ?? timezone
  return `${city.replace(/_/g, ' ')} time`
}

function bodyText(digest: Digest, base: string): string {
  const parts: string[] = []

  if (digest.focus.length > 0) {
    parts.push(
      [
        'START HERE',
        ...digest.focus.map((l, i) => `  ${i + 1}. ${l.title}\n     ${l.rationale}`),
      ].join('\n'),
    )
  }

  if (digest.rollups.length > 0) {
    parts.push(
      [
        'ALSO IN THE QUEUE',
        ...digest.rollups.map((r) => `  ${r.count} ${r.label}\n     ${base}/${r.href}`),
      ].join('\n'),
    )
  }

  if (digest.groups.length > 0) {
    parts.push(
      [
        'SINCE LAST TIME',
        ...digest.groups.map((g) => {
          const { heading, detail } = changeSummary(g)
          return `  ${heading}\n     ${detail}`
        }),
      ].join('\n'),
    )
  }

  parts.push(`Everything else is on the dashboard: ${base}/#overview`)
  return parts.join('\n\n')
}

/** A numbered focus row. Hairlines between rows rather than five boxes. */
function focusRow(l: DigestLine, n: number, base: string, first: boolean): string {
  const divider = first ? '' : `border-top:1px solid ${C.line};`
  return `
  <tr><td style="padding:${first ? '0 0 14px 0' : '14px 0'};${divider}">
    <table ${TABLE} width="100%" style="border-collapse:collapse;">
      <tr>
        <td width="34" valign="top" style="width:34px;padding:1px 12px 0 0;">
          <table ${TABLE} style="border-collapse:collapse;">
            <tr><td width="22" height="22" align="center" valign="middle" bgcolor="${C.ink}"
                    style="width:22px;height:22px;background-color:${C.ink};border-radius:6px;${type(11, 700, 22, C.surface)}">${n}</td></tr>
          </table>
        </td>
        <td valign="top">
          <a href="${escapeHtml(base)}/${escapeHtml(l.href)}" style="${type(15, 600, 21, C.ink)}text-decoration:none;">${escapeHtml(l.title)}</a>
          <div style="${type(13, 400, 20, C.body)}padding:4px 0 0 0;">${escapeHtml(l.rationale)}</div>
        </td>
      </tr>
    </table>
  </td></tr>`
}

function rollupRow(r: DigestRollup, base: string, first: boolean): string {
  const divider = first ? '' : `border-top:1px solid ${C.line};`
  return `
  <tr>
    <td width="42" align="right" valign="top" style="width:42px;padding:${first ? '0' : '10px'} 12px 10px 0;${divider}${type(15, 700, 20, C.ink)}">${r.count}</td>
    <td valign="top" style="padding:${first ? '0' : '10px'} 0 10px 0;${divider}">
      <a href="${escapeHtml(base)}/${escapeHtml(r.href)}" style="${type(14, 400, 20, C.accent)}text-decoration:none;">${escapeHtml(r.label)}</a>
    </td>
  </tr>`
}

function nested(rows: string): string {
  return `<tr><td style="padding:0 0 8px 0;"><table ${TABLE} width="100%" style="border-collapse:collapse;">${rows}</table></td></tr>`
}

function bodyHtml(digest: Digest, base: string): string {
  const sections: string[] = []

  if (digest.focus.length > 0) {
    sections.push(
      sectionLabel('Start here') +
        nested(digest.focus.map((l, i) => focusRow(l, i + 1, base, i === 0)).join('')),
    )
  }

  if (digest.rollups.length > 0) {
    sections.push(
      sectionLabel('Also in the queue') +
        nested(digest.rollups.map((r, i) => rollupRow(r, base, i === 0)).join('')),
    )
  }

  if (digest.groups.length > 0) {
    sections.push(
      sectionLabel('Since last time') +
        nested(
          digest.groups
            .map((g) => {
              const { heading, detail } = changeSummary(g)
              return `<tr><td style="padding:0 0 10px 0;">
                <div style="${type(13, 600, 19, C.ink)}">${escapeHtml(heading)}</div>
                <div style="${type(13, 400, 19, C.body)}padding:2px 0 0 0;">${escapeHtml(detail)}</div>
              </td></tr>`
            })
            .join(''),
        ),
    )
  }

  return (
    paragraph('What is worth your time first, then what is behind it.', { muted: true, bottom: 24 }) +
    sections.join(rule()) +
    rule() +
    button('Open the dashboard', `${base}/#overview`)
  )
}

export function renderDigestEmail(
  digest: Digest,
  opts: { base: string; schedule: Schedule; identity: SenderIdentity },
): RenderedEmail {
  const { base, schedule, identity } = opts
  return renderEmail(
    {
      subject: subjectFor(digest),
      // Naming the top item makes the preview say something the subject does not.
      preheader: digest.focus[0]?.title ?? 'Your weekly queue',
      heading: subjectFor(digest),
      body: bodyHtml(digest, base),
      text: bodyText(digest, base),
    },
    {
      kind: 'notification',
      reason:
        `You received this because the weekly digest is turned on for your Sun Dogs Music Scout account. ` +
        `It is sent ${describeSchedule(schedule)} ${zoneName(schedule.timezone)}, and only when there is something to report.`,
      manageUrl: `${base}/#settings/reminders`,
      manageLabel: 'Turn off the digest or change its schedule in Settings',
    },
    identity,
  )
}
