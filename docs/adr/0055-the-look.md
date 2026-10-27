---
status: accepted
date: 2026-10-07
amends: [ADR-021]
amended-by: [ADR-071, ADR-075, ADR-081, ADR-082]
---

# ADR-055 — The look: tokens, a side rail, tabs and a summary beside the work (amends ADR-021)

> **Amended by [ADR-081](0081-old-tabs-after-a-deploy.md).**
> The status page's discs and Home's empty line take the five tones' pairs, not MUI's derived `light` and `dark`, which fell below contrast.
>
> **Amended by [ADR-082](0082-the-products-brand.md).**
> The brand layer is unchanged: its default accent and the dark rail are the product's mark's own purple and navy, so a change to either is made to the mark's masters too.

**Context.** The client looks like Material UI's defaults because it is
them. `theme.ts` sets the font, the button defaults and two table rules;
colour, type, shape, density and dark mode are MUI's. An audit of the code
and of screenshots from `seed:demo`, in English, French and Chinese, light
and dark, at desktop and phone width, found:

- **Colour carries no meaning.** "Confirmed" is a filled blue on eight of
  nine order rows, blue is also every link and button, and four modules
  choose status colours their own way (`STATUS_COLOUR`, `STATUS_COLOR`, two
  helpers). A lot 20 days from expiry looks like one two years away. Filled
  warning chips and orange text are about 3:1, below WCAG AA.
