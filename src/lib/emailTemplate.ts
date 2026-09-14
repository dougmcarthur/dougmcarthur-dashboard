/**
 * The one shell every outgoing email is poured into.
 *
 * Two emails existed before this, each with its own idea of a header and no
 * footer at all — the setup code was three paragraphs, the digest a hand-built
 * page. A third was going to be a third idea. So the parts that are the same
 * for every message live here: who it is from, what it looks like, and the
 * footer that says why it arrived and what you can do about that.
 *
 * **The footer is not decoration, it is a statement about the message.** Every
 * email is one of two kinds, and the type makes the author pick:
 *
 *  - `transactional` — sent because of something that just happened to the
 *    account (a setup code was requested). There is nothing to unsubscribe
 *    from, and the footer says so in words rather than leaving a reader to
 *    look for a link that is not there.
 *  - `notification` — a recurring message the account holder switched on (the
 *    weekly digest). It links to the switch.
 *
 * Neither is marketing. Under CAN-SPAM both are transactional or relationship
 * messages, which leaves the obligation that headers are not false or
 * misleading; under CASL neither is a commercial electronic message, since
 * neither encourages anybody to buy anything. The footer carries the
 * identification anyway — the sender's name, a mailing address and a web
 * address — because it is what the rules ask of the messages they do cover,
 * because it is cheap, and because the day a message here does promote
 * something, the shell should already be right. That day it needs an
 * unsubscribe that works without signing in, which a Settings link is not.
 *
 * **The look is the app's light theme.** The app is dark by default, and an
 * email cannot be: clients re-colour dark messages unpredictably — Gmail's app
 * inverts some surfaces and not others — so the body takes the light tokens
 * from frontend/src/index.css and asks clients not to invert. The header band
 * keeps the dark surface, which is the one place the app's default shows.
 *
 * **On the markup:** mail clients are not browsers. Outlook renders through
 * Word, which ignores `max-width` on a div, drops the `font` shorthand and adds
 * gaps between table cells unless told not to. So layout is tables, CSS is
 * longhand, every table states its border model — `collapse`, or `separate` with
 * zero spacing where a rounded corner needs it, since browsers ignore
 * `border-radius` on a collapsed cell — and every coloured cell repeats
 * its colour as a `bgcolor` attribute. test/emailTemplate.test.ts holds every
 * email to those rules, not just the one that was written first.
 */

/** The product's written name. Scout never stands alone in anything we send. */
export const PRODUCT_NAME = 'Sun Dogs Music Scout'
export const HOUSE_MARK = 'Sun Dogs Music'

