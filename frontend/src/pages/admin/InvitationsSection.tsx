import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import { InvitesPanel } from '../../components/InvitesPanel'
import { InviteRequestsPanel } from '../../components/InviteRequestsPanel'
import { SectionHeader } from '../../components/ui/SectionHeader'

/**
 * Who has asked to join, and who has been invited: one page, because one
 * leads to the other. **Invite** on a request fills the form beneath it and
 * stops there; issuing is still the owner pressing Create and touching the
 * passkey with the address in front of them.
 */
export function InvitationsSection() {
  const qc = useQueryClient()
  const [prefill, setPrefill] = useState<{ email: string; name: string; nonce: number; requestId: number } | null>(null)
  const closeRequest = useMutation({
    mutationFn: (id: number) => api.admin.setInviteRequest(id, 'invited'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'invite-requests'] }),
  })

  return (
    <div className="space-y-8">
      <SectionHeader title="Invitations">
        Artists join by invitation only. Requests come in from the public page and wait here for an answer; an
        invitation creates an account when it is redeemed.
      </SectionHeader>

      <InviteRequestsPanel
        onInvite={(r) => setPrefill({ email: r.email, name: r.name, nonce: Date.now(), requestId: r.id })}
      />

      <InvitesPanel
        prefill={prefill}
        onIssued={(email) => {
          // Close the request this invitation answers, if it came from one.
          if (prefill && prefill.email.toLowerCase() === email.toLowerCase()) {
            closeRequest.mutate(prefill.requestId)
            setPrefill(null)
          }
        }}
      />
    </div>
  )
}
