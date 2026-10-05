// Reads an application form page and extracts its individual fields.
//
// Deliberately dependency-free and regex-based rather than HTMLRewriter: this
// runs identically in the Worker and in `vitest` (node), so the parsing rules
// are directly testable. Three sources are supported:
//   - ordinary server-rendered HTML forms (<input>/<textarea>/<select>)
//   - Google Forms, whose fields live in the FB_PUBLIC_LOAD_DATA_ blob
//   - FestivalPro forms, whose questions are rows of <div>s rather than labels
//
// Anything behind a login, or rendered entirely by JavaScript, is reported as
// blocked instead of guessed at.

export interface ParsedField {
  fieldKey: string
  label: string
  fieldType: string // text|textarea|email|url|number|date|select|radio|checkbox|file
  options?: string[]
  required: boolean
  maxLength?: number
  helpText?: string
  position: number
}

/**
 * Why a read produced no fields. The three want different things done next:
 * a login wall is a fact about the opportunity, a JavaScript form is filled in
 * by hand, and a page with no form on it may simply be the announcement that
 * links to one.
 */
export type BlockedKind = 'login' | 'javascript' | 'no-fields'

export interface ParsedForm {
  title: string | null
  source: 'html' | 'google-forms' | 'festivalpro'
  loginRequired: boolean
  /** Set when fields could not be read — the reason is shown in the dashboard. */
  blockedReason: string | null
  blockedKind?: BlockedKind
  fields: ParsedField[]
}

// Portals that always sit behind an account. Fetching them returns a login
// page, so there's no point parsing what comes back.
const LOGIN_GATED_HOSTS = [
  'submittable.com',
  'manager.submittable.com',
  'sonicbids.com',
  'submithub.com',
  'gigmit.com',
  'eventotron.com',
  'festivalnet.com',
  'opencall.com',
  'artsvest.com',
  'sxsw.com',
]

// Forms whose markup arrives empty and is drawn by JavaScript.
const JS_RENDERED_HOSTS = ['typeform.com', 'airtable.com', 'tally.so', 'fillout.com']

const LOGIN_PHRASES = [
  /sign in to (apply|continue|submit|your account)/i,
  /log ?in to (apply|continue|submit|your account)/i,
  /you must be (logged in|signed in)/i,
  /create an account to (apply|submit)/i,
  /please (log ?in|sign in) to continue/i,
]

const SKIP_NAME = /csrf|nonce|token|captcha|recaptcha|honeypot|^hp_|utm_|timestamp|^_/i
const SKIP_TYPE = new Set(['hidden', 'submit', 'button', 'image', 'reset', 'search'])

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function matchesHost(host: string, list: string[]): boolean {
  return list.some((h) => host === h || host.endsWith(`.${h}`))
}

function stripScripts(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const m = tag.match(re)
  if (!m) return undefined
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? '').trim()
}

