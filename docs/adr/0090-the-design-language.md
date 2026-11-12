---
status: accepted
date: 2026-11-04
areas: [docs, i18n, ui]
amends: [ADR-055, ADR-089]
amended-by: [ADR-091, ADR-092]
---

# ADR-090 — The design language: eight principles and their patterns, at every screen size (amends ADR-055 and ADR-089)

## Context

Since 30 October 2026 every screen is to follow one philosophy (#338).
The product's aims are in `docs/principles.md`; the look's tokens and
shared pieces in [ADR-055](0055-the-look.md) and conventions.md's "The
look"; the code rules in `.claude/rules/ui.md`; the mark in `docs/brand/`.
Nothing said how a screen behaves: what a person can click, what a
number means, what a tile opens, what happens while it loads.

A first-time viewer's look at Home on 30 October (#335) found six
things: no telling where things are, a tile that jumps down the page
instead of opening its list, words that are not his ("overdue"), nothing
showing what can be clicked, too much at once, and a screen that must
work for someone who knows nothing and does not want to learn. #335
planned a test with three to five newcomers before designing. There were
none to test with, only the maintainer.

So the test became a panel of personas played by Claude Code
(`/usability-walkthrough panel <journey>`, decided below), each persona
in a subagent of its own, at the same time. Five personas were added for
it: a senior who reads only Chinese and sees poorly up close, an outsider
on the first day, an owner who learns fast, an operations lead who knows
ERPs, and a sales rep on a phone on a slow network. Two journeys were
walked on 4 November 2026, on `main` at `a7b603b2`:

- **home**, by the first four: every task finished, none blocked, three
  by guessing and one order made wrong. 63 findings, merged to 45: 13
  major, 23 minor, 9 cosmetic. 28 are the design language's, because two
  personas or more hit them or they hold on every screen.
- **on-the-road**, by the sales rep, at 390 × 844 with the network slowed
  and a reload half way: every task finished, the first by guessing. 17
  findings: 8 major, 7 minor, 2 cosmetic; 11 the design language's.

Hit by three or four personas: Home says "late" and "expired" and the
next screen does not; the list behind "See all" does not keep Home's
order; what can be clicked in a row changes from panel to panel; and
"12 of 36" does not say what it counts. The one bug, a sale raised from
Home saved as a purchase, was filed as #454 and fixed by #457 the same
day. The reports stay on the maintainer's Mac, in `tmp/adr-090/`, which
git ignores. Personas played by a model find unclear labels and dead
ends, not what real people value: they come before tests with real
people, not instead of them.

Screen sizes had been recorded only as a check: since 23 October,
`/production-readiness`'s device pass covers tablets, foldables, the
iPhone Duo closed and open, and a phone held sideways, before real
users; and on 26 October the chat noted that a layout the pass shows to
be needed, such as a list beside its record when the Duo is open, would
be an ADR of its own. Nothing said how a screen adapts. The Duo, at the
3× scale iPhones use, is about 466 × 678 CSS pixels closed and about
890 × 626 open: estimates, until measured on the device.

### Checked before drafting

The areas `docs`, `i18n` and `ui`, with #335, #337, #338 and #433 named
(`scripts/adr-check.mjs 090`, 70 open issues, 19 read whole), the Deferred
lines of the areas' ADRs, ADR-051's watch list and Open decisions.

**Fired, and taken here** (the rule here; each built when its screen is
next changed):

- #160, quantities in dialogs: the page's form (Decision 2, Numbers).
- #170, touch targets under 44 px: 44 px on touch (Decision 3).
- #274, a select's empty choice drawn blank, and #275, a heading row whose
  actions do not wrap: patterns (Decision 2).
- #431, nothing shows while a screen's code loads: Loading (Decision 2).
- #149, one thing with two names (Lots and Trace a lot; Items and
  Products): one name in all three languages (principle 2), the fixes in
  the translation batch, where #149 rides.
- #338's question on a space between Latin letters and Chinese, and
  #150's two 和 in a row: Decision 5.
- #159, order tables on a phone: lists become cards below 600 px
  (Decision 2).
- #198 and #263's unsaved work: Unsaved work (Decision 2), built with
  that batch.

