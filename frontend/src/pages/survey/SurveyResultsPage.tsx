import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import { Button } from '../../components/ui/Button'
import { Message, Shell } from './SurveyPage'
import { ResultsView } from './results/ResultsView'

/**
 * Where the artist survey's notice says its summary is posted.
 *
 * It shows the published snapshot, which is whatever the owner last reviewed
 * and pressed Publish on, and nothing computed from the responses on a visit.
 * Until something is published it says so plainly: the notice promises a
 * summary, and a link that went nowhere would make that promise look false.
 *
 * Like the survey it is answered before the session, looks the same signed in or
 * out, and names the company rather than a product.
 */
export function SurveyResultsPage() {
  const status = useQuery({ queryKey: ['survey', 'status'], queryFn: api.survey.status, staleTime: 0, retry: 1 })
  const results = useQuery({ queryKey: ['survey', 'results'], queryFn: api.survey.results, staleTime: 0, retry: 1 })

  useEffect(() => {
    const previous = document.title
    document.title = 'Artist survey results · Sun Dogs Music'
    return () => {
      document.title = previous
    }
  }, [])

  const contact = status.data?.contact
  const open = !!status.data?.open

  if (results.isLoading) return <div className="min-h-screen bg-canvas" />

  if (results.error) {
    return (
      <Shell contact={contact}>
        <Message title="Something went wrong" body={['The results could not load. Please check your connection and try again.']} />
      </Shell>
    )
  }

  if (!results.data?.published) {
    return (
      <Shell contact={contact}>
        <Message
          title="Artist survey results"
          body={[
            'The results have not been posted yet.',
            'When they are, they will be here: answers combined across artists, never one person’s answers, and never the answers of a group too small to stay anonymous.',
          ]}
        >
          {open && (
            <Button size="lg" onClick={() => (window.location.hash = 'survey')}>
              Take the survey
            </Button>
          )}
        </Message>
      </Shell>
    )
  }

  return (
    <Shell wide>
      <ResultsView results={results.data.results} contact={contact} open={open} />
    </Shell>
  )
}
