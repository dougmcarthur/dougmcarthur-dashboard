/**
 * Which province or state a place is in.
 *
 * Its own module because three things need it and none of them should import
 * the others: what an artist asked for (`artistFocus.ts`), what a trip costs
 * (`gigCost.ts`) and what the shared catalog records about a listing
 * (`opportunityCatalog.ts`). A place is read the same way in all three, so a
 * gig is "in your province" for the queue, "a drive" for the cost and "in
 * Manitoba" in the catalog on one reading of the same words.
 *
 * Reading only, never guessing: a place that does not say has no region.
 */

/** Canadian provinces and territories, by code and by name. */
export const PROVINCES: Record<string, string> = {
  AB: 'alberta', BC: 'british columbia', MB: 'manitoba', NB: 'new brunswick', NL: 'newfoundland and labrador',
  NS: 'nova scotia', NT: 'northwest territories', NU: 'nunavut', ON: 'ontario', PE: 'prince edward island',
  QC: 'quebec', SK: 'saskatchewan', YT: 'yukon',
}

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
])

const PROVINCE_BY_NAME = new Map(Object.entries(PROVINCES).map(([code, name]) => [name, code]))

const COUNTRY_WORDS = new Set(['canada', 'usa', 'us', 'united states', 'united states of america'])

/**
 * The province or state a place names, from "Winnipeg, MB", "Brandon, Manitoba",
 * "Toronto, ON, Canada" or "somewhere in Manitoba".
 *
 * The last part that is a region, skipping a country written after it, and a
 * province's full name found anywhere in the text as a last resort. A place that
 * does not say is not guessed at: "Birds Hill" alone has no region. `CA` after a
 * province code is Canada and not California, and on its own it is California,
 * since a province never collides with it and the country is its own field.
 */
export function regionOf(place: string | null | undefined): { code: string; country: 'CA' | 'US' } | null {
  const parts = (place ?? '').split(',').map((p) => p.trim()).filter(Boolean)

  for (let i = parts.length - 1; i >= Math.max(0, parts.length - 2); i--) {
    const part = parts[i]
    if (COUNTRY_WORDS.has(part.toLowerCase().replace(/\./g, ''))) continue
    const upper = part.toUpperCase()
    if (upper === 'CA' && i > 0 && parts[i - 1].toUpperCase() in PROVINCES) continue

    if (upper in PROVINCES) return { code: upper, country: 'CA' }
    const byName = PROVINCE_BY_NAME.get(part.toLowerCase().replace(/\./g, ''))
    if (byName) return { code: byName, country: 'CA' }
    if (US_STATES.has(upper)) return { code: upper, country: 'US' }
  }

  const text = (place ?? '').toLowerCase()
  for (const [code, name] of Object.entries(PROVINCES)) {
    if (new RegExp(String.raw`\b${name}\b`).test(text)) return { code, country: 'CA' }
  }
  return null
}

/** The province in the artist's home base, if it names one in Canada. */
export function homeRegionOf(homePlace: string | null | undefined): string | null {
  const region = regionOf(homePlace)
  return region?.country === 'CA' ? region.code : null
}
