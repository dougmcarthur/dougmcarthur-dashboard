# Filling an application, and how Scout would know it was sent

> **Status: researched, not scheduled, 2026-09-16.** The extension is not being
> built yet either. One piece of it is cheap and separable whenever it is
> wanted: **pre-filled links for Google Forms**, where Scout already reads the
> field ids, needs no extension, no store review and no new permission, and is
> the only route that works on a phone. Airtable is the same mechanism. Every
> other platform needs field names from the form's builder, so the rest of the
> plan does not follow from that first step being easy.


Phase 3 reads a form and stages an answer per field. It stops there, because
an application filed by automation is a good way to be blacklisted. This
document is about the step after that one: getting the staged answers *into*
the form, and learning that the artist pressed Submit.

It exists because the research that was meant to settle it ran out of session
twice. What is written down here is the reasoning, which survives; every
claim that depends on somebody else's current documentation or pricing is
marked **(check)** and listed at the end, so the next run verifies a short
list rather than re-deriving the argument.

## The answer: an extension in the artist's own browser

Build a normal Chrome extension that fills form fields from page structure.
No AI model, no headless browser driving the submission.

A headless browser driven by a model is the wrong tool, for four reasons that
are all about the *session* rather than the intelligence:

- It runs in a browser that is not the artist's, so it cannot use a login they
  already have. It would have to hold or replace their password.
- It trips CAPTCHAs and bot detection, and Scout must not try to get around
  those — a festival flagging the artist is a worse outcome than a form filled
  by hand.
- It cannot hand a filled form back for a human to check. The artist pressing
  Submit is the line this app has never crossed, and a remote browser either
  crosses it or stalls.
- It costs money per form, minutes per form, and is brittle at exactly the
  sites that matter.

An extension inverts all four: the artist's own session, their own cookies,
no bot detection to trip, and the filled form is in front of them with their
own Submit button. That is the same line password managers and browser
autofill already hold.

**Headless keeps one job**: *reading* a JavaScript-built form once, when the
application is prepared. See "What headless is good for" below.

## Four corrections to the plan as first written

In order of how much they change it.

1. **The extension makes submission near-certain, not certain.** Three
   signals, increasing in strength: the Submit button was clicked (weak — a
   click is not an outcome); a confirmation page appeared, e.g. "Thanks, your
   application has been received" (strong); a receipt email matched (strongest,
   and the reason the inbound-mail question exists at all — see
   `docs/inbound-mail-research.md`). Have the confirmation page mark the gig
   submitted, and record what was seen and when as evidence beside it.

2. **Scout has no Google sign-in, and should not grow one for this.** Login is
   a passkey. Adding Google login just so an extension can authenticate would
   be a second way into the account. **Pairing** is the cleaner shape: the
   extension opens Scout, the artist approves it with their passkey — the same
   touch that already guards minting an agent token — and the dashboard hands
   back a revocable, per-artist token limited to a few routes: read the
   approved answers, report fill progress, update status. That is exactly the
   shape `shared/agentRoutes.ts` already holds for the research agents. If
   Google sign-in ever arrives with multi-artist accounts, it can be added
   then.

3. **"Application in progress" already exists.** It is `preparing`, and
   *Start preparing* is already the button. No new status: the extension moves
   the gig there when the artist opens the form from Scout.

4. **It keeps the rule that Scout never submits.** The extension fills, and
   highlights the Submit button. The artist clicks it. It also has to stop at
   payment fields, because some intakes charge an entry fee, and "never pay
   for anything" is a rule the research agents already hold.

## How it would work

1. **Approve first.** On the gig screen the artist reviews and approves each
   staged answer. That approval already exists — *This one is right* — and
   only approved answers are ever filled. A suggestion is not an answer.
2. **Open from Scout.** *Open the application* tells the extension which gig
   and which URL, over Chrome's page-to-extension messaging
   (`externally_connectable`), and moves the gig to `preparing`.
3. **Ask for that one site.** On arrival the extension requests permission for
   the site it is on — "Allow on jotform.com?" — never for every website up
   front. A side panel lists each field beside its approved answer.
4. **Fill.** The artist clicks *Fill form*. Fields are matched by label, name
   and accessibility attributes, against the question kinds Scout already
   assigns (`classifyQuestion`). The panel names what it could not place.
