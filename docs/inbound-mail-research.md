# How Scout would receive an artist's mail

Scout reads one mailbox today: the owner's, through one `GMAIL_REFRESH_TOKEN`
pointing at one inbox, on the cron, three times a day. That is why the digest
and the reply scan run for the owner's tenant only — the mailbox is platform
configuration, not the tenant's.

Two things now want an artist's mail rather than the owner's:

- **Submission evidence.** A receipt email is the strongest signal that an
  application was actually sent (`docs/submission-assist-research.md`). It
  arrives in the artist's inbox, not the owner's.
- **Replies.** `shared/replyMatch.ts` is built and works, and for every artist
  but the owner there is nothing for it to read.

So: how does mail get to Scout, and what does the artist have to do about it?

## The question, split

**A. Inbound transport.** Where does a message addressed to Scout land, and
what turns it into a row? Cloudflare Email Routing into the Worker's email
binding, a third-party inbound service, or the Gmail API.

**B. The forwarding pattern.** TripIt has `plans@tripit.com`; Expensify has
`receipts@expensify.com`. You forward a message and it appears. How do they
tell a genuine forward from a stranger's, how much work is an auto-forward
rule to set up, and is it better than Scout reading the mailbox directly under
a grant the artist makes?

Both bear on the same trade: **the artist forwards** (no mailbox access, no
scopes, works with any provider, but relies on them setting a rule up) versus
**Scout collects** (a per-tenant Google grant, like `google_grants` already
holds for drafting, but it is a wide scope and only covers Google).

One constraint already decided, and it is the binding one: `send_email` sends
through an allowlist of **one address**, the owner's. That is a real security
property, not a limitation. Nothing here may quietly widen it.

## Phases

Small on purpose. Each one writes its findings into this file and is committed
before the next starts, so running out of session costs one phase, not the
lot. Findings land under "What the research found"; nothing above that line is
a research output.

