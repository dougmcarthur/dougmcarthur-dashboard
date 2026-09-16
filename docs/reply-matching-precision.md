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