5. **Edits flow back.** When a filled value is changed in the live form, the
   extension offers to save the change to Scout — otherwise Scout stops being
   the record of what was actually sent.
6. **Confirm.** The artist submits. When a confirmation page loads, the
   extension reports "submitted, confirmation page seen" with the URL and the
   time, and Scout stores that as evidence.

## Knowing what you are dealing with, before you get there

Scout's form reader already does part of this: it reads Google Forms field
data out of the page, detects login walls from phrases like "sign in to
apply", flags JavaScript-built forms on Typeform, Airtable, Tally and Fillout,
parses plain HTML forms, and says when there is no form on the page at all.
That should grow into a stored *form profile* per application.

| Platform | Approach |
| --- | --- |
| Google Forms | Pre-filled link (`entry.<id>` parameters). Scout already reads the field ids. |
| Jotform, Wufoo, Airtable, Cognito Forms, Formstack, Microsoft Forms | Pre-filled link via URL parameters **(check, per platform)** |
| Typeform, Tally, Fillout | Extension fills the page; URL parameters mostly cover hidden fields only **(check)** |
| Submittable, portals behind a login | Extension, inside the artist's logged-in session |
| Squarespace, Wix, WordPress plugins, custom sites | Extension's general filler, plus per-platform adapters over time |
| Forms embedded in an iframe | Extension, with permission for the iframe's own origin (e.g. `form.jotform.com`) |

**What headless is good for**: forms built with JavaScript, where the reader
today can only say "renders its form with JavaScript". Load the page once in a
hosted browser and read the fields — fixed code, no model, seconds of browser
time, once, at prepare time. A cheap model could help match ambiguous labels
to question kinds at that same point, with the result saved rather than
re-derived.

## Cost

| | Money | Processing | Reliability |
| --- | --- | --- | --- |
| Pre-filled links | Nothing | Nothing | High, where supported |
| Chrome extension | $5 one-time Chrome Web Store fee, nothing per use | Runs on the artist's machine, instantly | High on the main platforms; custom sites need maintenance |
| Headless pre-reading (Cloudflare Browser Rendering) | Some browser time included with Workers Paid, then paid by the hour **(check current pricing)** | Seconds per form, once | Good for reading; no help with logins |
| Headless browser driven by a model | Screenshots and growing context put it around **$0.30–$0.65 per form (check — measure before trusting)** | Minutes per form | Brittle: fails on logins and CAPTCHAs, cannot hand back a filled form |

The agents-in-CI experience is the cautionary figure here: two runs spent $20
of API credit and filed nothing, because server-side search put every result
into one compounding context. A model driving a browser has the same shape.

## Other considerations

**Chrome Web Store review.** A broad "all websites" permission triggers a
scary install warning and extra scrutiny; per-site requests avoid both.
Extensions may not download code at runtime, so platform adapters ship inside
the extension — field-mapping *rules* can still be data fetched from Scout. A
privacy policy is required. The listing can start unlisted, reachable by link,
for invited artists. **(check: current Web Store program policies.)**

**Security.** The paired token lives only in the extension's background
service worker, never in the page, because form pages are untrusted. Messages
are accepted only from Scout's own origin. Tokens are revocable from Settings,
like agent tokens.

**Hard fields.** Framework-controlled inputs need specific events dispatched
or the site ignores the value. Custom dropdowns, rich text boxes and date
pickers each need handling. Multi-page wizards, and questions that appear only
after an earlier answer, need filling in rounds. Upload fields are an
opportunity rather than a problem: the extension can attach a press photo
straight from the artist library.

**Where it cannot help.** Chrome on Android and iOS does not run extensions,
so applying from a phone gets nothing — pre-filled links still work there.
Edge, Brave and Arc run the same extension; Firefox takes small changes;
Safari needs a Mac app wrapper and the $99/year Apple developer programme
**(check)**.

**Maintenance.** Platforms change their markup. Adapters for the top five plus
a general filler is a real ongoing cost, and wants its own tests against saved
copies of each platform's form.

**Where it lives.** A new `extension/` folder in this repository, sharing
types with `shared/`, built with an extension framework such as WXT
**(check)**.

## Suggested order

