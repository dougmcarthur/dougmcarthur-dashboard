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
| 1 | Cloudflare inbound: Email Routing, the Worker email binding, per-address and catch-all, what forwarding does to SPF/DKIM/DMARC, limits, cost | pending |
| 2 | Third-party inbound services: Postmark, Mailgun, SendGrid, ImprovMX and peers — webhook shape, pricing, retention | pending |
| 3 | Google side: Gmail watch/push versus polling, per-artist OAuth scopes, and what setting up an auto-forward rule actually costs a person | pending |
| 4 | The product pattern: how TripIt, Expensify and peers verify a forwarded message, and user-forwards versus Scout-collects | pending |
| 5 | Pre-filled link support per form platform (the extension doc's check list, item 1) | pending |
| 6 | Costs and store rules: Browser Rendering pricing, model-driven browser cost, Chrome Web Store policy, WXT and the ports (check list, items 2–4) | pending |
| 7 | Synthesis and critique — one recommendation, and what would make it wrong | pending |

## What the research found

Nothing yet.
