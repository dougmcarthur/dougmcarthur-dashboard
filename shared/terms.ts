/**
 * The version of the terms of service in force, which is the date the page at
 * `/terms-of-service/` says it was last updated.
 *
 * A date rather than a counter because the page already carries one: a reader,
 * a regulator and the record in `users.terms_version` can all be checked against
 * what the page itself says, with no second number to keep in step. It is
 * written once, here. `test/termsAcceptance.test.ts` reads the page and fails
 * when its "Last updated" line and this constant disagree, so changing the terms
 * and not this (or this and not the terms) is a red test rather than an account
 * recorded as having agreed to words it was never shown.
 *
 * Change it with the page, and only when the terms themselves change. A typo
 * fixed on the page is not a new version: moving the date would make every
 * account's record look stale, and a later prompt to accept again would ask
 * people to agree to the same words twice.
 */
export const TERMS_VERSION = '2026-10-13'