function hasAttr(tag: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`, 'i').test(tag)
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'field'
  )
}

function humanize(value: string): string {
  return value
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
}

/** Normalises an <input type> into the field types the dashboard renders. */
function normaliseType(rawType: string | undefined, tag: string): string {
  const t = (rawType ?? 'text').toLowerCase()
  if (t === 'email' || t === 'url' || t === 'number' || t === 'date' || t === 'tel') {
    return t === 'tel' ? 'text' : t
  }
  if (t === 'file') return 'file'
  if (t === 'radio') return 'radio'
  if (t === 'checkbox') return 'checkbox'
  if (hasAttr(tag, 'multiple')) return 'text'
  return 'text'
}

function detectLoginRequired(html: string, url: string): boolean {
  if (matchesHost(hostOf(url), LOGIN_GATED_HOSTS)) return true
  const body = stripScripts(html)
  if (/<input[^>]*\btype\s*=\s*["']?password/i.test(body)) return true
  const text = textOf(body).slice(0, 20_000)
  return LOGIN_PHRASES.some((re) => re.test(text))
}

function pageTitle(html: string): string | null {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1) {
    const t = textOf(h1[1])
    if (t) return t.slice(0, 200)
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  return title ? textOf(title[1]).slice(0, 200) || null : null
}

// ── Google Forms ──────────────────────────────────────────────────────────────

// Item type codes used by Google Forms' public payload.
const GF_TYPES: Record<number, string> = {
  0: 'text',
  1: 'textarea',
  2: 'radio',
  3: 'select',
  4: 'checkbox',
  5: 'select', // linear scale
  9: 'date',
  10: 'text', // time
  13: 'file',
}

export function parseGoogleForm(html: string): ParsedForm | null {
  const m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\])\s*;/)
  if (!m) return null

  let data: unknown
  try {
    data = JSON.parse(m[1])
  } catch {
    return null
  }

  const root = data as any[]
  const form = root?.[1]
  const items = form?.[1]
  if (!Array.isArray(items)) return null

  const fields: ParsedField[] = []
  const used = new Set<string>()

  for (const item of items) {
    if (!Array.isArray(item)) continue
    const label = typeof item[1] === 'string' ? item[1].trim() : ''
    const description = typeof item[2] === 'string' ? item[2].trim() : ''
    const typeCode = typeof item[3] === 'number' ? item[3] : -1
    const entries = item[4]

    // 6 = title block, 8 = page break — layout, not questions.
    if (!Array.isArray(entries) || !GF_TYPES[typeCode] || !label) continue

    for (const entry of entries) {
      if (!Array.isArray(entry)) continue
      const entryId = entry[0]
      const rawOptions = entry[1]
      const required = entry[2] === 1 || entry[2] === true

      const options = Array.isArray(rawOptions)
        ? rawOptions
            .map((o: any) => (Array.isArray(o) && typeof o[0] === 'string' ? o[0] : null))
            .filter((o: string | null): o is string => !!o && o.length > 0)
        : []

      let key = entryId ? `entry.${entryId}` : slug(label)
      while (used.has(key)) key = `${key}_${fields.length}`
      used.add(key)

      fields.push({
        fieldKey: key,
        label,
        fieldType: GF_TYPES[typeCode],
        options: options.length ? options : undefined,
        required,
        helpText: description || undefined,
        position: fields.length,
      })
    }
  }

  if (fields.length === 0) return null

  return {
    title: typeof form?.[8] === 'string' && form[8] ? form[8] : pageTitle(html),
    source: 'google-forms',
    loginRequired: false,
    blockedReason: null,
    fields,
  }
}

// ── FestivalPro forms ─────────────────────────────────────────────────────────
//
// FestivalPro hosts the artist-application form for a good many festivals, on
// the festival's own subdomain or a custom domain, so it is recognised by its
// markup rather than its host. Every question is one `div.ibFormOption
// .ibFieldID<n>` row: the question is the text of a `div.attributeName`, and
// nothing links it to its input — no <label for> reaches it. That is why the
// generic reader, finding no label, fell back to the input's `name` and filed
// a form whose questions were called "765", "3013" and "2933".
//
// The name is the field's number, and it stays the key: a re-read then
// refreshes the rows already stored under those keys instead of adding a
// second set beside them.

/**
 * Fields the page's own script hides until a switch is on, as dependent id →
 * trigger id. The markup says nothing about it — every row is present and
 * `required` — so the only record is the jQuery that hides them:
 *
 *   if (!($('input[name="1357"]').is(':checked'))){ $('.ibFieldID1359').hide(); }
 */
function festivalProConditionals(html: string): Map<string, string> {
  const out = new Map<string, string>()
  const re =
    /!\s*\(\s*\$\(\s*["']input\[name=["']?(\d+)["']?\]["']\s*\)\.is\(\s*["']:checked["']\s*\)\s*\)\s*\)\s*\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    for (const hidden of m[2].matchAll(/\.ibFieldID(\d+)["']\s*\)\.hide\(\)/g)) out.set(hidden[1], m[1])
  }
  return out
}

export function parseFestivalProForm(html: string): ParsedForm | null {
  const conditionals = festivalProConditionals(html)
  const body = stripScripts(html).replace(/<!--[\s\S]*?-->/g, ' ')

  const heads: { id: string; index: number }[] = []
  const rowRe = /<div\b[^>]*\bclass\s*=\s*(["'])([^"']*\bibFormOption\b[^"']*)\1[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(body))) {
    const id = /\bibFieldID(\d+)\b/.exec(m[2])?.[1]
    if (id) heads.push({ id, index: m.index })
  }
  if (heads.length === 0) return null

  const formEnd = body.search(/<\/form\b/i)
  const stop = formEnd > heads[heads.length - 1].index ? formEnd : body.length
  const chunkOf = (i: number) => body.slice(heads[i].index, i + 1 < heads.length ? heads[i + 1].index : stop)

  // A hint is usually inside its row, but "Select all that apply" is a div of
  // its own, beside the row rather than in it, which says whose it is in its
  // class. Both are read from the page as a whole so neither goes to the row
  // that merely happens to be next to it.
  const hints = new Map<string, string[]>()
  const descRe = /<div\b[^>]*\bclass\s*=\s*(["'])([^"']*\bdescription\b[^"']*)\1[^>]*>([\s\S]*?)<\/div>/gi
  while ((m = descRe.exec(body))) {
    const at = m.index
    const inside = heads.filter((h) => h.index <= at && at < stop)
    const id = /\bibFieldID(\d+)\b/.exec(m[2])?.[1] ?? inside[inside.length - 1]?.id
    const text = textOf(m[3]).replace(/^\((.*)\)$/, '$1')
    if (id && text) hints.set(id, [...(hints.get(id) ?? []), text])
  }

  const fields: ParsedField[] = []
  const used = new Set<string>()
  const byId = new Map<string, ParsedField>()

  for (let i = 0; i < heads.length; i++) {
    const { id } = heads[i]
    const chunk = chunkOf(i)

    const controls = [...chunk.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)]
      .map((c) => ({
        tagName: c[1].toLowerCase(),
        tag: c[0],
        index: c.index ?? 0,
        type: (attr(c[0], 'type') ?? 'text').toLowerCase(),
        name: attr(c[0], 'name'),
      }))
      .filter((c) => c.name && !(c.tagName === 'input' && SKIP_TYPE.has(c.type)))
    const first = controls[0]
    if (!first?.name) continue // a heading or a paragraph, not a question

    const labelBlock = chunk.match(
      /<div\b[^>]*\bclass\s*=\s*(["'])([^"']*\battributeName\b[^"']*)\1[^>]*>([\s\S]*?)<\/div>/i,
    )
    const label =
      (labelBlock && textOf(labelBlock[3])) ||
      attr(first.tag, 'aria-label') ||
      attr(first.tag, 'placeholder') ||
      `Question ${fields.length + 1}`
    const required = !!labelBlock && /\brequired\b/i.test(labelBlock[2])

    let fieldType: string
    let options: string[] | undefined
    let maxLength: number | undefined

    if (first.tagName === 'textarea') {
      fieldType = 'textarea'
    } else if (first.tagName === 'select') {
      // Picking several is a checkbox group that happens to be drawn as a list.
      fieldType = hasAttr(first.tag, 'multiple') ? 'checkbox' : 'select'
      options = selectOptions(chunk, first.index)
    } else if (first.type === 'checkbox' && /\bswitch\s*=/i.test(first.tag)) {
      // A switch is a yes/no question, and the page says what its two ends are.
      fieldType = 'radio'
      options = [
        chunk.match(/data-on-label\s*=\s*["']([^"']*)["']/i)?.[1] || 'Yes',
        chunk.match(/data-off-label\s*=\s*["']([^"']*)["']/i)?.[1] || 'No',
      ]
    } else if (first.type === 'checkbox' || first.type === 'radio') {
      fieldType = first.type
      options = [
        ...new Set(
          controls
            .filter((c) => c.name === first.name && c.type === first.type)
            .map((c) => attr(c.tag, 'value'))
            .filter((v): v is string => !!v),
        ),
      ]
    } else {
      fieldType = normaliseType(first.type, first.tag)
      const limit = parseInt(attr(first.tag, 'maxlength') ?? '', 10)
      if (Number.isFinite(limit)) maxLength = limit
    }

    const notes = [...(hints.get(id) ?? [])]
    const size = chunk.match(/<span\b[^>]*\bibmaxSize\b[^>]*>([\s\S]*?)<\/span>/i)
    if (size) {
      const text = textOf(size[1])
      const limitText = /max size\s*([\d.]+\s*[kmg]b)/i.exec(text)
      notes.push(limitText ? `Maximum file size ${limitText[1].replace(/\s+/g, '')}` : text.replace(/^\(|\)$/g, ''))
    }

    let key = first.name
    while (used.has(key)) key = `${key}_${fields.length}`
    used.add(key)

    const field: ParsedField = {
      fieldKey: key,
      label,
      fieldType,
      options: options && options.length ? options : undefined,
      required,
      maxLength,
      helpText: notes.length ? notes.join(' · ') : undefined,
      position: fields.length,
    }
    fields.push(field)
    byId.set(id, field)
  }

  if (fields.length === 0) return null

  // A follow-up the form only shows after a switch is on is not owed by
  // somebody who left it off, so it is not required — a required one would
  // keep the application from ever reading as ready. The fact is kept as a
  // note rather than dropped.
  for (const [dependent, trigger] of conditionals) {
    const field = byId.get(dependent)
    if (!field) continue
    const asked = byId.get(trigger)
    field.required = false
    field.helpText = [
      field.helpText,
      asked ? `Only asked if “${asked.label}” is switched on` : 'Only asked if an earlier switch is on',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return { title: pageTitle(html), source: 'festivalpro', loginRequired: false, blockedReason: null, fields }
}

// ── Plain HTML forms ──────────────────────────────────────────────────────────

function labelMap(html: string): Map<string, string> {
  const map = new Map<string, string>()
  const re = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const forId = attr(`<label ${m[1]}>`, 'for')
    const text = textOf(m[2])
    if (forId && text) map.set(forId, text)
  }
  return map
}

