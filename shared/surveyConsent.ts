/**
 * How the welcome is split into screens.
 *
 * The notice used to be one long page with the agreement under it, and on a phone
 * the checkbox sat a screen and a half down. It is now one paragraph to a screen,
 * and the agreement is a screen of its own at the end. What each step *is* is
 * decided here, from the number of points in the notice, so a point added to
 * `CONSENT.points` gets its own screen without anybody remembering to build one,
 * and cannot be left out.
 *
 * The agreement is the last step and the only one. The spam check and the field
 * a person never sees travel with it, because a spam token expires after five
 * minutes and somebody reading six screens carefully can take longer than that.
 */

export type ConsentStep =
  /** The title, what the survey is for and how long it takes. */
  | { kind: 'welcome' }
  /** One point of the notice, by its position in `CONSENT.points`. */
  | { kind: 'point'; index: number }
  /** The age confirmation, the spam check and Start. */
  | { kind: 'agree' }

export function consentSteps(pointCount: number): ConsentStep[] {
  return [
    { kind: 'welcome' },
    ...Array.from({ length: pointCount }, (_, index): ConsentStep => ({ kind: 'point', index })),
    { kind: 'agree' },
  ]
}
