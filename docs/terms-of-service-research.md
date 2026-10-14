# Terms of service: what comparable services say, and where ours differs

The page is `frontend/terms-of-service/index.html`, served at
`/terms-of-service/`. This file is the comparison it was revised against on
2026-10-13, so the next person changing a clause can see what the clause was
measured by. The legal position is not advice: it is a researched draft, and a
lawyer's read is still worth paying for before a second artist signs up in
volume.

## What was compared

Read in full on 2026-10-13. Each is the operator's own document, not a summary.

| Service | Document | Law and forum | Liability cap | Change notice |
| --- | --- | --- | --- | --- |
| Bandsintown (artists) | corp.bandsintown.com/terms-artists, May 2024 | New York, JAMS arbitration, class waiver | none stated, excludes indirect | none stated |
| SOCAN | socan.com/terms-of-use, January 2020 | Ontario, exclusive courts | none stated, excludes indirect | continued use |
| SubmitHub | submithub.com/about/terms | Delaware, AAA arbitration, class waiver | greater of fees paid or commissions, no floor | none |
| Bandzoogle | bandzoogle.com/terms/terms-of-service and terms-of-use | New York arbitration (service); Ontario, Ottawa courts (site) | greater of $50 or amounts paid | effective on posting |
| FACTOR | factor.ca/terms-of-use, February 2013 | Ontario, exclusive courts | none stated, excludes indirect | none |
| ReverbNation | reverbnation.com/termsandconditions | Singapore, SIAC or AAA arbitration | lesser of 3 months of fees or $250 US | none (30 days for arbitration) |
| Groover | general terms, April 2025 (French original controls) | France, Paris courts, consumer mediation | proven direct damage only | 15 days |
| Submittable (submitters) | submitter terms of use, October 2023 | Montana courts, jury waiver | greater of amount paid or $500 | effective on notice |

Not read: Manitoba Music (the terms page returned 403), Sonicbids (host would
not resolve), Songtradr. SOCAN, FACTOR and Bandzoogle's site terms are the
Canadian ones, and they are the closest in form: a province's courts, English
only, no arbitration.

## What the others do that ours deliberately does not

