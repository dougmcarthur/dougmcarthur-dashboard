# Artist survey: what makes an opportunity worth an artist's time

**Status, 2026-10-05: built, and closed.** The survey exists and works end to end,
and **ships closed**: nobody can start it until a contact address is configured
and it is asked to open (section 10). This is the questionnaire, the reasoning
behind it, and what is computed from the answers. It was written before any code
so it could be argued with cheaply, and the code is held to it by tests.

*Revised the same day: E2 and E3 were reworded, and A8 added, after comparing
them with the Manitoba Arts Council's and Arts Nova Scotia's identification forms.
See the end of section 8 for what was and was not found.*

Decided already: it lives on Scout's own Worker, launches in English and is
stored so French is a drop-in, goes first to the Manitoba Music network, and is
fully anonymous. See the open decisions at the end.

**One naming rule.** Anything a respondent reads says **Sun Dogs Music**, never
"Scout" on its own — the bare word is the mark this product avoids (see
`CLAUDE.md`). This document uses "Scout" because it is internal.

## 1. What it has to answer

The pipeline plan's scoring side (`gig-pipeline-plan.md`, step F) has waited on
one thing: nobody has measured how an artist trades pay against travel against
audience, and inventing five weights on somebody's behalf was ruled out. This
survey is that measurement, taken from many artists instead of one.

**Primary.** How artists trade off the things that decide whether to apply,
expressed in **dollars where possible** — "an audience of 2,000 instead of 100
is worth about $X to the average artist" — because a dollar figure is something
Scout can score with, and a rank order is not.

**Secondary.**
- Do the weights differ by income, how much of their living music is, or how
  often they play? (The one that matters most: price sensitivity should not be
  assumed to be the same for someone earning $8,000 and someone earning $50,000.)
- What artists *did* on their last decision, to check against what they say.
- How they find opportunities, and how long an application takes — both feed
  the product directly.

**Not what it can do.** It cannot say what artists in Canada want. It reaches
whoever the link reaches (section 7). It reports who answered and stops there.

## 2. How it is built, and why

1. **Trade-offs, not importance ratings.** "How important is the pay?" gets
   "very important" from nearly everyone, and so does every other item, which
   measures nothing. Two methods force a choice instead: best-worst ranking
   (section C) and side-by-side comparisons of made-up opportunities (D).
2. **What they did before what they think.** Recall of the last decision comes
   first (section B), so it is not coloured by the list of factors that follows.
3. **Order: easy and concrete first, sensitive last.** Consent, then facts about
   their music, then recent behaviour, then preferences, then optional personal
   questions. Income is the last closed question, and every personal item has
   "Prefer not to say".
4. **No filter questions that teach respondents a shortcut.** "Have you applied
   in the last 3 years?" followed by more questions only when the answer is yes
   teaches people to say no. Everybody sees the same questions, and the recall
   ones carry their own "None" and "I can't think of one".
5. **Option order is randomised where there is no natural order**, per
   respondent, and recorded. Ordinal lists (years, income, counts) keep their
   order. "Other", "None" and "Prefer not to say" are always last and never
   shuffled.
6. **A way out of every forced choice.** Paired comparisons have **Neither**,
   because artists really do pass on things; forcing a pick would manufacture
   preferences for opportunities nobody would apply to.
7. **Neutral wording.** One idea per item, the same grammatical shape across a
   list, and no loaded words ("prestige" becomes "how well known or respected").
   Terms are defined where used. Amounts are in Canadian dollars. Time frames
   are concrete ("the last 12 months").
8. **Fully labelled answers and no grids.** Grids invite straight-lining and are
   miserable on a phone. One question per screen, large tap targets, a progress
   indicator by section rather than a percentage that moves unevenly.
9. **The sponsor is named and the product is not mentioned.** Saying who is
   asking is honest and is expected in research; steering the answers toward
   what a tool could do is not.
10. **Order effects are measured, not hoped away.** The two preference sections
    (C and D) appear in a random order, 50/50, and which came first is stored,
    so any difference between the two orders can be tested.
11. **Accessible by default.** WCAG 2.1 AA: keyboard-operable, labelled for
    screen readers, no information carried by colour alone, plain language
    around a Grade 8 reading level.
12. **Nobody's list is shortened because of who they are.** It is tempting to hide
    factors a respondent will find irrelevant, for example the "people who could
    hire me again" factor for a hobby-level artist. It is not done, for four reasons.
    - *It assumes the answer.* The survey exists to measure whether a hobbyist cares
      about, say, industry attendance. A hobbyist who is quietly hoping to turn
      professional never gets to say so, and the answer is decided before anyone is
      asked.
    - *The ranking already records irrelevance.* The "least" pick is how a ranking
      says "this does not matter to me". A factor that is irrelevant costs a few
      seconds and gives us exactly the data the pruning would have thrown away.
    - *It breaks the arithmetic.* Which factors a person saw would depend on their
      earlier answers, so each factor's score would come mostly from the people who
      were shown it, and groups could not be compared on the same footing. Randomly
      chosen subsets, which is what nine of thirteen is, do not have this problem,
      because what a person sees does not depend on anything about them.
    - *It treats people differently on a guess.* Whoever ticks "hobby" would be
      shown a different survey from whoever ticks "main job", on a stereotype about
      what a hobbyist cares about, and a self-description is not a reliable
      stand-in for ambition.

    What helps the hobby-level respondent without any of that: the "least" pick
    (above), an optional anchor screen (decision 8, section 9) that records which
    factors a respondent would weigh at all, and, between the first wave and the
    second, pruning by what the **whole** sample did, which uses no individual's
    characteristics.

