import { biggestValue, type PublicResults } from '../../../../../shared/surveyPublic'
import { dateSpan, dollars, pct } from './format'

/**
 * The three figures at the top of the page, each as a whole sentence.
 *
 * A figure is large and the words after it are small, so it is tempting to write
 * the words as a label ("artists took part", "of the time they turned down
 * both"). Read aloud those are the end of a sentence whose start is a number on
 * a different line. So each is written as a complete sentence that begins with
 * its figure, and the page sets the figure large and lets the sentence carry on.
 *
 * Pure, so a test can read every sentence this can produce.
 */
export interface HeroLine {
  /** The number, set large. */
  figure: string
  /** The rest of the sentence, which carries on from the figure. */
  rest: string
}

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function heroLines(r: PublicResults): HeroLine[] {
  const { from, to } = r.collected
  const lines: HeroLine[] = [
    {
      figure: String(r.n),
      rest: `${r.n === 1 ? 'artist' : 'artists'} took part ${from === to ? 'on' : 'from'} ${dateSpan(from, to, true)}.`,
    },
  ]

  if (r.neither !== null) {
    lines.push({ figure: pct(r.neither), rest: 'of the time, artists shown two made-up opportunities turned down both.' })
  }

  const value = biggestValue(r.choices)
  if (value) {
    lines.push({
      figure: dollars(Math.abs(value.value)),
      rest: `of pay is roughly what ${value.phrase} ${value.value > 0 ? 'is worth to' : 'costs'} these artists.`,
    })
  }

  return lines
}

/** The same lines with the first word's capital where a sentence needs one, for anywhere they are read as plain text. */
export const sentence = (line: HeroLine) => upperFirst(`${line.figure} ${line.rest}`)