- **Perpetual, sublicensable, worldwide content licences** (Bandsintown,
  ReverbNation, Submittable's public areas, SubmitHub). Ours is for running the
  service, for as long as the account exists, and ends with it. Bandzoogle's
  "limited, revocable, solely for the Term" is the one it resembles.
- **Changing the terms without notice**, which is most of them. Ours promises 30
  days, which is longer than any of the eight.
- **Closing an account in sole discretion without notice.** Ours says why and
  gives a chance to put it right unless the matter is urgent.
- **Arbitration, class-action and jury waivers.** Most of the US peers have
  arbitration (Submittable has a jury waiver and a Montana court) and the
  Canadian ones do not. Quebec treats a consumer arbitration clause as void, and
  an artist's complaint against a sole proprietor is better in a Manitoba court
  than in a stranger's arbitration forum.
- **DMCA takedown procedures and US export control language.** The Copyright Act
  has notice-and-notice instead, so the page asks for what a notice needs and
  nothing more.
- **Auto-renewal, chargebacks and fee forfeiture** (Bandzoogle, SubmitHub,
  ReverbNation). Nothing here takes payment.
- **Inactive-account deletion** (ReverbNation after six months). The privacy
  policy says inactive accounts are not removed on a schedule.
- **A ban on disparaging the service** (Submittable). It is not a thing a
  musician should have to promise.

## What was added because the comparison found it missing

- **Somebody acting for an artist.** Bandsintown, ReverbNation and Bandzoogle all
  say a manager or agent must be authorised and binds the artist.
- **Capacity as well as age.** Bandsintown, Bandzoogle and Groover tie
  eligibility to being able to make a binding agreement where the person lives.
  The age stays 18, which is the owner's decision.
- **Dealings with an organiser are not ours.** ReverbNation (6(b)) and Groover
  (article 19): the service is not a party and is not responsible if it falls
  through.
- **An indemnity.** Seven of the eight have a user indemnity (SOCAN does not),
  and most are open-ended. Ours is narrow: what you put in, published or sent, in breach, to the extent
  you caused it, never something we did wrong. A sole proprietorship has no
  corporate shield, which is the reason to have one at all.
- **An exclusive forum.** SOCAN, FACTOR, Bandzoogle's site terms and Groover all
  name one. Ours gives way to a right to sue at home, which is the part a court
  would otherwise set the clause aside for.
- **A right to remove something published**, including switching a press kit link
  off (Bandzoogle, SubmitHub, FACTOR, Submittable).
- **Loss of information, and "reference only".** Bandzoogle, Groover (11.1(viii))
  and Submittable's data clause.
- **Tax and legal duties stay with the artist** (Groover 11.1).

## Where the figures came from, and which are the owner's call

- **$100 Canadian cap.** Peers' floors run from $50 to $500 US. A free service run
  by one person sits at the low end, and a low figure on a free service is less
  likely to be read as unconscionable. Change it by changing the number and the
  sentence together.
- **30 days** for a changed term, a paid plan or closing the service. Matches the
  privacy policy's answer time, and is stricter than every peer.
- **Free today.** `test/termsOfService.test.ts` fails if a payment processor
  appears anywhere in the code, so the sentence cannot go stale quietly.
- **Governing law is Manitoba**, where the business is registered. SOCAN, FACTOR
  and Bandzoogle's site terms use Ontario because that is where they are.
- **English only**, as the privacy policy is. This is a real gap and not a small
  one: see "Quebec" below. It is the owner's decision and it is not closed here.

## Things the comparison turned up outside the terms

- The privacy policy's retention list still says an unused invitation is kept
  until someone asks. Invitations are now pruned 90 days after they stop working
  (`UNUSED_INVITE_RETENTION_DAYS`), so that row is stale and so is its test.
- The privacy policy says a person "can also run an agent of your own with a
  token you issue in Settings". The Agent tokens card is shown to the owner only
  (`session?.role === 'owner'` in `SettingsPage.tsx`), so an artist has no such
  control. The terms are written around whoever holds a token, and
  `test/termsOfService.test.ts` fails if they start telling every artist to issue
  or revoke one in Settings.

## What Canadian legal commentary says

Read on 2026-10-13. Where a firm's own page refused the fetch (Fasken and the
Lexology copies returned 403, McCarthy Tetrault and Norton Rose Fulbright
returned a navigation shell for two articles), the finding below comes from the
search-result summary of that article and is marked "summary". Nothing here was
read from a judgment. A Canadian lawyer should confirm any of it before it is
relied on.

| Source | Read | What it contributes |
| --- | --- | --- |
| Gowling WLG, "Bill 96's French First rule takes effect" (June 2023) | in full | Section 55 of the Charter of the French language and website terms |
| Norton Rose Fulbright, mutual agreement contracts with standard clauses (March 2022) | in full | The adhesion contract line, written before the final text |
| Canadian Lawyer, "Beyond click-through agreements" (July 2020) | in full | The shift to non-negotiable online terms; cites no cases |
| Fasken, "Mind the Wrapping" (February 2020) | summary | Clickwrap against browsewrap, Century 21 v. Rogers, 2011 BCSC 1196 |
| Torys, "You're making a bad deal: Tilden Rent-A-Car rides again" (March 2020) | summary | Onerous terms in a standard form must be drawn to attention |
| McCarthy Tetrault, Dentons, BLG and Fasken on Douez v. Facebook, 2017 SCC 33 | summary | Forum clauses in consumer contracts; a free service counted as one |
| McCarthy Tetrault, Fasken and Miller Thomson on Uber v. Heller, 2020 SCC 16 | summary | Unconscionability reaches standard-form terms, not only arbitration |
| Lexology, McCarthy Tetrault and Cassels on Tercon, 2010 SCC 4 | summary | The three-step test for limitation clauses |
| Norton Rose Fulbright and Lavery on Videotron v. Union des consommateurs (QCCA, 2017) | summary | Unilateral amendment: circumstances, criteria, section 11.2 |

