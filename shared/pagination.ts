/**
 * Paging a list, the same way on the screen and in the Worker.
 *
 * The admin lists grew past a screen: thirty-odd sources, a catalog of a
 * hundred listings, up to eighty findings. A page that long hides the thing
 * you came for below the fold, so every list there shows one screenful and a
 * pager. Two rules keep that honest:
 *
 *  - **The sizes are a closed set.** A size from the query string or from a
 *    stored preference is only ever one of `PAGE_SIZES`, because a "limit" a
 *    browser can set to a million is a way to ask the database for everything.
 *  - **A page that no longer exists becomes the last one that does.** Hiding a
 *    row, or switching a source off, can leave the page you were on empty; the
 *    list should show the nearest page, not a blank.
 *
 * Pure: no clock, no storage, no database.
 */

export const PAGE_SIZES = [10, 25, 50] as const
export const DEFAULT_PAGE_SIZE = 10

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, size)))
}

/** A 1-based page number, pulled inside what exists. */
export function clampPage(page: number, total: number, size: number): number {
  const wanted = Number.isFinite(page) ? Math.floor(page) : 1
  return Math.min(Math.max(1, wanted), pageCount(total, size))
}

/** The nearest allowed size to whatever was asked for, or the default. */
export function normalisePageSize(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_PAGE_SIZE
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE
}

export interface PageSlice<T> {
  rows: T[]
  /** The page actually shown, after clamping. */
  page: number
  pages: number
  total: number
  /** 1-based position of the first and last row shown; both 0 for an empty list. */
  from: number
  to: number
}

export function paginate<T>(items: readonly T[], page: number, size: number): PageSlice<T> {
  const total = items.length
  const current = clampPage(page, total, size)
  const start = (current - 1) * size
  const rows = items.slice(start, start + size)
  return {
    rows,
    page: current,
    pages: pageCount(total, size),
    total,
    from: rows.length ? start + 1 : 0,
    to: rows.length ? start + rows.length : 0,
  }
}

/**
 * `limit` and `offset` from a query string, for a route that pages in the
 * database. An unknown limit becomes the default rather than an error (a stale
 * browser tab should still get a page), and an offset is never negative.
 */
export function parsePaging(limit: string | undefined, offset: string | undefined): { limit: number; offset: number } {
  const off = Number(offset)
  return {
    limit: normalisePageSize(limit),
    offset: Number.isInteger(off) && off > 0 ? off : 0,
  }
}