1. **Pre-filled links, no extension.** Google Forms first, since the field ids
   are already read, then the other URL-parameter platforms. Quickest win, and
   the only one that works on a phone.
2. **Extension MVP.** Passkey pairing, side panel, plain HTML and Google
   Forms, `preparing` on open, confirmation-page detection feeding the
   evidence record.
3. **Adapters.** Typeform, iframed forms, Submittable, then file uploads.
4. **Headless pre-reading** for JavaScript-built forms.

## Decisions still open

1. **Pairing**: passkey pairing from the dashboard, or is Google sign-in
   wanted despite being a second way in?
2. **The confirmation page**: does seeing it mark the gig submitted, or
   propose it for one click?
3. **Pre-filled links first**: build those before the extension?
4. **The accidental branch**: merge or roll back the one that went live.

## The (check) list this research has to settle

1. Per-platform pre-filled-link support: Jotform, Wufoo, Airtable, Cognito
   Forms, Formstack, Microsoft Forms — and whether Typeform, Tally and Fillout
   really only take hidden fields.
2. Cloudflare Browser Rendering: what is included with Workers Paid, and what
   it costs beyond that.
3. What a model-driven browser actually costs per form.
4. Chrome Web Store: host-permission review, remotely hosted code, privacy
   policy, unlisted listings. Plus WXT, and the Firefox and Safari ports.

## What the research found

### Check list item 1 — pre-fill is common; *discovering the field ids* is not

Read 2026-09-16 against each platform's own documentation.

| Platform | Pre-fill | Mechanism | Field ids from the public page? |
| --- | --- | --- | --- |
| Google Forms | Yes | `?entry.<id>=value` | **Yes** — the `name` attribute on the rendered inputs |
| Airtable | Yes | `?prefill_<Field Label>=value` | **Yes**, by label |
| Jotform | Yes | `?<uniqueName>=value` | No — the unique name is set in the builder |
| Wufoo | Yes | `?field<N>=value` | No — needs the account's API info panel |
| Cognito Forms | Yes | `?entry={JSON}` by internal name | No — internal name is not the label |
| Formstack | Yes | `?<Field Label>=value` | Probably, by label (unconfirmed). No free plan |
| Tally | Yes | URL param → hidden field → question's default answer | No — the author pre-declares the hidden field |
| Fillout | Yes | Parameter registered in settings → default value | No — must be registered first |
| Microsoft Forms | **No** | None official | — |
| Typeform | **No** | Hidden fields recall into question *text* only | — |
| Submittable | **No** | Nothing documented anywhere | — |

**The plan's suggested order was wrong about step 1, and this is the
correction.** It said: Google Forms first, "then the other platforms with URL
parameters". But pre-fill support is not the binding constraint — **knowing
what to call the fields is**. Only **Google Forms and Airtable** yield their
field keys from the public form page. Every other supporting platform needs the
internal name from the form's builder, which means the cooperation of whoever
set the form up. A festival is not going to do that, and Scout will never have
builder access.

So the honest scope of "pre-filled links, no extension" is **Google Forms, plus
Airtable**, plus any single form somebody reconnoitres by hand once. That is
still worth building — it is free, it works on a phone, and Scout already reads
Google Forms field ids — but it is one or two platforms, not a tier of them.

**Typeform is a harder dead end than the brief guessed.** The brief marked it
"URL parameters mostly cover hidden fields only (check)". It is worse: a hidden
field can only be *recalled into question or description text*, never used to
fill a visible answer. Confirmed from Typeform's developer documentation and
corroborated in their community forum. It is also gated behind a paid plan. The
extension is the only route there.

**Submittable has no pre-fill at all**, and submitting requires an account.
That is not a disappointment — it is the case *for* the extension. Submittable
is a major arts and grants platform, and it is exactly the shape the extension
handles best and links cannot touch at all: a real form behind a login the
artist already has.

**The leak note, which changes where this may be used.** Every URL mechanism
puts answers in plaintext in the URL: browser history, the `Referer` header
sent to the platform and to any analytics on the page, server logs, and
anywhere the link is copied. There is no out-of-URL pre-fill channel on any
platform. This is the same shape as the `mailto:` decision already made in this
repository — the handler is offered where it is safe and Copy is never
withheld — and it wants the same treatment: **pre-filled links for
low-sensitivity fields, and Copy as the fallback for anything else**. A
pre-filled link is not a private channel and should not be described as one.