### What they recommend

1. **Affirmative assent, with evidence of it.** Clickwrap is the reliable form and
   browsewrap is fact-dependent. Where terms are only linked, they should be
   available before the person commits and say that going on is accepting.
2. **Draw stringent terms to attention.** Under *Tilden* and *MacQuarie v. Durham
   Drug Store*, a stringent term in a standard form is not enforced merely because
   the form was signed or the link existed. The more a clause matters to the
   person's rights, the more a business has to do to point at it.
3. **Write a limitation clause so that it covers the loss likely to happen, caps
   rather than excludes, and carves out fraud, wilful misconduct and gross
   negligence.** Quebec adds art. 1474 CCQ: intentional or gross fault, and bodily
   or moral injury, cannot be excluded.
4. **Do not assume only the arbitration clause is at risk.** *Uber v. Heller* is
   about unconscionability in standard-form contracts generally, and what moved it
   was cost and mechanics the person could not see.
5. **A forum clause in a consumer contract needs strong cause not to be enforced
   against.** *Douez* counted a free service as a consumer contract, and said a
   business cannot contract out of local privacy law.
6. **Say what may change, why, with notice, and let the person refuse.**
   Quebec's Consumer Protection Act s. 11.2 asks for the amendable elements, 30
   days of written notice and a right to refuse and cancel, and art. 1373 CCQ asks
   for specific circumstances and criteria.
7. **Plain headings, a privacy policy that agrees with the terms, and terms
   written for this service rather than copied.**

### What they say is commonly missed or poorly written

- Terms reachable only through a footer link, with nothing at the moment of
  agreeing and no record that the person agreed.
- A clause that lets the business change anything, at any time, without notice.
- A liability exclusion with no cap, no carve-outs, or wording that does not reach
  the breach most likely to occur.
- The Quebec sentence: that a limit may not apply to a Quebec resident.
- Arbitration with the cost and place undisclosed.
- A template from another jurisdiction, with its arbitration clause, its DMCA
  procedure and its export-control language left in.

### Quebec, which is the one thing here that is a gap and not a choice

Since 1 June 2023, section 55 of the Charter of the French language lets an English
contract of adhesion bind a person only if a French version was handed to them
first and they then expressly chose English. Gowling's article does not limit the
rule to consumers, and lists website terms and conditions among the documents it
reaches. Whether a given document is a contract of adhesion has been argued in
Quebec courts and is not settled. The exemption for contracts used with people
outside Quebec does not help a Quebec artist, and the cost of the French version
cannot be passed to them. An English clause saying the parties wanted English is no
longer enough, and a language toggle on the page may not be either.

The page says it is English only and asks a Quebec resident to write before
creating an account. Because accounts are by invitation, the owner decides who is
invited and can hold an invitation to a Quebec artist until there is a French
version or the person has asked for English after reading one. The privacy policy
has the same gap.

### What was changed because of it

- The three onerous terms (the limit on responsibility, the indemnity, and the
  forum) are each in the short version at the top, and the invitation screen names
  two of them beside the button that agrees.
- The limit now excludes injury to a person from its reach, and says in a sentence
  what a Quebec resident keeps.
- The forum clause says outright that a Quebec resident keeps the Quebec courts.
- The change clause names its four reasons and its elements, promises 30 days and
  a way out, and says a change is not retroactive to a dispute already begun.
- The language line asks a Quebec resident to write first.

### What was not done, and is the owner's call

- **No record of acceptance.** Nothing stores which version of the terms an account
  agreed to, or when. Every firm that writes on this puts it near the top, because
  it is the evidence in a dispute about whether a term was agreed. It needs a
  nullable column and a write in the invitation redemption, and is queued as its
  own change.
- **No re-acceptance on a material change.** The page promises notice and treats
  continued use as acceptance, which is the weaker form. A prompt at next sign-in
  that must be accepted is the stronger one, and needs the same record.
- **No checkbox.** The invitation screen is one action on purpose. A ticked box
  would be firmer evidence and one more click. The record above matters more.
- **No French version**, and no Quebec lawyer has read either document.
