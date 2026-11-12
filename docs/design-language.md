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
each pattern as Home uses it, and a row of its own draws
[States](#states): a screen's five states, and each shared piece's own.

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
- A tile and the filter it opens share one name, the plainer of the two,
  in each language: "Late", never "overdue". A tile whose word alone does
  not say what it is about puts its page's name first: "Invoices · To
  issue".
- A tile with nothing to do stays in its place, quiet: muted, "Nothing to
  ship", still a link.

### Rows

- A row's one link is its name; a click or tap elsewhere in the row
  opens it too, without being a second link, so a screen reader hears
  the name, not the whole row (Items' rows, `item-rows.tsx`; #473 for
  every list).
- A row's own controls, a check box, a figure with its status and its
  actions, are targets of their own, never inside the link
  ([Text and targets](#text-and-targets)).
- The name first, then the code: "Omega-3 fish oil · OMG-120". A second
  code says what it is ("their ref. SO-DEMO-1").
- A table's Code column comes after its name, each table moved when its
  list is next changed, Inventory's in Movements' turn (ADR-093).
- A picker's option reads "Vitamin C 500 mg · VITC-100", the code grey
  after the name, a typed code still finding it and an exact one still
  leading its group (#563; `VariantPicker` puts the code first today).
- A code with a page of its own is a link wherever it appears, a lot's
  code included.
- A row's actions have words, not icons alone.
- A kind is a word: an item's type in a mixed list is a word on the
  row's second line beside its icon, and on the record the line under
  its title (#548, which gives each type its singular).
- An icon that tells a kind is never alone, and a kind takes no status's
  colour, since a kind is not a state (on All, Items' type is an icon
  today, said only to a screen reader).

### Numbers

- A number says what it counts: "12 left · reorder at 36", not "12 of
  36".
- One format, the page's (`displayQuantity`): "48", not "48.0000", a
  dialog's text included (#160). Only a field keeps the exact places it
  takes.
- Numbers are right-aligned in tabular figures, and nothing covers them:
  a pinned column never sits over a cell.
- The figure beside a status is the figure it judges, or links to where
  it is worked out: Items' stock on hand beside Low or Out is a link to
  Inventory for that item alone (`item-rows.tsx`).

### Sorting and filters

- A list sorts on the few columns a person decides by; its default is
  the one most asked for, named in that list's own ADR (ADR-092).
- What sorts looks sortable; the sort is kept in the address with the
  filters.
- A date column shows the date the list is sorted by; where a list keeps
  two dates, the column's header switches between them.
- After sorting from the keyboard, focus stays on the column's header.
- A list its filters made empty is No results, as
  [the five states](#the-five-states) say.

### Lists on a phone

- Below 600 px a list's rows become cards: the name, its status, and the
  one or two numbers that matter, the card opening as its row does
  (#159). Each list names its card's fields, built list by list as each
  is next changed.
- Above it, a table scrolls inside its own container, as ADR-055 set,
  and shows where it is cut (`scrollShades`, `client/src/theme/cut-edge.ts`).
- Until its cards come, a table that stays a table on a phone owes four
  things (#159):
  - its key columns first, and its name column fixed while the rest
    scrolls;
  - a visible edge where it scrolls;
  - its scrolling part taking keyboard focus, with a name;
  - a detail opened from a row opening below it, the scroll kept, never
    sliding the table sideways.
- The next cards are Inventory's two tabs, Stock and Reorder points, in
  Movements' turn (ADR-093), and the item's names table in Items' next.
- Reorder points' card holds the name, the status, "12 left · reorder at
  36" and the main action; at `sm`, the suggested order too.

### A main action the role cannot use

- One quiet line in its place says who can do it and whom to ask:
  "Raising orders is for Sales or Admin. Ask Demo Owner."
- Help hides the steps a role cannot take.

### Refusals at their field

- Each form checks itself (`noValidate`) and says under each field what
  it needs, focus on the first one's visible control, through one shared
  hook (#310). Every refusal says what to do next
  ([principles.md](principles.md)).
- A field brought into view brings its label, in a dialog and on a page,
  so a refused Name never sits under the dialog's top edge (#310's hook).
- A refusal from the server is put at its field by name, scrolled to and
  focused, and one that matches no field comes into view with focus
  (#310, #148); today it is one line above the form (`FormError`).
- A refusal from the server shows no field path or code, and says what
  to type, with an example: a currency such as CAD, never
  `lines.0.currency must be a 3-letter ISO code` (#148).
- A long form, an order, a run or an invoice, shows a summary at its
  top, each refusal a link to its field and focus on the summary, as
  GOV.UK's error summary does (#310).
- A dialog or a short form focuses its first refused field instead.

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
- On a phone the message with Undo sits above any pinned bar, and the
  list gains room at its foot while it shows, so the last row can scroll
  clear of it (#545).
- Focus goes to Undo only when the control that started the action is
  gone, as after Move in Items.
- Its timer waits while focus or the pointer is on it, and runs again
  once both have left (`UndoSnackbar`).

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
- A form that adds a record has a second, text button, "Add and add
  another", the main button still opening the new record (#562 for
  Items' Add item).
- It saves, says what was added with Open ("Added “Vitamin C 500 mg”."),
  and clears the form, keeping what repeats: the type, the category and
  the unit, so nothing is typed twice (WCAG 3.3.7).

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
- Back returns a list as it was: its loaded rows, its scroll, and focus
  on the row the person opened (#473, #509); today its filters and sort
  come back from the address, the rest does not.
- Back to Home focuses the tile the person left from (#473, #509).
- A page reached by a link puts focus on its title, so a screen reader
  hears where it is, as GOV.UK and React Router advise for an app that
  changes pages without reloading (#565).
- Today only a page whose action took away the focused button does, by
  `PageHeader`'s `headingRef`, such as after Remove a member, Delete a
  role or a category, and Issue an invoice.
- Nothing pinned covers the focused control (WCAG 2.4.11): the top bar,
  a sticky header, a dialog's buttons and a message leave room by one
  scroll margin from the top bar's height (#507's 41).

### One Settings page

The rail's Settings opens one page of the setup links, as Shopify's and
GitHub's do, built with #513. Today the menu holds a Settings group of
six links (`client/src/layout/navigation.ts`), and Categories opens from
Items' category filter, Manage categories.

- Its links are grouped by what they set up: the organization, people
  and access, the catalogue, money, and documents.
- Each link has a line under it saying what that page is for.
- Settings stays highlighted on every page under it, Categories
  included.
- The lookup then finds each page it links to (#154).

### Arranging your own screen

Where a person may arrange a screen: Home, by Customise Home (ADR-091),
and the places #337 names, each when its trigger comes.

- One button opens it, named for what it changes ("Customise Home"),
  beside the part it changes, not in a menu.
- Each thing that moves has a handle, and Up, Down and Hide as buttons,
  always there, so dragging is never the only way (WCAG 2.5.7). The
  keyboard drags too: Space to pick up, the arrows to move, Space to
  drop, and a screen reader hears the new place.
- What may not move stays in view, faded, with a lock and words saying
  so.
- What is hidden waits in one list below, each with Show.
- Done saves; leaving with changes not saved asks first (Unsaved work).
  Reset to default returns to the order the person's role gives.
- It changes that person's screen alone, on every device they use.

### Text and targets

- Text by its role, at the Standard text size:
  - a name, a figure, a status, a tile's label and a field's label at
    rest are 16 px, the text a person decides by;
  - a label floated above its value, a code, a filter chip and a line
    that explains a figure ("Bought · 48 at a time") are 14 px;
  - a caption is only for footnotes, and nothing else a person reads is
    under 14 px, stricter than Material's 12 px labels, for older eyes
    and for Chinese.
- Three places are under it today, each brought to 14 px in the theme
  by #566: a floated label at 12 px, the line under a reorder point's
  item at 12.5 (`caption`), and a quick filter at 13 (MUI's small
  `ToggleButton`, `QuickFilterPill`); a status chip is 14 already
  (`MuiChip`).
- The scale steps by 1.25: a section heading at 20 px and a page's title
  at 25 px, so a heading is told apart by size, not weight alone. Line
  heights sit on a 4 px grid: 16 on 24, 14 on 20, 20 on 28, 25 on 32; in
  Chinese, with more room for its strokes, 16 on 28 and 14 on 24.
- The text size is named in words where a person looks for it, not only
  behind their initials.
- On touch every target is at least 44 × 44 px (#170); with a mouse,
  WCAG's 24 px minimum, which axe checks on every screen in `SCREENS`
  (`wcag22aa`).
- On touch a row keeps ADR-055's touch density: the row at least 44 px
  tall, and each control in it a 44 × 44 target by its padding, not a
  bigger glyph; with a mouse, compact rows (Items' rows; #170 for the
  rest).
- The 44 px is the theme's touch density, held once
  ([conventions.md, The look](conventions.md#the-look-adr-055)): a
  select, a field, a toggle, a switch, a check box, a radio and a menu
  entry gain it, an inline link by its padding (#170).
- A touch check in the accessibility suite measures every target on the
  screens it walks, beside axe's 24 px (#170).

## States

What a screen shows while it reads, and how each piece it is built from
looks in each state it has
([ADR-090, amended](adr/0090-the-design-language.md#decision--the-five-states-and-each-pieces)).
The canvas row "状态 第一版 · States v1" draws them, in English, French
and 中文, light and dark. Each with what holds it in the code today, or
the issue that will.

### The five states

Every screen, and each part of one that reads on its own, is in one of
five; Items drew them first (ADR-092), and its words are the examples.

- **As it should be:** what it read, whole: Items' rows, with "Showing
  50 of 312" under them while there are more.
- **Empty,** in one of three kinds, each in its own words:
  - **First use** says what to add first, with the action: "No items
    yet. Add what you sell first, or the raw materials you make it
    from.", with Add item; where the action is not the role's, its line
    instead ([A main action the role cannot use](#a-main-action-the-role-cannot-use)).
  - **No results** names the filters that are on, with one button that
    clears them all, as Items' Show all items does; each chip's × still
    clears one.
  - **Done** is the goal reached, and says so: "Every item has a
    category."
- **Loading:** as [Loading](#loading) says, a table's head kept above
  its placeholder rows, so a header pressed to sort keeps its focus
  (`PlaceholderRows`).
- **Failed:** the part alone says it could not be read, with Try again
  (`ListError`), never an empty state, which would say there is
  nothing.
- **Partial:** what came is kept, and what did not is said beside it:
  - Items' Show 50 more, failing, keeps the rows and says "The next 50
    could not be loaded.", with Try again (#544 for every list).
  - A search with no match on this tab says where the matches are:
    "Nothing in Products matches “vit”. 3 items in Supplies match.",
    with See in Supplies.

### Each piece's states

Each piece draws its states once, here and on the canvas; a feature
draws a piece again only where it differs. The nine states are Material
3's set: selected is chosen, ticked or on; busy, while it works; invalid,
refused.

| Piece | Rest | Hover | Focus | Pressed | Selected | Disabled | Busy | Invalid | Dragged | To build |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| The main button (`MuiButton`) | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| A plain button, text or outlined | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| The tonal button (`TONAL`) | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — | #507's 48: a variant in the theme, not three props by hand |
| A link (`MuiLink`) | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |
| A field | ✓ | ✓ | ✓ | — | — | ✓ | — | ✓ | — | #566: its floated label at 14 px |
| A select, or a picker | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | — | #566: its floated label at 14 px |
| A check box and a radio | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | #170: 44 px on touch |
| A switch (`MuiSwitch`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | #170: 44 px on touch |
| A chip: a status, a filter's with its ×, a quick filter | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | #566 and #170: a quick filter at 14 px and 44 px on touch |
| A tab | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| A row | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | #170: touch density, each control in it 44 px |
| A tile | ✓ | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — |
| A dialog | ✓ | — | ✓ | — | — | — | ✓ | ✓ | — | #564: its buttons pinned, full screen on a phone |
| The message with Undo (`UndoSnackbar`) | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | #545: one Undo, its colours and ring in every message |
| Load more (`LoadMoreButton`) | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | — | #544: a failed page, with Try again, as Items' has |
| A drag handle (Customise Home's) | ✓ | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — |

- **✓ marks a state the piece has,** and — one it has not; in To
  build, — means nothing is left to build.
- **Pressed looks as hover does:** the theme turns MUI's ripple off, the
  hover and the focus ring showing what it did (`MuiButtonBase` in
  `client/src/theme/index.ts`).
- **Busy says what it is doing,** a button's word changing ("Add item",
  then "Adding…") and the dialog holding still while it saves
  (`DialogFooter`); Load more says "Loading…".
- **Focus is one ring,** as
  [conventions.md, The look](conventions.md#the-look-adr-055) says; a
  dialog takes focus in, and gives it back to what opened it when it
  closes.
- **Dragged lifts** with the lift's shadow and an accent edge, where it
  would drop a dashed box (`DraggableTile` in Customise Home).

### Their look

- **Each state's look is a token,** as Material 3's state layers are,
  read through the theme as
  [conventions.md, The look](conventions.md#the-look-adr-055) says.
- **Every state keeps its text at 4.5 : 1 and its edge and focus ring
  at 3 : 1,** in light and dark, a disabled control's included, which
  WCAG exempts.
- **A disabled control keeps its enabled size** (#170).
- **Held today in part:** `tokens.test.ts` holds an entry hovered,
  focused or chosen and the tonal button, and `index.test.tsx` a
  switch's track and #557's hover; #561 holds every piece in every
  state.

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
  takes more than the top bar.
  - A dialog's buttons stay pinned at its foot at every height, only its
    body scrolling, since a form taller than the dialog hides them at any
    height (#564).
  - Below 600 px a form dialog fills the screen, its height the visible
    screen's (`dvh`), so the phone's keyboard does not hide its buttons
    (#564).
  - Today only Members' Invite and Change roles do both, their form a
    flex column inside the dialog (`invite-dialog.tsx`,
    `change-roles-dialog.tsx`); every other form dialog puts a `<form>`
    between the dialog and its parts, so its buttons scroll away with the
    form.
- **Both sides of a breakpoint:** a layout is checked just below and
  just above each one, since a slightly different scale or Split View
  tips a device over; the Duo open sits about 10 px below 900.
- **A foldable opening or closing** re-flows to its new width and keeps
  what was typed.
- **Nothing works only by hovering;** a tablet and a foldable are touch
  screens.
- **The menu** is a rail from `lg`, and below it ADR-055's drawer, with
  its words, not a rail of icons.
- **Settings is one entry in the menu,** opening
  [One Settings page](#one-settings-page), so the rail no longer hides
  Settings links at 1366 × 768, as it does today (#513).
- **The top bar** below `lg` has a short word under each icon, as a
  phone's tab bar has, the app's own names (Notifications under the
  bell); on a narrow phone the organization's name shortens first.
- **Help** sits beside the page where there is room; where there is not,
  it is a modal side sheet that keeps focus inside it, so nothing focused
  sits under it (#272).
- **Checked** by the before-and-after screenshots at each class, the
  Duo's two sizes among them; by the walkthrough panel, which gives the
  classes to a journey's personas in turn unless the journey names its
  own sizes; and by `/production-readiness`'s device pass on real devices
  before real users.

The Duo's sizes are estimates, at the 3× scale iPhones use, until
measured on the device.

## Chinese beside Latin letters

- A space between Chinese and Latin letters or digits: "D3-1000-120
  已有库存下限", "另外 4 个".
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
  person sees walks the journeys it touches, the personas at once, in
  [the review step](engineering.md#the-review-step)
  (`/usability-walkthrough panel <journey>`), and what two personas or
  more hit is settled here.
- **The canvas:** a design is drawn there, at the classes it changes,
  before its code. A changed design is a new row, titled with its
  version, never drawn over the old one: every earlier row stays as the
  design's history, and the version the build follows is named in its
  ADR. [States](#states) names the row it follows.

## Not yet

Each in [ADR-090](adr/0090-the-design-language.md#deferred--each-with-what-brings-it-in),
with what brings it in: a list beside its record on a wide screen; a
dual screen's hinge; a test with real people; and ADR-055's density
setting per person.