function selectOptions(html: string, fromIndex: number): string[] {
  // Case-insensitive: some form builders write their tags in capitals.
  const length = html.slice(fromIndex).search(/<\/select>/i)
  if (length === -1) return []
  const block = html.slice(fromIndex, fromIndex + length)
  const out: string[] = []
  const re = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) {
    // An option whose value is empty is the prompt ("- Not Selected -"), which
    // is what the box shows before you choose, not something you can choose.
    if (attr(`<option ${m[1]}>`, 'value') === '') continue
    const label = textOf(m[2])
    if (label) out.push(label)
  }
  return out
}

// Forms that sit on nearly every festival site and are never the application: the
// footer newsletter box and the site search. Matched on the <form> tag itself
// (its action, id, name and class), and kept to words that are unambiguous —
// "signup" is not here, because "artist sign-up" is what some festivals call
// the real thing.
const NOT_AN_APPLICATION =
  /newsletter|subscribe|mailing[-_ ]?list|list-manage|mailchimp|constantcontact|campaign-?monitor|convertkit|mailerlite|klaviyo|substack|search/i

function withoutSignupForms(html: string): string {
  return html.replace(/<form\b([^>]*)>[\s\S]*?<\/form>/gi, (block, attrs: string) =>
    NOT_AN_APPLICATION.test(attrs) ? ' ' : block,
  )
}