## 3. The questionnaire

Fields: **type**, whether it is **required**, and **order** (R = randomised per
respondent, F = fixed). Nothing blocks a respondent except the consent and the
screen-out question. "Required" below means the analysis needs it, so everybody is
asked; a respondent can still skip it, and it is then counted as missing rather
than forced. Sensitive items always offer "Prefer not to say".

### Welcome and consent

> **Which opportunities are worth an artist's time?**
> A survey for musicians and bands working in Canada. About 10 minutes.
>
> Sun Dogs Music, a small company in Winnipeg, is building tools to help artists
> find and keep track of opportunities: festivals, showcases, grants, venue
> bookings. Before we decide what a tool should pay attention to, we want to
> learn how artists actually decide what is worth applying for.
>
> - **There are no right answers.** We want how you really decide, not how you
>   think you should.
> - **It is anonymous.** We do not ask for your name or email, and we do not
>   store your IP address. To keep out spam, the page runs a Cloudflare check
>   that does see your IP address while it runs; we do not receive or keep it.
>   The questions at the end about age, identity and income are optional, and
>   each has "Prefer not to say".
> - **Your answers are saved as you go.** If you stop, what you have answered stays, anonymously.
>   You can choose **Close without saving** at any time to delete it. Once you
>   finish, we cannot find your answers again, because nothing connects them to
>   you, so they cannot be taken back after that.
> - **Here is what happens to your answers.** We combine answers across artists and publish a
>   summary of the results at [address]. We never publish one person's answers,
>   or the answers of any small group.
> - It is voluntary. There is no payment and no prize draw.
>
> Questions: [contact address]
>
> ☐ I am 18 or older and happy to take part. **[Start]**

The checkbox is required to continue. Under-18s are excluded to avoid
guardian-consent obligations, not because their view is unwelcome.

