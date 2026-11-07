import { useEffect, useState } from 'react'

/**
 * Below the `md` breakpoint (768px): a phone, where a table of six columns is
 * twice the width of the screen and the stage, the one thing a row exists to
 * show, is off the right edge.
 *
 * Read in script rather than left to CSS for the reason `useNarrow` is: it
 * decides what is *drawn*. Rendering the table and the phone list together so a
 * media query could hide one would mount every expanded panel twice.
 */
const QUERY = '(max-width: 767.98px)'

export function usePhone(): boolean {
  const [phone, setPhone] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(QUERY).matches)

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia(QUERY)
    const onChange = () => setPhone(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return phone
}
