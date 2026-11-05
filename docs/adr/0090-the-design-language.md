---
status: accepted
date: 2026-11-04
areas: [docs, i18n, ui]
amends: [ADR-055, ADR-089]
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
thirteen dialogs on 4 November.

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
