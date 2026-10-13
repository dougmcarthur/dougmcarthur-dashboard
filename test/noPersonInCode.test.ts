import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A person's name does not belong in the code.
 *
 * Scout was written for one artist, and for a while the parser, its flags and
 * its comments said so by name: a field called after him, a pattern that only
 * matched him. For anybody else the pattern found nothing and the field's name
 * was a stranger's. Who a note is about is a fact about the *account* — see
 * `artistNames` — and the code says "the artist".
 *
 * Source only. Fixtures under `test/` hold real captured pages and documents,
 * and are data rather than behaviour.
 */
const ROOTS = ['shared', 'src', 'frontend/src', 'scripts']
const TEXT = /\.(ts|tsx|mjs|md|css)$/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : TEXT.test(name) ? [path] : []
  })
}

describe('source names nobody', () => {
  it('carries no first or last name of the person it was first written for', () => {
    const offenders = ROOTS.flatMap(files).filter((path) => /\bDoug\b|McArthur/.test(readFileSync(path, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('has no flag, field or function named after a person', () => {
    const offenders = ROOTS.flatMap(files).filter((path) => /\b(needs|awaits|for|by)Doug\b/i.test(readFileSync(path, 'utf8')))
    expect(offenders).toEqual([])
  })
})
