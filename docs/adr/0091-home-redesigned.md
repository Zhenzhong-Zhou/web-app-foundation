---
status: accepted
date: 2026-11-04
areas: [home, organizations, ui]
amends: [ADR-051, ADR-055, ADR-057, ADR-058, ADR-069, ADR-079, ADR-090]
---

# ADR-091 — Home, redesigned: a few large tiles that open their lists (amends ADR-051, ADR-055, ADR-057, ADR-058, ADR-069, ADR-079 and ADR-090)

## Context

Home is the page everyone opens first, and it has three moments: an
Owner setting up a new organization meets Getting started (ADR-058); a
member who joined by invitation meets their welcome, for two weeks
(ADR-079); and every member, every day, meets what needs attention. Since
ADR-058 that is a greeting, one sentence, a row of counts that jump down
the page to nine cards, each with its five most urgent rows, then quick
actions and Recently opened. Its issue, #335, asked for Home "for a
newcomer": simple enough that one can read it, for every member. On 30
October 2026 someone who had never used the app looked at it and found
six things: no telling where things are, a tile that jumps down the page
instead of opening its list, words that are not his ("overdue"), nothing
showing what can be clicked, too much at once, and a screen that must
work for someone who knows nothing and does not want to learn. ADR-090 turned those, with two
panels of personas, into the design language (`docs/design-language.md`).
Home, all three moments of it, is the first screen built to it, by 6
November.

The `home` panel walked again on `main` at 7049e753 on 4 November, four
personas at seven sizes, a laptop's 1366 × 768 among them, since ADR-090's
reports had gone with its branch's `tmp/` folder before this ADR read
them:

- **72 findings, merged to 43:** 2 blockers, 17 major, 16 minor and 8
  cosmetic; 36 the design language's, 7 Home's own screens'.
- **The blockers:** Expiring soon's list opens out of order, so the
  senior on a phone stopped at "which lot expires first"; and a Viewer on
  Orders finds no way to raise an order, and no line saying whom to ask.
- **Nearly all of the 36 break a rule the design language already
  states,** which Home and its lists are not yet built to. Four are gaps:
  which lists sort, the top bar's icons below `lg`, an anchor under the
  fixed top bar, and a wide screen.
- **What worked:** Home answers "what needs you today" with no tap, in
  words and colour; every word on Home is in Chinese; "See all" opens its
  list filtered, in the address, and Back keeps it.

Two more things stand where Home is redesigned:

- **Its budget.** `GET /v1/home` holds a known miss until 31 January 2027,
  with a 400 ms ceiling, given to this redesign by ADR-051's amendment for
  #225 and #276: it must come within its 300 ms with a median of 240 ms
  or less on a timed run, and remove the miss. One Home opens 14
  transactions one after another, eight of them the cards' rows; at large
  on the Mac it took 290 ms at the 95th percentile on 4 November.
- **The type.** ADR-090 decided 16 px for text a person decides by and 14
  px for detail, and built nothing: the client's tokens still hold 14.5
  and 13 px, and a section heading of 17 px, 1 px above the text it heads,
  told apart by weight alone.

### Checked before drafting

The areas `home` and `ui`, and those of the lists Home's tiles open and
of the bell: `orders`, `stock`, `product-licences`, `costs`, `invoices`,
`return-authorizations`, `production-orders` and `notifications`. The
issues named: #335, #276, #431, #170, #302, #272, #467, #380, #458, #459
and #460 (`scripts/adr-check.mjs 091`, 69 open issues, 28 read whole).
With them, the Deferred lines of the areas' ADRs, ADR-051's watch list
and Open decisions. A first check named `home` and `ui` alone, and
missed #458, #459 and #460, which ADR-090's panels had filed for the
screens Home's tiles open.

**Fired, and taken here:**

- ADR-058's Deferred "choosing and ordering cards per person": a first
  viewer asked on 30 October. Decided here, built next (Customise Home).
- ADR-051's Watch "Home after ADR-085", and #276: Home's budget. And
  ADR-051's Deferred "Home's reads in one transaction, or prepared
  statements", whose trigger is this ADR: the first taken, the second
  deferred again.
- #431, the top loading bar, decided in ADR-090 and built here.
- #302, a list's filters following its address, for the lists the tiles
  open.
- #272, Help over the page under about 1140 px.
- #467's finding 15, the width classes by the panel.
- #380, Home's translation review, since this rewrites the strings it
  reviews.
- #170: Home's own targets at 44 px on touch. The places it lists are on
  other screens, so it stays open.
- #460, Licences: its first half, the tile opening the list filtered to
  what it counts, soonest first, and Licences given its place in the
  menu. Its sort on other columns and its export stay, for every list's
  turn.
- #352's first finding: Home's Low stock reads drafts it never shows.
  Home's count reads no drafts. The rest of #352 is Reorder points' own.
- ADR-090's riders: the type scale, the Duo's two screenshot sizes and the
  walks at every width class; and its Deferred "a test with real people",
  as far as people can be found.

