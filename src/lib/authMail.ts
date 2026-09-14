/**
 * The passkey setup code, as an email.
 *
 * Its own module because what it says is a security claim, and the claim it
 * used to make was wrong. It told the reader the code "does nothing on its
 * own, and adding a passkey still needs your device to approve it". The device
 * that approves is whichever device the code is typed into — so anybody who
 * reads the code can enrol a passkey of their own and get a session. They
 * cannot make a code go to themselves (the recipient is deployment
 * configuration, see `enrolmentRecipient`), but a code on a lock screen is
 * enough, and an email reassuring you it is harmless is the one that gets
 * glanced at and left there.
 *
 * So three rules, each guarded by test/emailTemplate.test.ts:
 *
 *  - **The code is not in the subject or the preheader.** Both are what a
 *    phone shows on a locked screen. It appears once in the body, below the
 *    instruction to enter it.
 *  - **It says what the code can do**: whoever enters it can add a passkey.
 *  - **It says what happened if you did not ask**: somebody pressed the button
 *    on the sign-in screen, which anybody can, and asking again cancels this
 *    code.
 */

import {
  panel,
  paragraph,
  renderEmail,
  monoType,
  type,
  escapeHtml,
  EMAIL_COLOURS as C,
  type RenderedEmail,
  type SenderIdentity,
} from './emailTemplate'

export function setupCodeEmail(input: {
  code: string
  ttlMinutes: number
  identity: SenderIdentity
}): RenderedEmail {
  const { code, ttlMinutes, identity } = input

  const body = [
    paragraph(
      `Enter this code on the sign-in screen to add a passkey. It works once and expires in ${ttlMinutes} minutes.`,
    ),
    panel(
      `<div style="${monoType(30, 700, 36, C.ink)}letter-spacing:0.18em;">${escapeHtml(code)}</div>`,
      { align: 'center' },
    ),
    panel(
      `<div style="${type(14, 400, 21, C.clayFg)}">` +
        `<strong>Don&rsquo;t share this code.</strong> Whoever enters it can add a passkey to your account. ` +
        `Nobody from Sun Dogs Music will ever ask you for it.</div>`,
      { tone: 'clay' },
    ),
    paragraph(
      `<strong style="color:${C.ink};">Didn&rsquo;t ask for this?</strong> Somebody pressed ` +
        `&ldquo;Email me a setup code&rdquo; on the sign-in screen, which anybody can do. ` +
        `Nothing has changed on your account. You can ignore this email: the code expires on its own, ` +
        `asking for another one cancels it, and your passkeys keep working.`,
      { muted: true, bottom: 8 },
    ),
  ].join('')

  const text = [
    `Enter the code below on the sign-in screen to add a passkey. It works once and expires in ${ttlMinutes} minutes.`,
    `Your code: ${code}`,
    `Don't share this code. Whoever enters it can add a passkey to your account. Nobody from Sun Dogs Music will ever ask you for it.`,
    `Didn't ask for this? Somebody pressed "Email me a setup code" on the sign-in screen, which anybody can do. ` +
      `Nothing has changed on your account. You can ignore this email: the code expires on its own, ` +
      `asking for another one cancels it, and your passkeys keep working.`,
  ].join('\n\n')

  return renderEmail(
    {
      subject: 'Your passkey setup code',
      preheader: `Expires in ${ttlMinutes} minutes. Don't share it — whoever enters it can add a passkey.`,
      heading: 'Your passkey setup code',
      body,
      text,
    },
    {
      kind: 'transactional',
      reason: 'You received this because a passkey setup code was requested for your Sun Dogs Music Scout account.',
    },
    identity,
  )
}