- **Numbers are hard to read.** Quantities carry four decimals ("600.0000
  each") and no grouping, money is grouped, and the invoice already shows
  "400" where the order shows "400.0000".
- **Money is ambiguous.** The order's "Total" is ordered quantity times
  price before tax; nothing says so, and nothing on the order shows what was
  invoiced, credited or is still to invoice. An accountant asked which
  figure it was.
- **Phone layouts break.** Section actions overflow the edge, codes wrap
  mid-code ("FOC-/2609-/01"), and the production list's table is not in a
  scroll container.
- **The top bar is full.** French fits at 1280px with about 30px to spare;
  an organization's logo, the lot trace and a future lookup do not fit
  beside nine links.
- **Detail pages have no summary.** The order opens on the partner's name;
  its figures and actions are spread down the page.

Three directions were mocked up on real screens and demo data: a quiet
bordered ledger, a roomy side-navigation layout for warehouse tablets, and a
dark rail with tabs and a summary panel beside the work. A Chinese-reading
accountant with no UI background compared the last two in Chinese on two
tasks each. She preferred the third, above all its summary panel; asked for
expiry as days left with a colour; and found the money labels unclear, which
is where most of the money decisions below come from.

Two needs shape every decision here. No organization has a brand yet, and
each will want its own logo and colour, so the brand must be a few values
over a structure that never changes. And the app is read in three languages,
one of them Chinese, by people who are not designers.

**Decision — tokens in two layers.** A token is a named design value (a
colour, a size, a radius) that components use by name instead of writing the
value, so changing the token changes every screen. `client/src/theme/` holds
them:

- *Brand*: the accent colour, the logo, the radius scale and the sidebar's
  shade. These are the only values a rebrand or, later, an organization
  changes. Default accent `#5546B8`.
- *Semantic*: surfaces, text, borders, focus, and five status tones (below),
  in light and dark. Never brand-coloured, so no brand can make a warning
  unreadable or change what "expiring" looks like.

Dark mode derives the accent: the brand colour mixed 45% toward white, used
for fills with dark text and for links. The default accent passes AA in both
modes; checking an organization's own colour is the branding decision's job
(Open decisions).

Shape and space: an 8px spacing unit; radius 6px for controls, 8px for
panels, round for chips. Surfaces are flat, bordered and on a tinted page
background; shadows only for what floats (menus, dialogs, drawers).

**Decision — type.** Source Sans 3, hosted by the app
(`@fontsource/source-sans-3`, Latin and Latin Extended for French), weights
400, 600 and 700. Chinese uses the system's own font, chosen by `:lang(zh)`:
PingFang SC, Microsoft YaHei, Noto Sans CJK SC, then `sans-serif`. Noto Sans
SC is several megabytes per weight, too much to load for every reader;
system fonts cost nothing and are what the Chinese screenshots already use.
Numbers in tables and figures are tabular, so digits line up.

Five sizes and no others: page title 25px, section 17px, body 14.5px, small
13px, caption 12.5px. Line height 1.45 for Latin, 1.65 under `:lang(zh)`.

**Decision — one colour per meaning.** Every status maps to one of five
tones, in one table in `client/src/theme/status.ts`; modules name a status,
never a colour.

| Tone | Means | For example |
| --- | --- | --- |
| neutral | nothing to do, or finished with | draft, closed, cancelled, retired, typed by hand |
| info | in progress, normal | confirmed, released, issued |
| positive | completed as hoped | fulfilled, received in full |
| warning | needs someone soon | expires within 90 days, short, needs a cost, returns not settled |
| critical | wrong, or needs someone now | expires within 30 days, expired, voided |

Chips are tinted with dark text in light mode and the reverse in dark; every
pair passes AA. Colour is never the only signal: the chip's words carry the
meaning.

**Decision — expiry as days left.** A lot within 90 days of expiry shows a
chip with the days left ("Expires in 20 days" / "20 天后过期"), warning within
90 days and critical within 30 or past, and the date beside it in grey. Days
are counted from the person's own calendar day to the lot's `YYYY-MM-DD`
(ADR-052), on the client. The thresholds, 30 and 90, are one constant; per
organization they wait with the branding decision.

**Decision — quantities and money.**

- Quantities show no padding zeros and are grouped in the reader's language:
  "600", "1,000", "15.5 kg", "1 234,5" in French. The value stays a string
  end to end (ADR-025): trimming and grouping are string operations in
  `displayQuantity`, for reading. Fields keep `formatQuantity`, since a
  field shows what `toApiDecimal` accepts back, which refuses grouped
  digits. This brings in ADR-054's deferred grouped digits.
- Every money figure says what it is and whether tax is in it. On an order,
  amounts are before tax, because tax is decided when the invoice is issued:
  the items table's column is "Value, before tax" and its total row "Order
  total, before tax". Invoices and credit notes include tax, because they
  are the documents.
- An amount's currency is named once per group ("Money (CAD)"); an amount in
  any other currency carries its code.
- A sale's money summary comes from the server, calculated from its invoices
  and credit notes, never added up in the browser: order value before tax;
  invoiced and credited including tax, from issued documents only (a voided
  invoice counts in both, through its full credit note, so it nets to
  nothing); net invoiced; and not yet invoiced before tax, the value of what
  is ordered, not closed short and on no issued invoice. Per line, the
  quantity credited. And the returns not yet settled: received with no RMA,
  so nobody has decided on a credit, a replacement or nothing. A purchase
  shows its order value only, since supplier invoices are not recorded.
- No "return value". Returned goods are not money back; only a credit note
  is, and it may be at a lower price. The summary shows what was credited
  and flags what is not settled.

**Decision — navigation: a rail beside the page.** From 1200px (`lg`) a
sidebar, dark by default, with the light shade a brand token. Grouped: the
daily work (Inventory, Movements, Orders, Invoices, Returns, Production);
the records (Products, Partners, Locations, Trace a lot, Stock value, Audit
log); and Settings (Organization, Members, Tax codes, Exchange rates, Price
lists). It collapses to icons with names in tooltips, remembered per device.
Below 1200px it is a drawer behind a menu button, the same links in the same
groups. This replaces the top-bar rule in `conventions.md`; the rule it kept
stays: narrowing the window moves the links, never hides one.

The top bar is slim, sticky and never hides on scroll: the organization's
logo at the left (32px tall at most; its name in text until it has one),
then the bell and the account menu, which keeps the person's own things
(profile, devices, language, colour mode, sign out). In dark mode the logo
sits on a white plate, since most logos are made for white. A slot for a
lookup is left beside the logo and stays empty until that has its own
decision.

**Decision — detail pages: tabs, and a summary beside them.**

- A detail page with three or more sections of different kinds (order,
  invoice, production run, product, partner) puts them in tabs. One with
  fewer stays one page.
- The open tab is in the address, `?tab=shipments`; the first tab has no
  parameter. Switching replaces the history entry rather than adding one, so
  Back leaves the page instead of stepping back through tabs, and a refresh,
  a bookmark or a link from another page opens the same tab. A tab that does
  not exist, or that the person may not see, opens the first and corrects
  the address, with no error. One hook, `useTab`, does this for every page.
- The order's tabs are Items, Shipments, Returns, Invoices and credits, and
  History. History replaces `HistoryButton`'s drawer on tabbed pages, paged
  as it is now; untabbed pages keep the drawer.
- A summary panel sits beside the tabs and stays in view as the page
  scrolls: the actions the record allows, then its figures in groups (on an
  order, quantities and money). Quantities that need explaining say so in a
  grey line beneath ("not counting 1 voided shipment (100)", "doesn't add to
  still to ship"). Below 900px (`md`) the panel moves above the tabs.

**Decision — lists.** One filter row above each list: search, then quick
filters with counts ("Expiring soon 2", "Needs a cost 1"). One empty state:
what is missing, why it matters, what to do next, in the same frame on every
list. Codes (SKUs, lot codes, document numbers) never wrap, like numbers.
Every table scrolls inside its own container.

**Decision — density by pointer.** With a mouse, 36px controls and 40px
table rows. With touch (`pointer: coarse`), 44px targets and taller rows,
chosen by the device, not a setting.

**Decision — paper is separate.** `PrintSheet` renders inside its own fixed
light theme, black on white, outside the screen tokens. The packing slip,
invoice and credit note are unchanged by this decision; the screenshots of
them, in print mode, are the proof.

**Decision — accessibility, amending ADR-021.** WCAG 2.2 AA is the floor:
contrast for every token pair in both modes, a visible focus ring on
everything that takes focus, everything reachable by keyboard, tabs with
MUI's tab pattern (arrow keys, each tab tied to its panel).
`@axe-core/playwright` scans the main pages in light and dark, in a
Playwright spec (a new development dependency).

**Consequences.**

- Built in this order, each step one or more commits, each building on its
  own:
    1. Tokens and the theme (`client/src/theme/`), the font, the status
       table, the paper theme, and the UI section of `conventions.md`.
    2. The shell: rail, drawer and top bar.
    3. Shared pieces: `useTab`, the detail layout with its summary panel,
       the status and expiry chips, the filter row, the empty state,
       `formatQuantity`.
    4. Server: the sale's money summary, credited quantity per line and
       unsettled returns on the order's details; e2e tests. No migration is
       expected.
    5. Screens, one feature folder per commit, orders first; each updates
       `docs/manual-checks.md` and its specs.
    6. The axe spec, and manual checks for dark mode and narrow screens.
- Names do not change: every button, link and heading keeps its words, so
  `getByRole` lookups hold. What changes: specs that read sections now
  behind a tab click the tab first, and specs asserting "400.0000" read
  "400". Each is updated in the commit that changes its page.
- `npm run screenshots` is the before-and-after record: the whole set is
  retaken before step 1 and after each step.
- One more dependency in the bundle (the font) and one in development (axe).

**Deferred — each with what brings it in.**

- **Per-organization branding**, with the expiry thresholds: Open decisions.
- **The lookup in the top bar**, and search and sorting on lists: Open
  decisions.
- **Charts and the lot-trace diagram.** MUI X Charts would be a new
  dependency. Trigger: the stock-value trend or a recall that a table cannot
  show.
- **A density setting per person.** Trigger: someone on a desktop asking for
  more rows.

**Rejected.**

- **The quiet ledger** (direction A). The smallest change, but it keeps the
  top bar that has run out of room, and the people it was shown to read it
  as unchanged.
- **The roomy side navigation** (direction B) as it was. Its legibility is
  kept as touch density; its single long page lost to tabs and a summary
  that keeps the figures in view.
- **Tabs held only in memory.** A refresh, a bookmark or Back would lose the
  place, which is what makes tabs frustrating.
- **A history entry per tab.** Back would step through every tab visited
  before leaving the page.
- **Hiding the top bar on scroll.** It holds the bell and the account, and a
  bar that comes and goes moves the page.
- **Hosting a Chinese web font.** Megabytes per weight for every reader; the
  system fonts are good and free.
- **A monospace face for codes.** Tabular figures and a face that tells 0
  from O do the job without a third style.
- **A return value.** It reads as money given back, which is untrue until a
  credit note says so.
- **Brand colour on status.** One organization's red would make every action
  look like a warning.

**Amendment (built).** Steps 1 to 6 are built on `ui-design-pass`. What
was settled while building, against the decisions above; the method is
unchanged.

- **The summary counts items, and sums quantities only in one unit.** The
  server sends ordered, shipped, returned and still to ship summed when
  every line counts in one unit, and null otherwise: 600 bottles and 15 kg
  add up to nothing. A mixed order says how many items are complete. The
  same read carries the tabs' counts and a sale's invoices and credit
  notes, for an **Invoices and credits** tab beside a **History** tab.
- **Ship leads the summary**, full width; the status moves (Close order,
  Cancel order) come last and turn outlined beside it. A line's
  corrections are in a ⋮ menu, its actions column pinned to the table's
  right edge, so the menu is never found only by scrolling sideways.
- **Credits read with a minus** (`formatCredit`, U+2212) on the summary,
  the documents tab and an invoice's credit notes, which became a table.
- **Quick filters count on the server**, with the list's own filters:
  inventory's Expiring soon and Needs a cost (`GET /v1/stock/counts`), the
  latter through the one definition of a cost still waiting
  (`openNeedsCost`). Lists loaded whole (products, partners) narrow in the
  browser. Status filters are quick filters, never tabs or a select.
- **Not every page takes tabs or a filter row.** An RMA is one table and
  its notes; Locations is a tree, where a search would need a different
  design. Both keep their layout and take the tones and empty state.
- **Units take their plural** in every language, from the quantity
  (`displayWithUnit`, `withUnit`); the number is read only to choose the
  word's form, the figure shown is still the string (ADR-025).
- **Password fields show and hide** (`PasswordField`): hidden at the
  start, per field, and hidden again on submit and on leaving the page.
- **Accessibility is enforced, not hoped for.** `accessibility.spec` runs
  axe for WCAG 2.2 AA on twenty screens in both modes; its first runs
  found and fixed contrast on quick filters and disabled helper text, a
  link told by colour alone, and two controls without names. A link
  inside a sentence is always underlined; a control with no visible label
  carries one naming what it acts on.

**Amendment (October 2026) — the text size (ADR-075).** The five type
sizes stand, and a person may scale them all by 112.5% or 125% with Text
size. A width that holds text is rem, so it grows with them. A button
still never shrinks beside others, but its label breaks onto a second
line when it alone is wider than all its space, rather than running off
a phone's screen; in a table cell it stays on one line. Banners, header
buttons, dialog footers and date ranges wrap, so no page scrolls
sideways at 320px.

**Amendment (October 2026) — a colour given as a path goes in `sx`
(#196).** MUI 9's Typography takes its `color` prop only as a palette name
(`primary`, `error`, `textSecondary`) and ignores a path, which TypeScript
still accepts as a string. So from the first MUI 9 commit (2 September
2026) `color="text.secondary"`, in 214 places, drew the primary text
colour, and the muted line under a heading, a figure's note and a list's
detail read as loudly as what they explain; two warning lines were not
amber. The text hierarchy above is meant, and is put back:

- **MUI's own codemod,** `@mui/codemod@9.5.0` `v9.0.0/system-props`,
  moves every colour given as a path into `sx`, merging into an `sx`
  already there: `sx={{ color: 'text.secondary' }}`, as the client
  already writes colours elsewhere. A named colour stays a prop. A path
  inside an expression, which the codemod leaves, moves by hand.
- **The one `warning.dark` becomes `warning.main`,** the warning intent:
  MUI's derived shades are not tokens, and fell below contrast where
  ADR-081 met them.
- **A lint rule refuses a `color` prop with a dot in it,** however it is
  written, on any component, since the type cannot.
- **Checked by eye and by axe:** the main screens pictured before and
  after, in both modes, at desktop and phone width.

Rejected: a variant per path in the theme's `MuiTypography`, which would
be one file, but keeps working by our hand a spelling MUI 9 dropped, and
would fail as quietly at the next major; and renaming each to its palette
name (`textSecondary`), which leaves one colour with two spellings, the
prop's and `sx`'s.

**As built (#224, 23 October 2026).** The count was exact: 217 written-out
paths on Typography and one inside a conditional, which is the 218, plus
two on Link. MUI 9.5's Link honours a path, so those two were not broken;
they moved only so every path is written one way. The codemod's command
crashes on yargs 18 (`yargs.command is not a function`), so its v9
transform ran through the jscodeshift it ships, with its own flags. What
building added:

- **Muted text on a highlighted row takes the main text colour.** On a
  focused or selected option, and on a menu entry the keyboard is on,
  muted text against MUI's state tints fell to 4.13 to 4.48 : 1. The theme
  points the muted colour at the main text colour on those rows, once, so
  no screen changed. `tokens.test.ts` measures main text on every such
  tint, and muted text on hover and on a chosen card, with all six accent
  presets in both modes.
- **Every Autocomplete's groups sit inside its listbox,** each a group
  named by its heading (`theme/option-group.tsx`): MUI put grouped
  options outside it, and axe refused that.
- **A menu holds only its entries.** A title or an action goes in a
  Popover above a MenuList, since in a menu Tab closes it and the arrows
  skip anything but an entry. The bell is the first: its Popover is a
  dialog named by its title, and the bell has `aria-haspopup="dialog"`
  and `aria-expanded`.
- **Focus.** When a control removes itself, as Mark all read does once
  nothing is unread, focus moves to the next useful place, there the
  first entry. A key pressed while a list loads stops the list taking
  focus when it arrives.
- **A link drawn in the colour of the text around it is always
  underlined,** or it reads as a label (Home's Change the days).
- **The lint rule is proved by a test** that lints a component and a
  spec through the real `eslint.config.js`, so a later block that
  replaces its options fails a test. Lint cannot follow a colour kept in
  a variable, returned by a function or spread in; none exists today.
- **axe opens what it never opened:** the bell with the keyboard on an
  entry, the lookup with it on a result, and the time-zone list on the
  chosen zone, the darkest tint.

The two warning lines and a draft invoice's "None yet" are amber; the
breadcrumb's current page became the main text colour, as its comment
always said; a disabled role card's reason became muted, readable beside
the faded name.

Four stay muted on purpose, though the before-and-after comparison drew
each lighter than before (Bob, 24 October 2026): the seller's tax number
on an invoice, a production run's lot lines, a recipe's "Makes … per
batch" and Members' Last active. A later sweep leaves them so.

*Deferred:* a selected menu entry holding a muted line gets no rule yet,
since no menu has one; the first that does extends the theme's rule to
`.Mui-selected`.