export function parseHtmlForm(html: string, url: string): ParsedForm {
  const loginRequired = detectLoginRequired(html, url)
  const title = pageTitle(html)
  const host = hostOf(url)

  if (loginRequired) {
    return {
      title,
      source: 'html',
      loginRequired: true,
      blockedReason: 'The application form is behind a login, so it can’t be read automatically.',
      blockedKind: 'login',
      fields: [],
    }
  }

  if (matchesHost(host, JS_RENDERED_HOSTS)) {
    return {
      title,
      source: 'html',
      loginRequired: false,
      blockedReason: `${host} renders its form with JavaScript — the fields aren’t in the page source.`,
      blockedKind: 'javascript',
      fields: [],
    }
  }

  const body = withoutSignupForms(stripScripts(html))
  const labels = labelMap(body)
  const fields: ParsedField[] = []
  const usedKeys = new Set<string>()
  const groups = new Map<string, ParsedField>() // radio/checkbox groups by name

  const tagRe = /<(input|textarea|select)\b([^>]*)>/gi
  let m: RegExpExecArray | null

  while ((m = tagRe.exec(body))) {
    const tagName = m[1].toLowerCase()
    const tag = m[0]
    const rawType = attr(tag, 'type')
    const name = attr(tag, 'name')
    const id = attr(tag, 'id')

    if (tagName === 'input') {
      const t = (rawType ?? 'text').toLowerCase()
      if (SKIP_TYPE.has(t) || t === 'password') continue
    }
    if (name && SKIP_NAME.test(name)) continue
    if (!name && !id) continue

    const label =
      (id && labels.get(id)) ||
      attr(tag, 'aria-label') ||
      attr(tag, 'placeholder') ||
      humanize(name ?? id ?? '')

    const required = hasAttr(tag, 'required') || attr(tag, 'aria-required') === 'true'
    const maxLengthRaw = attr(tag, 'maxlength')
    const maxLength = maxLengthRaw ? parseInt(maxLengthRaw, 10) : undefined

    let fieldType: string
    let options: string[] | undefined

    if (tagName === 'textarea') {
      fieldType = 'textarea'
    } else if (tagName === 'select') {
      fieldType = 'select'
      options = selectOptions(body, m.index)
    } else {
      fieldType = normaliseType(rawType, tag)
    }

    // Radios and checkboxes sharing a name are one question with choices.
    if ((fieldType === 'radio' || fieldType === 'checkbox') && name) {
      const existing = groups.get(name)
      const choice = attr(tag, 'value') || label
      if (existing) {
        if (choice && !existing.options!.includes(choice)) existing.options!.push(choice)
        existing.required = existing.required || required
        continue
      }
      const grouped: ParsedField = {
        fieldKey: name,
        label: humanize(name),
        fieldType,
        options: choice ? [choice] : [],
        required,
        position: fields.length,
      }
      groups.set(name, grouped)
      usedKeys.add(name)
      fields.push(grouped)
      continue
    }

    let key = name || id || slug(label)
    while (usedKeys.has(key)) key = `${key}_${fields.length}`
    usedKeys.add(key)

    fields.push({
      fieldKey: key,
      label: label || humanize(key),
      fieldType,
      options: options && options.length ? options : undefined,
      required,
      maxLength: Number.isFinite(maxLength) ? maxLength : undefined,
      position: fields.length,
    })
  }

  // One email box and nothing else is a signup, whatever its markup calls
  // itself. Left as a form it reads as ready, with the artist's address staged
  // against it, which is how a festival's footer newsletter box became the
  // whole application.
  if (fields.length === 1 && fields[0].fieldType === 'email') {
    return {
      title,
      source: 'html',
      loginRequired: false,
      blockedReason:
        'The only thing on the page to fill in is an email box, which is a signup rather than an application.',
      blockedKind: 'no-fields',
      fields: [],
    }
  }

  if (fields.length === 0) {
    return {
      title,
      source: 'html',
      loginRequired: false,
      blockedReason:
        'No form fields were found on the page — the application may open later, be a PDF, or be submitted by email.',
      blockedKind: 'no-fields',
      fields: [],
    }
  }

  return { title, source: 'html', loginRequired: false, blockedReason: null, fields }
}

