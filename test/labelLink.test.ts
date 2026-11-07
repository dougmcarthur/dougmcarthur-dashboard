import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * A form label that is not tied to its input.
 *
 * It renders identically, and a screen reader announces an unnamed box while a
 * click on the label focuses nothing. Sixty-odd labels sat that way. `Label`
 * now ties itself to the control that follows it. The behaviour is a DOM
 * effect and these tests run without a DOM, so what is pinned here is that the
 * effect stays, and that an explicit `htmlFor` still wins. It was checked in
 * the running app when it was written: every label on the Gig and Sync forms
 * resolved to its input (`label.control`).
 */

const surface = readFileSync('frontend/src/components/ui/Surface.tsx', 'utf8')
const label = surface.slice(surface.indexOf('export function Label'), surface.indexOf('/* Caption'))

describe('Label', () => {
  it('ties itself to the control that follows when no htmlFor is given', () => {
    expect(label).toContain('useLayoutEffect')
    expect(label).toContain('nextElementSibling')
    // The next sibling, or the first control inside it: a wrapper that fixes a
    // width (the fee amount beside its currency) sits between the two.
    expect(label).toContain('querySelector(CONTROL)')
    expect(label).toContain('label.htmlFor = control.id')
  })

  it('leaves an explicit htmlFor alone', () => {
    expect(label).toMatch(/if \(!label \|\| htmlFor\) return/)
    expect(label).toContain('htmlFor={htmlFor}')
  })

  it('does not overwrite an id the control already has', () => {
    expect(label).toContain('if (!control.id) control.id = generated')
  })
})

describe('the landing page sample', () => {
  const landing = readFileSync('frontend/src/pages/LandingPage.tsx', 'utf8')

  it('shows the Fee column only when a listing states a fee', () => {
    // A column of dashes says "free or unknown" to someone reading quickly,
    // and the page's rule is that it never claims either.
    expect(landing).toContain('const showFee = rows.some((o) => o.feeAmount !== null)')
    expect(landing).toContain('{showFee && <th')
    expect(landing).toContain('{showFee && <td')
  })
})
