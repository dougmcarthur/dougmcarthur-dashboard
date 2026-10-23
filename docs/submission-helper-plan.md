# Getting the answers into the form: a submission helper

> **Status, 2026-10-23: step 1 is built (the pop-out answers window), steps 2
> and 3 are not scheduled.** This weighs every route found for the step after
> staging: the artist has approved answers in Scout and has to get them into
> somebody else's form. It does not repeat `docs/submission-assist-research.md`,
> whose findings still stand (which platforms pre-fill, Web Store rules, what a
> model-driven browser costs). It changes that document's order of work and adds
> the options it never weighed. "The pop-out window, as built" below records
> what was measured and what was made.

## What any helper has to do

These come from rules the rest of the repository already holds, so an option
that breaks one is out whatever else it offers.

1. **The artist presses Submit, always.** Scout drafts and never sends, and the
   terms say so. Whatever fills the form must not be able to submit it, and
   must stop at a payment field.
2. **Only answers the artist read are filled.** `answer_state` is `approved` or
   `edited`. A `suggested` answer stays out, as it does from the Google Forms
   pre-filled link (`shared/formPrefill.ts`).
3. **An over-long answer is worse than an empty box**, so `max_length` is
   checked before anything is written into a field.
4. **No new way into an account.** A passkey is the login. A credential for a
   helper is minted behind a passkey touch, is revocable, and reaches a handful
   of routes, the way `shared/agentRoutes.ts` limits the research agents.
5. **Nothing leaves the artist's control without them knowing where it goes.**
   The privacy policy promises no AI service without asking and no outside host
   on its own pages.
6. **It works where the pain is.** The forms an artist dreads are login-walled
   (Submittable) or drawn by JavaScript (Typeform, Tally, Airtable). Today a
   gig on one of those is `prep_status = blocked`, with no staged answers at
   all, because the Worker cannot log in and cannot run the page.
7. **It is cheap to keep alive.** This is a near-zero-spend project with a few
   testers. A design that needs weekly attention is a design that stops
   working.

## What is new since September

- **Document Picture-in-Picture now covers Firefox too.** Chrome and Edge from
  116 by Chrome's documentation (one tracker says 130), Firefox from 151
  (May 2026), Safari not at all, no mobile browser.
- **Claude in Chrome is generally available on every paid Claude plan**
  (2026-08-26). It fills forms in the person's own logged-in session. It
  "automatically approves actions it determines to be safe" unless that is
  switched off, and the page does not say whether it stops before Submit.
- **Chrome's own agent, auto browse, launched 2026-01-28** as a preview for
  Google AI Pro and Ultra subscribers in the US.
- **WebMCP is in a public origin trial in Chrome 149.** It needs the *site* to
  publish tools, which no festival form will.
- **Cloudflare Browser Run has a human-in-the-loop mode** (changelog
  2026-07-28): a script drives a hosted browser and a person takes over in a
  Live View tab, meant for MFA, CAPTCHAs and credentials.
- **Submittable ships its own applicant extension**, Grant Form Autofill. It
  autofills Submittable forms from an answer library kept *inside Submittable*,
  has about 100 users and was last updated in March 2025. Nothing can feed it
  from Scout, so it is not something to build on.

## The options, weighed

| Option | Gets text into the form | Login-walled forms | Uploads | Scout's rules enforced by | Artist installs | Cost to build and keep | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pop-out answers window (Document PiP, popup fallback) | By hand, copy and next | Yes, never touches the form | No | Nothing to enforce, it cannot submit | Nothing | Small | **Do first** |
| Chrome extension | Fills | Yes, and reads them | Yes | Code | One extension | Large, ongoing | **The destination** |
| Agent brief (Claude in Chrome, Gemini, any) | The agent fills | Yes | Maybe | A sentence in a prompt | A paid plan and their own extension | Small | **Offer, and measure** |
| Remote MCP connector for the artist's Claude | In chat only | n/a | n/a | n/a | Connector setup | Medium, new front door | Defer |
| Desktop app with a built-in browser | Fills | Only by logging in again inside it | Yes | Code | Signed installer | Largest | No |
| Hosted browser, human takes over | Fills | No: they type logins into a browser Scout runs | Yes | Code | Nothing | Medium | Reading only |
| Scout beside the form in an iframe | By hand | No | No | Cannot submit | Nothing | Small | No |
| Bookmarklet | Fills the top frame | Yes | No | Code | Drag a link | Medium | No |
| Snippet export (Espanso, TextExpander) | Library entries only | Yes | No | n/a | A text expander | Small | Maybe later |
| Pre-filled links | Fills | No | No | Code | Nothing | Done | Keep |

