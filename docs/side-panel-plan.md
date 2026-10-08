# The side panel, and where the navigation lives

Two questions came out of the History work and are answered together, because
they compete for the same pixels: what should stay in view on the right while you
work, and whether the main navigation should move from the top to the left.

Research was a handful of searches on 2026-10-07. Most of what exists on this is
practitioner writing, not studies, and the sources below say so themselves. It is
used here to find the questions worth asking, not to settle them.

## 1. What shipped

The notifications can be pinned. The bell's dropdown has a pin button; pinning
docks the same list in a 22rem column on the right, beside the page, under the
header. Everything about it is in `frontend/src/components/SidePanel.tsx`,
`NotificationPanel.tsx` and `frontend/src/sidePanel.ts`.

| State | What the bell does | What is on screen |
|---|---|---|
| Not pinned | Opens a dropdown | The page |
| Pinned, shown | Hides the panel | The page and the panel |
| Pinned, hidden | Shows the panel | The page |
| Pinned, window under 1280px | Opens a dropdown | The page |

`pinned` and `open` are two flags on purpose. Hiding a pinned panel to get the
width back must not unpin it, or the next click on the bell opens a dropdown
where the person expected their panel. Both live in `localStorage`
(`scout.sidePanel`), because they describe one person on one screen and pinning
on a wide monitor must not pin on a phone.

The header of the column has the tabs on the left, and on the right the panel's
own way out (the full History for the notifications, the Artist page for the
answers), then Unpin and Hide. Mark all read sits at the top of the
notifications panel. The answers have a book icon in the page header beside the
bell, which shows the column on that tab, and a menu item below 1280px.

**The threshold is 1280px, and it was measured.** The first version docked from
1024px. At 1100px the Gigs table, which needs about 830px of page, sat behind a
horizontal scroll inside its card on every visit. The panel takes 352px of the
screen and the page's gutters 64, so the table needs a window of about 1250px.
At 1280px it fits with nothing scrolling, which was checked on every page.

**The panel polls nothing.** The bell is on every page and polls the feed every
five minutes. Two observers each with their own interval would fetch twice per
period for one list, on a read that costs about 155 rows, so only the bell
polls and the panel reads what it keeps fresh. `test/historyUi.test.ts` fails if
that changes.

**It is never docked in admin mode.** The bell and every route behind it are
refused there.

## 2. What the research says about a docked right panel

- A permanently docked notifications column is not a common pattern. The bell
  almost always lives in the top bar, and a docked panel pays off mainly for
  people triaging a queue while they work. For occasional alerts a dropdown is
  enough. That is why it is an option and not the default.
- Side panels hold *supporting* material: context, secondary tools, reference.
  Design systems that describe them (GitLab Pajamas, Workday, Carbon) keep the
  decision itself, the approve or reject, on the page and the panel for what you
  need to look at while deciding.
- Pick one place for a given detail. A ClickUp feature request describes the
  failure of showing notification content both inline and in a side panel: it is
  unclear where relevant content will be and it wastes the space.
- Remember the state between sessions, show the unread count on the icon even
  when the panel is closed, and give the panel a named landmark. All three are
  done.
- Navigation panes belong on the left and contextual panels on the right,
  because a navigation choice changes the main view and a contextual panel
  follows it. That is the layout this app is heading toward if the navigation
  moves (section 4).

## 3. What else could be pinned

Ranked by how much it would save someone working through approvals. Each is
tied to data the app already holds.

### 3.1 Answers at hand (an at-a-glance artist profile)

The best candidate, because applications ask for the same facts again and again
and the artist currently leaves the page to find them. What real showcase and
festival forms ask for, from the three forms and two guides read for this:

- A short bio, with a limit that varies from about 50 to 200 words.
- Members and what they play, and whether a solo act brings anyone on stage.
- Up to three genres.
- A press photo: landscape, colour, no watermark, no text on it.
- A stage plot or input list, and power requirements.
- Links: an EPK, three to five tracks, a live video.
- Recent and upcoming shows, and who is on the team.

All of that is in `artist_assets` already, and `classifyQuestion` is the same
function that files a form field's label. So the panel is a list of the
questions forms ask, each with its answer and a Copy button, ordered by how
often it is asked. What makes it better than the Artist page is that it can say
what is wrong *before* the paste: the photo has no credit, the follower count was
last reviewed eight months ago, the bio exists in a 50-word version and not a
200-word one. `assetHealth` already computes all of that.

A press quote did not appear in any of the forms read. The library keeps them,
and whether to put them in the panel is a question for the artist.

**Built (2026-10-07).** The panel is the second tab in the column, and below
1280px it is a dialog opened from the menu. What it does, and the decisions
that are not obvious from using it:

