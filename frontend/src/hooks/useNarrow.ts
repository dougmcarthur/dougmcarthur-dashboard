import { useEffect, useState } from 'react'

/**
 * Below the `lg` breakpoint (1024px), where a sidebar has no room beside the
 * page and the pages become a list you tap through.
 *
 * Read in script rather than left to CSS because it decides what is *drawn*:
 * on a phone `#settings` is the list of pages and on a laptop it is the first
 * page, and rendering both so that a media query could hide one would load
 * every card twice. Same shape as `useWide` in `useSidePanel.ts`, which asks the
 * same kind of question of a different width.
 */
const QUERY = '(max-width: 1023.98px)'

export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(QUERY).matches)

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia(QUERY)
    const onChange = () => setNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return narrow
}
