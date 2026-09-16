# Why the Review queue is full of pizza receipts

The reply matcher was built against eight real organiser replies and it reads
well. In production it hands the Review page spam, newsletters, bills and
marketing, and the artist is asked to triage all of it.

This is the diagnosis, measured rather than guessed, and a proposal.

## The measurement

Running the real `matchReply` against invented but ordinary mail, with three of
this database's actual gig names loaded:

```
MATCH_THRESHOLD = 26

SHOWN   a pizza receipt           26 pts  Sofar Sounds Winnipeg — Artist  [name:26]
SHOWN   a city newsletter         26 pts  Sofar Sounds Winnipeg — Artist  [name:26]
SHOWN   a utility bill            26 pts  Sofar Sounds Winnipeg — Artist  [name:26]
SHOWN   an unrelated job ad       26 pts  West End Cultural Centre — Per  [name:26]
SHOWN   a REAL organiser reply    26 pts  Sofar Sounds Winnipeg — Artist  [name:26]
```

**Every one scores the same.** The matcher cannot distinguish a pizza receipt
from a genuine reply, because in both cases the only evidence it found was one
word.

## Four faults, each defensible alone

**1. The "distinctive" word is the longest, not the rarest.**
`distinctiveWord` takes the longest significant word of five letters or more.
For *Sofar Sounds Winnipeg — Artist Application* the significant words are
`sofar`, `sounds`, `winnipeg` — and the longest is **winnipeg**. For *West End
Cultural Centre — Performer Applications* it is **performer**. Both are words
this artist receives constantly: he lives in Winnipeg and works in music.

The function says so honestly — *"Not a frequency table, which would need a
corpus this app does not have."* That was true when it was written. It is not
true now: the mailbox **is** the corpus, and the words that matter are the ones
rare *in his own mail*.

**2. The same weak word is used to search Gmail.** `gigTerms` puts that word
into the query as a bare term, so Gmail is asked for every message containing
"winnipeg".

**3. The search reaches spam and trash.** The prefix is `in:anywhere`, chosen
so a receipt misfiled as spam is still found. The cost is that actual spam
arrives in the queue.

**4. The threshold is exactly the weakest signal.** `distinctive` in a body is
26 points and `MATCH_THRESHOLD` is 26, so **one common word with no
corroboration is sufficient**. Nothing has to agree with anything else.

Individually each is reasonable. Together they are a funnel that starts with
"every email containing a city name, including spam" and ends with "show it to
the artist".

## What the fix is not

It is not a stricter threshold. Raising the bar to 27 would drop the real
organiser reply above too — it scores 26 as well. The problem is that the
evidence is *undifferentiated*, not that the bar is low. More points for the
same weak signal changes nothing.

It is also not an AI classifier as step one. There is a large amount of cheap,
deterministic signal being ignored — rarity, headers, threading — and a model
that reads every message is expensive, unreviewable and would still need all of
this to decide what to read.

## The proposal, in shape

> **Status: diagnosis complete, approach not yet settled.** Everything above is
> measured and stands on its own. The five directions below are the shape of a
> fix rather than a decision — library research is still outstanding, and what
> it finds decides whether any of this takes a dependency at all. Nothing here
> has been built.

1. **Fetch less.** Narrow the Gmail query by category and stop reaching into
   spam and trash. This is the cheapest change and probably removes the most.
2. **Weight words by rarity in this artist's own mail**, not by length. The
   corpus the original comment said did not exist is the mailbox itself.
3. **Require corroboration.** One weak signal is a lead, not a match — the
   threshold should be unreachable by a single body-word hit.
4. **Score strong negative signals**: bulk and list headers, no-reply senders,
   marketing infrastructure. A message carrying `List-Unsubscribe` is not a
   personal reply from an organiser.
5. **Match on the top post, not the quoted receipt underneath.** Today the
   whole body is searched, which is deliberate — the quoted form receipt is
   often the only place the festival is named — but it also means the matcher
   reads text that is not the sender's.