- **Grouped by what is being asked**, not by how the library files it: bio and
  story, about you, links and recordings, press photos, stage plot and
  paperwork, numbers, practical details. The library files the same fact under
  several spellings (`bio_short`, `stat`, `link`), so an entry is grouped by its
  kind first and by what its label asks second, through the same
  `classifyQuestion` the form reader uses (`shared/answersAtHand.ts`).
- **Ordered by what is asked of this artist.** `application_fields.question_kind`
  is already stored for every field on every form they have opened, so the order
  is a count. With nothing counted, a fixed order stands in, and a shorter bio
  sorts before a longer so the one that fits a limit is first.
- **Copy copies something sensible.** A bio is copied as text without its
  markdown, the name fact (three lines in the library) as its first line with
  *Copy all lines* beside it, the genre as its clause with *Copy everything*, a
  photo as its address with *Copy credit*. The clipboard result is reported:
  *Copied*, or *Could not copy*, never a "Copied" over a refusal.
- **It says what is wrong before the paste.** A photo with no credit and a link
  that is not a link are *broken*; anything past its review date is *overdue*,
  with how long in the coarsest true unit. *Not reviewed yet* and *due soon* are
  said quietly and are not counted as problems: a library sourced from documents
  is mostly unreviewed, and a flag on every row is a flag nobody reads.
- **It names what it could not offer.** A question the applications ask and
  nothing on file answers is listed with how often it was asked, up to six. One
  that names the event ("why this festival") is never listed, because nothing on
  file could answer it in advance. Paperwork is not matched by its label: the
  classifier reads "minutes" as a set length, and a set list is not one, so a
  document answers only the question it was filed under. A gap hidden is worse
  than a gap named twice.
- **It never edits.** Fixing a credit is the Artist page's job, and a second
  place to edit an entry is a second place for it to be wrong. The panel says
  what is wrong and links there.

What it does not do: recent and upcoming shows and the team are not in the
library (shows are read from Bandsintown on the Artist page), so they are not
here; and it does not warn that a bio exists at 50 words and not at 200. It shows
each bio's true word count and leaves the choosing to the artist.

### 3.2 Deadlines and reminders

The next five deadlines and the reminders that are due, one line each, linking
to the gig. It is already derived (`summary.timing` and `reminders`) and costs
nothing new. It overlaps the Overview's timing strip, so it earns its place only
if it is visible on the pages that are not the Overview, which is the point of
pinning it.

### 3.3 The stage counts

New, In progress, Applied and the closed outcomes as four numbers and the next
item to look at. Derived, cheap, and useful for the sense of progress while
working through a batch. Low value alone; it would sit well at the top of 3.2.

### 3.4 Notes for the session

A scratch area that persists, for the thing you are about to paste into three
forms. Needs a `tenant_settings` row and nothing else. Common in CRM sidebars,
and the first place people reach for when the app has none.

### 3.5 Details of the open gig

A panel that follows the selection and shows the cost range, the visa lead time,
the correspondents and the form's readiness. The research warns against it here:
the Review and Gigs detail already show these, and a second copy beside them is
the duplication that ClickUp request describes. It makes sense only if the detail
moves out of the page into the panel, which is a larger decision than this
document.

### 3.6 Quick settings

Appearance, digest day, nudge routing. The least useful of the six: settings are
consulted rarely, not while working, and the theme toggle is already in the
header. Not recommended. The one exception worth considering is a *quiet hours*
switch that mutes the bell's badge, if the artist asks for it.

### 3.7 How the frame grows

The column has two occupants now, so it has the switch the research asked for:
one panel at a time, a tab for each, and the unread count on the notifications
tab as well as on the bell. The tabs come from `SIDE_PANELS` in
`frontend/src/sidePanel.ts`, so the third panel is an entry there and a
component handed to `SideDock`, not another layout. The remembered state is
three things now, `pinned`, `open` and `panel`, and a panel name this build
does not know opens the first one rather than an empty column.

Each panel has its own way out in the first slot of the header: the History icon
for the notifications, the Artist page for the answers. Only the panel in view
costs a request.

## 4. Top tabs or a left sidebar for the main navigation

### What the consensus is

There is no single answer, and the guidance splits along the number of
destinations:

- **A top bar fits a small set of primary areas**, about three to seven, and
  content that wants the full width: wide tables, editors, canvases.
- **A left sidebar fits many sections, nested pages and frequent switching.** It
  scales without shrinking labels, and a column is scanned faster than a row.
- **The collapsible left sidebar is the dominant pattern in current SaaS**
  (Slack, Notion, Linear and Asana are the names the guides use), and the most
  common arrangement is a hybrid: the top bar for global things (search, account,
  notifications) and the sidebar for sections.