export function parseApplicationForm(html: string, url: string): ParsedForm {
  if (!detectLoginRequired(html, url)) {
    const google = parseGoogleForm(html)
    if (google) return google
    const festivalPro = parseFestivalProForm(html)
    if (festivalPro) return festivalPro
  }
  return parseHtmlForm(html, url)
}

// ── Finding the form from the page that announces it ──────────────────────────
//
// The address an artist or an agent has is usually the festival's artist-info
// page, and the form is one button away — often on another host entirely
// (canmorefolkfestival.com → canmorefolkfest.festivalpro.com). Such a page has
// no fields, so the reader used to report "no form fields found" about a page
// that links to the very form it was asked for.

export interface FormLink {
  url: string
  /** What the link says, which is what the artist would have clicked. */
  text: string
  score: number
}

// Hosts whose whole job is hosting forms. A link to one of these is a form
// whatever it says, so it outranks any wording.
const FORM_PLATFORMS: { host: string; path?: RegExp }[] = [
  { host: 'festivalpro.com', path: /^\/form\// },
  { host: 'docs.google.com', path: /^\/forms\// },
  { host: 'forms.gle' },
  { host: 'jotform.com' },
  { host: 'wufoo.com' },
  { host: 'formstack.com' },
  { host: 'cognitoforms.com' },
  { host: 'paperform.co' },
  { host: 'typeform.com', path: /^\/to\// },
  { host: 'tally.so', path: /^\/r\// },
  { host: 'airtable.com', path: /^\/(shr|app)/ },
  { host: 'submittable.com', path: /^\/submit/ },
]

const APPLY_WORDS = /\b(apply|applications?|submit|submissions?|audition)\b/i
const ARTIST_WORDS = /\b(artists?|bands?|performers?|musicians?|performances?)\b/i
// The same page often offers a form for every way of taking part, and the one
// for vendors is not the one for acts.
const OTHER_ROLES =
  /\b(vendors?|volunteers?|sponsors?|sponsorships?|donors?|donate|jobs?|employment|staff|media|press|exhibitors?|booths?|workshops?|food|craft|artisans?|market)\b/i

/** Below this a link is not obviously an application at all. */
const FOLLOW_MIN = 4
/** A runner-up closer than this means the page offers a choice we cannot make. */
const FOLLOW_MARGIN = 4

export function findApplicationLinks(html: string, pageUrl: string): FormLink[] {
  let page: URL
  try {
    page = new URL(pageUrl)
  } catch {
    return []
  }
  const here = `${page.origin}${page.pathname}${page.search}`

  const best = new Map<string, FormLink>()
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  const body = stripScripts(html)
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const href = attr(`<a ${m[1]}>`, 'href')
    if (!href) continue

    let target: URL
    try {
      target = new URL(href, page)
    } catch {
      continue
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') continue
    const key = `${target.origin}${target.pathname}${target.search}`
    if (key === here) continue

    const text = textOf(m[2]) || attr(`<a ${m[1]}>`, 'aria-label') || attr(`<a ${m[1]}>`, 'title') || ''
    const host = target.hostname.toLowerCase()
    const platform = FORM_PLATFORMS.some(
      (p) => matchesHost(host, [p.host]) && (!p.path || p.path.test(target.pathname)),
    )

    // Path included in the wording tests: /get-involved/vendors says what a
    // button labelled only "Apply" would not.
    let path = target.pathname
    try {
      path = decodeURIComponent(path)
    } catch {
      // A stray % in somebody's markup: the raw path reads well enough.
    }
    const said = `${text} ${path}`.replace(/[-_/]+/g, ' ')
    const score =
      (platform ? 10 : 0) +
      (APPLY_WORDS.test(text) ? 4 : 0) +
      (ARTIST_WORDS.test(said) ? 2 : 0) -
      (OTHER_ROLES.test(said) ? 6 : 0)

    const prior = best.get(key)
    if (!prior || score > prior.score) best.set(key, { url: target.toString(), text, score })
  }

  return [...best.values()].sort((a, b) => b.score - a.score)
}

/**
 * The one link worth following, or none. `candidates` is what to name to the
 * artist when there was a choice: two apply buttons that read alike is a
 * question for them, and guessing one stages answers against the wrong form.
 */
export function chooseFormLink(links: FormLink[]): { link: FormLink | null; candidates: FormLink[] } {
  const eligible = links.filter((l) => l.score >= FOLLOW_MIN)
  if (eligible.length === 0) return { link: null, candidates: [] }
  if (eligible.length > 1 && eligible[0].score - eligible[1].score < FOLLOW_MARGIN) {
    return { link: null, candidates: eligible }
  }
  return { link: eligible[0], candidates: [] }
}