**Fired, and left for ADR-091**, Home's redesign: ADR-058's Deferred
"choosing and ordering cards per person" (a first viewer asked on 30
October), which is Customise Home; ADR-051's Watch on Home's budget;
the filters of a list not following its address (#302), since Home's
tiles open filtered lists; Help over the page below about 1140 px
(#272); and Home's own findings from the panel.

**Not fired, and left:**

- #33, #282 and #293: refactors, not how a screen behaves.
- #150: the review export, with #261 as the handoff orders it; its two
  和 are taken in Decision 5.
- #292: docs left for #283 and the invoices batch.
- #295: with #310's dialogs, on a branch of their own.
- #305, names sorted as text: with Products when next changed.
- #324: with #255's security emails.
- #337 and #433: `later`, their triggers not fired.
- ADR-055's charts and its density setting per person (no one asked for
  more rows); ADR-075's text size kept on the account; ADR-054's grouped
  digits; ADR-079's screenshots in guides; ADR-086 to ADR-089's: none
  fired.
- Open decisions: nothing on how screens behave; "Telling users what
  changed" waits for the first user outside the maintainer.

**Found while checking:**

- Six of the `when-touched` issues (#160, #170, #274, #275, #302, #431)
  were patterns waiting for a rule; with one, each stops being a one-off
  fix.
- The October device pass was missed at first, and found only when the
  maintainer asked about foldables; it is in Decision 4 now.
- ADR-055's type is smaller than this ADR's text rule: body 14.5 px, small
  13 px. Decision 3 raises the two, and ADR-091 settles the rest of the
  scale.

## Decision — eight principles

A short list, as design systems keep one, each from what the personas
hit:

1. **Plain words, names before codes.**
2. **One name for one thing,** on every screen and in all three
   languages.
3. **The next step visible,** and one main action per screen.
4. **What can be clicked looks clickable.**
5. **Simple first, detail one step away.** The most-used screens are the
   plainest: Home, Inventory, Orders, and the Receive and Ship dialogs,
   chosen by the personas' daily tasks until there is usage data.
6. **Readable and tappable by everyone;** nothing covers text or numbers.
7. **You never lose your place:** focus, a sort, a filter, Back.
8. **No default that can be wrong.**

The seven principles #338 proposed are in it: its "details on demand"
is 5, "the same thing in the same place" is 2, and "every page shows the
way back" is 7. The three new ones came from findings that broke no
principle on #338's list.

## Decision — the patterns

Each in `docs/design-language.md` with an example and the code rule or
shared piece that holds it:

- **Status carried through:** Home's word and chip ("2 days late",
  "expired 4 days ago") on the list and the record too; each status a
  tile counts is a filter on its list. A status says what is true now:
  an order with everything shipped reads "All shipped" until closed.
- **Tiles open their lists,** filtered and sorted by what the tile
  counts, both in the address.
- **Rows:** one link per row, at least 44 px on touch, the name first,
  then the code; a code with a page is a link everywhere; a row's
  actions have words.
- **Numbers:** they say what they count ("12 left · reorder at 36"); one
  format, the page's, with no trailing zeros, a dialog's text included
  (#160), only a field keeping the exact places typed; nothing overlaps
  them.
- **Sorting:** kept in the address; focus stays on the column's header.
- **Lists on a phone:** below 600 px a row becomes a card with its name,
  its status and the one or two numbers that matter, list by list as
  each is next changed (#159).
- **A main action the role cannot use:** one quiet line in its place,
  who can and whom to ask; Help hides the steps the role cannot take.
- **Refusals at their field,** each form checking itself, through one
  shared hook (#310).
- **Loading:** every wait past 250 ms shows something; a tap inside the
  app shows the top loading bar at once, a screen's code included
  (#431); the first load says it is loading, in words, and after 10 s
  that the network is slow.
- **Actions that cannot be undone** are never the page's biggest button
  and ask first, in one sentence ("Close SO-000003? It can't be
  reopened."); one that can runs at once with Undo.
- **Unsaved work:** a long form (an order, a run, an invoice) keeps what
  is typed in this browser as it is typed and offers to continue when
  opened again, cleared once saved and at sign-out; a short dialog keeps
  nothing.
- **A field with a known set of values is a list,** never free text: the
  currency in the reader's words (加元 CAD), filled from the partner's
  price list.
- **Exports** in the same place on every list, in the screen's words.
- **After saving,** the record takes the form's place in the history, and
  the message says what happened ("Draft saved").
- **The bell and Home** give the same counts in the same words.

## Decision — text to decide by at 16 px, and 44 px targets on touch

Text a person reads to decide (a tile's label, a status, a name, a
field's label) is 16 px at the Standard text size; secondary detail 14
px; a caption only for footnotes. The text-size setting is named in
words where a person looks for it. On touch, every target is at least
44 × 44 px, as ADR-055's density by pointer set; with a mouse, WCAG's 24
px minimum holds.

## Decision — five width classes, and a height rule

Screens are designed by width, as Material 3's window size classes do,
on the theme's breakpoints, with no new numbers:

| Class | Width | Devices |
| --- | --- | --- |
| Phone (`xs`) | under 600 px | phones; a foldable closed, the Duo's 466 |
| Small tablet (`sm`) | 600–899 | a tablet upright; a foldable open, the Duo's 890; a phone held sideways |
| Tablet sideways (`md`) | 900–1199 | a tablet held sideways, a small laptop |
| Laptop (`lg`) | 1200–1535 | laptops; the menu becomes a rail |
| Desktop (`xl`) | 1536 and wider | desktops |

Each pattern says what it does in each. On a screen under about 700 px
tall (a phone held sideways, the Duo open or closed) nothing fixed takes
more than the top bar, and a dialog scrolls inside itself so its buttons
stay reachable. A layout is checked on both sides of each breakpoint, since
the Duo open sits about 10 px below 900. A foldable opening keeps what was
typed. Nothing works only by hovering. Below 1200 px the menu stays
ADR-055's drawer, with words, not a rail of icons, which is what the
senior and the outsider stumbled on.

## Decision — Chinese beside Latin letters or digits

A space between Chinese and Latin letters or digits, as most of the
app's strings already have ("D3-1000-120 已有再订货点"). A list joins
with 、 and its last item with 和, the joiner adding the space beside
Latin text, once on each side (`joinList` on the server and its copy in
the client). A list item that holds 和 itself is worded so the join does
not double it. Applied in the translation batch, with ADR-054's
amendment.

## Decision — where it lives

A new document, `docs/design-language.md`: the principles, then the
patterns, each with an example and what holds it, then the screen sizes.
`docs/principles.md` keeps the aims and points to it;
`.claude/rules/ui.md` and `/code-review` point to it. The Claude Design
canvas gains a Design language section, each pattern drawn as Home uses
it, with ADR-091's boards. A change is an amendment of this ADR and an
edit of the document, in one commit.

## Decision — the walkthrough panel, in every review

`/usability-walkthrough panel <journey>` walks a journey of
`.claude/skills/usability-walkthrough/journeys.md` as each of its
personas at once, each in a `walkthrough` subagent
(`.claude/agents/walkthrough.md`), then merges what they found: each
finding once, the personas who hit it, its worst severity, whether it is
the design language's or the journey's screens'. Each walker runs at
high effort, set in its own file, since judging a screen is the work.
Every pull request that changes what a person sees walks the journeys
its change touches, a journey added first when its task is new. Each
walk only reads the app, through an account of its own, so the walks
can run together.

Home's journey is walked again on ADR-091's redesigned Home at every
width class, the outsider on the Duo's two sizes; the walks are not run
again now, since today's Home is replaced on 6 November and the rules
come from the size classes. The before-and-after screenshots gain the
Duo's two sizes in ADR-091's branch.

## Decision — cloud picks from an export, and small enough

The chat picks a cloud session's issue from two exports the maintainer
attaches, written by `gh` rather than read from GitHub's pages:
`tmp/cloud-picks.json`, the open `fix-now` and `when-touched` issues
with their text; then `tmp/cloud-picks-shortlist.json`, the few the
chat shortlists from it, with their comments too. All of them with
their comments came to 780 KB on 4 November, too much to read whole;
without, 290 KB. And an issue that names more than
about five files goes to a Mac branch: #310's session stopped for its
nine dialogs on 4 November.

## Decision — its own docs pull request

On `adr-090-design-language`, merged before Home's branch starts, so
ADR-091 is planned and built from `main` with this in it. Docs only, so
CI skips its long jobs, and the next code branch, Home's, takes the
dependency step.

## Considered and not done

- **The newcomer test with three to five people.** There were none; real
  people wait for a trigger, below.
- **#338's seven principles only.** Five design-language findings broke
  none of them: text too small, numbers covered, focus lost, a wrong
  default.
- **A simple mode beside an expert one.** Two apps to test and translate,
  and a switch few people find; one app in layers instead.
- **An icon rail from 900 px,** as Material 3 has for medium windows.
  Icons without words were what the senior and the outsider stumbled on.
- **A server draft for unsaved work.** It would number drafts nobody
  chose to keep.
- **Undo for everything.** Closing an order would need reopening it,
  which Open decisions leaves for "copy to new order".
- **The walks again now, at the new sizes.** They would mostly find what
  ADR-091 changes on Friday.
- **The design language inside Home's ADR, or on the canvas alone.** Each
  rule needs one home in the repository, and the canvas is not one.
- **An issue for each of the panels' 62 findings.** Design findings feed
  the design; the screens' own go into one issue per screen.

## Deferred — each with what brings it in

- **A list beside its record on a wide screen** (the Duo open, a tablet
  held sideways), which Material 3 suggests from about 840 px. Trigger:
  someone working on a tablet or a foldable every day, a walk that keeps
  going between a list and its records, or the whole-app device pass,
  whichever comes first, since foldables are only becoming more common.
- **A dual screen's hinge.** Trigger: a device with two screens in use.
- **A test with real people.** Trigger: the first person outside the
  maintainer, through the public demo or a first customer; then #335's
  plan, three to five people, fifteen minutes each.
- **A density setting per person.** ADR-055's, its trigger unchanged.

## Consequences

- `docs/design-language.md`, new; `docs/principles.md`, `docs/README.md`,
  `.claude/rules/ui.md` and `/code-review` point to it.
- The panel: `.claude/agents/walkthrough.md` and
  `.claude/skills/usability-walkthrough/journeys.md`, new; the skill's
  section 6, five personas in `personas.md`, and `CLAUDE.md`'s skills.
  The review step walks journeys, in `docs/engineering.md`, `CLAUDE.md`,
  `.claude/agents/brief-step.md` and the README's "Which tool, when".
- The planning skill's step 8 and its brief's shape, and `evals.md`'s
  prompt 6, uploaded again after the merge.
- Nothing a person sees changes in this pull request: no API change, no
  migration. The patterns are built as each screen is next changed, the
  most-used first.
- Build order: this pull request, docs only → ADR-091, Home, built to it:
  the loading bar, the type scale, the Duo's screenshots, the panel at
  every width class → Customise Home → #310's dialogs with #295, one
  hook → the translations, which apply Decision 5 and one name for each
  thing → the other screens as each is next changed.
- The panels' findings for single screens become issues: the order
  screens; Reorder points; Licences; and, `later`, a sales rep's answers
  on a phone.

## Amendment (November 2026) — as built (#465)

Built in #465 by its brief: the chat's commits first, then the reviews and
the fixes chosen, in Claude Code. Where building differed from the
decisions above, or found other than the Context assumed:

- **The reviews:** 27 findings from `/simplify`, `/code-review` and
  `/doctor prompt-audit`, none about what a person sees. Thirteen were
  fixed, one commit each (1 to 10, 24, 26 and 27); the rest, repeated
  text and cheaper panel runs, are #467, its finding on width classes
  marked for ADR-091's check.
- **Three fixes changed this ADR's own text before its merge,** with no
  amendment: a walker sets its own effort, high, in its file rather than
  the session; the cloud picks are exported without comments, then the
  shortlist with them; and #310 stopped for nine dialogs, not thirteen.
- **The panel:** a journey's Sizes reach each walker and replace the
  persona's own; the session, never a walker, serves the production
  build a slowed network needs; and a panel files one issue per screen,
  as decided above, where the skill had still said one per finding.
- **The export without comments is still large:** 96 open issues, 291 KB
  on 4 November, the bodies alone 225 KB. The shortlist's export, with
  its comments, is what the chat reads whole.
- **The type, on the canvas:** a row of its own, drawn after the reviews:
  the sizes at Standard, Large and Larger, one order at each on a laptop,
  the Chinese spacing and lists, and a phone at each size beside one at
  today's 14.5 px. Each board opens with how to read it, in Chinese and
  English, since a reviewer who reads only Chinese judged them too. On a
  phone 16 px read well to both; on a computer screen the maintainer
  leaned to 15 px, and 16 px stays everywhere, as decided (4 November
  2026).
- **Found on the way, filed:** #462, focus after issuing an invoice,
  which the list of what #155 still had open had dropped; and #466,
  Resend on an invitation's row dropping focus, found by the session
  that fixed #155's other parts.
- **Delivery:** text for GitHub now comes as a file passed with
  `--body-file`. A script that held an issue's text inside `$( )` filed
  #462 cut short, since macOS's bash 3.2 ended the `$( )` at a
  parenthesis in the text and ran the rest as commands, writing nothing.
  And a cloud session's pull request is squashed from the merge button's
  menu: the button offers the method used last, so from 2 November each
  went in as a merge commit, its Unverified commit kept on `main`.

## Amendment (November 2026) — the type scale's steps, the top bar's words and the panel's width classes (ADR-091)

Home's redesign settled what this ADR left to it, and what its panel
found the design language did not say:

- **The type scale:** a step of 1.25 from the 16 px text, a section
  heading at 20 px and a page's title at 25 px, so a heading is told apart
  by size, not weight alone; line heights on a 4 px grid, 16 on 24, 14 on
  20, 20 on 28 and 25 on 32. The caption stays 12.5 px.
- **The top bar below `lg`:** a short word under each icon, as a phone's
  tab bar has, each target 44 px, the app's own names; on a narrow phone
  the organization's name shortens first.
- **Tiles:** a tile and the filter it opens share one name, the plainer,
  a tile whose word alone does not say what it is about putting its
  page's name first; a tile with nothing to do stays in its place, quiet,
  still a link.
- **Text people read:** none under 14 px but a footnote's caption
  (ADR-091's as-built).
- **Help where there is no room beside the page** is a modal side sheet
  (ADR-079 amended).
- **The panel at every width class:** the panel gives the five classes to
  a journey's personas in turn, the Duo's two sizes among them; a
  journey's own Sizes line overrides it (#467's finding 15).
- **The canvas keeps every version:** a changed design is a new row,
  titled with its version, never drawn over the old one, and the version
  the build follows is named in its ADR.

## Amendment (November 2026) — which lists sort, and by what (ADR-092)

ADR-091 deferred the rule to the first list's turn, and Items is it.
`docs/design-language.md`'s Sorting and filters gains two lines:

- **A list sorts on the few columns a person decides by;** its default
  is the one most asked for, named in that list's own ADR.
- **A date column shows the date the list is sorted by;** where a list
  keeps two dates, the column's header switches between them.

ADR-092 also decides that each feature carries a wireflow board, an
interaction table in its ADR and each screen's five states, and that
the pieces every screen shares draw their states once. That States
section, with its canvas row, comes in a docs pull request of its own
after Items, which amends this ADR again.

## Amendment (November 2026) — flows and states: what each feature draws, and the shared pieces' states drawn once

ADR-092 decided that each feature carries a wireflow board, an
interaction table in its ADR and each screen's five states, and that the
pieces every screen shares draw their states once, in a docs pull
request of their own. Items' reviews handed it the patterns two
walkers or more had met (review items 1, 4, 7, 10, 15, 17, 18, 21, 22,
28, 30, 35, 39 and 43), and Items' as-built two more: the width switch,
and Settings › Categories out of the rail. #170 and #536 asked it a
question each. It was planned on 11 November 2026 on
`flows-and-states`, the maintainer confirming the requirements first and
choosing each decision as recommended. No code changes with it, no API
and no migration; the builds go to the issues each decision names.

### Requirements, as confirmed

The maintainer confirmed these on 11 November 2026, before drafting,
with the assumptions, what is not included and the questions' answers;
R15 was added the same day, with the check's decisions. Each names
its step in the brief, and the as-built marks each met, changed or
deferred.

| R | What | Done when | Step |
| --- | --- | --- | --- |
| R1 | This ADR amended: each feature's ADR carries a wireflow board, an interaction table and each screen's five states | This amendment, with its requirements, its check and its decisions; `scripts/check-docs.mjs` passes | 1 |
| R2 | The design language gains a States section: the five states once, and each shared piece's own states | Each piece *Decision — the five states, and each piece's* names has its states, in Items' words where Items has them; markdownlint and the docs check pass | 5 |
| R3 | One canvas row draws the States section, in three languages and both colour modes | The row "状态 第一版 · States v1" is on the canvas; this amendment and the States section name it | 11 |
| R4 | The planning skill asks each feature for the three, and its brief turns the interaction table into browser tests | `SKILL.md` and `reference/brief.md` say so; `evals.md` gains a prompt | 2 |
| R5 | The playback, a step of the skill: requirements with how each is shown done, then assumptions, what is not included and questions; the maintainer's confirmation before drafting; kept in the ADR; each mapped to its step; marked in the as-built | ADR-088 amended; `SKILL.md`, `reference/brief.md` and the skill's as-built section say so; `evals.md` gains a prompt | 1, 2 |
| R6 | The design language's items from Items' reviews, and the two from its as-built | Each item's fate is below: a pattern, a code rule or an issue | 1, 4, 6, 8 |
| R7 | The README's roadmap since v0.7.0, Items' name and CSV import moved to #552; the release routine changes the README's status and roadmap at every tag | Both say so; `scripts/verify.sh --docs` passes | 10 |
| R8 | The code's names for Items: `product` for any item, `good` for the Products type, in the glossary and `.claude/rules/products.md`; no file renamed (#553 holds that) | Both say so; the rules file passes its cap | 8 |
| R9 | The chat's notes: a script's test changed with it; commands chained with `&&` where a failure must stop; markdownlint reads text between two dollar signs as maths | ADR-088 amended; `engineering.md` holds the first two; the skill's delivery reference copies what every reply acts on | 1, 2 |
| R10 | A timed run read from its rounds' reports; `gh run watch` with the id `gh workflow run` prints; `gh run rerun <id> --failed` when a round's report is lost | `server/perf/README.md`, "Reading a timed run on CI", says each | 10 |
| R11 | The handoff: #558 and #559 merged, #559 as a merge commit, the steps after them, the triage of 11 November applied, this branch | `scripts/verify.sh --docs` passes, and the handoff says each | 1, 14 |
| R12 | After the merge: the skill packed from `main` and uploaded, and `evals.md`'s new prompts walked | The next session's comparison with `main` is clean | 15 |
| R13 | `/triage` files a finding that has no issue, by `gh issue create --body-file` | Its `SKILL.md` and its home in `engineering.md` say so | 9 |
| R14 | A code rules file held to 3,000 characters, not 40 lines (#517) | ADR-087 amended; the check and its test, a file of 3,000 passing and one of 3,001 failing; `/rules-file`'s line | 1, 7 |
| R15 | The check's decisions: adding several records, dense rows on touch, what Back restores, and what sharpens them | Each in its pattern, below; the six new builds filed, each pattern citing its issue | 4, 6 |

- **Assumptions:**
  - A1: docs only, but for `scripts/check-docs.mjs` and its test (R14):
    each commit verified with `--docs`, the full verify before the push.
  - A2: no new ADR number: this amendment, with short ones in ADR-087
    and ADR-088; the check ran as ADR 090.
  - A3: the canvas row is drawn in Claude Design from the prompt in the
    brief, a new row titled with its version.
  - A4: the items from Items' reviews are decided one by one below.
  - A5: nothing a person sees changes, so the reviews are `/simplify`,
    `/code-review` and `/doctor prompt-audit`, with no walkthrough panel.
  - A6: small enough to merge by about 14 November, leaving the
    translations two weeks before 30 November.
- **Not included:**
  - N1: no screen is built here: the Settings page, the width switch in
    code and every screen a pattern changes are built by the branch that
    next touches that screen, through the issues below.
  - N2: the rename to items in the code, the API and the database
    (#553).
  - N3: the CSV import (#552).
  - N4: the WebKit flake found by the triage of 11 November (#560).
- **The questions' answers:** Q1a, the pieces a screen is built from,
  each with its states, widened by *Decision — the five states, and each
  piece's* (D18); Q2a, #517 taken here; Q3a, one Settings page designed
  here and built later.

### Checked before drafting

On 11 November 2026, from `scripts/adr-check.mjs 090`: the areas
`products`, `docs`, `i18n` and `ui`, and the issues it was given, the
numbers 467, 513, 517, 552 and 553, 54 issues read whole; with them,
ADR-090's and ADR-092's Deferred lines, ADR-051's watch list and Open
decisions.

- **Fired, and taken here:**
  - #517's trigger, the next code rules file grown: this grows
    `products.md` and `ui.md`, both at 40 lines (R14).
  - #513: one Settings page for the setup links, designed here (Q3a).
  - #553's "Until then": the code's names written down (R8).
  - #170's comment of 9 November asks how a dense table row meets
    44 px on touch: *Decision — targets and text*.
  - #536 leaves a note for this pull request: after Add, the new item's
    page takes the form's place, so adding several in a row needs Back
    each time: *Decision — after an action*.
  - #544 and #545: Load more's failed state and the message with Undo
    are among the pieces whose states are drawn; their code stays in
    those issues.
- **Not fired, and left:**
  - #467's 14, 17 and 25: their files, `journeys.md` and
    `personas.md`, are not changed.
  - #292's two left: manual checks' anchors wait for #283, and "partly
    tested" for the invoice tests.
  - #306's 40, the docs check reading a test named through `it.each`:
    in the file R14 changes, but another function, and it widens what a
    rules file may cite.
  - #548 and #149: glossary words that change with their catalogues, in
    the translations' batch next.
  - The screens' own issues, #159, #160, #473 to #490, #501, #505, #507
    to #512, #533 to #543, #546, #549 to #551 and #555: their patterns
    are in the design language, each built at its screen's turn.
  - ADR-090's Deferred (a list beside its record, a hinge, real people,
    density per person) and ADR-092's: none fired. No `later` trigger in
    these areas but #517's.
- **Found while checking:**
  - #473 and #509 ask that Back keep the place, its scroll, its loaded
    rows and its focus; *The way back* said only who gets Back.
  - #505's 56 and 92 call Help's `useMediaQuery` a fix, so the width
    switch's exception stays narrow.
  - #507's 48 plans a tonal button variant; its states are drawn with
    the buttons'.
  - Add item's buttons scroll away because a `<form>` sits between the
    dialog and its parts: in 53 dialogs, as step 4 counted them on the
    branch. The 2 that keep their buttons pinned put a flex-column form
    inside the dialog, and are the only ones full screen on a phone.
  - A link to a new page leaves focus nowhere: the layout moves focus
    only after Remove or Delete.
  - Items' rows already make the name the link and open the item on a
    click elsewhere in the row.
  - axe already runs `wcag22aa`, so WCAG's 24 px target check runs on
    every screen in `SCREENS`; Items and Members pass `noSsr: true`, so
    the first draw knows the width.

### Decision — the five states, and each piece's

- **Every screen, and each part of one that reads on its own, is in one
  of five states,** the "UI stack" many teams use: as it should be;
  empty; loading, after 250 ms, its placeholders in the place of what
  will come, a table's head kept; failed, the part alone saying it could
  not be read, with Try again; and partial, what came kept and what did
  not said beside it (Show 50 more failed, no match on this tab). Items
  drew them first (ADR-092).
- **Empty is one of three, each in its own words:** first use, saying
  what to add first, with the action, or the role's line where the
  action is not theirs; no results, naming the filters that are on, with
  one button that clears them all ("Show all items"), each chip's ×
  still clearing one (D8); and done, where empty is the goal reached
  ("Every item has a category.").
- **Each piece draws its states once,** where it has them (D18): rest,
  hover, focus, pressed, selected, disabled, busy, invalid and dragged,
  Material 3's set. The pieces: a button (the main one, a plain one and
  the tonal one), a link, a field, a select, a check box and a radio, a
  switch, a chip, a tab, a row, a tile, a dialog, the message with Undo,
  Load more and a drag handle. A feature draws a piece's states again
  only where they differ.
- **Each state's look is a token** in `tokens.ts`, as Material 3's state
  layers are, and every state keeps its text at 4.5 : 1 and its edge and
  focus ring at 3 : 1, in light and dark (D19): #557's hover, at about
  3.7 : 1, is what this catches. A test that holds each pair is filed
  on the branch.
- **The canvas row** "状态 第一版 · States v1" draws them, in English,
  French and 中文 and both colour modes, the Settings page at its end.

### Decision — each feature's flows and states, asked for when it is planned

ADR-092's decision, written into the planning skill (ADR-088 amended):
each feature's plan asks for a wireflow board on the canvas, an
interaction table in its ADR (Where, You do, What happens, You land,
Back) and each screen's five states, drawn only where they differ from
the States section; its brief turns each row of the table into a
browser test.

### Decision — rows, numbers and tables

- **A row's one link is its name** (D6, D22): a click or tap elsewhere
  in the row opens it too, without being a second link, so a screen
  reader hears the name, not the whole row. A row's own controls, a
  check box, a figure with its status and its actions, are targets of
  their own, never inside the link.
- **The figure beside a status is the figure it judges, or links to
  where it is worked out** (item 1): Items keeps its stock on hand beside
  Low or Out, and the status opens "Where it stands", the figure it
  judges.
- **The name before the code everywhere a person reads** (D15, item 43):
  a table's Code column after its name; a picker's option "Vitamin C 500
  mg · VITC-100", the code grey after the name, a typed code still
  finding it and an exact one still leading. This changes Items'
  as-built "CODE — name"; the picker is filed on the branch.
- **A kind is a word** (D11, item 17): an item's type in a mixed list is
  a word on the row's second line beside its icon, and on the record the
  line under its title; an icon that tells a kind is never alone, and a
  kind takes no status's colour. Built with #548, which gives each type
  its singular.
- **A table that stays a table on a phone** (D7, D23, items 4 and 30),
  until its cards come: its key columns first, its name column fixed
  while the rest scrolls, a visible edge where it scrolls, and the
  scrolling part taking keyboard focus, with a name; a detail opened
  from a row opens below it, the scroll kept. The next cards: Inventory's
  two tabs and Reorder points in Movements' turn (ADR-093), the item's
  names table in Items' next. Reorder points' card: the name, the
  status, "12 left · reorder at 36" and the main action; at `sm`, the
  suggested order too.

### Decision — targets and text

- **On touch, ADR-055's touch density** (D4, #170): a row is one link at
  least 44 px tall, and each control in it a 44 × 44 target by its
  padding, not a bigger glyph; with a mouse, compact rows and WCAG's
  24 px.
- **Held once** (D9, items 10 and 35): the 44 px minimum set in the
  theme for a select, a field, a chip, a toggle, a switch, a check box,
  a radio and a menu entry; padding for an inline link; a disabled
  control at its enabled size; and a touch check in the accessibility
  suite that measures every target on the screens it walks, beside axe's
  24 px. Built with #170.
- **Text by its role** (D10, items 15 and 39): a name, a figure, a
  status and a field's label at rest at 16 px; a label floated above its
  value, a code, a filter chip and a line that explains a figure
  ("Bought · 48 at a time") at 14 px; nothing at 12 or 13 px. Stricter
  than Material's 12 px labels, for older eyes and for Chinese.

### Decision — after an action

- **Adding several records in a row** (D3, D26, #536's note): a form
  that adds a record has a second, text button, "Add and add another".
  It saves, says what was added with Open, and clears the form keeping
  what repeats, the type, the category and the unit (WCAG 3.3.7); the
  main button still opens the new record, as After saving says. Items'
  is filed on the branch.
- **The message with Undo** (D13, item 21): on a phone it sits above any
  pinned bar, and the list gains room at its foot while it shows, so the
  last row can scroll clear. Focus goes to Undo only when the control
  that started the action is gone, as after Move; its timer waits while
  focus or the pointer is on it, as built. Built with #545.

### Decision — refusals at their field

- **A field brought into view brings its label** (item 22), in a dialog
  and on a page.
- **A refusal from the server is put at its field** (D14, item 28), by
  the field's name, scrolled to and focused; one that matches no field
  comes into view with focus. Neither shows a field path or a code, and
  each says what to type, with an example ("CAD"). Built with #310 and
  #148.
- **A long form shows a summary at its top** (D24): an order, a run or
  an invoice lists each refusal as a link to its field, focus on the
  summary, as GOV.UK's error summary does; a dialog or a short form
  focuses its first refused field.

### Decision — dialogs

- **A dialog's buttons stay pinned at its foot at every height,** only
  its body scrolling (D12, item 18). Filed on the branch, with the
  `<form>` found while checking.
- **Below 600 px a form dialog fills the screen** (D25), its height the
  visible screen's (`dvh`), so the phone's keyboard does not hide its
  buttons.

### Decision — the way back, and focus

- **Back returns a list as it was** (D5): its loaded rows, its scroll,
  and focus on the row the person opened; Back to Home focuses the tile
  they left from. Built with #473 and #509.
- **A page reached by a link puts focus on its title** (D21), so a
  screen reader hears where it is, as GOV.UK and React Router advise for
  an app that changes pages without reloading. Filed on the branch.
- **Nothing pinned covers the focused control** (D20, WCAG 2.4.11): the
  top bar, a sticky header, a dialog's buttons and a message leave room
  by one scroll margin from the top bar's height. Built with #507's 41.

### Decision — one Settings page

The rail's Settings opens one page of the setup links (Q3a), grouped by
what they set up, the organization, people and access, the catalogue,
money and documents, each with a line saying what it is for (D27), as
Shopify's and GitHub's are. Settings stays highlighted on every page
under it, Categories included (D17). Its board ends the canvas row; it
is built with #513, and #154 then lets the lookup find each page.

### Decision — the width switch

`.claude/rules/ui.md` names one exception to CSS `display` (D16): a list
whose table and cards would each draw every row switches between them
with `useMediaQuery`, `noSsr: true`, as Items and Members do. Help's
switch stays a fix (#505's 56 and 92).

### Decision — what rides along

- **The playback and a feature's flows and states** in the planning
  skill, and the chat's notes: [ADR-088's amendment](0088-planning-in-the-chat-as-a-skill.md).
- **A code rules file held to 3,000 characters** (#517):
  [ADR-087's amendment](0087-the-rules-written-down.md).
- **The README's roadmap since v0.7.0,** and the release routine's line
  that the README's status and roadmap change at every tag (R7).
- **The code's names for Items** in the glossary and
  `.claude/rules/products.md` (R8), part of #553.
- **A timed run read from its rounds' reports,** in
  `server/perf/README.md` (R10).
- **`/triage` files a finding that has no issue** (R13), as #560 was.

### Considered and not done

- **Each feature drawing every piece's states.** ADR-092 chose against
  it: it repeats the shared states and drifts from them.
- **A "Create another" check box beside the one main button,** Jira's
  way. A button says what it does where a box changes what the main
  button does.
- **The empty list's button clearing the last filter set.** A person
  does not always know which was last; the chips clear one at a time.
- **A type as a chip,** like a status. A kind is not a state, and a
  chip's colour would read as one.
- **The code first in a picker,** where a code is typed or scanned.
  Typing finds it either way, and one look per row serves the reader who
  knows the name.
- **Buttons pinned only under about 700 px tall.** A form taller than
  the dialog hides them at any height.
- **Items and Members on CSS `display`.** Every row would be drawn
  twice, one copy hidden.
- **Both rules files cut to 40 lines.** That joins lines without
  shortening them (#517).
- **The Settings page built here.** It would end the pull request's
  being docs only, ahead of the translations' date.

### Deferred — each with what brings it in

- **A state machine for a flow,** its states and moves as code (as
  XState's statecharts are). Trigger: a flow whose interaction table
  passes about fifteen rows, or a bug from a move the table missed.
- **The touch check on every screen,** not only those
  `accessibility.spec.ts` walks. Trigger: a target under 44 px found on
  touch outside them.
- **Density per person:** ADR-055's, its trigger unchanged.

### Consequences

- **Amended:** ADR-087 (the cap in characters) and ADR-088 (the
  playback, a feature's flows and states, the chat's notes).
- **Docs:** the design language's States section and its patterns;
  `.claude/rules/ui.md` and `products.md`; the glossary; the planning
  skill, its references and `evals.md`; `/triage`'s skill and
  `/rules-file`'s; `engineering.md`; the README; the perf README; the
  handoff. With them `scripts/check-docs.mjs` and its test (R14).
- **The canvas:** the row "状态 第一版 · States v1", the Settings page at
  its end.
- **Filed on the branch,** before the design language's steps, so each
  pattern cites its issue: the state pairs' contrast test (D19); Items'
  "Add and add another" (D26); the picker's name first (D15); the
  dialogs' pinned buttons and full screen on a phone (D12, D25); focus
  on a new page's title (D21); the theme's text floors (D10).
- **After the merge,** `/triage` comments with the pattern on #159,
  #170, #473, #507, #509, #513, #536, #544, #545 and #548.
- **Build order:** this amendment, with ADR-087's and ADR-088's and the
  handoff → the planning skill and `engineering.md`'s lines → the
  dependencies → the six new issues → the States section → the patterns → the cap (#517) →
  the code rules and names → `/triage`'s new issue → the perf README
  and the README → the canvas row → the dependencies again → the reviews
  → the as-built and the pull request, closing #517 and part of #553.

### As built (#568)

Built on 11 November 2026 on `flows-and-states`, 23 commits with this
one and the next, from its brief in `tmp/flows-and-states/`; pull request #568.

**The requirements:**

| R | Marked | How |
| --- | --- | --- |
| R1 | met | This amendment, 12b2a73 |
| R2 | met | The States section, 89330aa; four rules said once and The look linked after the reviews, f44e976 and 03636de |
| R3 | changed | The row "状态 第一版 · States v1", eight boards, drawn by the chat with its Artifact tool, not by the maintainer in Claude Design |
| R4 | met | bed2643 |
| R5 | met | ADR-088's amendment, 12b2a73; the skill, bed2643 |
| R6 | met | Each item's fate above; the patterns, f62db64; the width switch, 20d154a, its exception written in `conventions.md`, dd4e5c6 |
| R7 | changed | The README since v0.7.0 and the release routine's line, 53d9e5a; its Next a link to the handoff's order, not a copy of it, b4f424c |
| R8 | met | 20d154a; the names' rule naming its decision, fe2063a |
| R9 | met | bed2643; the timed run's line left to its README, ed17374 |
| R10 | met | 3f6fb60 |
| R11 | met | 12b2a73 and this commit |
| R12 | deferred | After the merge, as the handoff says |
| R13 | met | 9bacdb3; `engineering.md`'s new-issue line, 3364bfa |
| R14 | met | d739148, closing #517 |
| R15 | met | f62db64; #561 to #566 filed in step 4 |

**Added, beyond R1 to R15:**

- **`/code-review` checks a branch's new clones and its simplicity**
  (0fe2aa1, a fix between steps 10 and 11): jscpd 5.4.2, pinned and run
  with `--absolute`; `scripts/new-clones.mjs` and its test print only the
  clones in the lines the branch changed (966e20c); `.jscpd.json` leaves
  out `client/src/api/`, which `npm run api` writes (460c8c3);
  `conventions.md` extracts a copied block of 20 lines or more at its
  second copy. On 11 November the repository held 667 clones once the
  generated types were left out, 4.1% of its lines, about 1.3% in the
  client's and the server's own code.
- **The planning skill closes a session** (the next commit): what no file
  holds is filed first, only the rest carried into the next session's
  prompt, from a fixed checklist; ADR-088's amendment says so.

**Decided while building:**

- **No gate in CI for duplication:** judged at review, since jscpd counts
  the declarations `conventions.md` keeps on purpose.
- **The clones already there:** one reading pass after the merge over
  those of 20 lines or more in the client's and the server's code, 29 and
  5, each marked extract or keep on #282, then fixed when its file is next
  touched.
- **A pressed state that looks like hover** (step 5): #561 is widened, at
  `/triage` after the merge, so pressed gets a token of its own, tested
  with the others.
- **The reviews' fixes:** 11 of 20 findings, each a commit, 966e20c to
  35a3f7b; one older finding filed as #567, the screens that switch with
  `useMediaQuery` outside the exception.
- **The one home for filing an issue** is a comment on #319 at `/triage`,
  not a new issue.
- **A disabled control is exempt from the contrast pairs,** as WCAG's
  1.4.3 and 1.4.11 say and as Material, Carbon and Polaris do; the line
  saying why stays at 4.5 : 1. Step 5 had held it to them, which would
  have made every disabled control #561's first fix.
- **A footnote's caption stays at 12.5 px,** as ADR-091's amendment
  allows: "nothing at 12 or 13 px" in *Decision — targets and text* is
  for text a person reads to decide.
- **#562's three small points go to its build:** whether the lot switch
  is kept, where focus goes once the form clears, and how the list behind
  learns of the items added; its pull request says each.

**Built differently from the text above:**

- **Items' Low and Out do not yet open "Where it stands":** the status is
  a plain chip, and only the stock beside it links, to Inventory for that
  item alone. `/triage` files the issue after the merge; the design
  language says so at Numbers.
- **A row's one link is its name where the row has controls of its own;**
  Home's Recently opened and Getting started rows stay one link, their
  whole row (da775eb).
- **The design language links `conventions.md`'s The look** for the
  theme's density, focus ring and tokens, rather than saying them again
  (03636de).
- **A new issue `/triage` files is decided already,** so it carries its
  labels and no `needs-triage` (3364bfa).

**Measured:** steps 3 to 10 took 36 minutes against the brief's 205, on
58,625 to 181,403 tokens a step; no Sonnet step ran again on Opus, so the
model table holds. Steps 3 to 13 took about 76 minutes in all against the
brief's 305, the reviews 9 minutes for the findings and 25 for the fixes;
the full verify ran 490 browser tests in Chromium and 119 each in Linux
Firefox and WebKit. Steps 3 and 12 found no dependency 7 days old; step
12's summary advised waiting for 15 November, where the rule takes what
is old enough on the day.

**Found:**

- Dependabot alerts 11 and 12 are #446's, waiting for their upstreams.
- The 13 px "chip" the walkers measured is the quick filter, MUI's small
  toggle button, which the theme gives its colour alone; a status chip is
  already 14 px. For #566, at `/triage`.
- Items' empty search offers "Clear search" and leaves a category on,
  against *The five states*' no results; `/triage` files it.
- The label brought into view and the long form's summary have no issue
  of their own, so the design language cites #310, the shared hook; a
  comment there at `/triage`.
- Settings holds 6 links, and Members sits outside `/settings`, which
  #513's highlight must count; a comment there at `/triage`.
- #517's table counted bytes, 2,972 for `database.md`; the check counts
  characters, 2,968.
- `CLAUDE.md`'s line for `/triage` does not mention a new issue; it stays
  true, and is left.

**Deferred, added:** a gate in CI for duplication. Trigger: a clone that
reaches `main` unread.