### Pop-out answers window

A button on the application panel opens the field list (or *Answers at hand*)
in a small always-on-top window above the form's tab: one Copy per field, a
copy-and-next key, the character count against `max_length`. Document
Picture-in-Picture gives the always-on-top part, with a plain `window.open`
popup for Safari. It is Scout's own page in Scout's own session, so there is no
new credential, no store review and no install, and it works on a login-walled
form because it never touches one. `AnswersPanel.tsx` and
`ApplicationPanel.tsx` are most of its contents already.

It does not remove the paste, cannot attach a file, and cannot see the form, so
it does not know which field is which. And for a `blocked` gig it has no field
list to show, only the library, because Scout never read that form.

### Chrome extension

Still the right end state, for reasons that did not exist when it was first
proposed:

- It is the only option that **reads a login-walled form**. In the artist's own
  session it sees the rendered fields and sends them back, so Scout can stage
  answers for exactly the gigs that are `blocked` today. Browser Run cannot,
  because it has no login.
- It enforces rules in code. It fills only approved answers, only on the host
  Scout recorded for that gig, never clicks Submit, and stops at a payment
  field. An agent only has these as instructions.
- It sees the confirmation page, which is the free "submitted" signal
  `docs/inbound-mail-research.md` found.
- It covers artists with no paid AI plan.

Build it so that the first version needs no cleverness. A side panel listing
the fields with **Insert into the focused field** has no matching problem,
because the artist chose the field. *Fill all matched* comes after, reusing
`classifyQuestion`, then reading blocked forms, then files, then confirmation
evidence. The panel is the same list the pop-out window shows, built as a
component that takes its data as props so it works in both.

