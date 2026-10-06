import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import { Button } from '../../components/ui/Button'
import { Message, Shell } from './SurveyPage'

/**
 * Where the artist survey's notice says its summary will be posted.
 *
 * It says so plainly until there is a summary: the notice promises one, and a
 * link that went nowhere would make that promise look like a lie. Nothing is
 * read from the responses here — the page is as public as the survey itself, so
 * what it will show is something the owner publishes, not a live view of the
 * data. Posting a summary is a separate step that does not exist yet.
 *
 * Like the survey it is answered before the session, looks the same signed in
 * or out, and names the company rather than a product.
 */
export function SurveyResultsPage() {
  const status = useQuery({ queryKey: ['survey', 'status'], queryFn: api.survey.status, staleTime: 0, retry: 1 })

  useEffect(() => {
    const previous = document.title
    document.title = 'Artist survey results · Sun Dogs Music'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <Shell contact={status.data?.contact}>
      <Message
        title="Artist survey results"
        body={[
          'The results have not been posted yet.',
          'When they are, they will be here: answers combined across artists, never one person’s answers, and never the answers of a group too small to stay anonymous.',
        ]}
      >
        {status.data?.open && (
          <Button size="lg" onClick={() => (window.location.hash = 'survey')}>
            Take the survey
          </Button>
        )}
      </Message>
    </Shell>
  )
}
