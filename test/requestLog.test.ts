/**
 * The request log prints paths, never query strings.
 *
 * Hono's `logger()` printed the whole URL after the host, and on the OAuth
 * callback that is `?state=…&code=…` — a live authorization code in every
 * `wrangler tail`. Both halves are checked: the middleware's behaviour through
 * a real Hono app, and the source, because swapping `requestLog()` back to
 * `logger()` typechecks, runs and logs perfectly well.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path/posix'
import { Hono } from 'hono'
import { logLine, requestLog } from '../src/lib/requestLog'

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return tsFiles(p)
    return p.endsWith('.ts') ? [p] : []
  })
}

async function logged(url: string): Promise<string[]> {
  const lines: string[] = []
  const app = new Hono()
  app.use('/api/*', requestLog((line) => lines.push(line)))
  app.get('/api/gmail/callback', (c) => c.redirect('/#settings?calendar=connected', 302))
  app.get('/api/gigs', (c) => c.json([]))
  await app.request(url)
  return lines
}

describe('requestLog', () => {
  it('logs the OAuth callback without its code or state', async () => {
    const lines = await logged(
      'https://scout.sundogsmusic.ca/api/gmail/callback?state=abc.def&code=4/0AXlSecret&scope=https://www.googleapis.com/auth/gmail.compose',
    )
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('<-- GET /api/gmail/callback')
    expect(lines[1]).toMatch(/^--> GET \/api\/gmail\/callback 302 \d+m?s$/)
    for (const line of lines) {
      expect(line).not.toContain('?')
      expect(line).not.toContain('4/0AXlSecret')
      expect(line).not.toContain('abc.def')
    }
  })

  it('strips the query from every route, not only the callback', async () => {
    const lines = await logged('https://scout.sundogsmusic.ca/api/gigs?stage=new&token=whatever')
    expect(lines[0]).toBe('<-- GET /api/gigs')
    expect(lines[1]).toMatch(/^--> GET \/api\/gigs 200 \d+m?s$/)
    expect(lines.join('\n')).not.toContain('token=')
  })

  it('keeps the format logger() had', () => {
    expect(logLine('<--', 'POST', '/api/gigs')).toBe('<-- POST /api/gigs')
    expect(logLine('-->', 'POST', '/api/gigs', { status: 201, ms: 42 })).toBe('--> POST /api/gigs 201 42ms')
    expect(logLine('-->', 'GET', '/api/review', { status: 200, ms: 2400 })).toBe('--> GET /api/review 200 2s')
  })
})

describe('no request logger prints the URL', () => {
  const src = tsFiles('src')

  it('never imports hono/logger', () => {
    // It prints everything after the host, query string included, and takes
    // only a print function — there is no option that trims it.
    expect(src.filter((f) => /from ['"]hono\/logger['"]/.test(readFileSync(f, 'utf8')))).toEqual([])
  })

  it('mounts requestLog on the API', () => {
    expect(readFileSync('src/index.ts', 'utf8')).toMatch(/app\.use\(\s*['"]\/api\/\*['"]\s*,\s*requestLog\(\)\s*\)/)
  })

  it('logs c.req.path, never c.req.url', () => {
    const body = readFileSync('src/lib/requestLog.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(body).toMatch(/\bpath\b[^}]*\}\s*=\s*c\.req\b/)
    expect(body).not.toMatch(/c\.req\.url|\burl\b/)
  })
})
