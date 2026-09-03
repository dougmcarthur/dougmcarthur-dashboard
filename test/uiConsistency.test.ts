import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source-level guards for mistakes that typecheck and render fine.
 *
 * Both of these shipped at least once: a hover state that was a no-op because
 * it named the colour the element already had, and the same input class string
 * declared under three names in five files.
 */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return tsxFiles(p)
    return p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : []
  })
}

const FILES = tsxFiles('frontend/src')

describe('no dead hover states', () => {
  it('never sets hover:bg-X on an element already painted bg-X', () => {
    const offenders: string[] = []
    for (const file of FILES) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/"([^"]*)"/g)) {
          const cls = m[1]
          const bg = new Set([...cls.matchAll(/(?<!hover:)\bbg-([a-z0-9-]+)\b/g)].map((x) => x[1]))
          const hov = new Set([...cls.matchAll(/hover:bg-([a-z0-9-]+)\b/g)].map((x) => x[1]))
          for (const same of [...bg].filter((b) => hov.has(b))) {
            offenders.push(`${file}:${i + 1} bg-${same} + hover:bg-${same}`)
          }
        }
      })
    }
    expect(offenders).toEqual([])
  })
})

describe('form controls come from one place', () => {
  it('has no per-page copy of the input class string', () => {
    const copies = FILES.filter(
      (f) =>
        !f.includes('/ui/') &&
        /border border-line-strong rounded-md[^'"]*focus:ring-accent/.test(readFileSync(f, 'utf8')),
    )
    expect(copies).toEqual([])
  })
})
