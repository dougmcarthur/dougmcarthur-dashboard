/**
 * Saying what an admin write did, from its method and path alone.
 *
 * The log keeps a sentence and never the request body, so nothing typed into a
 * form (an address, a key) can end up in it. A route this file does not know
 * is logged as a generic line rather than dropped: a change nobody described
 * is still a change.
 */

const RULES: Array<[string, RegExp, (m: RegExpMatchArray) => string]> = [
  ['DELETE', /^\/artists\/[^/]+$/, () => 'Removed an artist and their data'],
  ['POST', /^\/invites$/, () => 'Issued an invitation'],
  ['DELETE', /^\/invites\/[^/]+$/, () => 'Withdrew an invitation'],
  ['PATCH', /^\/invite-requests\/(\d+)$/, () => 'Answered a request to join'],
  ['POST', /^\/feedback\/(\d+)\/read$/, () => 'Marked a feedback message read'],
  ['PATCH', /^\/listings\/(\d+)$/, () => 'Showed or hid a landing page listing'],
  ['PATCH', /^\/catalog\/sources\/(\d+)$/, () => 'Changed an external data source (on or off, or how often)'],
  ['POST', /^\/catalog\/sources\/(\d+)\/poll$/, () => 'Read one external data source now'],
  ['POST', /^\/catalog\/poll$/, () => 'Read the next external data sources now'],
  ['PATCH', /^\/survey\/settings$/, () => 'Changed the artist survey settings'],
  ['POST', /^\/survey\/publication$/, () => 'Published the survey results'],
  ['DELETE', /^\/survey\/publication$/, () => 'Took the survey results down'],
  ['PATCH', /^\/drive-picker$/, () => 'Changed the Google Drive picker settings'],
]

/** A path as the admin router sees it, without the `/api/admin` prefix. */
export function describeAdminChange(method: string, path: string): string | null {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null
  for (const [m, re, say] of RULES) {
    const hit = method === m ? path.match(re) : null
    if (hit) return say(hit)
  }
  return 'Changed something in admin mode'
}
