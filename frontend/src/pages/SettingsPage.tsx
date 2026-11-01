import type { ReactNode } from 'react'
import { IntegrationsCard, useConnectionAttention } from '../components/IntegrationsCard'
import { BandsintownCard } from '../components/BandsintownCard'
import { AssociationsCard } from '../components/AssociationsCard'
import { NudgeRoutingCard } from '../components/NudgeRoutingCard'
import { AppearanceSettings } from '../components/AppearanceSettings'
import { DigestSettingsCard } from '../components/DigestSettingsCard'
import { SuggestionsCard } from '../components/SuggestionsCard'
import { NotesBackfillCard } from '../components/NotesBackfillCard'
import { PasskeysCard } from '../components/PasskeysCard'
import { AgentTokensCard } from '../components/AgentTokensCard'
import { AdminModeCard } from '../components/AdminModeCard'
import { ProfileCard } from '../components/ProfileCard'
import { HomeBaseCard } from '../components/HomeBaseCard'
import { SectionHeader } from '../components/ui/SectionHeader'
import { SidebarShell, type SidebarBadge } from '../components/ui/SidebarShell'
import { useSession } from '../hooks/useSession'
import { settingsGroupsFor, settingsSectionLabel, type SettingsSectionId } from './settings/sections'

/**
 * Settings, a page at a time.
 *
 * It was four tabs over a two-column grid of a dozen cards, so a tab still held
 * several errands: "Account" was your name, where you travel from, your
 * passkeys, the agents' tokens and the way into admin mode. Each of those is a
 * page of its own now, in a sidebar shaped like the admin surface's
 * (`./settings/sections.ts` has the pages and the names; `SidebarShell` is the
 * frame both share).
 *
 * **Which page is the router's job.** `App.tsx` reads the address, resolves it
 * for this person (an old tab id becomes the page that replaced it, an owner's
 * page asked for by an artist becomes the default) and hands the answer here.
 * **Google account is the default** because it is where every link into
 * Settings means to land: Google's consent round trip (`#settings?google=…`) and
 * the bell's "Calendar disconnected". `#settings/reminders` is the digest's
 * "switch this off" link, so no link has to land on the wrong page and hope.
 *
 * One column, not two. The grid was there so a single reading column pinned to
 * the left did not bank empty pixels, and the sidebar is what stands there now.
 *
 * Reference documents live on the Artist page: they describe the artist, and
 * that is where the Library reads its facts from them.
 */

/** The width a settings card reads well at. A form stretched across a wide window is a form nobody can scan. */
function Column({ children }: { children: ReactNode }) {
  return <div className="max-w-3xl space-y-6">{children}</div>
}

export function SettingsPage({ section }: { section: SettingsSectionId }) {
  const session = useSession()
  const owner = session?.role === 'owner'
  const failing = useConnectionAttention()

  // A count only for a connection that has stopped working. A service nobody
  // has connected is a choice not yet made, and `rowNeedsAttention` says so.
  const badges: Partial<Record<SettingsSectionId, SidebarBadge>> =
    failing > 0 ? { google: { count: failing, tone: 'attention', noun: 'needing attention' } } : {}

  return (
    <SidebarShell
      label="Settings pages"
      groups={settingsGroupsFor(owner)}
      current={section}
      hrefFor={(id) => `#settings/${id}`}
      badges={badges}
    >
      {/* Keyed, so moving to another page starts it clean rather than carrying
          a half-typed field across. */}
      <Page key={section} section={section} owner={owner} />
    </SidebarShell>
  )
}

function Page({ section, owner }: { section: SettingsSectionId; owner: boolean }) {
  const title = settingsSectionLabel(section) ?? 'Settings'

  switch (section) {
    case 'profile':
      return (
        <section className="space-y-4">
          <SectionHeader title={title}>Who Scout is working for, and where your trips start from.</SectionHeader>
          <Column>
            <ProfileCard />
            <HomeBaseCard />
            {/* Renders nothing, heading included, unless there is something to fill. */}
            <NotesBackfillCard />
          </Column>
        </section>
      )

    case 'security':
      return (
        <section className="space-y-4">
          <SectionHeader title={title} />
          <Column>
            <PasskeysCard />
          </Column>
        </section>
      )

    case 'google':
      return (
        <section className="space-y-4">
          <SectionHeader title={title}>
            Connect Google once for Calendar, Tasks, Gmail drafts and Drive. Each service can be connected on its own
            account, and each can be disconnected without touching the others.
          </SectionHeader>
          <Column>
            <IntegrationsCard />
          </Column>
        </section>
      )

    case 'services':
      return (
        <section className="space-y-4">
          <SectionHeader title={title}>
            Outside services Scout reads with your own key or your own profile address.
          </SectionHeader>
          <Column>
            <BandsintownCard />
            <AssociationsCard />
          </Column>
        </section>
      )

    case 'reminders':
      return (
        <section className="space-y-4">
          <SectionHeader title={title}>
            Where reminders go, the weekly email, and whether Scout suggests new opportunities.
          </SectionHeader>
          <Column>
            <NudgeRoutingCard />
            {/* Every account has its own digest, off until they switch it on. */}
            <DigestSettingsCard />
            <SuggestionsCard />
          </Column>
        </section>
      )

    case 'appearance':
      return (
        <section className="space-y-4">
          <SectionHeader title={title} />
          <Column>
            <AppearanceSettings titled={false} />
          </Column>
        </section>
      )

    case 'tokens':
      return (
        <section className="space-y-4">
          <SectionHeader title={title} />
          <Column>
            {/* The owner's only: research is collected once for everybody, so an
                artist has no agent of their own to give a credential to. And the
                route says the same thing again, because a card that is merely
                not rendered is still a URL. */}
            {owner && <AgentTokensCard titled={false} />}
          </Column>
        </section>
      )

    case 'admin':
      return (
        <section className="space-y-4">
          <SectionHeader title={title} />
          <Column>
            {/* Owners only, and the route says the same thing again. */}
            {owner && <AdminModeCard titled={false} />}
          </Column>
        </section>
      )
  }
}