Two things that are **not** the fix, recorded so they are not re-proposed:

**Not a stricter threshold.** The real organiser reply scores the same 26 as
the pizza receipt. Raising the bar drops both.

**Not a model as step one.** There is a large amount of cheap, deterministic
signal being ignored — rarity, headers, threading — and a classifier that reads
every message is expensive, hard to review, and would still need all of the
above to decide what is worth reading.

---

## What the research found — the mail itself

Sources are RFCs and Google's own API documentation, read 2026-09-16. Detail
and citations are in the researcher's notes; what follows is what it changes.

### The cheapest change is to stop asking for so much

`q=` on `users.messages.list` takes most of the Gmail web search syntax,
including `category:`. Google's own filtering guide contrasts
`category:promotions` in `q=` with `labelIds: ['CATEGORY_PROMOTIONS']` as two
forms of the same thing, so the tab classifier is usable from the API — which
means **Gmail's own machine learning will sort promotions, social and updates
out for free**, before this app spends a cycle on them.

One caveat checked rather than assumed: `q=` does not work under the
`gmail.metadata` scope. This app holds `gmail.readonly`, so it applies.

So the prefix changes from

```
in:anywhere -in:sent -in:draft newer_than:Nd
```

to something like `category:primary -in:spam -in:trash`. Losing `in:anywhere`
is a real trade and it should be a deliberate one: it was chosen so a receipt
misfiled as spam is still found. The answer is probably that **the routine scan
stops reading spam and a manual "look harder" still can** — a queue nobody
trusts finds nothing either.

### The strongest available signal is not text at all

`In-Reply-To` and `References` (RFC 5322 §3.6.4) say which message a reply is
answering. Matched against the `Message-ID`s of mail **this artist actually
sent**, that stops being a similarity score and becomes a fact: this is a reply
to that application.

Two things make it practical here. The app already reads Sent mail — the sync
reconciler searches `in:sent` — so there is precedent and **no new scope**.

And one thing limits it, which matters more than it first looks: **most gig
applications do not start with an email.** They start with a web form, so the
receipt arrives unthreaded and there is nothing for it to be in reply to. Of
the eight real replies this matcher was built against, the senders were Wufoo,
Jotform, a portal, a parent organisation and two personal addresses — form
infrastructure, mostly. So threading is a **decisive positive when present and
useless when absent**, which makes it a signal worth a large number of points
and never a filter.

### Some headers are close to proof of "not a personal reply"

Two are reliable enough to exclude on:

- **`List-Id`** (RFC 2919) — the RFC says it must only be generated by mailing
  list software, not by end users.
- **`Auto-Submitted`**, anything other than `no` (RFC 3834) — auto-responders
  identify themselves precisely so that bots do not answer bots.

Two more are strong evidence of bulk, and belong as heavy negative weight
rather than a hard exclude:

- **`List-Unsubscribe`** / `List-Unsubscribe-Post` (RFC 2369, RFC 8058). Gmail
  and Yahoo have required these from bulk senders since February 2024, so
  presence is a stronger bulk signal now than it used to be.
- **`Feedback-ID`** — a Gmail and ESP convention rather than a standard, set by
  most large senders. Presence means bulk; **absence proves nothing**.

And a group to use as small nudges only, because each degrades as soon as a
sender brands their domain or omits a header: a DKIM `d=` on an unbranded ESP
domain, a VERP-shaped `Return-Path`, `Precedence: bulk` (RFC 2076 calls it
non-standard and discouraged — legacy mail only), `Reply-To` differing from
`From` (a classic heuristic, but real newsletters trip it too), and the visible
recipient count.

The important property of this group: **a festival's own mail can carry these
too.** An organiser who sends through Mailchimp gets a `Feedback-ID` on a
message that really is about your application. That is exactly why these are
weights and not filters.

### Reading the top post, not the receipt underneath

`email-reply-parser` (the maintained fork) is 25.6 KB unpacked with **zero
required dependencies**; its only native-code option, `re2`, is an optional
peer that is simply not installed. That makes it usable in a Worker.

