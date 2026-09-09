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
 * On the markup: mail clients are not browsers. Outlook renders through Word,
 * which ignores `max-width` on a div, drops the `font` shorthand, and adds gaps
 * between table cells unless told not to. So the layout is tables, every CSS
 * property is longhand, every table carries `border-collapse`, and every
 * coloured surface repeats itself as a `bgcolor` attribute. It reads as
 * old-fashioned HTML because that is the format that survives the trip.
 */

import type { Digest, DigestGroup, DigestLine, DigestRollup } from '../../shared/digest'

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Names in the change section before it stops naming and starts counting. */
const NAME_LIMIT = 4

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

const INK = '#111827'
const BODY = '#4b5563'
const MUTED = '#9ca3af'
const RULE = '#eceff2'
const EDGE = '#e5e7eb'
const PAPER = '#ffffff'
const GROUND = '#f3f4f6'

/** Longhand type, because Outlook drops the `font` shorthand entirely. */
function type(size: number, weight: number, height: number, color: string): string {
  return (
    `font-family:${FONT};font-size:${size}px;font-weight:${weight};` +
    `line-height:${height}px;color:${color};`
  )
}

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

export function renderText(digest: Digest, base: string): string {
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

/**
 * The line Gmail shows beside the subject.
 *
 * Left alone it takes whatever text comes first, which was the standing
 * description of what the email is — the same words every week. Naming the top
 * item instead makes the preview say something the subject does not.
 */
function preheader(digest: Digest): string {
  const lead = digest.focus[0]?.title ?? 'Your weekly queue'
  // The padding stops the client pulling body copy in after the preheader.
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escape(lead)}</div>
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${'&zwnj;&nbsp;'.repeat(60)}</div>`
}

function sectionLabel(text: string): string {
  return `<tr><td style="padding:0 0 12px 0;${type(11, 700, 14, MUTED)}letter-spacing:0.08em;text-transform:uppercase;">${escape(text)}</td></tr>`
}

/** A numbered focus row. Hairlines between rows rather than five boxes. */
function focusRow(l: DigestLine, n: number, base: string, first: boolean): string {
  const rule = first ? '' : `border-top:1px solid ${RULE};`
  return `
  <tr><td style="padding:${first ? '0 0 16px 0' : '16px 0'};${rule}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td width="34" valign="top" style="width:34px;padding:1px 12px 0 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr><td width="22" height="22" align="center" valign="middle" bgcolor="${INK}"
                    style="width:22px;height:22px;background-color:${INK};border-radius:5px;${type(11, 700, 22, PAPER)}">${n}</td></tr>
          </table>
        </td>
        <td valign="top">
          <a href="${escape(base)}/${escape(l.href)}" style="${type(16, 600, 22, INK)}text-decoration:none;">${escape(l.title)}</a>
          <div style="${type(13, 400, 20, BODY)}padding:5px 0 0 0;">${escape(l.rationale)}</div>
        </td>
      </tr>
    </table>
  </td></tr>`
}

function rollupRow(r: DigestRollup, base: string, first: boolean): string {
  const rule = first ? '' : `border-top:1px solid ${RULE};`
  return `
  <tr>
    <td width="42" align="right" valign="top" style="width:42px;padding:${first ? '0' : '10px'} 12px 10px 0;${rule}${type(15, 700, 20, INK)}">${r.count}</td>
    <td valign="top" style="padding:${first ? '0' : '10px'} 0 10px 0;${rule}">
      <a href="${escape(base)}/${escape(r.href)}" style="${type(14, 400, 20, BODY)}text-decoration:none;">${escape(r.label)}</a>
    </td>
  </tr>`
}

function card(inner: string): string {
  return `
  <tr><td bgcolor="${PAPER}" style="background-color:${PAPER};border:1px solid ${EDGE};border-radius:10px;padding:24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      ${inner}
    </table>
  </td></tr>
  <tr><td height="16" style="height:16px;line-height:16px;font-size:16px;">&nbsp;</td></tr>`
}

export function renderHtml(digest: Digest, base: string): string {
  const cards: string[] = []

  if (digest.focus.length > 0) {
    cards.push(
      card(
        sectionLabel('Start here') +
          digest.focus.map((l, i) => focusRow(l, i + 1, base, i === 0)).join(''),
      ),
    )
  }

  if (digest.rollups.length > 0) {
    cards.push(
      card(
        sectionLabel('Also in the queue') +
          `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            ${digest.rollups.map((r, i) => rollupRow(r, base, i === 0)).join('')}
          </table></td></tr>`,
      ),
    )
  }

  if (digest.groups.length > 0) {
    cards.push(
      card(
        sectionLabel('Since last time') +
          digest.groups
            .map((g) => {
              const { heading, detail } = changeSummary(g)
              return `<tr><td style="padding:0 0 10px 0;">
                <div style="${type(13, 600, 19, INK)}">${escape(heading)}</div>
                <div style="${type(13, 400, 19, BODY)}padding:2px 0 0 0;">${escape(detail)}</div>
              </td></tr>`
            })
            .join(''),
      ),
    )
  }

  const button = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr><td align="center" bgcolor="${INK}" style="background-color:${INK};border-radius:6px;">
        <a href="${escape(base)}/#overview" style="display:inline-block;padding:12px 22px;${type(14, 600, 14, PAPER)}text-decoration:none;">Open the dashboard</a>
      </td></tr>
    </table>`

  // `color-scheme: light` asks the client not to auto-invert. Without it a dark
  // mode client repaints the greys and the hairlines vanish into the card.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Sun Dogs Music Scout</title>
</head>
<body style="margin:0;padding:0;background-color:${GROUND};">
${preheader(digest)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${GROUND}" style="border-collapse:collapse;background-color:${GROUND};">
  <tr><td align="center" style="padding:28px 12px;">
    <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:600px;border-collapse:collapse;">

      <tr><td style="padding:0 4px 18px 4px;">
        <div style="${type(11, 700, 14, MUTED)}letter-spacing:0.1em;text-transform:uppercase;">Sun Dogs Music Scout</div>
        <div style="${type(24, 700, 30, INK)}padding:6px 0 0 0;">${escape(subjectFor(digest))}</div>
        <div style="${type(14, 400, 20, BODY)}padding:4px 0 0 0;">The five worth your time, and what is behind them.</div>
      </td></tr>

      ${cards.join('')}

      <tr><td style="padding:4px 4px 0 4px;">${button}</td></tr>

      <tr><td style="padding:22px 4px 0 4px;${type(12, 400, 18, MUTED)}">
        Sent Monday mornings from your dashboard. Nothing is sent when the queue is clear.
      </td></tr>

    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body>
</html>`
}
