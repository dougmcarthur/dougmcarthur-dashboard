import { useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, clampPage, normalisePageSize, pageCount, paginate } from '../../../../shared/pagination'
import { Button } from './Button'
import { Select } from './Field'

/**
 * One screenful of a long list, and the controls to move through the rest.
 *
 * The admin pages used to print every row, so the thing you came for sat
 * somewhere down a page that kept growing. Every list there shows ten rows by
 * default and says how many there are; the page size is the one preference
 * that is shared, kept in this browser, because somebody who prefers twenty-five
 * rows prefers them everywhere.
 *
 * **It says nothing when there is nothing to page.** Ten rows or fewer is one
 * screen at every size offered, and a pager over a list that fits is a control
 * that does nothing.
 *
 * **The count is the whole list, not the page.** For a list the Worker pages
 * itself the total comes from the response, so "of 43" is true of the database
 * and never of the slice that happened to arrive.
 */

const STORAGE_KEY = 'scout.admin.pageSize'

function storedSize(): number {
  try {
    return normalisePageSize(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    // A private window or blocked site data: the default, and it simply is not remembered.
    return DEFAULT_PAGE_SIZE
  }
}

/** The state a pager needs: which page, how many rows, and the two ways to change them. */
export function usePaging() {
  const [page, setPage] = useState(1)
  const [size, setSizeState] = useState(storedSize)

  const setSize = (next: number) => {
    setSizeState(next)
    setPage(1)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      /* Not remembered; it still applies until the page is closed. */
    }
  }

  return { page, setPage, size, setSize }
}

/**
 * Moves a page that no longer exists to the nearest one that does. Hiding the
 * only row on the last page leaves one page fewer, and the screen should show
 * the page before it, not a blank. Pass the total once it is known.
 */
export function useFitPage(
  paging: { page: number; size: number; setPage: (page: number) => void },
  total: number | undefined,
) {
  const { page, size, setPage } = paging
  useEffect(() => {
    if (total === undefined) return
    const fitted = clampPage(page, total, size)
    if (fitted !== page) setPage(fitted)
  }, [total, page, size, setPage])
}

export interface PagerProps {
  total: number
  page: number
  size: number
  onPage: (page: number) => void
  onSize: (size: number) => void
  /** What is being counted, plural: "sources". */
  noun: string
}

export function Pager({ total, page, size, onPage, onSize, noun }: PagerProps) {
  if (total <= PAGE_SIZES[0]) return null

  const pages = pageCount(total, size)
  const current = clampPage(page, total, size)
  const from = (current - 1) * size + 1
  const to = Math.min(total, current * size)

  return (
    // Held to the bottom of the window while its list is on screen, so the way
    // to the next page is never below a fold; at the end of the list it sits
    // where it would have anyway. Not on a phone, where it stacks into three
    // rows and would take an eighth of the screen.
    <nav
      aria-label={`Pages of ${noun}`}
      className="sm:sticky sm:bottom-0 sm:z-10 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line bg-canvas/95 py-2 text-xs text-muted"
    >
      <p aria-live="polite" className="tabular-nums">
        Showing {from} to {to} of {total.toLocaleString()} {noun}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2">
          Rows per page
          <Select filter value={size} onChange={(e) => onSize(Number(e.target.value))} className="!py-1 !text-xs">
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex items-center gap-2">
          <Button variant="neutral" size="sm" disabled={current <= 1} onClick={() => onPage(current - 1)}>
            Previous
          </Button>
          <span className="tabular-nums">
            Page {current} of {pages}
          </span>
          <Button variant="neutral" size="sm" disabled={current >= pages} onClick={() => onPage(current + 1)}>
            Next
          </Button>
        </div>
      </div>
    </nav>
  )
}

/**
 * A list that is already in memory, one screenful at a time.
 *
 * For the lists the Worker pages itself (listings, findings) the screen holds
 * `usePaging` and `Pager` directly, because the rows on a page are not the rows
 * it has. Everything else is small enough to fetch whole and slice here.
 *
 * `resetKey` sends the list back to its first page when what it is a list *of*
 * changes: a new filter is a new list, and page three of the old one is not
 * where anybody wants to be.
 */
export function PagedList<T>({
  items,
  noun,
  resetKey,
  children,
}: {
  items: readonly T[]
  noun: string
  resetKey?: string
  children: (rows: T[]) => ReactNode
}) {
  const paging = usePaging()
  useFitPage(paging, items.length)
  const { setPage } = paging
  useEffect(() => setPage(1), [resetKey, setPage])
  const slice = paginate(items, paging.page, paging.size)

  return (
    <div className="space-y-3">
      {children(slice.rows)}
      <Pager total={items.length} page={slice.page} size={paging.size} onPage={paging.setPage} onSize={paging.setSize} noun={noun} />
    </div>
  )
}
