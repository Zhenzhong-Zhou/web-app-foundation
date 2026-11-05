# The design language

How every screen looks and behaves, at every size
([ADR-090](adr/0090-the-design-language.md)). [principles.md](principles.md)
says what the product aims for; this says how a screen gets there. The
tokens, the type, the colours and the shared pieces it builds with are
[ADR-055](adr/0055-the-look.md) and
[conventions.md, The look](conventions.md#the-look-adr-055); the code
rules, [`.claude/rules/ui.md`](../.claude/rules/ui.md); the mark,
[brand/](brand/README.md). The Claude Design canvas that
[engineering.md](engineering.md#how-code-is-delivered) names has a row
for it: the type at each text size, on a laptop and on a phone, and the
rules for Chinese beside Latin letters and digits. ADR-091's boards add
each pattern as Home uses it.

It came from a first-time viewer's look at Home (#335) and from two
walkthrough panels of personas, on 4 November 2026: who they are is in
[personas.md](../.claude/skills/usability-walkthrough/personas.md), and
how a panel walks a journey in
[the walkthrough skill](../.claude/skills/usability-walkthrough/SKILL.md).

A screen is built to it when it is new or next changed, the most-used
first: Home, Inventory, Orders, and the Receive and Ship dialogs. A
pattern a screen needs and this lacks is added here first, with an
amendment of ADR-090, as the pull request's first commit.

## Simple first, detail one step away

One app, in layers, rather than a simple mode beside an expert one:

| Layer | Who it serves | For example |
| --- | --- | --- |
| The surface | someone who knows nothing, or reads poorly up close | Home: a few large tiles, in plain words |
| One step | someone who checks in and learns fast | a tile opens its list, already filtered and sorted |
| The depth | someone who knows the trade | the list's columns, sorting and export; the record, its whole history |

## The principles

1. **Plain words, names before codes.** A person's words, not the
   trade's or the code's: "late", not "overdue"; "Code", not "SKU"; the
   product's or customer's name first, its code after.
2. **One name for one thing,** on every screen and in all three
   languages. A page is called what the menu calls it, everywhere that
   links to it; the glossary holds each word.
3. **The next step visible,** and one main action per screen. A person
   never has to guess what to do next, nor why they cannot.
4. **What can be clicked looks clickable,** with a hover and a focus
   state, and looks the same wherever it appears.
5. **Simple first, detail one step away.** The most-used screens are the
   plainest; detail is on the next screen, not on this one.
6. **Readable and tappable by everyone:** text to decide by at 16 px,
   targets of 44 px on touch, and nothing covering text or numbers.
7. **You never lose your place:** focus, a sort, a filter and Back come
   back as they were, and what was typed survives a reload.
8. **No default that can be wrong.** A choice that changes everything
   after it (selling or buying) starts with neither chosen.

## The patterns

Each with what holds it in the code today, or the issue that will.

### Status carried through

- Home's word and chip ("2 days late", "expired 4 days ago") show on the
  list and the record too, as colour, word and icon together
  (`StatusChip`, `STATUS_TONES` in `client/src/theme/status.ts`).
- Each status a tile counts is a filter on its list: a tile counting
  late orders opens Orders with Late chosen.
- A status says what is true now: an order with everything shipped reads
  "All shipped" until it is closed.

### Tiles open their lists

- A tile opens its list, filtered and sorted by what it counts:
  "Expiring soon" opens Inventory's expiring lots, the soonest first.
- The filter and the sort are in the address, so Back and a bookmark
  keep them (#302).

### Rows

- One link per row, the whole row, at least 44 px tall on touch.
- The name first, then the code: "Omega-3 fish oil · OMG-120". A second
  code says what it is ("their ref. SO-DEMO-1").
- A code with a page of its own is a link wherever it appears, a lot's
  code included.
- A row's actions have words, not icons alone.

### Numbers

- A number says what it counts: "12 left · reorder at 36", not "12 of
  36".
- One format, the page's (`displayQuantity`): "48", not "48.0000", a
  dialog's text included (#160). Only a field keeps the exact places it
  takes.
- Numbers are right-aligned in tabular figures, and nothing covers them:
  a pinned column never sits over a cell.

### Sorting and filters

- What sorts looks sortable; the sort is kept in the address with the
  filters.
- After sorting from the keyboard, focus stays on the column's header.

### Lists on a phone

- Below 600 px a list's rows become cards: the name, its status, and the
  one or two numbers that matter, the row's link the whole card (#159).
  Each list names its card's fields, built list by list as each is next
  changed.
- Above it, a table scrolls inside its own container, as ADR-055 set.

### A main action the role cannot use

- One quiet line in its place says who can do it and whom to ask:
  "Raising orders is for Sales or Admin. Ask Demo Owner."
- Help hides the steps a role cannot take.

### Refusals at their field

- Each form checks itself (`noValidate`) and says under each field what
  it needs, focus on the first one's visible control, through one shared
  hook (#310). Every refusal says what to do next
  ([principles.md](principles.md)).

### Loading

- Every wait past 250 ms shows something (`INDICATOR_DELAY_MS`): a
  list's placeholder, a button's own progress
  ([conventions.md, Loading states](conventions.md#loading-states)).
- A tap inside the app shows the top loading bar at once, a screen's
  code loading included (#431).
- The app's first load says it is loading, in words, and after 10 s that
  the network is slow.

### Actions that cannot be undone

- Never the page's biggest button, and they ask first, in one sentence
  that says what happens: "Close SO-000003? It can't be reopened."
- An action that can be undone runs at once and offers Undo
  (`UndoSnackbar`).

### Unsaved work

- A long form (an order, a run, an invoice) keeps what is typed in this
  browser as it is typed, and offers to continue when it opens again;
  cleared once saved and at sign-out. A short dialog keeps nothing.
- Leaving still asks first
  ([conventions.md, Unsaved changes](conventions.md#unsaved-changes)),
  but a phone discards a tab without asking, and Safari ignores the
  question, so asking is not enough (#198, #263).

### A field with a known set of values

- A list, never free text: the currency in the reader's words (加元 CAD),
  filled from the partner's price list; a unit, a country, a type.
- A select's empty choice is named in words ("Everywhere", "All
  actions"), not a blank box (#274).

### Exports

- In the same place on every list, the recall list included, and in the
  screen's words and the reader's language, never a code such as
  `just_enough`.

### After saving

- The record takes the form's place in the history, so Back does not
  open an empty form.
- The message says what happened: "Draft saved. Confirm it to send.",
  not "Order raised" for a draft.

### Headings and their actions

- A page's heading and its actions are two groups; below the space they
  need, the actions drop to their own line, right-aligned, and wrap
  among themselves (#275;
  [conventions.md, Responsive layout](conventions.md#responsive-layout)).

### The bell and Home

- The same counts in the same words: the bell does not say 3 where Home
  says 26 of the same thing.

### The way back

- A page reached by a link inside the app offers Back (`OFFER_BACK`); one
  opened from the menu, a new tab or a bookmark does not
  ([conventions.md, Back from a link inside the app](conventions.md#back-from-a-link-inside-the-app)).
- A breadcrumb shows the way the person came, not a page they never
  visited.

### Text and targets

- Text a person reads to decide (a tile's label, a status, a name, a
  field's label) is 16 px at the Standard text size; secondary detail 14
  px; a caption only for footnotes.
- The text size is named in words where a person looks for it, not only
  behind their initials.
- On touch every target is at least 44 × 44 px (#170); with a mouse,
  WCAG's 24 px minimum.

## Screen sizes

By width, as Material 3's window size classes do, on the theme's
breakpoints:

| Class | Width | Devices |
| --- | --- | --- |
| Phone (`xs`) | under 600 px | phones; a foldable closed, as the iPhone Duo at about 466 |
| Small tablet (`sm`) | 600–899 | a tablet upright; a foldable open, as the Duo at about 890; a phone held sideways |
| Tablet sideways (`md`) | 900–1199 | a tablet held sideways, a small laptop |
| Laptop (`lg`) | 1200–1535 | laptops; the menu becomes a rail |
| Desktop (`xl`) | 1536 and wider | desktops |

- **Each pattern says what it does in each class,** as Lists on a phone
  does.
- **Height counts:** on a screen under about 700 px tall (a phone held
  sideways, the Duo open, about 626, or closed, about 678), nothing fixed
  takes more than the top bar, and a dialog scrolls inside itself so its
  buttons stay reachable.
- **Both sides of a breakpoint:** a layout is checked just below and
  just above each one, since a slightly different scale or Split View
  tips a device over; the Duo open sits about 10 px below 900.
- **A foldable opening or closing** re-flows to its new width and keeps
  what was typed.
- **Nothing works only by hovering;** a tablet and a foldable are touch
  screens.
- **The menu** is a rail from `lg`, and below it ADR-055's drawer, with
  its words, not a rail of icons.
- **Help** sits beside the page where there is room, and must not cover
  a focused control where there is not (#272).
- **Checked** by the before-and-after screenshots at each class, the
  Duo's two sizes among them; by the walkthrough panel at each class; and
  by `/production-readiness`'s device pass on real devices before real
  users.

The Duo's sizes are estimates, at the 3× scale iPhones use, until
measured on the device.

## Chinese beside Latin letters

- A space between Chinese and Latin letters or digits: "D3-1000-120
  已有再订货点", "另外 4 个".
- A list joins with 、 and its last item with 和, the joiner adding the
  space beside Latin text, once on each side (`joinList` on the server,
  its copy in the client).
- A list item that holds 和 itself is worded so the join does not double
  it: 采购订单、销售订单及其价格, not 采购订单和销售订单和订单价格 (#150).

## How it is held

- **The code rules:** `.claude/rules/ui.md` points here, so Claude Code
  reads it with every screen's files.
- **`/code-review`** judges a screen the change touches against it.
- **The walkthrough panel:** every pull request that changes what a
  person sees walks the journeys it touches, the personas at once
  (`/usability-walkthrough panel <journey>`), and what two personas or
  more hit is settled here.
- **The canvas:** a design is drawn there, at the classes it changes,
  before its code.

## Not yet

Each in [ADR-090](adr/0090-the-design-language.md#deferred--each-with-what-brings-it-in),
with what brings it in: a list beside its record on a wide screen; a
dual screen's hinge; a test with real people; and ADR-055's density
setting per person.
