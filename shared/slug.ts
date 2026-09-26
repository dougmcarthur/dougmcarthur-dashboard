/**
 * The key a document is stored under, made from its title.
 *
 * The reference-document form used to ask for it — "ID (slug, e.g. bio,
 * press-kit)" — which is asking a person to invent an identifier for the
 * database. It is derived instead, and numbered if the title's slug is taken.
 */
export function slugFor(title: string, taken: readonly string[]): string {
  const base =
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'document'
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}