- Sidebars cost width, and the figures quoted for it (about 15 to 20 percent of
  the screen against about 6 for a top bar) are rough estimates with no source.
  On wide monitors the cost matters less; on laptops it is the main objection,
  and the usual answer is a collapsible icon-only mode.
- Nielsen Norman Group is more permissive than most about top bars with many
  items, and says a left column can hold as many top-level items as needed on a
  desktop. Hiding navigation behind a menu icon slows people down compared with
  showing it.

### What this app has

Six primary destinations (Overview, Review, Gigs, Artist, Sync, Promo), with
Settings and History in the drawer. Six sits at the top of the range where a top
bar is the guidance's default. The pages that matter most (Gigs, Review) are wide
tables, which is the guidance's case for a top bar. Settings and Artist have tabs
of their own, which is the beginning of the nested structure that tips the
balance toward a sidebar, but only the beginning.

The deciding fact is the one this work created: a left navigation of about 14rem
and the pinned panel of 22rem together take about 580px, and the Gigs table was
measured to need 830. The two cannot both be open on anything under about 1500px
without the table scrolling.

### Recommendation: an appearance setting, not a wholesale change

- **Keep the top tabs as the default.** Six items, wide tables, and a right panel
  that competes for the same width are all reasons the top bar is right for this
  product today. A wholesale move would be a bet that the app grows past about
  eight sections, and nothing in the plans under `docs/` says it will.
- **Offer the sidebar as a per-browser setting** beside the existing appearance
  controls (`frontend/src/appearance.ts` already holds theme, text size and
  width). The research is consistent on the conditions: keep the information
  architecture, the order and the labels identical, make it one global
  preference rather than several independent position settings, and implement
  the difference as one layout switch so components do not fork. The navigation
  is already one array (`NAV_LINKS` in `Layout.tsx`) drawn twice, in the header
  and the mobile menu, so a third drawing is a small change. The cost is the
  testing matrix: two navigations, with the panel pinned or not, in artist and
  admin mode.
- **Make the sidebar collapsible to an icon rail**, and start it collapsed
  whenever the pinned panel is also open on a window under about 1500px.
- **Below 1280px always use the top bar** or the existing menu, as the panel does.
- **Mode switching.** If "mode" means moving between the sections, the sidebar
  helps and is what the setting offers. If it means artist and admin mode, a
  sidebar is the conventional home for an account and mode block at its foot, but
  entering admin mode costs a passkey touch on purpose, so it should stay a
  deliberate action there and not become a tab.
- **Revisit as a default** if the primary sections pass about eight, or if the
  nested pages under Artist and Settings become destinations people switch
  between all day. Both would be visible in how often those tabs are used.

## 5. Open questions

- Which of 3.1 to 3.4 the artist would use first. The answers-at-hand panel is
  the recommendation, but it is a guess about habit, and one session of working
  through approvals with a stopwatch would settle it.
- Whether the quiet-hours switch in 3.6 is wanted.
- Whether the sidebar setting should arrive with the panel's second occupant, so
  the layout is designed once for a left column, a centre and a right rail.

## Sources

- [SaaS sidebar navigation UX patterns](https://www.saasui.design/blog/saas-sidebar-navigation-ux-patterns)
- [SaaS slide-over and drawer panel patterns](https://www.saasui.design/blog/saas-slide-over-drawer-panel-ux-patterns)
- [Inbox: introduce a consistent two-pane review layout (ClickUp feedback)](https://feedback.clickup.com/feature-requests/p/inbox-introduce-a-consistent-two-pane-review-layout)
- [In-app notification center design (Courier)](https://www.courier.com/blog/in-app-notification-center-design)
- [GitLab Pajamas, drawer](https://design.gitlab.com/components/drawer)
- [Workday Canvas, side panel](https://canvas.workday.com/v8/components/containers/side-panel)
- [Top navigation vs left navigation, which works better (UX Movement)](https://uxmovement.com/navigation/top-navigation-vs-left-navigation-which-works-better/)
- [Vertical navigation (Nielsen Norman Group)](https://www.nngroup.com/articles/vertical-nav/)
- [SaaS navigation menu design (Lollypop)](https://lollypop.design/blog/2025/december/saas-navigation-menu-design/)
- [GitLab Pajamas, navigation sidebar](https://design.gitlab.com/usability/navigation-sidebar)
- [Festival 506 showcase application FAQ (Music NB)](https://www.musicnb.org/en/blog/festival-506-showcase-application-faq)
- [MusicOntario at Folk Alliance, private showcase submissions](https://surveymonkey.com/r/ontarioatfai2018)
- [How to apply to perform at music festivals](https://climbtheladder.com/how-to-apply-to-perform-at-music-festivals/)
