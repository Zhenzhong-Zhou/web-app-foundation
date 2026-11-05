---
status: accepted
date: 2026-11-04
areas: [home, organizations, ui]
amends: [ADR-051, ADR-058, ADR-079, ADR-090]
---

# ADR-091 — Home, redesigned: a few large tiles that open their lists (amends ADR-051, ADR-058, ADR-079 and ADR-090)

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

1. The greeting and the date, as ADR-058 has them, and under them the
   organization's What we do line (below).
2. The summary sentence (below).
3. The newcomer's welcome, and Getting started while it shows.
4. The tiles.
5. The one main action, and the line in its place for a role that cannot
   use it.
6. Recently opened.

- **A tile** is its name, its count in large figures, and its status in
  words and colour together ("2 late", "1 expired", "3 out"). The whole
  tile is one link, at least 44 × 44 px on touch, with a hover and a
  focus state, opening its list filtered to what it counts and sorted by
  what makes it urgent, both in the address. No rows: the list holds them,
  one step away.
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
  characters, in the organization's own words. Home shows it under the
  greeting to every member, and the welcome shows it too. A column on
  organizations (a migration), in the organization's export, its change
  audited as the profile's are, its text kept out of the payload
  (ADR-018); `seed:demo` fills it in.
- **The welcome card (ADR-079):** below `md` it is folded to one line
  above the tiles ("Welcome, Fatima · your first week, 2 of 5"), opening
  in place; from `md` it is open, as now. Each area under "What you can do
  here" is a link to its page.
- **The summary sentence** names what is late by kind, each part a link
  to that tile's list with its late filter: "3 things are late: 2 orders
  to ship, 1 licence." Counted only from the tiles the reader can see, as
  ADR-058 has it; "Nothing is late" when nothing is, and "Nothing needs
  attention today" when every tile is empty.
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

## Decision — the type scale, on every screen at once

ADR-090 set the text to decide by at 16 px and the detail at 14 px. The
rest of the scale is a step of 1.25: a section heading at 20 px and a
page's title at 25 px, so a heading is told apart by size, not weight
alone. The line heights sit on a 4 px grid: 16 on 24, 14 on 20, 20 on 28
and 25 on 32. The caption stays 12.5 px, for footnotes only.

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
  as a phone's tab bar has, each target 44 px: drawn on the canvas at 360
  px first. Where they do not all fit, the lookup alone gets its word,
  "Search". An amendment of ADR-090, since the design language did not
  say.
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
  someone forgot because nothing showed it.
- **Help hiding the steps a role cannot take.** Trigger: Orders' turn,
  whose guide told a Viewer to press a button they never see.
- **Home in no organization built to the design language** (ADR-078).
  Trigger: its next change, or a person left with no organization asking
  what to do next.

## Consequences

- **Amended:** ADR-051 (Home's reads, and its Deferred taken), ADR-058
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
- **Client:** the type tokens, alone first, with #221 checked; the address
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
