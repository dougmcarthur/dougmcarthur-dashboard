import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import { EpkView } from '../../components/epk/EpkView'
import { epkProfile } from '../../../../shared/epkProfile'

/**
 * A shared EPK, opened from its link — by somebody who is not signed in and
 * never will be.
 *
 * The token is the URL fragment (`#epk/<token>`), read here and sent in a
 * POST body, which is the invitation's arrangement: a fragment never reaches a
 * server log or a Referer header. An unknown link and a withdrawn one get the
 * same sentence, so a guessed token learns nothing.
 */
export function PublicEpkPage({ token }: { token: string }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['public-epk', token],
    queryFn: () => api.publicEpk(token),
    retry: false,
  })

  const name = data ? epkProfile(data.epk, data.name).name : null
  useEffect(() => {
    if (name) document.title = `${name} — EPK`
  }, [name])

  if (isLoading) return <div className="min-h-screen bg-canvas" />
  if (error || !data) {
    return (
      <main className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <p className="text-body text-center max-w-sm">
          {(error as Error | null)?.message ?? 'This link is not active. Ask the artist for a current one.'}
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-canvas">
      <EpkView page={data} />
      <div className="max-w-5xl mx-auto px-5 sm:px-10 py-6 print:hidden">
        <button onClick={() => window.print()} className="text-sm text-muted underline hover:text-ink">
          Save as PDF
        </button>
      </div>
    </main>
  )
}
