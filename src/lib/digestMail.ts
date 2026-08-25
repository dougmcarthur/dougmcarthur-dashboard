/**
 * Turning a Digest into an email.
 *
 * Kept apart from shared/digest.ts on purpose: that module decides what is
 * worth saying and is pure; this one decides how it looks and is allowed to
 * know about HTML and URLs. Changing the wording of a heading should not risk
 * changing who gets reported.
 */

import type { Digest, DigestGroup } from '../../shared/digest'

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Subject names the one thing that earns the open, not a count of everything. */
export function subjectFor(digest: Digest): string {
  const actionable = digest.groups.find((g) => g.id === 'actionable')?.lines.length ?? 0
  const fresh = digest.groups.find((g) => g.id === 'new')?.lines.length ?? 0
  const total = digest.groups.reduce((n, g) => n + g.lines.length, 0)

  if (actionable > 0) return `${actionable} ready to act on`
  if (fresh > 0) return `${fresh} new ${fresh === 1 ? 'opportunity' : 'opportunities'}`
  return `${total} ${total === 1 ? 'update' : 'updates'}`
}

export function renderText(digest: Digest, base: string): string {
  const block = (g: DigestGroup) =>
    [
      g.heading.toUpperCase(),
      ...g.lines.map((l) => `  ${l.title}\n    ${l.rationale}`),
    ].join('\n')

  return [
    ...digest.groups.map(block),
    `Open the dashboard: ${base}/#overview`,
  ].join('\n\n')
}

export function renderHtml(digest: Digest, base: string): string {
  const group = (g: DigestGroup) => `
    <h2 style="font:600 12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
               text-transform:uppercase;letter-spacing:.06em;color:#6b7280;
               margin:28px 0 10px">${escape(g.heading)}</h2>
    ${g.lines
      .map(
        (l) => `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin-bottom:8px">
        <a href="${escape(base)}/${escape(l.href)}"
           style="font:600 15px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                  color:#111827;text-decoration:none">${escape(l.title)}</a>
        <p style="font:400 13px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                  color:#4b5563;margin:6px 0 0">${escape(l.rationale)}</p>
      </div>`,
      )
      .join('')}`

  // Inline styles and a table-free layout: every mail client strips <style>
  // blocks differently, and this has exactly one reader whose client is known
  // to render plain HTML fine.
  return `<div style="max-width:600px;margin:0 auto;padding:24px 16px;background:#ffffff">
    <p style="font:600 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
              color:#111827;margin:0 0 4px">Music HQ</p>
    <p style="font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
              color:#6b7280;margin:0">What moved since the last one.</p>
    ${digest.groups.map(group).join('')}
    <p style="margin:28px 0 0">
      <a href="${escape(base)}/#overview"
         style="font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                background:#111827;color:#ffffff;text-decoration:none;
                padding:10px 16px;border-radius:6px;display:inline-block">Open the dashboard</a>
    </p>
  </div>`
}
