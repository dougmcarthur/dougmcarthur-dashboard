/**
 * Turning a Digest into an email.
 *
 * Kept apart from shared/digest.ts on purpose: that module decides what is
 * worth saying and is pure; this one decides how it looks and is allowed to
 * know about HTML and URLs. Changing the wording of a heading should not risk
 * changing who gets reported.
 *
 * The shape is deliberately top-heavy. Five items get a name, a sentence and a
 * number; everything else gets one line and a link. An email that lists sixty
 * items has not prioritised them, it has just moved the dashboard into your
 * inbox — and the dashboard is better at being the dashboard.
 */

import type { Digest, DigestGroup, DigestLine, DigestRollup } from '../../shared/digest'

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Names in the change section before it stops naming and starts counting. */
const NAME_LIMIT = 4

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

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

function focusCard(l: DigestLine, n: number, base: string): string {
  return `
    <tr><td style="padding:0 0 10px">
      <div style="border:1px solid #e5e7eb;border-left:3px solid #111827;border-radius:8px;padding:14px 16px">
        <span style="font:600 11px/1 ${FONT};color:#9ca3af">${n}</span>
        <a href="${escape(base)}/${escape(l.href)}"
           style="font:600 16px/1.35 ${FONT};color:#111827;text-decoration:none;
                  display:block;margin:4px 0 0">${escape(l.title)}</a>
        <p style="font:400 13px/1.55 ${FONT};color:#4b5563;margin:6px 0 0">${escape(l.rationale)}</p>
      </div>
    </td></tr>`
}

function rollupRow(r: DigestRollup, base: string): string {
  return `
    <tr>
      <td style="font:600 13px/1.7 ${FONT};color:#111827;padding:0 10px 0 0;
                 white-space:nowrap;vertical-align:top">${r.count}</td>
      <td style="font:400 13px/1.7 ${FONT};color:#4b5563;padding:0">
        <a href="${escape(base)}/${escape(r.href)}"
           style="color:#4b5563;text-decoration:none">${escape(r.label)}</a>
      </td>
    </tr>`
}

function heading(text: string): string {
  return `<p style="font:600 11px/1.4 ${FONT};text-transform:uppercase;letter-spacing:.08em;
                    color:#9ca3af;margin:0 0 10px">${escape(text)}</p>`
}

export function renderHtml(digest: Digest, base: string): string {
  const sections: string[] = []

  if (digest.focus.length > 0) {
    sections.push(`
      <div style="margin:0 0 28px">
        ${heading('Start here')}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${digest.focus.map((l, i) => focusCard(l, i + 1, base)).join('')}
        </table>
      </div>`)
  }

  if (digest.rollups.length > 0) {
    sections.push(`
      <div style="margin:0 0 28px">
        ${heading('Also in the queue')}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${digest.rollups.map((r) => rollupRow(r, base)).join('')}
        </table>
      </div>`)
  }

  if (digest.groups.length > 0) {
    sections.push(`
      <div style="margin:0 0 28px">
        ${heading('Since last time')}
        ${digest.groups
          .map((g) => {
            const { heading: h, detail } = changeSummary(g)
            return `<p style="font:400 13px/1.6 ${FONT};color:#4b5563;margin:0 0 6px">
              <span style="color:#111827;font-weight:600">${escape(h)}</span><br>${escape(detail)}</p>`
          })
          .join('')}
      </div>`)
  }

  // Inline styles and a table-based layout: every mail client strips <style>
  // blocks differently, and this has exactly one reader whose client is known
  // to render plain HTML fine.
  return `<div style="max-width:600px;margin:0 auto;padding:24px 16px;background:#ffffff">
    <p style="font:600 13px/1.4 ${FONT};color:#111827;margin:0 0 4px">Music HQ</p>
    <p style="font:400 13px/1.5 ${FONT};color:#6b7280;margin:0 0 28px">
      The five worth your time, and what is behind them.</p>
    ${sections.join('')}
    <p style="margin:0">
      <a href="${escape(base)}/#overview"
         style="font:600 13px/1 ${FONT};background:#111827;color:#ffffff;text-decoration:none;
                padding:10px 16px;border-radius:6px;display:inline-block">Open the dashboard</a>
    </p>
  </div>`
}
