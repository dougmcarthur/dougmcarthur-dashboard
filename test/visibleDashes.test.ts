import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * No em dash in anything a person reads.
 *
 * The owner has asked for none of the habits of generated text, and em dashes
 * came back in each pass because nothing stopped the next sentence being typed
 * with one. This reads the string literals, template literals and JSX text of
 * the frontend, the Worker and the shared code, so a dash in a comment is fine
 * and a dash in a banner, an email subject or a notification is not.
 *
 * Two allowances. A dash on its own, standing for an empty value in a table
 * cell or a select, is a mark and not punctuation. And a pattern that has to
 * match a dash in somebody else's prose (a regular expression, or a string that
 * builds one) is not a sentence: the parsers read "Deadline: Nov 20" written
 * with a dash, and would stop reading it.
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
      // A string that builds a regular expression, such as `\\s*(?:–|—|to)\\s*`.
      // Regular expression literals are not string literals, so are not read.
      const pattern = shown.includes('\\s')
      if (shown.includes(DASH) && !aloneMark && !pattern) {
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
        found.push(`${file.split('\\').join('/')}:${line}: ${shown.replace(/\s+/g, ' ').slice(0, 90)}`)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

describe('what the app says', () => {
  it('has no em dash in a string or in JSX text, apart from an empty-value mark and a pattern', () => {
    const offenders = ['frontend/src', 'src', 'shared'].flatMap((dir) => files(dir)).flatMap(visibleDashes)
    expect(offenders).toEqual([])
  })
})