**Not fired, and left:**

- #33, #282, #293 and #177: refactors in screens this does not change.
- #458 and #459, the order screens and Reorder points: their findings
  are those screens' own, in their turns; this panel's findings for the
  same screens join them as comments.
- #25, #157, #164, #264, #296, #356 and #426: screens or reads this does
  not change. #296's names on the costs screen wait for its turn, as the
  rows' names do on every list (finding 6).
- #261: its Help section on search goes with its own batch, after #260's.
- #160: the Receive and Ship dialogs, in their screens' turn.
- #274: Home has no select. #275: Home's heading row already wraps, and
  stays one copy until the shared piece is built.
- #295, with #310's dialogs on their own branch; #263, #198, #178,
  #156, #161, #241 and #169, in their own batches; #333, #331 and #442,
  the expired lots' batch.
- The translation reviews other than Home's, #371, #377, #382, #384,
  #389, #390, #393, #395 and #396, with #148: the translations batch.
- #16, #18, #142, #158, #159, #197, #262, #281, #285, #298, #300, #332,
  #337, #360, #409, #433, #441, #461 and #470: `later`, their triggers
  not fired here. #470 is Movements' own pull request, after this one.
- The Deferred lines of ADR-055 (charts, a density setting per person),
  ADR-056, ADR-057, ADR-060, ADR-075, ADR-079, ADR-082, ADR-084 and
  ADR-085: none fired.

**Found while checking:**

- Open decisions' "A dashboard at `/`" still says `/` redirects to
  Products, stale since ADR-058: rewritten in this commit.
- ADR-058 says pressing a filter "does not rewrite the address", where the
  design language keeps the filter and the sort in it: reversed here.
- Licences' "See all" opens `/licences` unfiltered, and Costs waiting
  opens Inventory's list, where no cost can be set: the one that can is
  Stock value's Waiting for a cost.
- Dropping the cards' rows changes `GET /v1/home`'s response, so the API
  revision goes to 3 (ADR-081).
- At Larger text the new 16 px body is 20 px, past the 18 px that
  `text-size.spec` has walked.
- After Load more, Back to a list reopens its first page at the top, which
  principle 7 forbids: an issue of its own, for the lists' turns.
- `scripts/clean-local.sh --yes` removed ADR-090's reports with their
  branch's folder before this ADR read them: the planning skill's
  after-merge step now moves first what a later ADR still reads.
- #469 (#462) went in as a merge commit, as #468 did, since GitHub's
  button offers the method used last: a cloud pull request is merged from
  the terminal from now on.
- The glossary's 再订货点, for a reorder point, is the English word
  translated word by word, not the word Chinese inventory software uses.
  #395, stock's review, checked against the glossary and kept it in 20
  places.
- A reviewer who reads only Chinese saw Movements list one entry twice,
  not reproduced yet: #471, kept open until it is, or proves a false
  alarm.
- #221, the order's Total column cut under its actions on a computer, is
  likely to get worse at 16 px: the type tokens' commit checks the order
  page's screenshots, and fixes it there if so.
- Home has a fourth state, a person in no organization (ADR-078), which
  takes only the new type here.
- The `set-up` journey starts on the demo organization, which is set up,
  so no walk has met Getting started since ADR-058.

## Decision — Home's three moments, each built to the design language

Every member sees one Home, which changes with where they stand:

| Moment | Who | What leads Home |
| --- | --- | --- |
| Setting up | the Owner, or whoever may change the organization, while it is new | Getting started's seven steps (ADR-058) |
| The first two weeks | a member who joined by invitation | their welcome (ADR-079) |
| Every day | every member | the tiles |

All three are built to the design language in this pull request:

- **Getting started:** each step one link, the whole row, at least 44 px
  on touch, its words plain and at 16 px, the next step to take marked as
  the page's one main action, Learn more kept beside it.
- **The welcome:** as decided below, folded on a small screen, each area
  a link.
- **The tiles:** as decided next.

The canvas draws each moment at every width class. The review walks
`home`, `join` and `set-up`, with `set-up` starting on a new organization,
so its Owner meets Getting started.

## Decision — Home is a few large tiles, each opening its list

What the first viewer asked for, and the design language's surface layer:
"a few large tiles, in plain words". From the top:

1. The greeting, the date and the time, and Refresh beside them; under
   them the organization's What we do line (below), with room above and
   below.
2. What is late (below).
3. The newcomer's welcome, and Getting started while it shows.
4. The tiles, under a heading, "What needs you today".
5. The one main action, and the line in its place for a role that cannot
   use it.
6. Recently opened, each row with its kind's icon and when.

The canvas holds four looks of it, each a row; the build follows the
fourth, which takes the third look's header and the second look's panel
of what is late, and adds hover and focus.