The cookie is `SameSite=Lax` and `HttpOnly`, so an extension cannot lean on the
session. Pairing is as `submission-assist-research.md` described: the
artist approves the extension with a passkey touch and it holds a revocable
bearer in its background worker. It should be a new credential kind, narrower
than an agent token (agent tokens are the owner's alone): read one gig's
approved answers, post the fields it read, post edits, post a confirmation.
What the page sends back is strings from a stranger's markup, so the route
takes a strict, length-bounded schema and treats it like a polled source.

### Agent brief

A **Copy as agent brief** button: the approved answers, the fields, and the
rules (fill only these, never submit, never pay, stop and ask on anything
else), as text the artist pastes into whatever agent they use. It is
agent-agnostic, so Claude in Chrome, Chrome's auto browse and the next one all
work without Scout knowing about any of them. It costs about as much as the
Copy buttons, and nothing leaves Scout except by the artist pasting it.

The case against making it *the* helper is the extension's list of strengths
read the other way: the "do not submit" rule is a sentence the agent may or may not honour, there is no
independent measurement of how well any of these fill a form, the same request
can come back different, a page can contain text aimed at the agent, and it
needs a paid plan and desktop Chrome. The brief must say, in the dialog, that
pasting it into an AI service sends those answers to that service.

Because no accuracy figure exists for this job, **measure it** rather than
argue: see "What to measure" below.

### Remote MCP connector

Scout as a custom connector would let an artist's Claude read approved answers
and gig fields in chat (custom connectors are open to Free, Pro and Max, Free
capped at one; Cloudflare hosts remote MCP servers with OAuth). It helps with
*writing* an answer, not with getting one into a form, and it opens a second
front door on the Worker with its own sign-in. Not now.

### Rejected, and why

- **Desktop app with a built-in browser.** Everything the extension does, plus a
  signed installer for each OS (cost not researched), an updater, and a browser
  the artist has to log into every portal on again with no saved sessions or
  password manager. An embedded browser is also the likeliest thing to trip
  bot detection. Strictly more work for strictly less.
- **Hosted browser with a human taking over.** Cost is not the objection, since
  Workers Paid includes 10 browser-hours and extra ones are $0.09. The
  objection is that the artist would type their Submittable password into a
  browser Scout runs, which is the thing `submission-assist-research.md` ruled
  out. It stays a *reader* for JavaScript-drawn forms with no login.
- **Scout beside the form in an iframe.** Measured on 2026-10-23: Submittable's
  login sends `X-Frame-Options: DENY`, Tally's root `DENY`, Airtable's root
  `SAMEORIGIN`, while FestivalPro and Canmore's page send nothing. So it works on
  the plain sites that were already easy and fails on the platforms where help
  matters, and a login or passkey inside a frame is a further problem. Those were
  root pages, not live forms, so the platforms' embed pages may differ, but the
  pop-out window gives the same layout without depending on the form's
  headers.
- **Bookmarklet.** It could bridge to a Scout popup with `postMessage` and
  hold no token, but it runs only in the top frame, a page whose
  Content Security Policy forbids inline script blocks it (Firefox has had that
  bug open since 2013, and I could not confirm Chrome's 2026 behaviour), it cannot
  attach files, and an update means re-dragging a link. Develop the fill engine as
  pure functions in `shared/`, tested against saved forms like `parseFestivalProForm`
  is, and ship it in the extension.
- **Userscript managers.** Asks the artist to install somebody else's extension
  before ours.
- **Computer use (screenshots and a mouse).** Slower and dearer than the same
  agent working from the page, for no gain on a web form.
- **Browser autofill and password managers.** They hold contact details, not a
  150-word bio.

### Watch, not build

WebMCP and Chrome's auto browse. Neither needs anything from Scout beyond the
brief above, and neither is established enough to design around.

## The pop-out window, as built

A button on the application panel ("Pop out answers") and an icon in the side
column's header (on the Answers panel) open a window above the form. It lists
the application's questions in the form's order, each with its answer, a Copy
button, the character count against the form's limit, and "This one is right"
for a suggestion the artist has just read. Enter copies the highlighted answer
and moves to the next one that has something in it; the arrow keys move without
copying. A second tab holds *Answers at hand*, and it is the tab a form Scout
could not read opens on. It writes one thing, approving an answer, and cannot
reach the form. In admin mode and on a phone it is not offered.

**What was measured first.** A throwaway page, then the real app, driven in the
installed Chrome (155, Windows 11) over the DevTools protocol with trusted mouse
and key input, and the Windows clipboard read back afterwards as the witness, so
a write the browser refused could not pass as a success.

| Question | Answer |
| --- | --- |
| Does a copy from a click inside the window reach the clipboard? | Yes, through the window's **own** `navigator.clipboard`, and through `execCommand('copy')` on a textarea in its document. |
| And through the app's `navigator.clipboard`, the one every other button uses? | **No.** "Document is not focused", every time: the window is focused, the page that owns the code is not. This is the trap. |
| With the app in a background tab, which is the normal state? | Copying works, and the window's own DOM updates from the app's handlers. |
| Does Enter work as a copy key? | Yes. |
| Does the app's stylesheet carry across? | Yes. A linked sheet is copied by its absolute address and an inline one by text. Fonts load, a relative `url()` resolves (the window inherits the app's base address), and the window is in standards mode. |
| Does the theme follow? | Yes, by watching the attributes on `<html>`. Switching theme in the app switches the window. |
| Does the size asked for hold? | Yes: 380 by 640, bottom right of the screen, 240px the narrowest. **A Chrome launched with a fixed `--window-size` ignores the request**, which looks like the API refusing and is a fact about the test rig. |
| What ends it? | The page that opened it going away: a reload, a sign-out redirect, closing the tab. A change of `#` route does not. It reopens from the button. |

**Two things the real app found that the spike could not.** The copy buttons
carry screen-reader text that is absolutely positioned. In the app that is
harmless, because the column is a positioned element. In the window there was no
positioned ancestor, so that text was placed against the whole document,
stretched it, drew a second scrollbar, and let `scrollIntoView` move the header
out of view. The shell is now positioned and clipped, and the highlighted row is
brought into view by scrolling the list alone. Both are pinned in
`test/popOut.test.ts`, which was checked by breaking each finding on purpose and
watching it fail.

**Where it lives.** `frontend/src/popOutWindow.ts` opens and mirrors the window;
`frontend/src/components/PopOut.tsx` is the provider (in `Layout`, so changing
page does not end the window), the window's shell and the button;
`frontend/src/components/AnswerSheet.tsx` is the list; `frontend/src/clipboard.ts`
is the one place text is written to a clipboard, taking the window that was
clicked; `shared/answerSheet.ts` is the pure part. `CopyButton` now takes its
window from the button that was pressed, so every Copy in the app works from
inside the pop-out.

**Not verified.** A physical mouse click (the input was trusted but synthetic),
Firefox 151, Safari and the pop-up fallback path, macOS and Linux, and a second
monitor. The fallback is written and reasoned through, and nobody has opened it.

## Recommended order

1. **Pop-out answers window. Built, see above.** Small, no install, no new
   credential. It also builds the field-list component the extension's panel
   needs, so none of it is thrown away. Done when an artist finishes a real
   application without switching windows, which nobody has yet, so the owner's
   next real application is the test. Shows the *Answers at hand* column too, so
   a `blocked` gig is not left with nothing.
2. **Agent brief, with a measured trial by the owner.** Small. The result
   decides how much the extension is worth, and the button is useful whatever
   it shows.
3. **The extension, in the stages above.** Large. Go once the owner decides it
   is wanted; the research's costs and review rules are in
   `submission-assist-research.md`. Chrome, Edge and Brave on a desktop first,
   a Firefox port later, Safari and phones not at all (pre-filled links and Copy
   are what a phone gets).

## What to measure

The owner has Claude in Chrome. Take about ten real forms across the shapes
that matter (a Submittable call, a Google Form, FestivalPro, a Typeform or Tally
form, a plain festival page, one with a file upload and one with a fee), give the
agent the brief, and for each form record:

- fields filled correctly, wrongly, left empty, and any over `max_length`;
- whether it touched a field the brief did not mention;
- whether it clicked Submit, or went near the payment step, without being asked;
- what the form said or did when it did.

A bar worth proposing: no unrequested submit and no wrong answer in a field the
brief covered, on any of the ten. One failure to hold that is the finding, and
the brief stays a convenience rather than a feature Scout recommends. This is the
owner's call to set, and I made the number up.

## Decisions for the owner

1. **Is the extension still the destination?** Recommended yes, for the reasons
   above, but it is the biggest piece of work and step 2 may say it can wait.
2. **A narrower credential for artists.** Recommended a new token kind rather
   than reusing agent tokens, because those are owner-only by design.
3. **Wording of the brief dialog.** It sends answers to a service the artist
   chooses. The privacy policy and the terms say Scout does not do that without
   asking, so this is the "asking".
4. **Whether to export snippets** for a text expander. It is cheap and covers
   the library, not per-form answers, so it is parked.

## Not yet checked

- Anything about the pop-out window beyond what "as built" lists as measured:
  a real mouse click, Firefox 151, the pop-up fallback, macOS.
- Frame headers on live form pages rather than root pages.
- Whether Chrome today lets a bookmarklet through a strict CSP.
- What Claude in Chrome does at a Submit button in auto-approve mode, and what
  it costs against a plan's usage.
- Whether Chrome's auto browse is open to Canadian accounts.
- What Windows and Mac code signing would cost for a desktop app, and whether
  Browser Run's browsers identify themselves as bots.

## Sources

- [Document Picture-in-Picture, browser support](https://www.rabbitpair.com/en/products/dualpip/faqs/document-pip-browser-limits) and [Chrome's documentation](https://developer.chrome.com/docs/web-platform/document-picture-in-picture)
- [Claude in Chrome is generally available](https://claude.com/resources/articles/claude-in-chrome-generally-available) and [using it safely](https://support.claude.com/en/articles/12902428-using-claude-in-chrome-safely)
- [WebMCP origin trial](https://developer.chrome.com/blog/ai-webmcp-origin-trial)
- [Chrome auto browse](https://alternativeto.net/news/2026/1/google-launches-a-new-ai-agent-style-auto-browse-tool-for-task-automation-in-chrome)
- [Cloudflare Browser Run, human in the loop](https://developers.cloudflare.com/browser-run/features/human-in-the-loop)
- [Submittable Grant Form Autofill](https://chromewebstore.google.com/detail/ghopadabobbldneolekpndkddnjjdfmg)
- [Firefox bug 866522, bookmarklets and CSP](https://bugzilla.mozilla.org/show_bug.cgi?id=866522)
- [Claude custom connectors](https://support.claude.com/en/articles/11175166)
