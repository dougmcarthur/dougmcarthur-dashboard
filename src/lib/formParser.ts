// Reads an application form page and extracts its individual fields.
//
// Deliberately dependency-free and regex-based rather than HTMLRewriter: this
// runs identically in the Worker and in `vitest` (node), so the parsing rules
// are directly testable. Two sources are supported:
//   - ordinary server-rendered HTML forms (<input>/<textarea>/<select>)
//   - Google Forms, whose fields live in the FB_PUBLIC_LOAD_DATA_ blob
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

export interface ParsedForm {
  title: string | null
  source: 'html' | 'google-forms'
  loginRequired: boolean
  /** Set when fields could not be read — the reason is shown in the dashboard. */
  blockedReason: string | null
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
  const end = html.indexOf('</select>', fromIndex)
  if (end === -1) return []
  const block = html.slice(fromIndex, end)
  const out: string[] = []
  const re = /<option\b[^>]*>([\s\S]*?)<\/option>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) {
    const label = textOf(m[1])
    if (label) out.push(label)
  }
  return out
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
      fields: [],
    }
  }

  if (matchesHost(host, JS_RENDERED_HOSTS)) {
    return {
      title,
      source: 'html',
      loginRequired: false,
      blockedReason: `${host} renders its form with JavaScript — the fields aren’t in the page source.`,
      fields: [],
    }
  }

  const body = stripScripts(html)
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

  if (fields.length === 0) {
    return {
      title,
      source: 'html',
      loginRequired: false,
      blockedReason:
        'No form fields were found on the page — the application may open later, be a PDF, or be submitted by email.',
      fields: [],
    }
  }

  return { title, source: 'html', loginRequired: false, blockedReason: null, fields }
}

export function parseApplicationForm(html: string, url: string): ParsedForm {
  if (!detectLoginRequired(html, url)) {
    const google = parseGoogleForm(html)
    if (google) return google
  }
  return parseHtmlForm(html, url)
}