**Shown one paragraph to a screen.** Written out as above, the notice ran to a
screen and a half on a phone with the checkbox below the fold. It is seven
screens: the welcome (title, lede and what the survey is for), one screen for
each of the five points under its own heading, and a last one that holds only the
checkbox, the spam check and **Start**. Every screen has Back, and a count ("3 of
7") beside the buttons. The heading of a point is its bold lead, which is why two
of them became whole sentences (*Your answers are saved as you go*, *Here is what
happens to your answers*): a fragment makes a poor heading. Nothing else in the
notice was reworded. The spam check is mounted with the checkbox rather than at
the start, because its token lasts five minutes and somebody reading carefully can
take longer than that. `shared/surveyConsent.ts` decides the steps from the number
of points, so a sixth point gets its own screen without anyone building one.

**S1. Which of these describes you?** · single choice · F
- I perform or release music in Canada, solo or in a band, and I decide or help
  decide which opportunities to go for. → continue
- I manage, book or represent artists, but I am not the artist. → thank-you page
- Neither of these. → thank-you page

The second option gets a thank-you and a line saying a version for managers and
agents may follow. Mixing them in would blur whose trade-offs are being measured.

### A. About your music

> *A few quick facts about your music, so we can see who answered.*

**A1. Where do you live?** · select list · required · F (alphabetical)
Alberta · British Columbia · Manitoba · New Brunswick · Newfoundland and
Labrador · Northwest Territories · Nova Scotia · Nunavut · Ontario · Prince
Edward Island · Quebec · Saskatchewan · Yukon · I live outside Canada

**A2. How long have you been performing or releasing music publicly?** · single
choice · required · F
Less than 2 years · 2 to 5 years · 6 to 10 years · 11 to 20 years · More than
20 years

**A3. How do you usually perform?** · single choice · required · F (smallest to
largest)
Solo · As a duo · In a group of 3 or more · It depends on the show · Other (please
specify)

**A4. Which genre best describes most of your music?** · single choice · required
· F (alphabetical)
Alternative or indie · Blues · Children's · Classical or contemporary classical ·
Country · Electronic or dance · Folk, roots or singer-songwriter · Hip-hop or
rap · Jazz · Metal, punk or hardcore · Pop · R&B or soul · Rock · World or global
· Another genre (please specify)

**A5. How would you describe your work in music?** · single choice · required · F
It is my main job · A major part of my work, alongside other work · A side
activity alongside other work or study · A hobby or occasional

**A6. In the last 12 months, about how many live shows did you play?** · single
choice · required · F
None · 1 to 5 · 6 to 15 · 16 to 40 · More than 40

**A7. Who helps you find or apply for opportunities?** · multiple choice · R
A manager · A booking agent · A label or publisher · A publicist · A bandmate or
friend · *No one, I do it myself* (exclusive, F) · Other (please specify) (F)

**A8. What language are most of your songs or lyrics in?** · single choice · F
English · French · An Indigenous language · Another language (please specify) ·
About equally in more than one · Mostly instrumental

A8 is here because the language the music is in bears on which festivals and
programmes are open to an artist, which is a behaviour and not an identity, and it
is far less sensitive to ask. It replaces the official-language-minority item the
first draft had in E3.

### B. What you did recently

> *These questions are about what you actually did, not what you would ideally
> do. If a question does not apply, there is an answer for that.*

**B1. In the last 12 months, about how many opportunities did you apply or submit
for?** *Count festivals, showcases, conferences, grants, venue bookings and
similar. Do not count things you were simply invited to.* · single choice · required
· F
None · 1 or 2 · 3 to 5 · 6 to 10 · 11 to 20 · More than 20

**B2. Which kinds of opportunity were those?** · multiple choice · R
Festivals · Showcases *(events where industry people come to watch artists play)*
· Conferences or industry events · Venue bookings or residencies · Grants or
funding · Competitions or awards · Radio, playlist or media pitches · Sync
*(placing music in film, TV, games or ads)* · Other (please specify) (F) ·
*None of these* (exclusive, F)

**B3. How do you usually find opportunities?** · multiple choice · R
Other artists or friends · Newsletters or websites from a music association ·
Social media · Search or listing websites · Invitations sent to me directly · A
manager, agent or other helper · An app or service that finds them for me · Other
(please specify) (F) · *I do not actively look* (exclusive, F)

**B4. Think of the most recent opportunity you could have applied for but chose
not to. What was the main reason?** · single choice · required · R
- The pay or fee was too low
- The cost to apply was too high
- The application would have taken too long
- Travel and lodging would have cost too much
- It would have kept me away from home or other work for too long
- The audience would have been too small
- None of the people who could hire me again would have been there
- It was not a good fit for my music
- My chances of being selected seemed too low
- I was not convinced the event was well known or respected enough
- I had doubts about how the organisers treat artists
- It would not have helped me toward my goals
- The dates did not work
- I missed the deadline, or heard about it too late
- Other (please specify) (F)
- *I cannot think of one* (F)

**B5. Now think of the most recent opportunity you did apply for. What was the
main reason you went for it?** · single choice · required · R
- The pay or fee was good
- It was free or cheap to apply, and quick
- Travel and lodging would cost me little, or were covered
- It would take little time away from home or other work
- The audience was a good size
- People who could hire me again were going to be there
- It suited my kind of music
- I thought I had a good chance of being selected
- It is well known or respected
- The organisers have a good record with artists
- It would help me toward my goals
- Someone I know recommended it, or was involved
- Other (please specify) (F)
- *I cannot think of one* (F)

B4 and B5 are the same list read two ways on purpose: what made someone pass
and what made someone go are the revealed half of the picture, and section C is
the stated half. Where they disagree, that is a finding (section 6).

**Parked for a later wave** (cut to reach ten minutes, by Doug's decision):
- *How long does a typical application take you, start to finish?* The paired
  choices still measure how much application time costs; this would only have
  told us how long applications actually take.
- *In the last 12 months, did you pay any application or entry fees?*
- *Of the opportunities you applied for in the last 12 months, about how many were
  successful?* The one the analysis misses most: it is the only check on how
  well artists' sense of their own odds matches what happened.

### C. Deciding what is worth it (ranking)

The order of **C** and **D** is randomised per respondent and recorded.

> **Imagine you have found an opportunity you are eligible for, and you are
> deciding whether it is worth your time to apply.** On each of the next screens
> you will see four things that might matter. Choose the one that matters
> **most** to you in that decision, and the one that matters **least**. There are
> no right answers, and some choices will be hard. That is expected.

Each screen shows four factors, and the respondent picks a **Most** and a
**Least**. On a phone it is two steps: pick the most, then pick the least from
the three that remain, so the same item cannot be both.

**The 13 factors** · each short, parallel, one idea:

| # | Factor |
| --- | --- |
| 1 | How much it pays if I am selected |
| 2 | What it costs to apply (entry or submission fee) |
| 3 | How much time and effort the application takes |
| 4 | What it would cost me to get there and stay (travel, lodging, meals) |
| 5 | How long it would keep me away from home or other work |
| 6 | How many people I would play to |
| 7 | Whether people who could hire me again would be there (bookers, agents, programmers) |
| 8 | How well it fits my kind of music |
| 9 | How good my chances of being selected seem |
| 10 | How well known or respected the event is |
| 11 | How the organisers treat artists (clear terms, replies, fair treatment) |
| 12 | Whether it helps me reach new audiences |
| 13 | Whether I would get a proper set (length, sound, a good slot) |

**The design.** Thirteen screens of four, built from the difference set
{0, 1, 3, 9} modulo 13. Checked: **every factor appears exactly 4 times and every
pair of factors appears together exactly once**, so no factor is favoured by
where it lands and every factor is compared against every other the same number
of times. Per respondent, the 13 labels are shuffled onto the 13 blocks, the
blocks are shuffled, and the four items within a screen are shuffled, so a
position effect cannot be mistaken for a preference.

**Length.** All 13 screens is about 4 minutes. The default proposed is a
**random 9 of the 13 per respondent** (about 2.5 minutes), which keeps every
factor equally represented across respondents but gives up the guarantee for a
single person. That is fine for what we want (the average artist), and not fine
for scoring one artist from their own answers — which is not the aim. If you
would rather keep the full 13, section 9 lists what to cut instead.

### D. Choosing between two opportunities

> **Now we will show you two made-up opportunities side by side.** Which would
> you rather apply to? If neither appeals to you, choose **Neither**. Assume
> everything that is not shown is the same: your music suits both, and the dates
> work.

Eight choice screens plus one attention check (below). Each shows **Opportunity
A** and **Opportunity B** as two cards with the same six rows in the same order,
and a **Neither** button beneath. The row order is fixed for each respondent and
randomised across respondents.

| Attribute | Levels |
| --- | --- |
| Pay if selected | $0 (exposure only) · $300 · $750 · $1,500 |
| Cost to apply | Free · $20 · $40 · $75 |
| Your out-of-pocket cost to get there and stay | $0 · $150 · $500 · $1,200 |
| People in the audience | About 100 · About 500 · About 2,000 · About 10,000 |
| People there who could hire you again | Few or none · Some · Many |
| Time the application takes | About 15 minutes · About 1 hour · About 3 hours |

Why these six: they are the things Scout can already know or ask an agent to
capture (a fee, an entry fee, a travel estimate from `shared/gigCost.ts`, an
audience size, a showcase or conference flag, the length of the form it reads),
so whatever weight comes out can be applied to a real row. "Chance of being
selected" is deliberately left out of this section: artists' beliefs about their
odds are poorly calibrated and Scout cannot supply them, so it stays in the
ranking (factor 9) and the recall (B4, B5) where it is not asked to do more than
it can.

**Design.** A D-efficient fractional design generated offline, in three
versions assigned at random. Every level appears equally often, the two cards
differ on at least four of the six rows so that every task makes someone trade
something for something, and no pair is *dominated* (one card better on every row)
except the planted check.
Prices are chosen so that dollar amounts are the common currency: pay, cost to
apply and out-of-pocket cost are all in dollars, so the estimate for "one more
dollar" is shared and every other attribute can be converted into a dollar value.

**Attention check.** One screen, in a random slot from 3 to 7, where A is at least
as good as B on every attribute and clearly better on three. Choosing B, or
Neither, is recorded as a failed check. It is never used to remove anyone
silently (section 5).

### E. About you (all optional)

> *The last few questions are optional. They help us see whether artists in
> different situations weigh things differently, and who this survey did and did
> not reach. We never show one person's answers, and we do not report on any group
> of fewer than 10 people. Skip any you would rather not answer.*

**E1. What is your age?** · single choice · F
Under 25 · 25 to 34 · 35 to 44 · 45 to 54 · 55 to 64 · 65 or older · *Prefer not to say*

**E2. What is your gender?** · single choice · F
Woman · Man · Non-binary · Prefer to self-describe *(with an optional text box)* ·
*Prefer not to say*

Self-description is its own option rather than part of "another gender" because
the Canada Council's review of demographic data collection warns against putting
everyone outside the first few categories into an "Other" box. "Woman" and "Man"
are gender terms; the Manitoba Arts Council's form says Female and Male under the
heading Gender, and we prefer the former because the question is about gender.

**E3. Do any of these describe you? Select all that apply.** · multiple choice ·
F (the order below, not randomised: this is not a list of preferences, and the
order is the one the Manitoba Arts Council's form uses, which Manitoba artists
have already met)

- Indigenous (First Nations, Métis or Inuit)
- Francophone
- Black and/or a person of colour
- D/deaf, deafened or hard of hearing
- Living with a disability (physical, mental or intellectual)
- Two-Spirit, lesbian, gay, bisexual, transgender, queer, or part of the 2SLGBTQ+
  community in another way
- New to Canada (landed within the last 5 years)
- Part of another community that faces barriers in the music industry
- *None of these* (exclusive)
- *Prefer not to say* (exclusive)

**Where the wording comes from.** Each item follows the Manitoba Arts Council's
2026 voluntary identification section where it has a counterpart, because that is
the language Manitoba artists have already seen on a form, and the guidance we
checked recommends established wording over invented wording. Changes from the
first draft, and why:

- **Deaf and disability are two items, not one.** The first draft joined two
  communities in one option, which broke the one-idea-per-item rule in section 2.
  Both the Manitoba Arts Council and Arts Nova Scotia keep them apart.
- **"2SLGBTQ+" is spelled out.** An acronym on its own is the jargon section 2
  rules out, and the Manitoba form spells the community out in full.
- **"Black and/or a person of colour"** replaces "Racialized, or a person of
  colour": it is the Manitoba form's wording, and it names Black artists directly
  rather than leaving them to infer they are included.
- **"Francophone" replaces "official-language minority".** The old wording was
  federal jargon, and the Manitoba form asks about Francophone identity instead.
  What actually bears on opportunities is the language the music is in, which is
  now a question of its own (A8) and not an identity item.
- **A catch-all with no text box.** "Part of another community…" gives people who
  fit none of the above a way to say so, without the "Other" box the Canada
  Council review warns about. It has no free text on purpose: a typed description
  of a small community is the likeliest way for an anonymous answer to point at a
  person. The one open question (E5) is still there for anyone who wants to say
  more.
- **"None of these" and "Prefer not to say" are both kept.** They mean different
  things, "this does not apply to me" and "I would rather not say", and the Manitoba
  form cannot tell them apart because a blank could be either.

**"New to Canada" is five years, by Doug's decision.** It was ten in the first
draft, which had no source. Five matches the federal definitions that were found
(see the end of section 8), with one open point about whom "landed" includes.

**Not settled.** No wording is final: the Canada Council's review says terminology
moves and should be revisited every few years, and asks that members of the
communities named help design the questions. Section 7 builds that into the
read-through.

**E4. About how much did you earn from all your music work in the last 12 months,
before expenses?** *Include performing, teaching music, royalties, grants and
merchandise. If you are in a group, count your own share.* · single choice · F
Under $2,500 · $2,500 to $9,999 · $10,000 to $24,999 · $25,000 to $49,999 · $50,000
or more · *Prefer not to say*

The $10,000 break is on purpose: the 2024 survey by Hill Strategies and the
Cultural Human Resources Council reported the share of artists earning under
$10,000, so this question can be set against a published figure.

**E5. Is there anything that matters to you when you decide which opportunities to
go for that we did not mention?** · optional free text, up to 500 characters

The only open question, and the one place a respondent can tell us what the factor
list in section C missed. Open text is expensive to read and easy to skim into
whatever you already believe, so there is one, it is read in full, and it is
coded by theme with the codes written down before reading. It is worded to ask for
a missing factor directly, because a first-wave list cannot know what it left out.

### Close

Thank you, and where the results will be posted. A line saying *Know another
artist? Share this link* with the same address. Passing it on widens the reach,
and also changes who is reached, which is why every channel carries its own tag
(section 4).

## 4. What is stored, and what is not

**Stored per response:** a random response id; the page-by-page time taken
(in seconds, not clock times); language; the order of C and D; the blocks and
picks in the ranking; the design version and the choices in the comparisons;
every answer; whether it was completed; and a **source tag** from the link
(`?src=manitoba-music-newsletter`), so the sample can be described by channel
without asking anybody anything.

**Not stored:** IP address, user-agent string, cookies that identify a person,
email, name, location finer than the province they chose. Device is recorded only
as phone or computer.

**Re-identification is the real privacy risk here, not a name.** Someone in
their fifties, from a small community, who plays a rare genre and earns over
$50,000 can be picked out of a small network without a name anywhere. So: personal
items are optional, categories are coarse, raw responses are never published or
shared, and any published figure for a group of fewer than **10** respondents is
suppressed. Treat the optional identity items as sensitive even though no name is
attached.

**Free text is where an identifying detail is likeliest to slip in**, which is why
the community catch-all in E3 has no text box, and why the text that does exist
(E5, the "please specify" boxes, and the optional gender self-description in E2) is
read by hand, and anything that points at a person is removed before results are
shared.

A short read by someone qualified in privacy law (PIPEDA, and Quebec's Law 25 once
there are Quebec respondents) before launch is cheap and worth it; this document
is not that.

## 5. Protecting quality without identifying anyone

- **Bots and spam:** a honeypot field, rate limiting, and a Cloudflare Turnstile
  check on starting. Turnstile does see an IP at Cloudflare, which is stated in
  the notice rather than skipped.
- **Duplicates:** a flag in the browser only. It stops accidental repeats. It
  does not stop a determined person, and we will not claim it does.
- **Speeding:** anyone under a third of the median time is **flagged, not
  removed**. The analysis is run with and without the flagged, and both are
  reported.
- **The attention check:** failed checks are flagged the same way.
- **What counts as complete** for each analysis is decided in advance (section
  6): someone who skipped the ranking is still in the recall results.

## 6. How the answers become weights

Written before any data, so it cannot be bent to fit it.

**1. Describe who answered.** Province, years performing, genre, how much music
is their living, shows played, income band, channel. Compare with the Hill
Strategies profile of Manitoba artists from the 2021 census where the categories
line up, and say plainly where the sample differs. Weight by those categories
only where each cell has enough people to bear it; otherwise report unweighted
and say so.

**2. Ranking.** Best-minus-worst score per factor, standardised, then a
multinomial logit on the best and worst picks for the utility of each factor.
Confidence intervals by resampling respondents (1,000 draws). Reported as a
ranked list and as a share of preference summing to 100.

**3. Comparisons.** A conditional logit with an alternative-specific constant for
**Neither**. Because pay, cost to apply and out-of-pocket cost are all in dollars,
every other attribute becomes a dollar value — *an audience of 2,000 rather than
100 is worth about $X; many people who could hire me again rather than few is worth
about $Y; each extra hour on an application costs about $Z.* Intervals by the
same resampling.

**4. Differences between groups.** Only the comparisons written here, to avoid
fishing: **income band × pay**, **how much music is their living × time away**,
**years performing × audience**. A difference is reported only if both groups
have enough respondents and the interval excludes zero.

**5. Do the three agree?** The ranking (what they say matters), the comparisons
(what they trade), and B4 and B5 (what they did) are three views of one thing.
Where they disagree — for example people ranking pay first while their recent
passes cite travel — that is reported as a disagreement. It is not averaged away.
It may be the most useful result.

**6. What it will not say.** Not "artists in Canada want X". Not causes. Not any
result for a group too small to report.

**What Scout does with it.** The dollar values and the ranking become the
*starting* weights for scoring an opportunity, labelled with the survey's date
and size. They are a baseline, not a verdict on any one artist. Each artist's own
decisions refine it later (step G in the pipeline plan), which is why a decision
has to be stored with its score.

## 7. Fieldwork and sample size

- **Read-through first.** Even though the first wave goes to the Manitoba Music
  network, two or three artists should do it aloud before the link goes out: say
  what each question means to you, answer, and say what you would have wanted to
  pick instead. About 15 minutes each. Confusing wording found here costs nothing;
  found in the data it costs the first wave.
- **The read-through is also where E2 and E3 get checked, by the people they
  ask about.** Choose readers so that several of the communities named in E3 are
  represented, and ask them specifically whether anything is missing, mislabelled
  or uncomfortable. The Canada Council's review asks for exactly this, and says no
  wording is ever final. Ask Manitoba Music, which has its own Equity &
  Accountability Policy, to look at the terminology too: the members it serves
  are the ones who will read it.
- **How many.** For a comparison design the usual rule of thumb is
  n × tasks × alternatives ÷ largest number of levels ≥ 500. With 8 tasks, 2
  alternatives and 4 levels that is **about 125 completed responses** for the
  overall result, and several times that for any group comparison. So group
  comparisons are likely out of reach of the first wave, and the first wave is
  reported as aggregate and indicative.
- **The Manitoba Music network may not reach 125.** If it does not, we report it
  as a Manitoba result with the interval it deserves and widen the link, tagging
  each new channel so the two samples can be told apart.
- **Open for three weeks**, with one reminder via the same channel. No incentive.
  A prize draw would need an email address, which is exactly what anonymity rules
  out. The return for taking part is the published summary, which is why the notice
  promises it.

## 8. What existing data says, and what is still unread

First pass only, five searches. The figures come from search summaries, **not**
from the reports themselves, so none should be quoted until read in the original.

- **Canadian Artists and Content Creators Economic Survey** (Canadian Heritage,
  2021): income volatility among musicians.
- **Survey on affordability and working conditions** (Cultural Human Resources
  Council, analysed by Hill Strategies, 2024): systemic barriers and the share
  earning under $10,000.
- **Barriers and enablers study** (Diversity Institute and Music Canada, 2023;
  624 respondents).
- **Hear and Now** (Canadian Live Music Association, with Nordicity, January
  2025): the sector's economic weight, and live shows and merchandise as most of an
  artist's income.
- **Hill Strategies' 2021-census profiles**, including one for Manitoba: who
  professional artists are, for comparing our sample against.

**The gap:** none of these, on this first pass, asks how an artist decides which
opportunities to apply for. That is what this survey adds.

**Still to read:** the originals of the above; FACTOR and CIMA reports; provincial
association member surveys (Manitoba Music, Music BC, Music Alberta); and anything
on how artists weigh application fees and travel costs specifically.

### How the wording of E2 and E3 was checked

Read, 2026-10-05:
- **Manitoba Arts Council**, the 2026 voluntary identification section of its
  grant application form, plus its 2017 explanation of why artists are asked.
  The closest thing to the wording a Manitoba artist has already answered.
- **Arts Nova Scotia**, the 2019 self-identification form for its equity funding
  programme. It ties the answers to eligibility for a targeted programme, which a
  survey does not, and it has no "prefer not to say".
- **The Canada Council for the Arts' review of collecting demographic data**
  (Hill Strategies, an excerpt, 2021): self-identification, select-all with a
  self-description, avoiding "othering", consulting the communities asked about,
  and a short privacy FAQ.
- **MusicNL's 2020 diversity and inclusion survey results** (a provincial music
  association). Results only: it shows that sexual orientation, a transgender
  question and gender identity were asked, but not how, and it reports nothing on
  race or disability.
- **A 2025 article on inclusive demographic questions** (Canview), through a
  fetched summary: select-all for ethnicity, self-describe and "prefer not to
  answer" for gender.
- **Manitoba Music's Equity & Accountability Policy**, from a screenshot of the
  page supplied by Doug. (The site refuses requests from Claude's tools; see
  below.) It names Indigenous Peoples, Black People, People of Colour and LGBTQ2S,
  "and the people who exist at those intersections", and lists ability and mental
  health among its concerns. E3's wording is consistent with it. Two small
  differences: it writes LGBTQ2S where the Manitoba Arts Council writes 2SLGBTQ+,
  which is why E3 spells the community out instead of relying on an acronym, and
  it capitalises People and Peoples. It describes no member survey and asks for no
  demographic information.

Not found or not read, so none of this should be treated as checked:
- **No music association's own questionnaire wording.** The Canadian Music Centre
  BC's equity survey and Sask Music's economic survey did not show their
  demographic questions in anything that could be opened, and MusicNL published
  results without the questions.
- **The Diversity Institute and Music Canada study** (624 respondents) is the
  likeliest published instrument from the music industry itself. Its report was too
  large to read here, and it should be asked for directly.

### How the "new to Canada" window was checked

The window is five years, chosen by Doug as a judgement call, and compared with
what federal and arts-sector bodies use. **The primary pages for most of these
could not be opened** (Statistics Canada's dictionary refused automated access with
a 403, as Manitoba Music did, and the CRA's report sits behind a disclaimer page),
so each figure below is from a search summary of the source, not from the source.

| Body | What it uses | Clock starts at |
| --- | --- | --- |
| **Statistics Canada**, "recent immigrant" in the 2021 census | The five years before the census (1 January 2016 to 11 May 2021) | Landing, or becoming a permanent resident |
| **CRA**, for its own 2023 study of newcomers | Within the last five years | Entering Canada, as a permanent **or temporary** resident (work or study), intending to settle |
| **CRA**, for tax purposes | The first year of residency only | The first day living in Canada |
| **IRCC**, settlement-service eligibility | About six years from April 2026, and five from April 2027, for economic immigrants | Becoming a permanent resident |
| **Toronto Arts Council**, newcomer artist programmes | Under seven years | Arriving as an immigrant or refugee |

**Five years agrees with Statistics Canada, with the CRA's research definition, and
with where IRCC's window is heading.** The one arts-sector figure found is longer
(seven).

**What the comparison turned up that the five years does not settle:** who counts.
Statistics Canada's clock starts at landing, so it counts permanent residents. The
CRA's research definition also counts people on work or study permits. A musician
here on a work permit is exactly the person whose touring and networks are most
constrained, and "landed" excludes them, and is immigration jargon besides, which
section 2 rules out. A plainer wording that includes them would be *"New to Canada
(you came to live here within the last 5 years)"*. **Closed on 2026-10-05:** Doug decided
it is not relevant to this tool, since what matters is whether someone who has moved here
means to build a career in music here. The survey keeps his wording, "landed within the
last 5 years", and the question is not being pursued.

**FACTOR and SOCAN:** no definition of "newcomer" or "recent immigrant" was found
for either. FACTOR's eligibility is by citizenship or permanent residence (found
for its Official Language Minority Communities showcase programme), which is not the
same question, and nothing was found for SOCAN.

## 9. Decisions

**Settled, 2026-10-05:**

1. **Length: aim for ten minutes.** B6 to B8 are cut (parked in section 3), which
   brings the estimate to about ten; that is an estimate until the read-through
   times it. **The open question stays, out of the cut order I proposed**, because
   decision 3 leans on it: it is the one place respondents can tell us what the
   factor list missed. If the read-through runs over, cut next from A8 and B3, then
   reduce the ranking screens, and the open question last.
2. **Nine of the thirteen ranking screens per respondent.** Fine for the average
   artist, which is the aim; thirteen would only be needed for an estimate of one
   person.
3. **The factor list stays at thirteen for the first wave, shown the same way to
   everyone, and nothing is hidden by who the respondent is.** Nobody can say what
   is missing until responses arrive, so the open question (E5) now asks for it
   directly, and the second wave prunes or adds factors using the first wave's
   data. The reasoning against hiding factors from, say, hobby-level artists is
   principle 12 in section 2.

**Still open** (the build takes the default in brackets, and each is easy to change):

4. **Optional personal questions** (E1 to E4). Is asking these in an anonymous
   survey to a small network acceptable to you, given the re-identification risk in
   section 4? Dropping E3 is the cheap way to lower that risk, at the cost of not
   seeing equity differences. E2 and E3 were reworded after comparing them with the
   Manitoba Arts Council's form (see the end of section 8); "New to Canada" is five
   years as decided, and whether it should also include people on a work or study
   permit was closed as not relevant to this tool. [Asked, as drafted.]
5. **Saved as you go.** Keeping partial answers lets us see where people drop out,
   and the notice says so. The alternative is to keep nothing until someone
   finishes. [Saved as you go, with Close without saving to delete.]
6. **Where the results go**, and who the contact address belongs to. The notice
   promises both. [The survey does not open until a contact address is configured.]
7. **No incentive.** Agreed? [None.]
8. **An anchor question after the ranking** (proposed in answer to decision 3, see
   principle 12): one screen asking which of the thirteen factors the respondent
   would actually weigh, so a hobby-level artist who finds most of the list
   irrelevant is visible as that and not forced into a relative ranking. About 30
   seconds, which puts the estimate nearer 10 and a half minutes. [Not built;
   additive if wanted.]

**Risks worth saying out loud.**
- A single association's members are not a sample of artists. They skew toward
  people already organised enough to join one.
- People who answer a survey about opportunities may be unusually active in
  seeking them, which would overstate how much they care about the application
  itself.
- A dollar value inferred from made-up opportunities is a stated preference, not
  behaviour. The comparison with B4 and B5 is the check, and it is partial.
- Anyone may share the link, and we will not know where it went except by the tag.

## 10. What was built, and how to open it

**It is closed by default.** Shipping the code does not publish anything.

### To launch

None of this is in `wrangler.toml`: the survey's switches are settings the owner changes
in **Admin mode → Artist survey**, stored in the database, so opening or closing a
public survey never waits on a deploy.

1. **Set a contact address** in that panel: a mailbox somebody reads. The notice every
   respondent reads promises one, so the survey will not open without it, and the
   panel will not let it be removed while the survey is open.
2. **Set up the spam check.** In the Cloudflare dashboard (Turnstile → Add site, this
   site's hostname) make a widget. Paste the **site key** into the panel. The **secret**
   is the one piece that is not a setting, because a secret cannot be saved from a
   screen: add it in the dashboard under the Worker's Settings, Variables and Secrets
   as a secret named `TURNSTILE_SECRET_KEY` (or `wrangler secret put
   TURNSTILE_SECRET_KEY`). Secrets survive a deploy. Without both halves the survey
   still runs, and the panel warns that the notice describes a Cloudflare check that
   would not be running: do not share the link in that state.
3. **Do the read-through** (section 7): two or three artists, aloud, including people
   from the communities in E3, and ask Manitoba Music to look at the terminology.
   This is also the only way to time it. About ten minutes is an estimate until then.
4. **Have the privacy read** (section 4) by someone qualified, before a public link.
5. **Press Open the survey.** It takes effect on the next request. **Close the survey**
   stops new starts and lets anyone partway through finish.

The results address in the notice is `/survey-results` on this site, a route of the
Worker. It is not a setting: a link that went nowhere would make the notice's promise
look false. Until something is published it says the results have not been posted yet.

### Publishing the summary

6. **Review, then publish.** In the same panel, *Publish the summary* shows the public
   page exactly as it will read, built just now, and nothing is public until you press
   **Publish this**. It needs 30 completed responses; below that it says how many are in.
   It uses the exclusions you have set above (leave out those who failed the attention
   check, leave out the fastest), and the page says how many were left out and why.

What is public is a **stored snapshot**, not a view of the responses. The notice promises
that a small group is never reported, and a page computed on every visit would break
that the moment the tenth person in a category had not yet answered. So publishing is an
act, and the page changes only when you publish again. The panel says when responses have
come in since, and **Take it down** removes it at once.

The Worker builds the snapshot from an allow-list, and the browser sends only a digest of
what you looked at. If responses arrive between your preview and your press, the digest no
longer matches, the Worker refuses, and you review the new version first. What is reviewed
is what is shown.

What the public page carries: the ranking (best minus worst, averaged over artists, with
the range each is likely to sit in), the dollar values with their ranges when pay can be
told from zero, the reasons for passing and for applying, how artists find opportunities,
and who answered by province, years performing, how they perform and how much of their work
music is. What it never carries: a response, a channel tag, a free-text answer, and age,
gender, community or income. In a first wave from one provincial network a breakdown of a
few of those is a short step from a name, and the owner's panel is where they are read.

The sentences on the page are written from the same bands as the charts. A factor is
called clearly above or below average only when its whole range is, two are called tied
when their ranges overlap, and an entry-fee dollar is not called "about a dollar" when the
range runs from nothing to three. The comparison the method section calls the most useful
result, what artists say matters against what stopped them, is a slopegraph of the reasons
that at least ten artists gave, with the count of those left out.

The owner's page for all of this is **Admin mode → Artist survey**: the switch, the
contact address and site key, a link builder that tags a channel
(`#survey?src=manitoba-music-newsletter`), who has answered, the results, the summary
to publish, and a CSV download.

### Where it lives

| What | Where |
| --- | --- |
| Every word and answer shape | `shared/surveyInstrument.ts` |
| What one respondent is shown, from one seed | `shared/surveyDesign.ts` |
| The paired-choice design (generated, committed) | `shared/surveyChoiceDesign.ts`, `scripts/generate-survey-design.ts` |
| Checking every answer against the plan | `shared/surveyAnswers.ts` |
| What a tap means; when Next unlocks | `shared/surveyDraft.ts` |
| The model, the dollar values, the summary, the export | `shared/surveyAnalysis.ts`, `shared/surveyLogit.ts` |
| Public routes, `/api/public/survey/…` | `src/routes/survey.ts` |
| The owner's routes, `/api/admin/survey` | `src/routes/admin.ts` |
| The switch, contact address and site key (`app_settings`) | `src/lib/surveySettings.ts` |
| The page the notice sends results readers to | `frontend/src/pages/survey/SurveyResultsPage.tsx`, `/survey-results` in `src/index.ts` |
| What may be public, and the sentences written from it | `shared/surveyPublic.ts` |
| The stored snapshot, and its digest | `src/lib/surveyPublication.ts` |
| The summary page and its charts | `frontend/src/pages/survey/results/` |
| Reviewing and publishing, in admin mode | `frontend/src/components/SurveyPublish.tsx` |
| The table | `migrations/0035_survey_responses.sql` |
| The respondent's screens | `frontend/src/pages/survey/` |
| The owner's panel | `frontend/src/components/SurveyPanel.tsx` |

### What differs from the draft above

- **B6 to B8 are not in the survey** (cut for length, section 9, decision 1).
- **The choice screen is a table**, one row per attribute with Opportunity A and B
  side by side, not two cards. On a phone two cards meant scrolling between the
  two things being compared.
- **The notice says the browser keeps a random code**, because it does: it is how a
  refresh or a later visit resumes. It keeps nothing else, and never an answer.
- **The attention check** is checked by the server and shown to the owner as a count
  of passed, failed and not reached. Nobody is removed unless the owner asks.
- **Rate limits are global.** A per-sender limit needs something that recognises
  the sender, and the notice says no address is stored, not even a hash.

### What is not built

- **French.** The structure is ready (every string is `{ en, fr? }`, ids are stable)
  and nothing is translated. It waits on the English settling after the read-through.
- **Group comparisons on the public page, and any breakdown by age, gender, community or
  income.** Left out on purpose, as above.
- **The anchor screen** (section 9, decision 8). Additive if wanted.
- **Intervals by resampling.** `bootstrap()` exists and is tested, but the owner's page
  shows model-based ranges only. The method section calls for resampling for the
  final report.
- **An automatic test for an order effect.** The page shows how many respondents saw
  each order; comparing their answers is by hand.
- **Group comparisons.** Income against pay, how much music is their living against
  time away, and years performing against audience (section 6, step 4) need more
  responses than a first wave will have.
- **Wiring the weights into Scout.** The result is a table the owner reads. Nothing
  scores a gig with it yet; that is the scoring side of the pipeline plan, and it
  waits on there being data.
