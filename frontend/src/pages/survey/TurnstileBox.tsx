import { useEffect, useRef, useState } from 'react'

/**
 * Cloudflare Turnstile, the spam check on starting the survey.
 *
 * It exists so a script cannot fill the survey with answers, and it is shown
 * only when the deployment has both halves configured. The page that uses it
 * says in its notice that Cloudflare sees the visitor's address while this runs;
 * the server never receives one (see src/lib/turnstile.ts).
 *
 * Loaded on demand, once, rather than in the page head: nobody who is not taking
 * the survey should be handed a third party's script.
 */

interface TurnstileApi {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<void> | null = null

function load(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SCRIPT
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => {
      loading = null
      reject(new Error('The spam check could not load.'))
    }
    document.head.appendChild(el)
  })
  return loading
}

export function TurnstileBox({
  siteKey,
  onToken,
}: {
  siteKey: string
  /** The token, or null when it has expired or failed and a new one is needed. */
  onToken: (token: string | null) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let widget: string | undefined
    let cancelled = false
    load()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return
        widget = window.turnstile.render(box.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => {
            setFailed(true)
            onToken(null)
          },
        })
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
      if (widget && window.turnstile) window.turnstile.remove(widget)
    }
    // The token callback is stable for the life of the page that mounts this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey])

  return (
    <div>
      <div ref={box} />
      {failed && (
        <p role="alert" className="text-sm text-danger-fg">
          The spam check did not load. Turn off any blocker for this page, then reload it and try again.
        </p>
      )}
    </div>
  )
}
