# The artist profile: what feeds it, where files live, and what it looks like

> **Status, 2026-09-24.** Built: Bandsintown (migration 0027,
> `shared/bandsintown.ts`, Settings → Bandsintown, Shows on the EPK tabs) and
> Manitoba Music profiles (`shared/manitobaMusic.ts`, Settings → Manitoba
> Music, an import panel in the library). **Social platforms are set aside**:
> the scan reads websites and public industry profiles only. Everything else
> here is a plan. Mockups of the profile are on the canvas "Scout EPK
> redesign".

The EPK today is a list of assets grouped by kind. It works as a checklist and
reads like one. What a programmer or a journalist expects is an **artist
page** — the shape Spotify, Bandcamp, Apple Music and Bandsintown have all
converged on: a big photo and name, one obvious "watch live" and "listen", the
music, a bio, the dates, and then the paperwork. This plan is the three things
that page needs underneath it.

## 1. The page

Three views, mocked up on the canvas:

- **The profile, as a programmer sees it.** Hero photo with its credit, name,
  genre line, hometown and one stated number (monthly listeners) *with the date
  it was true*. Live video first, because it is what a festival programmer
  watches before deciding. Popular tracks. A bio with a 50 / 150 / full switch
  and Copy, because those are the lengths forms ask for. Shows (Bandsintown).
  Press quotes and recognition. Press photos, each captioned with its credit,
  and a full-resolution download. A "For programmers" block: stage plot, input
  list, rider, booking contact.
- **The same page on a phone**, one column with section tabs.
- **The artist's own view**: the same page with its health drawn on it —
  overdue, never reviewed, missing credit — beside what the scan found and the
  sources it reads.

The audience cut (festival / sync / press) stays exactly as `assembleEpk`
already does it; the redesign changes how a cut *looks*, not what goes in it.
"Kept current with Sun Dogs Music Scout" in the footer is the product's name
in full, never "Scout" alone.

A public share link is new: today the EPK is only visible signed in. It wants
an unguessable token in the URL fragment (the invitation rule) and a
revocation, and it serves only what the chosen cut contains.

## 2. Where files live

**Recommendation: Cloudflare R2 for files Scout serves, with Google Drive as an
optional place to import from.**

Drive with the `drive.file` scope is attractive: it is non-sensitive, needs no
Google verification, uses the artist's own storage (15 GB free, up to 2 TB on
Google One), and lets them pick files they already have. It is the wrong place
to *serve* from. A share link that must load a hero photo on every view would
be hot-linking Drive, which is rate-limited and not a CDN, and would need every
file set to "anyone with the link" — a sharing change on the artist's own
Drive that outlives Scout.

R2 is on the account already, charges no egress, and is free to 10 GB-month
(then $0.015/GB-month). At an EPK's size — a dozen photos, a few WAVs, a
stage plot — one artist is well under a gigabyte, so a hundred artists fit in
the free tier. Uploads go browser → R2 on a short-lived presigned URL the
Worker issues, because a Worker request body tops out at 100 MB on this plan
and a live video file is bigger than that. The Worker never holds the bytes.

Video stays on YouTube. Hosting a performance video is a video platform's job,
and a programmer clicks a YouTube link without thinking about it.

The rule that carries over: a photo counts only once it has a credit, and an
uploaded file is an asset like any other, with a review date.

## 3. Industry-association profiles: Manitoba Music first

The testers after the owner are other Winnipeg artists, and most of them keep
a Manitoba Music member profile. It is a better source than a personal
website: every profile has the same server-rendered markup, written by the
artist — bio, genres, a Websites list, Media & Downloads (the owner's has a
stage plot and an EPK PDF), YouTube videos, a discography with release dates,
photos, shows and news. `robots.txt` allows `/profiles`.

**The artist gives the address.** Scout never searches for a profile by name:
the day there are two artists with one name, a search files a stranger's bio
as yours. `profileUrl` accepts only `/profiles/view,<n>/<slug>` on
manitobamusic.com, and connecting reads the page and shows the name, photo,
genres and what it found — "Is this you?" — before anything is saved.

**What it files, and what it leaves.** Bio, genre, links, videos, releases,
downloads and photos become proposals in the same shape the reference-document
import uses, previewed and then written as never reviewed. A proposal is
dropped when its `source` *or its value* is already on file, so the Instagram
link your reference docs filed is not filed twice. Contact details are never
copied. Shows are left to Bandsintown and news is named rather than written
into a bio.

