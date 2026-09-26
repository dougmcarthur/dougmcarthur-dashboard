import { api } from '../api'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'

/**
 * What connecting Google lets Scout do, said before Google's own screen does.
 *
 * Gmail is the permission that decides whether people trust this. The
 * narrowest one Google offers for drafting also lets the holder read, change
 * and delete drafts and send mail as you — there is no drafts-only option — so
 * the promise that nothing goes out on its own is kept by this app, not by
 * Google. Google's consent screen shows a checkbox and a sentence; a person
 * deciding whether to hand over their mail deserves the whole picture first,
 * and a way to say no that means Google never asks.
 *
 * Two rules the wording keeps:
 *
 *  - **It is exact in both directions.** It says what the permission allows
 *    — more than Scout uses — and also what it does not: this permission
 *    cannot read an inbox, so the screen says so. Scaring somebody with a
 *    claim that is not true is its own kind of dishonesty.
 *  - **No is a first-class answer.** "Connect without Gmail" is the primary
 *    button and requests a consent that never mentions Gmail
 *    (`/api/google/connect?gmail=skip`). Everything Gmail drafting does has a
 *    path that needs no access at all — Copy, and the open-in-Gmail button on
 *    every draft — and the screen says that too.
 *
 * `mode` is `bundle` for "Connect Google account" and "Add them", and `gmail`
 * for the places that connect Gmail drafting on its own. Every route to the
 * Gmail permission comes through here; `test/uiConsistency.test.ts` fails if
 * one goes straight to Google.
 */
export type GoogleConsentMode = 'bundle' | 'gmail'

export function GoogleConsentModal({
  mode,
  gmailHref,
  onClose,
}: {
  mode: GoogleConsentMode | null
  /** Where "Continue" goes in `gmail` mode: drafting's own consent, or another account's. */
  gmailHref?: string
  onClose: () => void
}) {
  const go = (href: string) => {
    window.location.href = href
  }

  return (
    <Modal
      open={mode !== null}
      onClose={onClose}
      title={mode === 'gmail' ? 'Before you connect Gmail' : 'Before Google asks'}
      subtitle={
        mode === 'gmail'
          ? 'Gmail is optional. Here is what it allows, and what you get without it.'
          : 'What connecting your Google account lets Scout do. Gmail is optional.'
      }
      closeLabel="Cancel"
    >
      <div className="space-y-4 text-sm">
        {mode === 'bundle' ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-ink">Calendar, Tasks and Drive</h3>
            <ul className="space-y-1.5 text-xs text-body">
              <li>
                <span className="font-medium text-ink">Calendar</span> — makes one calendar,
                called Sun Dogs Music Scout, for shows you have confirmed. It cannot see your other
                calendars.
              </li>
              <li>
                <span className="font-medium text-ink">Tasks</span> — adds deadlines and replies
                you owe to one task list. Google’s permission covers your other lists too; Scout
                only uses its own.
              </li>
              <li>
                <span className="font-medium text-ink">Drive</span> — one folder for your EPK, and
                files you pick for it. It cannot see anything else in your Drive.
              </li>
            </ul>
          </div>
        ) : null}

        <div className="space-y-2 rounded-lg border border-warn-line bg-warn-bg px-3.5 py-3">
          <h3 className="text-xs font-semibold text-warn-fg">Gmail — optional, and worth reading first</h3>
          <dl className="space-y-2 text-xs text-body">
            <div>
              <dt className="font-medium text-ink">What it is for</dt>
              <dd>Scout writes sync pitches straight into your Gmail drafts, for you to read and send.</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">What Google’s permission allows</dt>
              <dd>
                Seeing, changing and deleting your drafts, and <strong>sending email as you</strong>.
                Google has no narrower permission for drafting.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">What Scout does with it</dt>
              <dd>
                Creates drafts, and nothing else. It never sends: there is no send code in Scout, and
                the build fails if any appears.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">What it cannot do</dt>
              <dd>Read your inbox. Google does not allow that with this permission.</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">You do not need it</dt>
              <dd>
                Every draft in Scout already has Copy and Open in Gmail. Without this permission you
                lose one thing: dropping several pitches into your drafts at once.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Changing your mind</dt>
              <dd>
                Disconnect in Settings at any time, or remove Scout from your Google account at{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noreferrer"
                  className="text-info-fg underline"
                >
                  myaccount.google.com/permissions
                </a>
                .
              </dd>
            </div>
          </dl>
        </div>

        {mode === 'bundle' ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => go(api.google.connectWithoutGmailHref)}>
                Connect without Gmail
              </Button>
              <Button variant="neutral" onClick={() => go(api.google.connectHref)}>
                Include Gmail drafting
              </Button>
            </div>
            <p className="text-xs text-muted">
              Google shows each service with its own checkbox next, so you can still leave any of
              them out there.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="neutral" onClick={() => go(gmailHref ?? api.gmail.connectHref)}>
              Continue to Google
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
