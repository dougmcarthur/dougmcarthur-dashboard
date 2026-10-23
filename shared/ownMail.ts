/**
 * Mail this app sent, which the reply scan must never read as somebody's answer.
 *
 * The weekly digest names the gigs that need a decision, and it lands in the
 * owner's own inbox, so a search for a gig's name finds it: four of them sat in
 * Review as "Not sure, low confidence", each offering to bind `digest@` to
 * whichever application it listed first. `-in:sent` does not catch it, because
 * the Worker sends through Cloudflare's binding rather than through Gmail, so
 * Gmail never files it as sent.
 *
 * The senders are a closed list on purpose. `wrangler.toml`'s
 * `allowed_sender_addresses` is what the binding will accept as a From line, so
 * those two addresses are every address this app can write as, and
 * `test/ownMail.test.ts` fails if that list grows and this one does not. The
 * two that are *configurable* (the digest's sender, the sign-in sender) are
 * passed in, so a change to either is excluded the same way.
 *
 * It is an exact address and never the domain. `sundogsmusic.ca` is also where
 * the artist's own mail lives, and an organiser who replies to a pitch may well
 * be answering somebody there.
 */

/** Every From address the send binding accepts. */
export const SCOUT_SENDERS: readonly string[] = ['login@sundogsmusic.ca', 'digest@sundogsmusic.ca']

/**
 * The addresses to treat as this app's own: the fixed pair plus whatever the
 * deployment is configured to send as. Lower-cased and de-duplicated, because
 * `parseFrom` lower-cases what it reads and the comparison is exact.
 */
export function ownSenders(configured: ReadonlyArray<string | null | undefined> = []): string[] {
  const out = new Set<string>()
  for (const a of [...SCOUT_SENDERS, ...configured]) {
    const address = (a ?? '').trim().toLowerCase()
    if (address) out.add(address)
  }
  return [...out]
}

/** Whether this From address is one of the app's own. */
export function isOwnMail(from: string, senders: readonly string[]): boolean {
  const address = from.trim().toLowerCase()
  return address !== '' && senders.includes(address)
}