Two things the real site taught:

- **Photos are hot-link protected.** An image request carrying another site's
  `Referer` gets a 403; one with none gets the image. Links from Scout already
  send no referrer, so opening a photo works, but an EPK page that *displays*
  one has to serve its own copy — which is the R2 decision below arriving
  early.
- **A read can fail on its own.** One of four reads in a minute came back as
  an error while testing, and the next worked. The import re-reads the page
  before writing, so a failure writes nothing and says so; trying again is the
  fix.

Other provincial associations (SaskMusic, Alberta Music, Music Nova Scotia
and so on) may keep public member directories too; none has been checked. Each
would be its own parser plus a `profileUrl` pattern — add one when a tester has
a profile there, not before.

**Not built: re-reading on a schedule.** The profile is read when the artist
opens the panel. A weekly re-read would compare against the library and raise
a bell condition — "your Manitoba Music profile has 3 things Scout does not"
— which is the scan below, pointed at one page.

## 4. The artist scan

The research agents find opportunities on a schedule; the same shape can find
news about the artist. A new routine, `artist-profile-scan`, weekly, reading
the links on the artist's profile, and filing **findings** — never assets. A
finding is a proposal the artist accepts ("Use as live video", "Add to
shows", "Add to recognition") or dismisses, the same rule as a suggestion not
being an answer. What it looks for: new live videos, show announcements,
awards and shortlists, press quotes, releases.

What each source actually allows, checked 2026-09-24:

| Source | How | Needs |
| --- | --- | --- |
| Artist's website, Bandcamp, Linktree | Read the public pages | Nothing |
| YouTube | The channel's public uploads feed, or the Data API (`playlistItems.list`, 1 unit of a 10,000/day quota) | Nothing, or a free API key |
| Press, festival line-ups, award lists | Web search for the artist's name | Nothing — the routines already search |
| Bandsintown | Built — the artist's own key | The artist's key |
| Instagram | Instagram API with Instagram Login: the artist's **own** media, Business or Creator accounts only. Basic Display was shut down in December 2024 | The artist connects, and Meta app review |
| Facebook Page | The artist's own Page with `pages_read_engagement`; reading other Pages needs Page Public Content Access, which needs business verification and review | The artist connects, and Meta app review |
| TikTok | Display API: `user.info.basic` + `video.list`, the authorising user's own videos only | The artist connects, and TikTok app review |

**Set aside, 2026-09-24:** the scan reads websites and public industry
profiles; the social platforms below are recorded for later and not planned.

**The three social platforms are not scraped.** All three put public profiles
behind login walls and bot defences and forbid scraping in their terms, and a
routine that reads them would break weekly and could get the artist's account
flagged. Each has an official path that reads *the artist's own* posts once
they connect — which is exactly what this feature wants — at the cost of an
app review per platform. That is real work and belongs after the three free
sources prove the findings inbox is worth having. Until then, web search still
turns up an Instagram or TikTok post that someone else wrote about.

The routine gets the same fences as the others: named tools only, an agent
token limited to `list_artist_sources` (links only — never documents like a
W-8BEN), `list_findings`, `file_finding` and `log_run`, and the instruction
that a web page's text is information, never a request.

## 5. Getting the Bandsintown key

The key is per artist, so every artist has to fetch their own, and the hard
part is finding the page. The card links straight to it —
`artists.bandsintown.com/artist/settings/general` — with the three steps
beside the form, and checks the key with Bandsintown before saving.

**A form-filler cannot do this part for them, and should not.** The key sits
behind the artist's Bandsintown login. A browser extension running in their
own session could *navigate* there and highlight the button — that is the
same extension the submission-assist research describes, working in a tab
they are already signed into — but reading a credential off a page and
posting it to Scout is an extension exfiltrating a secret, which is the thing
a Chrome Web Store review looks for and the thing an artist should be wary
of. The honest version is: the extension opens the page and points at the
button; the artist presses Copy and pastes. The deep link gets most of that
benefit today without an extension.

**Before inviting other artists, ask Bandsintown.** Their help page says the
API is for artists and their teams to display event data "on their website or
app", and that data "is not meant to be used in any other circumstances
unless specifically approved". An artist showing their own dates in their own
EPK through Scout reads as within that; a platform doing it for many artists
is the case their partner programme (`API@bandsintown.com`) exists for, and a
partner key would also remove the step above entirely.