`mailparser` is ruled out: ~1.5 MB through `nodemailer` alone and reliant on
Node `net`, `tls` and `dns`, which Cloudflare marks only partially supported.
`postal-mime` is the right MIME parser for raw messages and is unnecessary
here, because the Gmail API already returns parsed JSON. `planer` strips quotes
in plain text but needs a DOM for HTML and does not strip signatures at all.

This one needs care rather than adoption, because **it argues against an
existing decision**. CLAUDE.md is explicit that matching reads the whole body
on purpose: the quoted form receipt underneath a reply is often the only place
the festival is named, and LieLow's rejection names it nowhere else. Stripping
quotes would lose that.

So the shape is not "strip and then match" — it is **know which half you are
reading**. Matching can keep using the whole body; the *negative* signals and
any classification should read only the top post, so a quoted receipt cannot
make an unrelated message look like a reply, and a quoted newsletter cannot
make a real reply look like bulk.

### Nothing off the shelf does this

No open-source project matches this shape. Mailgun's `talon` is the nearest
structural reference — strip quotes, strip signature, classify what is left —
and is a pipeline worth copying rather than a library to depend on.

---

## What the research found — libraries

Sizes are min+gzip from Bundlephobia; stars and activity from the GitHub API,
checked 2026-09-16. The researcher discarded `npms.io` dates after they
contradicted both other sources.

**The recommendation is to take no search-index dependency**, and it is worth
saying why rather than just saying no. Every BM25 and TF-IDF library — Orama
(24.4 KB, edge support genuinely verified, official Cloudflare KV helper),
MiniSearch (5.8 KB, compatible by inspection), `wink-bm25-text-search` (3.3 KB),
`okapibm25` (0.5 KB) — is built to index **a fixed corpus you hold**. That is
not the problem. The corpus to index is 30–60 short gig names, which is an
array. The thing that needs measuring is how common a word is in **the
artist's mail**, which none of them models. A dependency here would carry
machinery for the easy half and none for the hard half.

Three of the obvious candidates are also stale enough to matter: `lunr` has
been in maintenance mode since 2020, `elasticlunr` has been dead since 2016,
and `string-similarity` is archived on GitHub.

**Disqualified on size or runtime**: `natural` (~2 MB, Node-only — out), and
`compromise` (138 KB) and the default `stopword` import (49 KB to hold about
150 English words) are Worker-safe but absurd for this. A short hand-written
stopword array is already in `replyMatch.ts` and is the right call.

**Where a dependency would earn its place** is the other half — catching
"Sofar Sounds Wpg" for *Sofar Sounds Winnipeg*. `fuse.js` (9.4 KB, Apache-2.0,
20k stars, actively pushed, zero deps, verified Worker-safe) or
`fastest-levenshtein` (under 1 KB) would do it. **Not in the first pass**: the
current fault is false positives, and fuzzy matching creates more of those. It
belongs after precision is fixed, if abbreviations turn out to be a real miss.

## The idea the research made available

The original comment was right that rarity needs a corpus, and right that the
app did not have one. It does now, and it does not have to build it:
**Gmail will report how common a word is.**

A search for a term returns `resultSizeEstimate`. Ask it for `winnipeg` and
get thousands; ask it for `sofar` and get a handful. That is document frequency
measured against the authoritative corpus — this artist's actual mail — with no
index to maintain, no library, and no storage beyond a cached number.

It costs one request per candidate term, tens of requests in total, and term
rarity moves slowly enough that the answer can be cached for a long time. It
also degrades honestly: a term Gmail cannot estimate is simply not down-weighted.

That turns `distinctiveWord` from a guess into a measurement, and it is the
piece the whole diagnosis was pointing at.

## The staged proposal

Ordered by junk removed per unit of work. Each stage stands alone.

**1 — Ask for less.** `category:primary -in:spam -in:trash`, and stop putting
the bare weak word in the query. Gmail's own tab classifier does the coarse
sort for free. *Biggest single reduction, smallest change.*

