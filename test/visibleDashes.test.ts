import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * No em dash in anything a screen says.
 *
 * The owner has asked for none of the habits of generated text, and em dashes
 * came back in each pass because nothing stopped the next sentence being typed
 * with one. This reads the string literals, template literals and JSX text of
 * the frontend, so a dash in a comment is fine and a dash in a banner is not.
 *
 * The one allowance is a dash on its own, standing for an empty value in a
 * table cell or a select. It is a mark, not punctuation.
 *
 * Scope is `frontend/src`. The Worker still builds some sentences with dashes
 * (notification titles, a few emails); widen this when those are rewritten.
 */

const DASH = '\u2014'

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return files(path)
    return /\.tsx?$/.test(e.name) ? [path] : []
  })
}

function visibleDashes(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  if (!text.includes(DASH)) return []
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: string[] = []
  const visit = (n: ts.Node) => {
    const k = n.kind
    const isText =
      k === ts.SyntaxKind.StringLiteral ||
      k === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
      k === ts.SyntaxKind.TemplateHead ||
      k === ts.SyntaxKind.TemplateMiddle ||
      k === ts.SyntaxKind.TemplateTail ||
      k === ts.SyntaxKind.JsxText
    if (isText) {
      const shown = n.getText(sf)
      const aloneMark = shown.replace(/['"`\s]/g, '') === DASH
      if (shown.includes(DASH) && !aloneMark) {
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
        found.push(`${file.split('\\').join('/')}:${line}: ${shown.replace(/\s+/g, ' ').slice(0, 90)}`)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

describe('what the frontend says', () => {
  it('has no em dash in a string or in JSX text, apart from a dash standing alone for an empty value', () => {
    const offenders = files('frontend/src').flatMap(visibleDashes)
    expect(offenders).toEqual([])
  })
})
