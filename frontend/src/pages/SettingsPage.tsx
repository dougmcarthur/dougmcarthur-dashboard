import { useState, type ReactNode } from 'react'
import { IntegrationsCard } from '../components/IntegrationsCard'
import { BandsintownCard } from '../components/BandsintownCard'
import { AssociationsCard } from '../components/AssociationsCard'
import { NudgeRoutingCard } from '../components/NudgeRoutingCard'
import { AppearanceSettings } from '../components/AppearanceSettings'
import { DigestSettingsCard } from '../components/DigestSettingsCard'
import { NotesBackfillCard } from '../components/NotesBackfillCard'
import { PasskeysCard } from '../components/PasskeysCard'
import { AgentTokensCard } from '../components/AgentTokensCard'
import { AdminModeCard } from '../components/AdminModeCard'
import { ProfileCard } from '../components/ProfileCard'
import { Tabs } from '../components/ui/Tabs'
import { useSession } from '../hooks/useSession'

/**
 * Settings, in four sections rather than one wall.
 *
 * It was a two-column grid of a dozen cards, every one on screen at once:
 * appearance beside integrations beside the digest, and your name alone in a
 * card of its own. Somebody coming here has one of four errands, and the tabs
 * are those errands.
 *
 * **Connections comes first and is the default,** because it is where every
 * link into Settings means to land: Google's consent round trip
 * (`#settings?google=…`) and the bell's "Calendar disconnected". A tab is
 * addressable — `#settings/reminders` is the digest's "switch this off" link —
 * so no link has to land on the wrong section and hope.
 *
 * Reference documents moved to the Artist page: they describe the artist, and
 * that is where the Library reads its facts from them.
 */
const SECTIONS = [
  { id: 'connections', label: 'Connections' },
  { id: 'reminders', label: 'Reminders & digest' },
  { id: 'account', label: 'Account' },
  { id: 'appearance', label: 'Appearance' },
] as const

export type SettingsSection = (typeof SECTIONS)[number]['id']

export function isSettingsSection(value: string | null | undefined): value is SettingsSection {
  return SECTIONS.some((s) => s.id === value)
}

function Columns({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
      <div className="space-y-8 min-w-0">{left}</div>
      <div className="space-y-8 min-w-0">{right}</div>
    </div>
  )
}

export function SettingsPage({ initialTab = null }: { initialTab?: string | null }) {
  const session = useSession()
  const [section, setSection] = useState<SettingsSection>(
    isSettingsSection(initialTab) ? initialTab : 'connections',
  )

  const choose = (next: SettingsSection) => {
    setSection(next)
    // Kept in the address so a reload, or a link somebody copies, returns to
    // the same section. replaceState, not a hash change: this is not a new
    // page, and the Back button should leave Settings rather than walk back
    // through its tabs.
    window.history.replaceState(null, '', `#settings/${next}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink tracking-tight">Settings</h1>

      <Tabs label="Settings sections" tabs={SECTIONS} active={section} onSelect={choose} />

      {/* Two columns once there is room, for the sections with more than one
          card: a single reading column pinned to the left banks empty pixels
          on a wide display. Appearance is one card and stays one column. */}
      {section === 'connections' ? (
        <Columns
          left={<IntegrationsCard />}
          right={
            <>
              <BandsintownCard />
              <AssociationsCard />
            </>
          }
        />
      ) : section === 'reminders' ? (
        <Columns left={<NudgeRoutingCard />} right={<DigestSettingsCard />} />
      ) : section === 'account' ? (
        <Columns
          left={
            <>
              <ProfileCard />
              <PasskeysCard />
            </>
          }
          right={
            <>
              {/* Beside Passkeys: both answer who and what can get in. */}
              <AgentTokensCard />
              {/* Owners only — and the route says the same thing again, because
                  a card that is merely not rendered is still a URL. */}
              {session?.role === 'owner' && <AdminModeCard />}
              {/* Renders nothing — heading included — unless there is something to fill. */}
              <NotesBackfillCard />
            </>
          }
        />
      ) : (
        <div className="max-w-3xl">
          <AppearanceSettings />
        </div>
      )}
    </div>
  )
}