**2 — Exclude what says it is not a person.** `List-Id` present, or
`Auto-Submitted` anything but `no`. Both are reliable by specification.

**3 — Weigh words by measured rarity.** Replace longest-word with
rarest-word via `resultSizeEstimate`, cached per tenant. A common word stops
being able to carry a match on its own.

**4 — Require corroboration.** Set the threshold above what any single
body-only signal can score, so a lead needs two things to agree. This is the
change that separates the pizza receipt from the real reply — and note that it
only works *after* stage 3, because today both score identically.

**5 — Weigh bulk down.** `List-Unsubscribe`, `Feedback-ID` and the softer
ESP signals as negative points, never filters: a festival that mails through
Mailchimp is still a festival.

**6 — Read the right half.** Keep matching on the whole body, deliberately, but
compute negative signals and classification from the top post only, so a quoted
receipt cannot make a stranger's mail look like a reply.

**7 — Show the evidence.** The matcher already returns `signals` with points,
and the Review page shows none of it. "Matched because: the word *winnipeg*
appeared in the body" would have made this bug obvious to the artist on day
one, and turns a wrong match from a mystery into something correctable.

Stages 1 and 2 are cheap and independent. Stage 4 is the one that fixes the
screenshot, and it depends on 3.


---

## What was built, and one correction to the plan above

Stages 1, 2 and 7 landed first: the query stopped asking for a bare city name,
mail that declares itself automated is dropped before scoring, and the queue
says how strong a match is instead of showing every one as the same grey
caption.

Stages 3 and 4 are the pair that fixes the measurement this document opens
with. Rarity is measured through Gmail's `resultSizeEstimate`, banded in
`shared/termRarity.ts`, and passed into `matchReply` as an argument — never
fetched by it, for the reason `buildReviewQueue` takes `today`.

Measured against the same four messages, with Gmail reporting 12,000 messages
in a year, `winnipeg` in 2,400 of them and `sofar` in 9:

```
── before, threshold 26 ──
  a pizza receipt       26 pts  Weak   "Winnipeg" in the body.
  a utility bill        26 pts  Weak   "Winnipeg" in the body.
  a city newsletter     26 pts  Weak   "Winnipeg" in the body.
  a GENUINE reply       26 pts  Weak   "Winnipeg" in the body.

── after ──
  a pizza receipt      —  not shown at all
  a utility bill       —  not shown at all
  a city newsletter    —  not shown at all
  a GENUINE reply       26 pts  Weak   "Sofar" in the body, which is rare here.
```

### Stage 4 was wrong, and running it is what showed that

The plan said: *set the threshold above what any single body-only signal can
score, so a lead needs two things to agree.* That was right about the problem
and wrong about the mechanism, and it only became visible once stage 3 existed.

With rarity measured, a common word no longer reaches the bar — it scores 2
where it used to score 26 — so the junk is gone before any threshold change.
Raising the bar now would remove only the thing left standing: a genuine reply
whose sole evidence is a **rare** word, which is exactly the lead the feature
exists to surface.

So stage 4 became an **invariant** rather than a change: a word that is common
in this mailbox must never carry a match by itself, however long it is, and
`test/termRarity.test.ts` asserts it across a range of frequencies. The
corroboration idea survives where it belongs — in what the screen says. A lone
signal still reads *Weak*, because one mention with no domain and no thread is
a lead rather than a match, and now the note beside it says whether the word it
found was rare or everywhere.

### What is still true, and unmeasured

An unmeasured term keeps its full weight, so a deployment that has never
reached Gmail scores exactly as it did before rather than slightly worse. The
cache is monthly and platform-level, which is the same reasoning the reply scan
already uses: one refresh token, one mailbox, one answer to "how common is this
word". It moves with the scan when a second artist has a mailbox of their own.

Two things this does not touch, both still open: the quoted receipt underneath
a reply is still read when matching (stage 6), and nothing yet checks
`In-Reply-To` against the artist's own sent mail, which is the strongest signal
available and needs no new permission.