| # | Phase | Status |
| --- | --- | --- |
| 1 | Cloudflare inbound: Email Routing, the Worker email binding, per-address and catch-all, what forwarding does to SPF/DKIM/DMARC, limits, cost | **done** |
| 2 | Third-party inbound services, and whether Cloudflare inbound honours ARC on a forward | **done** |
| 3 | Google side: Gmail watch/push versus polling, per-artist OAuth scopes, and what setting up an auto-forward rule actually costs a person | **done** |
| 4 | The product pattern: how TripIt, Expensify and peers verify a forwarded message, and user-forwards versus Scout-collects | **folded into 7** — 1b answered the first half, and the second is a decision, not a question |
| 5 | Pre-filled link support per form platform (the extension doc's check list, item 1) | **done** — findings in `submission-assist-research.md` |
| 6 | Costs and store rules: Browser Rendering pricing, model-driven browser cost, Chrome Web Store policy, WXT and the ports (check list, items 2–4) | **running** |
| 7 | Synthesis and critique — one recommendation, and what would make it wrong | pending |

## What the research found

### Phase 1a — Cloudflare can deliver mail into the Worker, and plus-addressing is the per-artist mechanism

Sources are Cloudflare's own documentation, read 2026-09-16. Note that the
product has been reorganised under an **Email Service** umbrella: pricing and
configuration now live under `/email-service/…` while the routing and Workers
pages are still under `/email-routing/…`. Cite accordingly next time.

**It works, and the inbound half is free.** Email Routing delivers a message
into a Worker's `email()` handler. Only outbound sending through `send_email`
is metered; receiving is not
(`/email-service/platform/pricing/`).

**The zone has to be a full setup.** Cloudflare must run the nameservers — a
partial/CNAME setup will not do — and it provisions the MX and SPF records
itself. **You cannot keep another mail server on the same MX**, which is the
first real constraint: `sundogsmusic.ca` currently sends login and digest mail
through Email Service, so this needs checking against whatever else holds MX
on that domain before anybody commits to it
(`/email-routing/setup/email-routing-dns-records/`, `/dns/zone-setups/`).

**Per-artist addresses are plus-addressing, not rules.** Sub-addressing per
RFC 5233 is supported natively: one rule for `scout@sundogsmusic.ca` also
matches `scout+<artist>@sundogsmusic.ca`, and the tag survives for the Worker
to read off the recipient address
(`/email-routing/setup/email-routing-addresses/`). That is the right shape
here. The alternative — an explicit rule per artist — runs into a documented
ceiling of **200 rules per domain and 200 verified destinations per account**,
which is a cap on the number of artists, and a cap is a bad thing to put on a
tenant table.

One caveat, and it is an anecdote rather than a documented limit: a community
post claims plus-addressed mail silently failed to route in some setup. Not
treated as fact, but **smoke-test a plus-addressed message before building on
it**.

**The Worker gets raw MIME and no parser.** The handler receives a
`ReadableStream`; Cloudflare's own docs point at the third-party
`postal-mime` package for parsing, and `mimetext` for building outbound MIME
(`/email-routing/email-workers/runtime-api/`). That is a dependency this
repository does not have yet.

**`reply()` is not gated by the `send_email` allowlist.** Replying is a method
on the inbound message and is structurally separate from the send binding, so
it sidesteps the one-address allowlist entirely
(`/email-routing/email-workers/reply-email-workers/`). **This is worth
pausing on**: the allowlist is described in CLAUDE.md as a real security
property — the Worker cannot mail anywhere else even if the code is wrong —
and adding an inbound handler quietly introduces a second, differently-gated
way for the Worker to send mail. Its own constraints are tight (the inbound
message must pass DMARC, the recipient must be the original sender, one reply
per message, matching sender domain), but "you may reply to anyone who writes
to you" is not the same promise as "you may only mail one address", and the
difference should be a decision rather than a side effect.

**Inbound authentication is mandatory and not configurable.** Email Routing
enforces SPF/DKIM/DMARC on inbound mail, with no setting found to relax it
(`/email-routing/postmaster/`). Mail sent *directly* by Wufoo, Jotform and the
rest carries its own valid authentication and is fine. **Forwarded mail is the
exposed case** — which is precisely the pattern phase 4 is about — and phase
1b covers what forwarding does to those signatures.

**Limits**: 25 MiB message size, with no separate attachment sub-limit
documented (`/email-routing/limits/`). No inbound rate limit stated anywhere
reachable — *not found*, rather than "none".

**Failure behaviour is under-documented, and matters.** `setReject()` is
always a *permanent* SMTP rejection; there is no documented soft-fail for a
transient problem such as D1 being briefly unavailable. And what happens when
the handler throws or times out is not spelled out in the official lifecycle
or limits pages — community posts describe it surfacing as an exception and
the message being effectively dropped, which is the worst of the options and
the only one nobody has confirmed. **Test it deliberately** (throw in a test
handler and watch what the sender sees) before depending on any retry
behaviour. A submission receipt silently dropped is exactly the failure this
whole feature exists to prevent.

### Phase 1b — a `From` header is not evidence, and forwarding breaks the things that are

Standards sources plus practical ones, read 2026-09-16. Confidence is the
researcher's, and is reported here because it varies a lot by question.

**The answer the design turns on**: SPF, DKIM and ARC cannot bind a forwarded
message to the person who forwarded it. Only **account-level verification**
can. Every service that accepts forwarded mail does the same two things:

1. **Verify the forwarding address once**, at signup or in settings, with a
   confirmation code or link sent to that address. Expensify requires the
   sender be a primary or secondary login on the account; TripIt accepts
   forwards from any address already on the account.
2. **On every message, check the envelope sender** — the connecting SMTP
   identity — against that pre-verified list. **Never the `From:` header**,
   which is content inside the message and is written by whoever composed it.

That gap is not theoretical. *Forward Pass* (IEEE EuroS&P 2023, best paper,
arXiv:2302.07287) demonstrated `From`-header spoofing at scale against real
forwarding services, impersonating `state.gov` and others, by abusing exactly
this trust. A per-user **secret** inbound address is the third layer, so a
guessable public address cannot be used to spam rows into somebody's account.

That maps onto Scout's existing vocabulary cleanly. It is the recovery-address
rule again: the address is never typed by the person asking, it is read from
something already trusted. Here the trusted thing is an address verified once
against an account that already exists.

The mechanics underneath, briefly:

- **SPF fails on forwarded mail by design.** It authenticates the envelope
  `MAIL FROM` against the connecting IP, and a forwarder is an IP the original
  domain never listed. SRS fixes the check by rewriting the envelope — and
  breaks DMARC *alignment* with the original `From` domain, so DKIM has to
  carry alignment instead. RFC 7208 §2.2, §10.3 and Appendix D warn about
  precisely this.
- **DKIM survives a clean relay and dies on a touched one.** It signs headers
  and a body hash, independent of the connecting IP (RFC 6376 §3.4), so a
  forwarder that changes nothing leaves it valid. Footer injection, subject
  rewriting, MIME re-encoding and mailing-list transforms all break it;
  relaxed canonicalisation forgives whitespace and case, not inserted content.
- **ARC exists for this and is optional.** RFC 8617 lets an intermediary sign
  what authentication evaluated to at its hop, so a later receiver can honour
  it. Honouring is a MAY, per receiver policy. Gmail is the consistently cited
  signer and validator; Microsoft 365 and Yahoo are cited as validating.
- **Gmail's auto-forward**: DKIM commonly survives, the envelope sender is
  expected to be rewritten, and the `X-Forwarded-For` / `X-Forwarded-To`
  headers are reported by users rather than documented by Google. Low to
  medium confidence, and labelled as such.
- **A manual forward usually arrives as quoted prose.** Gmail and Apple Mail
  both default to inlining the original; both offer *forward as attachment*,
  which produces a real `message/rfc822` with untouched headers. Since inline
  is the default, most hand-forwarded mail would have to be recovered by
  parsing prose.

That last point is a direct hit on something this repository has already
decided. Recovering a sender and a date from quoted text is prose parsing, and
`reviewParse.ts` is the debt the codebase is trying to delete rather than
repeat. **A hand-forwarded message should be treated as the weak path**:
accept it, mark what was recovered as approximate — the same treatment a
deadline recovered from prose gets — and prefer *forward as attachment* or an
auto-forward rule, which is a rule set once rather than a habit maintained.

### Where 1a and 1b collide, and it is the central risk

Cloudflare enforces SPF/DKIM/DMARC on inbound mail, mandatorily, with no
documented way to relax it. Forwarding is the thing that breaks SPF and can
break DKIM. **So the forward-to-Scout pattern and the Cloudflare inbound path
may be in direct conflict**, and the whole question is whether Email Routing
honours ARC, or is lenient where DKIM survives a clean forward.

Nothing found so far answers that, and it is the single fact that decides
between Cloudflare and a third-party inbound service. It goes into phase 2 as
its own question, and it wants a **live test** — forward a real message
through a Gmail rule to a plus-addressed Cloudflare address and see whether it
arrives — rather than another documentation search. Documentation cannot
settle a question about somebody else's enforcement thresholds.

### Phase 2a — the useful question is "reject, or deliver with a verdict?"

Prices and tiers read 2026-09-16; all of them move, so re-read before
committing money. Detail per service is in the researcher's notes.

Phase 1 turned the comparison into a single question, and it sorts the field
cleanly. **A service that rejects mail failing SPF or DMARC is hostile to
forwarding; a service that delivers it with a verdict attached lets Scout
decide.** Scout wants the second, because it has a stronger signal available
than any of those checks — the envelope sender matched against an address
verified once against the account — and it wants the verdicts as
*corroboration* rather than as a gate somebody else operates.

| Service | On a failed check | Inbound cost |
| --- | --- | --- |
| CloudMailin | Delivers, with a structured per-protocol verdict (`pass`/`fail`/`neutral`/`temperror`/`permerror`) | Free tier: 10,000/month, 512 KB per message, no card |
| EmailConnect.eu | Delivers, with verdicts, threshold explicitly the caller's | Free tier: 100/month |
| Mailgun | Delivers by default, verdicts in `X-Mailgun-*` headers — **but hard-reject spam filtering is opt-in, so the domain's setting has to be checked** | Free 100/day, 1 route; Basic $15/month |
| SendGrid | Delivers; documentation says explicitly it does not reject | Essentials $19.95/month, no permanent free plan any more |
| ImprovMX | Exposes `Authentication-Results`, but its own accept/reject policy is undocumented | Webhooks need Premium, $9/month |
| Postmark | No documented reject policy; SpamAssassin score only, nothing on SPF/DKIM/DMARC | Inbound gated behind Pro, $16.50/month |
| Mailparser | No authentication verdicts found at all | No free tier |
| Resend | **Not found** | — |

**CloudMailin is the candidate**, and it is not close: the free tier covers
this volume many times over, and it is the clearest documented answer to the
deciding question. EmailConnect.eu is the same design from a much smaller
vendor, with a tighter free tier, and is worth knowing about only as a second
source.

Two entries that are warnings rather than options. **Resend could not be
confirmed either way** — no statement found about whether it reports
authentication results on inbound mail or silently drops failing messages —
and an attractive free tier does not compensate for not knowing that. Its
webhook is also metadata-only, with the body and attachments needing a second
API call. **Mailparser** is a field-extraction product, not a relay; it would
put the parsing somewhere Scout cannot test.

**What this does to the comparison.** Cloudflare is free, is already in the
stack, and needs no new vendor — but enforces on Scout's behalf with no
documented override. CloudMailin is a new dependency and a webhook endpoint
that must be authenticated, but hands over the decision. If phase 2b finds
that Cloudflare honours ARC and a Gmail-forwarded message lands, Cloudflare
wins on every axis. If it does not, this is the fallback, and the free tier
means the fallback costs nothing but the integration.

### Phase 2b — Cloudflare rejects forwarded mail, unpredictably, and the senders it rejects are this app's senders

**Documented.** Email Routing requires inbound mail to pass SPF *or* DKIM
*and* satisfy the sender domain's DMARC alignment. A message failing that is
**rejected outright** — no quarantine, no deliver-with-a-verdict mode, no
per-address exception in any documentation found. Enforced since 2025-07-03
per the changelog (`/email-routing/postmaster/`).

**The ARC gap is real, and it is on the wrong leg.** Cloudflare's own
October 2023 blog post confirms it adds ARC seals and does SRS rewriting **when
Cloudflare is itself the forwarding hop** — its outbound leg. Nothing
documented says it *validates* an ARC chain arriving on mail that some earlier
hop (Gmail) already forwarded. That is the direction this design needs, and it
is a documentation gap rather than an inference.

**User reports, which are the substance here.** Three Cloudflare Community
threads describe exactly this topology — Gmail auto-forward into an Email
Routing address — failing with "DMARC checks failed", rejected before the
Worker runs:

- **August 2026**, six weeks ago: mail from automated senders forwarded via
  Gmail consistently rejected while other forwarded mail arrived. The user
  asked for a per-address override; no such feature exists and the request went
  unanswered.
- **October 2025**: a setup that worked for a month then broke, with a
  community reply attributing it to Cloudflare enforcing *strict* alignment
  where the sender's own DMARC record asked for *relaxed*.
- **July 2025**: mail that passed DKIM still rejected, because the sender's own
  alignment was incomplete.

No report was found of anyone forwarding from Gmail into Email Routing
successfully and reliably.

**The mechanism explains the inconsistency.** Gmail's auto-forward rewrites the
envelope sender but leaves signed content alone, so DMARC can still pass *via
DKIM alignment* — if the original sender DKIM-signs with a key aligned to its
own `From` domain. SPF alignment always breaks on a forward. So the outcome is
**per-sender**: well-configured senders survive, SPF-only and misaligned
senders do not.

**And that is the finding, because this repository already knows who its
senders are.** The reply-matching work counted eight real organiser replies in
this mailbox: exactly one came from the festival's own domain. The rest came
from Wufoo, Jotform, a portal, a parent organisation and **two personal Gmail
addresses**. That population — third-party form platforms and individuals on
free mail — is precisely the population whose mail fails alignment when
forwarded. The senders Scout most needs to receive are the senders Cloudflare
is most likely to reject, and it will do it silently, before any code runs.

An intermittent, silent, per-sender rejection is close to the worst failure
shape available for this feature. A receipt that never arrives looks exactly
like an application that was never acknowledged, and the whole point of the
submission-evidence work is to tell those two apart.

**Direct sends are fine.** A Wufoo or Jotform notification sent *directly* to a
Scout address is a first hop from the platform's own authenticated
infrastructure, and faces only the ordinary bar. Nothing suggests Cloudflare
penalises automated senders as a category. This is reasoned rather than
separately confirmed.

### Section A has an answer

**Two paths, split by how the mail gets there** — and the split falls out of
the evidence rather than being a compromise:

- **Mail sent directly to Scout** — an artist putting their Scout address into
  a form's notification field, or as their reply-to — can go through
  **Cloudflare Email Routing**, free, already in the stack, into the Worker's
  `email()` handler, per-artist by plus-addressing.
- **Forwarded mail** cannot go through Cloudflare. It needs a service that
  delivers with a verdict: **CloudMailin**, on the free tier.

Before building either, note what phase 1a raised: Email Routing needs
Cloudflare's own nameservers and its own MX on the domain, and `send_email`
already sends from `sundogsmusic.ca`. Whether Email Routing can coexist with
that is a prerequisite, not a detail.

**The live test still matters, and is now cheap and specific.** Not "does
forwarding work" — the answer is "sometimes, per sender". Stand up the address
and forward one message from each of the classes that actually appear in the
mailbox: a personal Gmail address, a small organiser's own domain, and a
Wufoo/Jotform notification, each both forwarded and sent directly. Read the
`Authentication-Results` on what arrives and note what never does. A single
synthetic message generalises to nothing.

### Phase 3a — every Gmail scope this app uses is Restricted, including the one that only writes drafts

Read 2026-09-16 against Google's own documentation
(`support.google.com/cloud/answer/13464325`,
`developers.google.com/workspace/gmail/api/auth/scopes`).

`gmail.readonly`, `gmail.metadata`, `gmail.modify` **and `gmail.compose`** are
all classified **Restricted**. Only bare `gmail.send` sits in the lighter
Sensitive tier. `gmail.metadata` is Restricted despite returning headers only,
and `gmail.compose` is Restricted despite granting no read access at all.

This app holds both `gmail.readonly` (the owner's `GMAIL_REFRESH_TOKEN`, for
the reply scan) and `gmail.compose` (the runtime grant in `google_grants`, for
drafting).

**To let anyone outside the developer's own account grant those**, Google
requires brand verification (2–3 business days), restricted-scope data-access
verification with a demo video and a Trust & Safety review — **Google's own FAQ
says about six weeks** — and an **annual third-party CASA security
assessment**, performed by an approved lab and paid for directly by the
developer. Google charges nothing and controls nothing about that fee.

**What CASA costs.** Google publishes no price list. Vendor rate cards
(deepstrike.io, updated September 2026; switchlabs.dev) converge on **Tier 2 at
roughly $500–$1,800 a year**, with **$540** the most-cited floor from Google's
named preferred partner. Tier 3 runs $4,500–$8,000+. Recurring, annually.
These are third-party figures, not Google's, and are labelled as such.

**There is no small-app exemption.** Confirmed from Google's FAQ — the tier is
set by data sensitivity and per-scope user volume, not revenue — and from
third-party reporting. No hobby waiver was found.

**The free path is OAuth Testing status**, and its terms matter: up to 100 test
users, added by hand in the Cloud Console, with no verification and no CASA.
The catch is that **refresh tokens expire seven days after consent**, on a
fixed clock. A handful of invited musicians fits inside 100 easily; being
walked through re-authorising every week, forever, does not fit inside anything.
And the failure is silent — the token simply stops working.

**No narrower scope reads a body.** `gmail.metadata` gives headers and labels
only, is Restricted anyway, and would not serve reply matching, which extracts
a deciding sentence and recognises asks from body text. Body access means a
Restricted scope. There is no way around it.

**Push is not worth it here.** `users.watch` with Pub/Sub needs a topic, IAM
grants and a reachable subscriber, and **the watch expires after seven days
with no automatic renewal and no warning** — mail arrives and nothing is
delivered. For a mailbox swept three times a day, polling is the right answer,
and it is already what the cron does. Quota is nowhere near a constraint.

**What this means for work already built.** Gmail drafting exists, and
`google_grants` was designed precisely so the *user* decides whether to
connect. That design is right and the feature works — for the owner. Offering
it to an invited artist is not a matter of writing a per-tenant grant row: it
is six weeks of review and a recurring four-figure-at-worst assessment, or a
token that dies every seven days. The multi-tenant plan lists per-artist
mailbox grants as "real work with schema behind them"; the schema is the cheap
part, and the plan should say so.

**One thing this research did not settle, and it bears on the owner's current
setup.** The finding presents Testing and verified Production as the only two
options. There is a third state — **published but unverified** — which
historically showed users an unverified-app warning and capped the app at a
number of grants, without the seven-day token expiry. Which state this app's
Cloud project is actually in decides whether `GMAIL_REFRESH_TOKEN` is quietly
living on a seven-day clock today. **Check the Cloud Console before relying on
any of this**, and treat the two-option framing as unconfirmed.

### Phase 3b — the forwarding rule is about ten steps, and cannot express what it needs to

**The confirmation code is still required** in 2026, with no bypass for a new
destination address. The flow: add the destination in Gmail's forwarding
settings → Google mails that destination a code → open *that* inbox, take the
code → return to the source account's settings, paste it, confirm → only then
can "forward a copy of incoming mail" be selected → save. **Nine to eleven
steps across two mailboxes**, then another five to seven clicks per filter.

**One real shortcut exists, and it collapses back into phase 3a.** If Scout
controls the destination it can read the confirmation code itself, so nobody
has to fetch it. And with the `gmail.settings.sharing` scope it could create
the forwarding address and confirm it server-side, making the whole thing
invisible. That is a Gmail scope on the *artist's* account — so it carries the
same verification and CASA cost as reading the mailbox, for a narrower benefit.
The shortcut is only available to an app that has already paid the toll.

**The filter cannot say what needs saying.** Gmail filters match sender,
subject and keywords. "Anything that looks like a festival application receipt"
is not expressible in those terms, and this repository already knows why: of
eight real organiser replies, they came from Wufoo, Jotform, a portal, a parent
organisation and two personal Gmail addresses. No sender-or-subject filter
anticipates that set without being maintained by hand, forever, by the artist.

Three more properties, each of which is a defect on its own:

- **No history.** Forwarding applies only to mail arriving after setup.
  Receipts already in the mailbox are invisible to it.
- **Spam is excluded by design**, and forwarding itself can break SPF and DKIM
  and get the forwarded copy spam-foldered at the destination. Both documented
  by Google. This is phase 2b's finding arriving from the other direction.
- **It stops silently.** Forwarding switching itself off is a well-reported
  failure with no notification; the only way to find out is to reopen settings
  and look, or to notice something never arrived.

Apps Script is not an easier route: it hits the same verification gate and adds
an unverified-app warning on top. iCloud's documentation does not describe a
destination-verification step (unconfirmed); Outlook's is muddier.

### Phase 4 is answered, and is folded into the synthesis

Phase 4 was to cover how TripIt and Expensify verify a forward, and
user-forwards versus Scout-collects. **Phase 1b answered the first** — verify
the address once against the account, then check the envelope sender, never the
`From` header. **The second is now a decision rather than a research
question**, and both of its options have been priced:

- **Scout collects**: six weeks of review and $500–$1,800 a year, or a token
  that dies every seven days.
- **The artist forwards**: ten steps, a filter that cannot express the
  criterion, no history, and silent failure.

Running a phase to compare two options that are already this well characterised
would be spending session on a conclusion that is already available. It goes to
phase 7 instead, where there is a third option to weigh them against — because
the strongest thing this research has turned up is that **mail may not be the
right instrument for the submission-evidence problem at all**, and the
extension's confirmation-page signal is free, needs no scope, no vendor and no
setup by the artist. That argument belongs in the synthesis, with the
comparison in front of it.