- **A tile** is its kind's icon, its count in large figures, its name, and
  its status in words and colour together ("2 late", "1 expired", "3
  out"), its icon red while anything in it is late. The whole tile is one
  link, at least 44 × 44 px on touch, opening its list filtered to what
  it counts and sorted by what makes it urgent, both in the address. No
  rows: the list holds them, one step away.
- **Hover and focus:** under a mouse a tile's edge turns the accent and it
  lifts a little; the keyboard's focus is a ring in the accent; the main
  button darkens under a mouse. A touch screen shows no hover.
- **A tile and the filter it opens share one name,** in each language,
  the plainer of the two, held in the glossary in all three languages.
  "Late" replaces "overdue" everywhere. Costs waiting becomes Waiting for
  a cost and opens Stock value's list of that name, where a cost can be
  set; Licences opens its list filtered to those expiring or expired.
  Returns keeps "Open" in English, as its filter says; in French both
  read « en cours », as #380 asks, and in Chinese both keep 未结. The
  words are drawn on the canvas board and settled in the glossary with it.
- **A tile with nothing to do stays in its place,** quiet: muted, "Nothing
  to ship", still a link. An empty Home reads as done (ADR-058), and the
  places do not move from day to day (Customise Home, below).
- **The same nine kinds, by permission,** in the order of a working day:
  To ship, To receive, Low stock, Expiring soon, Waiting for a cost,
  Invoices to issue, Returns, In production, Licences. A tile the member
  may not view is not shown, and its count never read.
- **Draft orders get no tile.** Orders' Draft filter and Reorder points'
  drafted chip show them; Customise Home weighs one later.

## Decision — the lists keep what a tile chose, in the address

Each list a tile opens reads its filters and its sort from the address
while the page is open, and writes them there when they are pressed,
replacing the history entry, so Back and a bookmark keep them and a tile
followed while its list is open lands filtered (#302). A filter at its
default is left out of the address; a value the list does not know is
ignored. One hook does it, beside `useListSearch`, for Orders, Inventory,
Reorder points, Stock value, Invoices, Returns, Production and Licences.
This reverses ADR-058's "changing a filter on the page does not rewrite
the address".

What the tiles' lists gain, so a tile's word carries through (the design
language's Status carried through):

- **Expiring soon sorts by expiry, soonest first,** whenever its filter is
  on: the panel's first blocker.
- **Orders gains Late,** the outstanding orders whose expected date is
  before the organization's today, by the same condition Home counts, the
  late first; and a list row shows Home's chip, "2 days late".
- **Licences gains its expiring filter,** soonest first.
- **A sort is in the address,** and after a sort from the keyboard focus
  stays on its column's header.

Each tile's count is still exactly its list's rows, which the end-to-end
test that opens each tile proves.

## Decision — a newcomer's first screen

- **What we do:** an optional line on the organization's profile, written
  by a member who may change it (`organizations.update`), up to 200
  characters, in the organization's own words. Home shows it to every
  member under the date, at 16 px, regular, with room above and below,
  without a card, a logo or the organization's name again; the welcome
  shows it too. A column on
  organizations (a migration), in the organization's export, its change
  audited as the profile's are, its text kept out of the payload
  (ADR-018); `seed:demo` fills it in.
- **The welcome card (ADR-079):** below `md` it is folded to one line
  above the tiles ("Welcome, Fatima · your first week, 2 of 5"), opening
  in place; from `md` it is open, as now. Each area under "What you can do
  here" is a link to its page.
- **The date and the time:** "Thursday 5 November, 07:42", in the
  organization's time zone (ADR-072), changing each minute by itself; no
  seconds.
- **What is late** is a pale red panel: its heading says how many ("6
  things are late"), and one button per kind ("2 orders to ship"), each
  opening that tile's list with Late chosen too, so just the late ones,
  where the tile opens all of its kind, the late first. Counted from the
  kinds the reader may see, as ADR-058 has it, a tile they hid included
  (Customise Home). When nothing is late, the panel is one grey line with
  a tick, in the same place: "Nothing is late today"; with nothing at all
  to do, "Nothing needs you today".
- **A main action the role cannot use:** where the member may use none of
  Home's actions, one quiet line takes their place, saying the role cannot
  and whom to ask, from `whomToAsk` (ADR-079's amendment of October 2026).
  Orders shows the same line where Raise an order would be: the panel's
  second blocker. Help hiding the steps a role cannot take waits for
  Orders' turn.

## Decision — Home reads counts, in one transaction

- **`GET /v1/home` returns each tile's count and late count,** the
  welcome and Getting started, and no rows. Home's own reads run in one
  transaction; the counts stay one statement, Low stock's count from its
  list's count read without its rows. The response changes shape, so the
  API revision goes to 3 and an open tab reloads once (ADR-081).
- **Held by a test that counts Home's statements,** as the lookup's does,
  so a tile added later cannot quietly bring reads back.
- **Met as #225 was:** the plans and the Mac's figures before and after,
  at small and at large, then one timed run on GitHub's runners with a
  median of 240 ms or less. Home's known miss goes in the commit that
  meets it, from `server/perf/scenarios.ts` and `server/perf/README.md`.
- **Prepared statements stay deferred** (below).
- **Read again on return:** Home reads its counts again when its tab comes
  back into view after a minute or more away, beside Refresh, as most data
  libraries do on a window's focus; counts alone make it cheap.

## Decision — the type scale and the corners, on every screen at once

ADR-090 set the text to decide by at 16 px and the detail at 14 px. The
rest of the scale is a step of 1.25: a section heading at 20 px and a
page's title at 25 px, so a heading is told apart by size, not weight
alone. The line heights sit on a 4 px grid: 16 on 24, 14 on 20, 20 on 28
and 25 on 32. The caption stays 12.5 px, for footnotes only.

The corners grow with them: 12 px on panels and tiles, 10 on controls,
16 on dialogs, where ADR-055 has 8, 6 and 10; an organization's own
radius can still replace them later (ADR-055's brand tokens).

They are the theme's tokens, so every screen changes with them, in a
commit of its own before any other client commit, so it can be reverted
alone. `text-size.spec` at Larger and every screen's before-and-after
screenshots, at the Duo's two sizes too, are its checks. If a dense table
reads too wide on a desktop, ADR-055's density setting per person is the
answer, by its own trigger, not a smaller body.

## Decision — the frame: the loading bar, the top bar's words, the account menu

- **The top loading bar (#431),** as ADR-090 decided: shown at once on a
  tap inside the app, until the next screen's code and its first read
  have landed, from the router's navigation state. A production build is
  timed on the same slow network before and after.
- **The top bar's icons get words below `lg`,** a short word under each,
  as a phone's tab bar has, each target 44 px: Menu, Search, Help,
  Notifications and Account, the app's own names. On a narrow phone the
  organization's name shortens first. An amendment of ADR-090, since the
  design language did not say. From `lg` the rail and the top bar stay
  as they are, the search in the middle.
- **The account menu's three selects get visible labels,** Colour mode,
  Language and Text size, so the text size is named in words where a
  person looks for it (the senior's finding, and ADR-090's rule).

## Decision — Help over a narrow window is a modal side sheet

Where the window leaves the page less than its 720 px beside Help, Help
is a modal side sheet, as Material 3 has it for a narrow window: the page
dimmed behind it, focus kept inside Help, closed by Escape or Close, and
focus back on Help in the top bar after. Nothing focused can then sit
under it (WCAG 2.4.11, #272). Above that width it stays beside the page,
as ADR-079 has it; on a phone, full screen, as now. The cost: between 600
and about 1140 px, a tablet or the Duo open, Help cannot be read while
working the page. An amendment of ADR-079.

## Decision — Customise Home, decided here, built next

ADR-058's trigger has fired. Built as a pull request of its own, after
Movements' (below), so Home's tiles have stable kinds from the start:

- **A default order first,** since most people never change one: the
  tiles of the work a member may do lead, from the permissions they hold
  (who may buy or plan runs sees Low stock and To receive first; who may
  ship, To ship), since roles are each organization's own (ADR-016,
  ADR-080). The rest follow in the working day's order.
- **Then each person's own:** Move up and Move down buttons, dragging with
  a pointer as well (WCAG 2.5.7), Hide, and Reset to the default.
- **Kept per membership on the server,** so it follows the person across
  devices, read in Home's one transaction. A tile added later appears at
  its default place; a kind that is gone, or unknown to the build, is
  skipped.
- **Places kept** until the person moves them, empty tiles included.
- **The main action too,** later: each person may choose their own main
  action and the order of More's menu (6 November 2026).
- **What a person can change:** the tiles, and Recently opened, which can
  be switched off. The greeting with What we do, what is late, and the
  main action stay where they are, so a newcomer always finds them and
  Help can describe them.
- **A hidden tile buries nothing:** its late items still show in the
  panel of what is late.

## Decision — the panel spreads the width classes

`/usability-walkthrough panel <journey>` gives the five width classes to
a journey's personas itself, in turn, the Duo's two sizes counted among
them, so every class is walked on every journey with enough personas; a
journey's own Sizes line overrides it (#467's finding 15). One rule in
the walkthrough skill, rather than a Sizes line on each of eleven
journeys. An amendment of ADR-090. #467's findings in the files it
changes (19 and 23) are taken or dropped in this branch's review step.
`journeys.md`'s laptop size, 1366 × 768, is committed with it.

## Decision — the words: 库存下限, late, and #380

- **库存下限 for a reorder point,** in Chinese, for Inventory's tab and
  the number: the plainest, the word Chinese inventory software uses, and
  a pair with the third rule's 最高库存. All 47 places, the catalogue's 28
  strings and the guides' 19 lines, and the glossary, in one commit, so no
  screen says two words for one thing. The translations batch reads
  #395's suggestions with it.
- **"Late" for overdue,** in the glossary in three languages, on Home and
  on the lists it opens.
- **Home's strings, written once:** every string kept or written here
  takes #380's corrections and its natural-wording comments in French and
  Chinese, and this pull request closes #380.

## Decision — a test with whoever can be found

After the merge, on the live site, each person found does #335's
fifteen minutes, thinking aloud through its five tasks; one person is
worth it, since one finds the worst problems. With no one, the panel's
walks stand and ADR-090's Deferred stays as it is. What they find feeds
Customise Home's planning. It blocks nothing.

## Decision — what the panel found on other screens

As ADR-090 decided, each screen's findings become one issue, built in
that screen's turn; where ADR-090's panels already filed one, they join
it as a comment. Inventory's (findings 6, 11, 24, 25 and 37) are an issue
of their own; Reorder points' (20, 33, 34, 37 and 42) a comment on #459;
the order screens' (3's record page, 11, 14, 30, 31 and 43, beside #159)
a comment on #458; every list's (5, 16, 17 and 29, Back after Load more,
and #460's sort and export) an issue; the breadcrumbs' (21) and the
bell's (38) one each. Findings 22 and 39 go to the translations batch;
32 is on #458 already; 40 is ADR-090's Deferred wide screen. The order after this pull request: Movements (#470, with #471 if
it is real), then Customise Home, then #310's dialogs with #295, then the
translations, before 30 November, then Orders.

## Considered and not done

- **The first, second and third looks,** kept on the canvas as its
  history: the first plain, a sentence of links; the second with an
  organization card; the third with what is late as one plain line.
- **What is late as one plain line, the tiles its only links:** simpler,
  but the late buttons open just the late ones, which no tile does.
- **Where a tile leads, three more ways,** drawn beside the chosen one:
  Home jumping down to its card, today's, which surprised the first
  viewer; a sheet over Home with the first few, whose address does not
  change; and the most urgent record alone, which hides the rest.
- **Seconds on the clock, and an introduction at 18 or 20 px, or bold:**
  seconds draw the eye with nothing to act on; 18 px is off the scale,
  20 px reads as a heading, and bold pulls the eye before the greeting.
- **Rows on Home,** today's cards restyled below the tiles, or each tile
  with its one most urgent row: what the first viewer called too much,
  and eight of Home's fourteen reads.
- **Prepared statements now,** or one transaction per request for every
  endpoint in `TenantDb`: the second is wider than Home and an ADR of its
  own, and a generic plan can go wrong for one large organization. Counts
  in one transaction come first.
- **Raising Home's budget,** or keeping the known miss: a known miss with
  an owner and a date stays a debt (ADR-082), and this is its owner.
- **The new type on Home alone,** the tokens later: two scales for months.
- **补货点, 订货点, 库存临界点 or 补货 alone:** 补货点 and 订货点 keep
  the English word's shape; 库存临界点 is longer and more technical;
  补货 alone names the action and reads as a quantity to order, beside
  订多少.
- **Help beside the page from 600 px:** the page's breakpoints follow the
  window, not the room left beside Help, so its layout would not fit.
- **A Sizes line on every journey:** eleven lines to keep where one rule
  serves.
- **The welcome below the tiles:** the newcomer's two weeks would start
  below what they cannot do yet.
- **Hiding a tile with nothing to do,** or moving it to the end: an empty
  Home would read as broken, and the places would move each day.
- **A drafts tile:** fewer, bigger things first.
- **Caching the counts on the server for a short while:** stale numbers
  for little gain once the counts are one statement.
- **One read per tile, so one failure leaves the rest:** a failure here is
  a bug, which the error tracker reports, and Home shows it with Try
  again.

## Deferred — each with what brings it in

- **Prepared statements for Home's reads.** Trigger: Home's median over
  240 ms in a weekly run on `main`.
- **An organization's default Home per role,** set by an Owner. Trigger:
  an Owner asking to set Home for the people in a role.
- **Which lists sort, and by what,** a rule for the design language.
  Trigger: each list's own turn, the rule written with the first.
- **A drafts tile.** Trigger: Customise Home's planning, or a draft
  someone forgot because nothing showed it. Taken in November 2026, by
  Customise Home: this ADR's amendment of that month.
- **Help hiding the steps a role cannot take.** Trigger: Orders' turn,
  whose guide told a Viewer to press a button they never see.
- **Home in no organization built to the design language** (ADR-078).
  Trigger: its next change, or a person left with no organization asking
  what to do next.

## Consequences

- **Amended:** ADR-051 (Home's reads, and its Deferred taken), ADR-055
  (the corners), ADR-058
  (Home's shape, the lists' address, Customise Home taken), ADR-079 (the
  welcome folded, Help as a modal sheet) and ADR-090 (the type scale's
  steps, the top bar's words, the panel's width classes);
  `docs/design-language.md` with ADR-090's amendment.
- **Docs in this commit:** Open decisions' "A dashboard at `/`"
  rewritten, and "Knowing which screens are used" added; the working
  agreements' merge from the terminal, in `docs/engineering.md` and the
  planning skill's delivery rules; the skill's after-merge step; the
  handoff.
- **Server:** `GET /v1/home` with counts only, in one transaction, the API
  revision raised to 3, and its statements counted in a test; Low stock's
  count without drafts (#352's first finding); Orders' late filter;
  Licences' expiring filter; What we do, a migration on
  organizations, the profile's read and write, the export and the audit;
  `seed:demo` filling it in. `seed:volume` adds nothing: no new table and
  no new hot query.
- **Client:** the type and corner tokens, alone first, with #221 checked; the address
  hook for the tiles' lists; Licences in the menu; Home's tiles, sentence,
  Getting started, welcome, What we do, main action and its line, and the
  read on return; Orders' line and late chip; the
  loading bar, the top bar's words and the account menu's labels; Help's
  modal sheet; every new string in three languages.
- **Words:** 库存下限 in the catalogues, the guides and the glossary, in one
  commit; "late" in the glossary; #380's suggestions on Home's strings.
- **Checks:** the manual checks for every changed screen; the rules files
  where an area has one; the before-and-after screenshots at every class,
  the Duo's two sizes among them; the panel on the branch, on `home`,
  `join` and `set-up`, at every class, `set-up` starting on a new
  organization (its journey changed for it in `journeys.md`).
- **After the merge:** the planning skill packed from `main` and uploaded,
  since this changes it, and `evals.md` walked; the test with whoever can
  be found; this panel's reports moved into Movements' `tmp/` folder before
  `scripts/clean-local.sh --yes`, since Inventory's turn reads them.
- **Build order:** this ADR → `journeys.md`'s laptop size → the
  dependencies → the canvas boards (Home's three moments at every class,
  the tiles' states, the welcome folded, the top bar at 360 px, Help's
  sheet, and Movements' for #470) → the Mac's figures before → the server's reads,
  the revision and the statement test → the lists' filters → What we do →
  the seeds → the type tokens → the address hook → Home → Orders' line
  and chip → the frame → Help → the words → the guides → the panel's rule
  → the timed run and the miss removed → the dependencies again → the
  reviews and the panel → the pull request, closing #335, #276, #302,
  #272, #380 and #431, and part of #170, #352, #460 and #467.

## As built (6 November 2026)

Built in #477 on `adr-091-home-redesigned`, 76 commits above `main` at
51941f3c, by the build brief's 22 steps (`tmp/adr-091/brief.md`, its
summaries beside it), the last two this as-built and f3256a8f, a flaky
test's fix: a React Router transition let an ordinary update draw before
a removed chip left the page, so `useFocusAfterRemove` focused a chip
that then vanished. The canvas keeps every look drawn, a row each.

- **Home's time:** `GET /home`'s median on GitHub's runners is 177 ms,
  where it was 314 ms, a newcomer's 165 ms; on the Mac, 41 ms at small
  (71 before) and 205 ms at large (378). An Owner's Home sends 11
  statements at small, where it sent 23, in one transaction. The known
  miss is gone (e91b7dea), and ADR-051's Watch closes "Home after
  ADR-085", with a line for Home's growth with the data.
- **Changed from the decisions above,** on the canvas and in the reviews,
  on 5 and 6 November:
  - **The main action:** one button, at the right of the greeting's row
    from 900 px and full width under the greeting below it: the first the
    member may do of Raise an order, Receive stock and Plan a run, the
    others under More, Trace a lot only there. With none of them, the
    quiet line and whom to ask; while Getting started shows, no main
    action. Refresh is an icon button, and nothing stays below the tiles.
    This replaces item 5 of Home's order above.
  - **Home's order:** the welcome and Getting started come first, above
    what is late, and the welcome's fold is remembered.
  - **What is late:** its heading is "7 things need you now", each button
    saying late, expired or out, with "Choose one to see just those."; the
    lots' and licences' buttons open Expired, a filter both lists gained.
  - **Tile names:** each tile and the filter it opens share one name, the
    plainer; a tile whose word alone does not say what it is about puts
    its page's name first: "Invoices · To issue", "Production · In
    progress", "Stock value · Waiting for a cost".
  - **Text and targets:** nothing a person reads is under 14 px, the top
    bar's words, hints, chips and initials among it; chips and their × are
    44 px on touch. Chinese is set 16 on 28 and 14 on 24, on every type
    variant. The top bar's words give way below 316 px in English, 340 in
    French and 262 in Chinese.
  - **The order's items (#221):** from 900 px Total and Actions are held
    at the right, the other columns scrolling under an edge from a new
    `edge` token, which every table that scrolls sideways on a phone shows
    too.
  - **Your devices** leaves the avatar menu; Your account and the sign-in
    emails still lead to it.
  - **A new organization's Low stock** says "No reorder points set yet",
    as ADR-085's review had it; Home reads that in its counting statement.
- **The reviews:** 127 findings (`tmp/adr-091/review.md`), about 50
  fixed here. Issues #478 to #505 hold the rest worth keeping, #505 "Left
  from ADR-091's reviews" the small ones, the welcome's trade words among
  them; comments went on #159, #170, #310, #458, #459, #467, #472, #473
  and #474; the rest were dropped with their reasons.
- **Found on the way:** Waiting for a cost is counted as Stock value lists
  it, a row per receipt; 库存下限 is in 63 lines of catalogues and guides;
  Licences sits first in Records; Help's sheet is Help's 420 px; the
  search sits 8 px right of the middle, and the report of it far to the
  right at 2560 px was not reproduced.
- **After the merge:** Items (#476) and then Movements (#470), two
  branches back to back, before Customise Home; and the test with whoever
  can be found.

## Amendment (November 2026) — Customise Home, before Items and Movements

Decided on 6 November 2026, before its branch, `customise-home`. It is
built as this ADR's, with no ADR of its own, from the decision
"Customise Home, decided here, built next", above, and these:

- **The order of work:** Customise Home first, then Items (#476,
  ADR-092), then Movements (#470, ADR-093). This reverses "after
  Movements', so Home's tiles have stable kinds from the start", and the
  order in "What the panel found on other screens" and the as-built:
  neither Items nor Movements adds or removes a tile's kind, and a kind
  added later takes its default place while one that is gone is skipped.
- **Where a layout is kept:** one column on the membership, `home_layout`,
  holding the tiles' order, which are hidden and whether Recently opened
  shows; empty is the default. The person alone sets it, through Home's
  own routes, `PUT` and `DELETE /v1/home/layout`, which act only on their
  own membership. It is not audited, as the welcome's dismissal is not
  (ADR-079): it changes only what that person sees. It goes in their own
  data (ADR-069's amendment).
- **The default order:** a tile leads when the member may do its work;
  the rest follow; both keep the working day's order, so an Owner's Home
  is as it is today.

  | Tile | Leads for whoever holds |
  | --- | --- |
  | To ship | `orders.ship` |
  | To receive | `orders.receive` |
  | Orders · Draft | `orders.create` |
  | Low stock | `orders.create` or `production.create` |
  | Expiring soon | `stock.adjust` |
  | Stock value · Waiting for a cost | `costs.update` |
  | Invoices · To issue | `invoices.issue` |
  | Open returns | `return_authorizations.update` |
  | Production · In progress | `production.complete` |
  | Licences expiring | `product_licences.update` |

- **A drafts tile,** Deferred above, its trigger this planning: Orders ·
  Draft (订单 · 草稿), after To receive. It is hidden for everyone until
  they show it in Customise Home, and Reset to default hides it again: the
  first tile hidden by default, so the default says which kinds start
  hidden. It counts every draft order the member may see, exactly as
  Orders lists them with Draft chosen, and opens that list oldest first
  (ADR-057's amendment), the forgotten draft first. A draft is never
  late, so the panel of what needs you now never counts it.
- **Dragging:** `@dnd-kit/react`, the library's current line, at the
  newest 0.5 version 7 days old on the build's day, for its keyboard
  dragging (Space, the arrows, Space) and its spoken announcements. Up,
  Down and Hide stay as buttons beside each tile, for anyone who cannot
  drag (WCAG 2.5.7). Moving to 0.6 is a choice of its own, never in range.
- **What is drawn:** the canvas's row "Customise Home v2", where it starts,
  while customising on a phone and dragging on a laptop, and decision
  64a's board, over the first row's. Customise Home is a button at the
  right of "What needs you today". Done saves; Reset to default returns to
  the default; leaving with changes not saved asks first, as every form's
  guard does (`useUnsavedChanges`, #198's rule). The design language's new
  pattern, Arranging your own screen, holds it for the places #337 names.
- **Not here:** each person choosing their own main action and More's
  order stays later, as above.
- **Riders:** from #505, its 8 (the second half), 52, 55, 66, 67, 68, 93
  and 117, each in a file this branch changes, or a pattern it would
  otherwise copy again.
- **No revision raise:** each change to the API adds something (a tile's
  kind, the layout and its routes, Orders' order), and Home skips a kind
  it does not know (ADR-058's amendment for ADR-085).

### Checked before drafting

The areas `home`, `orders`, `recent`, `auth`, `help` and `ui`, and the
issues #337 and #505 (`scripts/adr-check.mjs 091`, 6 November 2026), with
the Deferred lines of their ADRs, ADR-051's watch list and Open
decisions.

**Fired, and taken here:**

- This ADR's Deferred "A drafts tile", its trigger this planning.
- ADR-057's Deferred "More sortable columns", by the drafts tile's oldest
  first.
- #505's eight above.

**Not fired, and left:**

- Orders' #458, #479, #481, #159, #160, #157, #177 and #25: Orders gains
  only its oldest first and its chip, and these need designs of their own.
- Home's #482, #485 and #489, other parts of Home; #502, with each
  person's main action; #504, since Recently opened gains only its switch.
- #392, #324, #255, #258, #261, #154 and #150, in screens this does not
  change, and the translation reviews, for their batch.
- The `ui` area's issues: the new controls meet #170's 44 px themselves.
- #300 and #337, `later`, their triggers not fired.
- ADR-051's watch "Home with the data": Home is timed again at small and
  large with the drafts count.
- This ADR's Deferred "An organization's default Home per role".

**Found while checking:**

- Orders sorts by expected date alone, so oldest first is ADR-057's
  amendment.
- `scripts/adr-check.mjs` writes only to `tmp/adr-NNN/`, so a branch with
  no ADR of its own moves its check into its own folder.
- #477 ended with 76 commits, not 74: corrected in the as-built above.

### As built (7 November 2026)

Built on `customise-home`, 78 commits above `main` at 965fdd76 with this
as-built, by the build brief's 20 steps (`tmp/customise-home/brief.md`,
its summaries beside it), then two test fixes that CI's Linux browsers
found (5631d0d8, 3cdebcd7). The canvas keeps every look drawn, a row each.

- **Home's time:** `GET /home` at large on the Mac is 190–225 ms against
  300, and 44 ms at small. Step 7 read 337 ms at large because the large
  seed's tables had never been vacuumed: `main` was as slow on the same
  database, and after `VACUUM ANALYZE` both came back. So `seed:volume`
  now ends with one. Home's statement-count test reads 4, where it read 6
  (#505's 67 and 68).
- **Home's download:** Customise Home and `@dnd-kit` load only when its
  button is pressed. Home's chunk is 15.8 kB gzipped, the panel's 41.4 kB.
- **Changed from the decisions above,** in the build and the reviews:
  - **The default arrangement comes from the server:** `GET /v1/home`
    sends `defaultLayout`, and the client keeps no copy of the default
    order.
  - **A save keeps what the reader cannot see:** a `PUT` keeps the stored
    kinds it does not name, hidden as they were. A `DELETE` clears them
    all, so the person follows later defaults.
  - **A kind missing from a saved layout** goes after the kind before it
    in the default order, hidden only if it is hidden by default.
  - **The drafts tile** opens `/orders?status=draft&order=asc`, its icon
    a page with a pencil (`EditNoteOutlined`). Orders reads it along the
    orders' primary key (ADR-057's amendment, as built).
  - **The line under the red panel,** for a hidden tile's late items,
    shows only while Customise Home is open, as the boards draw it, with
    the singular for one.
  - **A status line** in the row with Done says where a tile went, or
    that it was hidden or shown ("To ship, 2 of 8"). Up and Down keep
    their words in a grid.
  - **The fixed parts** fade to 75 % (`FIXED_OPACITY`), since 70 % left
    the date at 2.96:1, each lock named for a screen reader ("Greeting:
    fixed"). The keyboard's line is hidden under a coarse pointer. Every
    switch's off track takes the `edge` token at full strength.
  - **Recently opened:** Clear says what it did and where to turn it
    off; the switch says what it shows; `seed:demo` opens two records for
    the demo Owner.
  - **Dragging:** auto-scroll works only in the window's outer tenth, at
    speed 10, never sideways. `@dnd-kit/react` is 0.5.3, by the
    maintainer's exception to the 7-day rule (c0e82ca7): six days old, its
    0.5.2 a touch fix and its 0.5.3 a security fix.
  - **Done** saves through `useSubmit`, saying "Saving…", with a refusal
    in `FormError`. Opening Customise Home reads Home first, so an old tab
    cannot write over another device's arrangement, and the panel is
    inert while Done saves.
- **Not built from the boards:** the dragged tile lifts with the `lift`
  token, not the board's deeper shadow, and has no "dragging" chip; each
  lock sits on its own line above the part it marks.
- **The API:** revision 3. The drafts kind is accepted in
  `server/openapi-breaking-accepted.txt`, as ADR-058's amendment for
  ADR-085 expects. Migration 0079 adds one nullable column.
- **The reviews:** 92 findings (`tmp/customise-home/review.md`), 53 fixed
  here in three batches. #507, "Left from Customise Home's reviews",
  holds the small ones, and #508 to #514 the rest worth keeping; comments
  went on #337, #505 and 15 other issues. Findings 89, 90 and 91, on
  Claude Code's own instructions, go to the router's pull request.
- **Found on the way:**
  - CI's Linux WebKit starts a keyboard drag a render later than the
    Mac's, so a test's arrow came too soon (5631d0d8). The Mac's full
    verify runs macOS's own WebKit, so only CI met it.
  - `client/e2e/home.spec.ts` runs only in Chromium, even in CI.
  - The small volume database is `foundation_perf_adr091`; its ignored
    manifest was overwritten on 7 November, to be rebuilt before the next
    small timed run.
  - A tab open across the deploy keeps the old client until reloaded,
    since the revision does not change (ADR-081).
- **After the merge:** by hand, a drag on an older iPhone (iOS 16.4 to
  16.7, with no Popover API), Android WeChat in 中文, a phone held
  sideways and an old tab across the deploy; then the router's pull
  request, then Items (#476) and Movements (#470).
