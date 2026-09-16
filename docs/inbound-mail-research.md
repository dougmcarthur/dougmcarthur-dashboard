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
| 2 | Third-party inbound services, and whether Cloudflare inbound honours ARC on a forward | **running** |
| 3 | Google side: Gmail watch/push versus polling, per-artist OAuth scopes, and what setting up an auto-forward rule actually costs a person | pending |
| 4 | The product pattern: how TripIt, Expensify and peers verify a forwarded message, and user-forwards versus Scout-collects | pending |
| 5 | Pre-filled link support per form platform (the extension doc's check list, item 1) | pending |
| 6 | Costs and store rules: Browser Rendering pricing, model-driven browser cost, Chrome Web Store policy, WXT and the ports (check list, items 2–4) | pending |
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