export function subjectLine(subject: string): string {
  return `${PRODUCT_NAME} — ${subject}`
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/* ----------------------------------------------------------------------- */
/* Tokens — frontend/src/index.css, [data-theme='light'], plus the dark     */
/* surface for the header band.                                            */
/* ----------------------------------------------------------------------- */

export const EMAIL_COLOURS = {
  canvas: '#f3f4f1',
  surface: '#ffffff',
  raised: '#f7f8f5',
  line: '#dfe2db',
  lineStrong: '#c2c8bd',
  ink: '#141712',
  body: '#454a41',
  muted: '#5f6659',
  accent: '#35703d',
  accentFg: '#ffffff',
  clayBg: '#fdf3f0',
  clayLine: '#ecc9bc',
  clayFg: '#a4432f',
  // The header band is the app's dark surface and its text.
  band: '#141613',
  bandInk: '#edefea',
  bandMuted: '#8a9083',
} as const

const C = EMAIL_COLOURS

const FONT = "'Public Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Courier New',monospace"

/** Longhand type, because Outlook drops the `font` shorthand entirely. */
export function type(size: number, weight: number, height: number, color: string, family = FONT): string {
  return (
    `font-family:${family};font-size:${size}px;font-weight:${weight};` +
    `line-height:${height}px;color:${color};`
  )
}

export const monoType = (size: number, weight: number, height: number, color: string) =>
  type(size, weight, height, color, MONO)

/* ----------------------------------------------------------------------- */
/* Building blocks for a message body. Each returns one or more `<tr>`s     */
/* for the content panel's table.                                          */
/* ----------------------------------------------------------------------- */

const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"'

export function paragraph(html: string, opts: { muted?: boolean; bottom?: number } = {}): string {
  const colour = opts.muted ? C.muted : C.body
  const size = opts.muted ? 13 : 15
  const height = opts.muted ? 20 : 23
  return `<tr><td style="padding:0 0 ${opts.bottom ?? 16}px 0;${type(size, 400, height, colour)}">${html}</td></tr>`
}

export function sectionLabel(text: string): string {
  return `<tr><td style="padding:0 0 12px 0;${type(11, 700, 14, C.muted)}letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(text)}</td></tr>`
}

/** A hairline between sections, the app's `border-line`. */
export function rule(): string {
  return `<tr><td style="padding:8px 0 24px 0;"><table ${TABLE} width="100%" style="border-collapse:collapse;"><tr><td height="1" bgcolor="${C.line}" style="height:1px;line-height:1px;font-size:1px;background-color:${C.line};">&nbsp;</td></tr></table></td></tr>`
}

/** A raised, bordered box — the app's `bg-raised border-line`. */
export function panel(inner: string, opts: { tone?: 'neutral' | 'clay'; align?: 'left' | 'center' } = {}): string {
  const bg = opts.tone === 'clay' ? C.clayBg : C.raised
  const edge = opts.tone === 'clay' ? C.clayLine : C.line
  return `<tr><td style="padding:0 0 20px 0;">
    <table ${TABLE} width="100%" style="border-collapse:separate;border-spacing:0;">
      <tr><td align="${opts.align ?? 'left'}" bgcolor="${bg}" style="background-color:${bg};border:1px solid ${edge};border-radius:10px;padding:18px 20px;">${inner}</td></tr>
    </table>
  </td></tr>`
}

/** The app's primary button: green, white label, 8px radius. */
export function button(label: string, href: string): string {
  return `<tr><td style="padding:4px 0 8px 0;">
    <table ${TABLE} style="border-collapse:separate;border-spacing:0;">
      <tr><td align="center" bgcolor="${C.accent}" style="background-color:${C.accent};border-radius:8px;">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;${type(14, 600, 16, C.accentFg)}text-decoration:none;">${escapeHtml(label)}</a>
      </td></tr>
    </table>
  </td></tr>`
}

/* ----------------------------------------------------------------------- */
/* The shell.                                                              */
/* ----------------------------------------------------------------------- */

/** Who a message is from, on paper. Deployment configuration, never a row. */
export interface SenderIdentity {
  /** The app's public origin, for the footer's web address. */
  siteUrl: string
  /**
   * The mailing address the footer prints. Null prints no address line rather
   * than a guessed one; test/emailTemplate.test.ts fails if the deployment
   * leaves it unset.
   */
  postalAddress: string | null
}

export type EmailFooter =
  | {
      kind: 'transactional'
      /** Why this one arrived, as a sentence: "…because a code was requested." */
      reason: string
    }
  | {
      kind: 'notification'
      reason: string
      /** Where the recipient turns it off or changes it. */
      manageUrl: string
      manageLabel: string
    }

export interface EmailContent {
  /** Without the product prefix — `subjectLine` adds it. */
  subject: string
  /**
   * The line an inbox shows beside the subject, and what a phone notification
   * previews. Never a secret: it is readable on a locked screen.
   */
  preheader: string
  heading: string
  /** Table rows from the building blocks above. */
  body: string
  /** The plain-text body, footer excluded — `renderEmail` appends it. */
  text: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/** The sentence a transactional footer always carries. */
export const NO_UNSUBSCRIBE =
  'This is a transactional email about your account, not marketing, so it has no unsubscribe link.'

function footerLines(footer: EmailFooter): { html: string[]; text: string[] } {
  if (footer.kind === 'transactional') {
    return {
      html: [escapeHtml(footer.reason), escapeHtml(NO_UNSUBSCRIBE)],
      text: [footer.reason, NO_UNSUBSCRIBE],
    }
  }
  const notMarketing = 'It is a service notification about your own account, not marketing.'
  return {
    html: [
      `${escapeHtml(footer.reason)} ${escapeHtml(notMarketing)}`,
      `<a href="${escapeHtml(footer.manageUrl)}" style="color:${C.accent};text-decoration:underline;">${escapeHtml(footer.manageLabel)}</a>`,
    ],
    text: [`${footer.reason} ${notMarketing}`, `${footer.manageLabel}: ${footer.manageUrl}`],
  }
}

function identityLines(identity: SenderIdentity): { html: string; text: string[] } {
  const host = identity.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const parts = [HOUSE_MARK, identity.postalAddress].filter((p): p is string => Boolean(p))
  return {
    html:
      `${parts.map(escapeHtml).join(' · ')}<br>` +
      `<a href="${escapeHtml(identity.siteUrl)}" style="color:${C.muted};text-decoration:underline;">${escapeHtml(host)}</a>`,
    text: [parts.join(', '), identity.siteUrl],
  }
}

export function renderEmail(content: EmailContent, footer: EmailFooter, identity: SenderIdentity): RenderedEmail {
  const subject = subjectLine(content.subject)
  const why = footerLines(footer)
  const who = identityLines(identity)

  const footerHtml = [...why.html, who.html]
    .map((line, i) => `<tr><td style="padding:${i === 0 ? 0 : 10}px 0 0 0;${type(12, 400, 18, C.muted)}">${line}</td></tr>`)
    .join('')

  // The padding after the preheader stops a client pulling body copy in after
  // it — the code in a setup email is exactly the body copy that must not.
  const preheader = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(content.preheader)}</div>
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${'&zwnj;&nbsp;'.repeat(90)}</div>`

  // `color-scheme: light` asks the client not to auto-invert; without it a dark
  // mode client repaints the greys and the hairlines vanish into the panel.
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${C.canvas};">
${preheader}
<table ${TABLE} width="100%" bgcolor="${C.canvas}" style="border-collapse:collapse;background-color:${C.canvas};">
  <tr><td align="center" style="padding:28px 12px;">
    <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <table ${TABLE} width="100%" align="center" style="width:100%;max-width:600px;border-collapse:separate;border-spacing:0;">

      <tr><td bgcolor="${C.band}" style="background-color:${C.band};border-radius:12px 12px 0 0;padding:20px 28px;">
        <div style="${type(11, 600, 14, C.bandMuted)}letter-spacing:0.14em;text-transform:uppercase;">${HOUSE_MARK}</div>
        <div style="${type(20, 700, 26, C.bandInk)}letter-spacing:-0.01em;padding:2px 0 0 0;">Scout</div>
      </td></tr>

      <tr><td bgcolor="${C.surface}" style="background-color:${C.surface};border-left:1px solid ${C.line};border-right:1px solid ${C.line};border-bottom:1px solid ${C.line};border-radius:0 0 12px 12px;padding:28px 28px 16px 28px;">
        <table ${TABLE} width="100%" style="border-collapse:collapse;">
          <tr><td style="padding:0 0 12px 0;"><h1 style="margin:0;${type(22, 700, 28, C.ink)}letter-spacing:-0.01em;">${escapeHtml(content.heading)}</h1></td></tr>
          ${content.body}
        </table>
      </td></tr>

      <tr><td style="padding:20px 28px 0 28px;">
        <table ${TABLE} width="100%" style="border-collapse:collapse;">
          ${footerHtml}
        </table>
      </td></tr>

    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body>
</html>`

  const text = [
    content.text.trimEnd(),
    '—',
    [PRODUCT_NAME, ...why.text, ...who.text].join('\n'),
  ].join('\n\n') + '\n'

  return { subject, html, text }
}