### Check list items 2–4 — the headless reader is free, and the model-driven browser fails on accuracy before cost

Read 2026-09-16.

**Browser Rendering is now "Browser Run"** (rebranded 2026-04-15, same product
and API), and **Workers Paid already includes 10 browser-hours a month and 10
concurrent browsers**. Beyond that it is **$0.09 per browser-hour** and **$2
per additional concurrent browser** — the latter only for stateful sessions
through the binding, not stateless REST calls. Opening one form, reading the
rendered DOM and closing it, at this app's volume, stays inside the included
allowance comfortably.

So the brief's "(check current pricing)" resolves in the most favourable way
available: **the headless pre-reader costs nothing**, on a plan already being
paid for, and it is cheaper per hour than Browserbase, Steel or Browserless,
none of which beat an allowance that is already included.

**The model-driven browser's cost could not be corroborated, and something
worse than cost showed up.** No independent per-form benchmark exists — a real
gap, recorded rather than filled. The closest measured figures are Browser
Use's own benchmark (2026-08-01, 106 hard live-site tasks, cost per task
*solved*): from $0.17 at 82% success for their own agent, through $1.55 at 59%,
to $3.40 at 62% for a general computer-use model. The brief's $0.30–$0.65
estimate sits inside that range and is not contradicted — **treat it as
reasonable and still unverified**.

But the number to look at is not the dollars, it is the **success rate: 37% to
82% on general web tasks, on a vendor's own benchmark**. The brief argued
against a model-driven browser on cost, credentials and CAPTCHAs. The stronger
argument was available and not made: at those rates, roughly one application in
four goes wrong, and a festival application is not a task you retry — a wrong
answer submitted is submitted. Cost was never the real case against it.

**Chrome Web Store, four rules that bear on the design:**

1. **Config-as-data is allowed, and this is the favourable one.** Chrome's
   remotely-hosted-code policy says explicitly that it "does not include data
   or things like JSON or CSS". So fetching **field-mapping rules as JSON**
   from Scout at runtime is permitted — which is what the brief hoped. The
   limit is sharp and worth respecting: a mini scripting language fetched as
   data and interpreted by the extension is explicitly closed. Keep remote
   JSON flat and declarative, keep every interpreter inside the package.
2. **Unlisted and private listings get the same review.** Only discoverability
   differs. For invited artists, **private** — restricted to named Google
   accounts — is the right fit. It buys audience control, not leniency.
3. **Broad host permissions are a scrutiny risk, not a rejection risk.**
   `<all_urls>` triggers a dashboard warning that review may be delayed and a
   frightening install prompt; `activeTab` with optional host permissions
   avoids both, and runtime-granted permissions are reported to convert about
   30% better at install. A form filler will land in manual review either way,
   but the per-site design is still right.
4. **The privacy regime tightened on 2026-08-01 and is live now.** All data
   collection must be prominently disclosed regardless of how close it is to
   the extension's single purpose, changes must be disclosed proactively, and a
   privacy policy link is mandatory. An extension holding form answers is
   squarely in scope.

**The rest, confirmed:** the $5 registration fee is unchanged; review runs from
about two days to a few weeks, with broad-permission extensions at the slow
end; **WXT is actively maintained** and is the current cross-browser MV3
consensus; the Firefox port is mostly mechanical; and **Safari still requires an
app wrapper and the $99/year Apple Developer Program** — WWDC 2026 removed the
Xcode-and-a-Mac requirement for building and submitting, not the wrapper or the
fee.

### The check list, resolved

1. **Pre-fill support** — resolved, and it narrowed the plan. Google Forms and
   Airtable only, without form-owner cooperation. Typeform and Submittable are
   dead ends for links.
2. **Browser Rendering** — resolved. Included with Workers Paid at this volume;
   effectively free.
3. **Model-per-form cost** — *not* resolved, and downgraded in importance. No
   task-matched figure exists; the accuracy rates are the disqualifying number.
4. **Chrome Web Store** — resolved. Config-as-data is allowed, private listing
   is the right distribution, per-site permissions are worth it, and the
   privacy disclosure regime is live.

