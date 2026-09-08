# Phase 4 — reading the organiser's answer

Step E of the build order in [gig-pipeline-plan.md](./gig-pipeline-plan.md).

Four statuses have existed since migration 0008 that nothing could reach.
`acknowledged`, `info_requested`, `invited` and `declined` are all claims only
a reply can justify, and until this landed nothing read received mail — so
`submissionSilence` could measure the wait but never end it.

## How far back the mailbox is readable

**All of it.** A `gmail.readonly` token searches the whole account; the Gmail
API imposes no time horizon, and `newer_than:` is a filter we choose to apply
rather than a limit we are given. This mailbox's archive begins **late June
2021** — about five years and three months — and it carried the address
`doug@mcarthurwebmarketing.com` before `doug@dougmcarthur.net`, in the same
account. Nothing before that exists to read.

What the app *chooses* to read is narrower and derived rather than fixed:

```
window = (today − oldest submission still in play) + 14 days
         clamped to [30, 1095]
```

So it reaches back to just before the oldest application still waiting, and no
further. Reading five years of mail on every scan would be waste, not
diligence, and a hardcoded "look back a year" would go stale the first time an
application aged past it. `planReplyScan` returns the number so a screen can
say it out loud — "looked back 104 days across 9 open applications" — and
`test/gmailReplies.test.ts` asserts it rather than describing it.

Two deliberate inclusions:

- **Spam and trash are searched** (`in:anywhere`). A rejection auto-filed as
  spam is precisely the silence this phase exists to break. The row records
  that it was found there, so nothing pretends it arrived normally.
- **Sent mail is excluded** (`-in:sent`). The sync reconciler already reads
  outbound mail for a different purpose; mixing them would have this phase
  classify your own applications as replies to themselves.

The scan is also bounded by the *pipeline*, not the mailbox: it searches for
the names of the applications in play plus the addresses already known to write
about them, so the work is proportional to how many applications are open. At
most 60 messages are read per scan.

## How a reply is matched to a submission

The plan said "matched by organiser domain and thread". Run against the real
mailbox, that rule matches **one reply in eight**:

| Application | The reply came from | Same domain? |
|---|---|---|
| Highlands Music Festival | `noreply@highlandsmusicfestival.ca` | **yes** |
| Manitoba Showcase | `do-not-reply@iwanttoshowcase.ca` | no — the portal |
| Folk On The Rocks | `no-reply@wufoo.com` | no — the form vendor |
| JIMWEEK | `noreply@jotform.com` | no — the form vendor |
| LieLow Music Fest | `lielowmusicfest@gmail.com` | no — gmail |
| Festival du Voyageur | `jdesaulniers@heho.ca` | no — unrelated domain |
| Road to BreakOut West | `andrea@manitobamusic.com` | no — the parent organisation |
| Regional Showcase | `devinlat@gmail.com` | no — a person |

So the domain is a corroborator, never the test. Six signals are scored
independently and the reasons are kept and shown:

| Signal | Worth | What it is |
|---|---|---|
| `thread` | 100 | This thread is already bound to a gig |
| `address` | 90 | This sender is already bound to a gig |
| `name` | 18–50 | The event's name in the subject or the body |
| `domain` | 30 | Sender's domain is the listing's domain |
| `relay` | 12 | A receipt from the portal this application was filed on |
| `organizer` | 12 | The organiser is named in the message |

### The name is what actually works

All eight match by name, and three things are needed to get there:

- **The whole name compared with punctuation removed.** "Folk On The Rocks" has
  two stopwords sitting between its only two distinctive words, so a pattern
  built from `folk` and `rocks` misses it. Squashing both sides to
  `folkontherocks` does not.
- **The most distinctive word.** "LieLow" is one token, not `lie` + `low` —
  which is why names are tokenised *without* splitting camel case for this
  purpose, and *with* splitting it for the next one.
- **Abbreviations, including of part of the name.** Organisers write the way
  they talk: FOTR, FDV, "Road to BOW". Initialisms are generated from every
  word (FOTR needs "On" and "The") and from contiguous runs of the significant
  words (BOW is *BreakOut West*, inside a longer name). Three letters minimum,
  matched case-sensitively as whole words — `FDV` is an abbreviation, `fdv`
  inside a URL is a coincidence.

A name made only of words every event shares — "The Music Festival" — produces
no terms at all. Such a gig is findable by domain and by a confirmed binding
and by nothing else, which is the honest position rather than a shortage.

### The receipt is the anchor

LieLow's rejection has the festival's name **nowhere in its subject** — the
subject is `Re: Form Submission - New Form`. What names it is the Squarespace
receipt quoted underneath, which the form sent you at submission time and which
is sitting in the same mailbox. Match the receipt and the whole thread follows.

This is also why matching reads the entire body while classification reads only
the top post: the quoted receipt is often the only place the event is named,
and it is never the organiser's answer. Two questions, two texts.

### Confirm once, then remember

The lasting answer to the domain problem. Accepting a match writes the sender
address **and** the thread id into `gig_correspondents`, so `jdesaulniers@heho.ca`
costs one judgement and never has to be worked out again. Bindings are
decisive — they are not ranked against guesses — and an address belongs to one
gig, so confirming it elsewhere moves the binding rather than leaving two that
contradict each other.

When two applications match equally well the reply is stored with **no** gig
attached and marked ambiguous. Naming one would be inventing the answer the
matcher just said it did not have.

## How a reply is read

Four things to recognise, and the ordering is the whole difficulty: **every
rejection opens by thanking you for applying.** So all four are scored and the
strongest wins, with `unclear` when two are close — a first-match rule that
checked acknowledgement early would file every rejection under it.

Three things the real mail taught that the plan did not know:

- **Rejections avoid the word.** "Unfortunately" appears in none of the three
  real ones. What they say is *"we won't be moving forward"*, *"was not
  selected"*, *"not able to make it work"*.
- **A conditional is not a decision.** Highlands writes *"if you don't hear
  from us by June, it means we weren't able to make it work this year"*. That
  sentence contains a rejection phrase and is not a rejection. Sentences in
  that shape are read as acknowledgements, and the date is surfaced separately
  as the day silence becomes a no.
- **An invitation can be a question.** Festival du Voyageur's is *"Wondering if
  you are available/interested to do an acoustic set on Feb 21st"*. A question
  mark is not evidence that information is being requested.

The sentence that decided it is stored verbatim and quoted on screen. A reading
you cannot check is a reading you should not trust.

## Nothing here transitions a row

`POST /api/replies/scan` proposes. Accepting a reply records the judgement and
binds the correspondent — and stops. Moving the gig is a separate call to
`PATCH /api/gigs/:id`, which is the one place that owns what a transition means
and refuses the ones the pipeline does not offer.

Two calls is the correct number. They can be wrong independently: a reply from
a stranger's address about the right festival is the common case, and a
correctly-matched reply read the wrong way is the dangerous one. A wrong
auto-transition tells you that you were rejected when you were not.

Re-scanning is safe by the same logic: a message you have already resolved is
left exactly as you left it.

## Not built

- **Drafting the answer.** `info_requested` is recognised but the reply is
  yours to write; §5 of the pipeline plan wants a draft, and that needs the
  question parsed rather than merely detected.
- **A scheduled scan.** It runs when you press *Check mail*. The hourly cron
  already exists and could call it, which is a small change and a large
  behavioural one — it wants to be a decision, not a side effect.
