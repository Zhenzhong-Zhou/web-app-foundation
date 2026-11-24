---
status: accepted
date: 2026-11-21
areas: [costs, numbering, stock]
amends: [ADR-023, ADR-044, ADR-048, ADR-056, ADR-073, ADR-074, ADR-093]
---

# ADR-094 — Lots at receipt: a code made for us, the supplier's lot later, tracking started with stock (amends ADR-023, ADR-044, ADR-048, ADR-056, ADR-073, ADR-074 and ADR-093)

## Context

A lot's code is typed, and stored as printed on the box (ADR-023). When
a delivery shows no lot, the receiver makes one up, and it is stored as
printed all the same: `lots.is_assigned`, the flag for a code made
here, has been in the table since ADR-023 and no screen sets it. A
blank expiry means "does not expire", so a date nobody knows yet reads
the same as none. Lot tracking is chosen when a code is added and never
again (`UpdateVariantDto` has no `tracksLots`), so a code that already
holds stock can never start. And a receipt with no order says nothing
of why, or of who sent it.

Issue #629 asked for the receipt's parts on 18 November 2026, drawn on
the canvas's row "库存与库存变动 第三版 · v3" ("the supplier's lot added
later"). ADR-093's Movements review decided the rest on 20 November
(119a to 124a), drawn on "第十版 · v10": its own branch after Movements,
tracking started for a code with stock, our own lot codes with their
format beside document numbering, at most 20 characters, and an older
code marked as made here. The branch is `adr-094-lots-at-receipt`, from
`main` at 9002a93d, planned in the chat on 21 November. Its changes
against v3 and v10 are the row "第十五版 · v15 (ADR-094, #629)", four
boards; v3 and v10 stay as its history.

### Requirements, as confirmed

The maintainer confirmed these on 21 November 2026, before drafting,
with the assumptions and what is not included, and answered the
questions Q1c, Q2a, Q3a, Q4a, Q5a, Q6a and Q7a; then Q8a and Q9a, after
the choices were checked against production practice (E1 to E7); then
the check's 1a to 5a. A step is the brief's.

| R | What | Done when | Step |
| --- | --- | --- | --- |
| R1 | Organization › Documents › Lot codes: a prefix, a date part, a number and when it starts again; the default `L-YYYY-MM-DD-n`, again each day; the next code shown | Every organization has the default after the migration and at registration; a changed format gives the code the screen showed; the change is in the Activity log | 6, 7, 19 |
| R2 | A code made for us is at most 20 characters of A to Z, 0 to 9 and hyphens; a format that could print more is refused when saved (123a, Q2a) | Unit tests at 20 and 21 characters, and for a refused character, on the server and on the client's copy | 7, 19 |
| R3 | "Make a code for us" wherever a new lot is made: Receive stock, an order's Receive, Count it in…; the code takes its number when the write is saved, and the message says to write it on the delivery, with Copy code (121a, E3) | A server test per route, two codes the same day ending -1 and -2, two writes at once never sharing one; a browser test per dialog | 8, 18, 22 |
| R4 | A made code is stored as made here, a typed one as printed; Count it in… no longer tells a new lot by the movement's reason (#649's 46) | The lot's flag in each route's test; a made code can be corrected in Edit lot details | 8 |
| R5 | A lot made here has a Supplier's lot: optional at receipt, added later in Edit lot details; until then it reads "Supplier's lot to add" | A browser test receives with a made code, adds the supplier's lot later, and the mark goes | 8, 9, 18, 20, 22 |
| R6 | Both codes find the lot: Stock's search, the Lot view, the top bar's lookup, Movements' find box; the lot's page, the recall list and the exports show both | A server test per search; each inside ADR-051's budget at large, the new index in the plan check | 3, 16, 24 |
| R7 | An older lot whose code was typed up here is marked "We made this code up; nothing printed it", one way, in the Activity log, by its own permission, the Owner's alone at first (124a, Q1c) | A server test: marked once, never unmarked, refused without the permission; the role editor offers it | 9, 20 |
| R8 | A new lot's Expires is one of three, in the three dialogs and in Edit lot details: On a date, Not known yet, Doesn't expire; today's lots with no date stay Doesn't expire; the choice starts on what the item's last lot had, and a first lot has none chosen (E6) | A server test stores each; Edit lot details moves a lot between the three; a component test per starting choice | 6, 8, 9, 18 |
| R9 | A lot whose expiry is not known reads "Expiry to add" wherever its expiry shows; it stays usable, and is never counted expired or expiring (Q5a); one quick filter on the Lot view, Details to add, counts lots with either mark (E5) | Usable stock's test; the filter's count is the rows it shows; Stock, the Lot view, the lot's page and the exports read the mark | 10, 20 |
| R10 | As a code is typed, the field says which it is: an existing lot (this adds to it, with its expiry and what is where) or a new lot | A component test for each; a browser test | 18, 22 |
| R11 | A receipt with no order asks why: Opening stock, Returned, A sample, Other, Other with a note; it may name who it came from (E2); both show on the movement and in its export | A server test per reason; Movements reads "Received: opening stock"; the lot's page names who it came from | 8, 18 |
| R12 | "Found in a count" is offered there and is no receipt: it opens Count it in… with the item and place kept | A browser test chooses it and lands in Count it in…; Escape returns | 18, 22 |
| R13 | A code not tracked offers "Start tracking lots…" on the item's page to whoever may change items and correct counts; never for equipment; a code with nothing on hand starts too, and no lot is made | A server test refuses without either permission and for equipment; a test with nothing on hand | 12, 20 |
| R14 | The question says how much is on hand at which places, how the lot's code is made, that it cannot be undone, and takes the supplier's lot and the expiry when they are known (E4) | A browser test reads each line; Cancel changes nothing | 20, 22 |
| R15 | Confirmed, in one write: tracking on; one lot made for us, noted "Stock on hand when lot tracking started", holding the code's stock at every place (120a, 122a) | A server test: each place's quantity unchanged and now in the lot; On hand, Held, Free, Short and Coming as before | 12 |
| R16 | Movements shows one row a place, "moved 3,000 each into a lot, counted in neither", its reason a lot change, Lots started; who and when in the Activity log (4a) | The stock card's closing balance is the same before and after; the reason in the filter and the export | 12, 20 |
| R17 | The code's whole cost history moves into the lot: Stock value unchanged, and what waited for a cost still waits, its later cost landing on the lot (3a) | A costs test: value and average equal before and after; a receipt that waited, costed afterwards, values the lot | 4, 12 |
| R18 | One way: nothing turns tracking off; afterwards receipts ask for a lot, as for every tracked code | No route unsets it; Help, the rules file and MC-203 say so (#306's 25 and 33) | 12, 23 |
| R19 | First, a list of every read and write that assumes a code's tracking never changes; stock that comes back from before goes into the lot noted as from before tracking, made then if the code has none (Q4a) | The list, each case fixed by a test: a return of an earlier sale, a voided shipment, a released run's unused stock, each at the cost it left at | 4, 14 |
| R20 | Move to another lot…, on a lot's Actions, for whoever may correct counts: part of a lot to another lot of the same item, one it has or a new one; a note asked; a new lot starting with the first lot's expiry and supplier's lot (Q3a, E7, 5a) | A server test: both lots' quantities, the value carried, the new lot listed as waiting for a cost when the first was (3a); a browser test | 13, 20, 22 |
| R21 | The lot's trace follows a move between lots: where a lot came from, and a recall of the first lot listing who received the second, on the page and in the export (E1) | A server test: a customer who received only the second lot is on the first lot's recall list, with the lot it came through | 15, 21 |
| R22 | A pool with any stock still waiting for a cost gives no average: stock counted into it waits too (#650, 2a) | #650's test, failing first; the rules file's line and MC-322 | 11 |
| R23 | Seeds, Help in three languages, the rules files, manual checks, the glossary's words, the Activity log's words, and the canvas row with the wireflow and each screen's states | `seed:demo` holds a code to start tracking and a lot with details to add; the volume seed holds supplier's lots, timed | 5, 17, 23 |
| R24 | The riders (1a): #647; #160's Receive half; #618; #306's 25 with MC-203; #649's 46 and the trace's joins, with #627's recall half; #282's numbering line; #308's 37; #617 and #620 | Each closed by its commit, or commented with what is left | 8, 14, 15, 16, 18, 19, 21, 23 |
| R25 | The handoff tidy: 143a is #656; the kept review files in the branch's own folder; #653 also checks the issues an ADR names as its direction | The handoff's patch in the first commit; a comment on #653 | 1 |

- **Assumptions:**
  - All of #629's text is built here, so the pull request closes it.
  - "Made here" is `lots.is_assigned`; no second flag is added.
  - Migrations, and no API revision raise: every field and route is
    added, and the new reason is one accepted line (below).
  - This branch's dependency steps leave typescript-eslint 8.73.0 to
    its own pull request (ADR-093's Deferred).
- **Not included:** #442, #331 and #333's picking half, with which lot
  a shipment takes among lots with no date; lot labels (#441), scanning
  and the barcodes table; turning tracking off, merging two lots,
  renaming a printed code; the CSV import and opening stock by lot
  (#552), a stocktake, stock by site (#409); a product or a site in the
  lot format.

### Checked before drafting

On 21 November 2026, from `scripts/adr-check.mjs 094` on
`adr-094-lots-at-receipt` at 9002a93d: the areas `stock`, `orders`,
`products`, `locations`, `partners`, `numbering`, `costs`, `search`,
`production-orders`, `return-authorizations`, `api`, `i18n`, `ui` and
`help`, and the issues 629, 442, 331, 333, 441, 552, 650, 653 and 656;
147 open issues, 101 whole in the file. Of those, 40 were read whole,
every one named and every one on stock, lots, receiving, costs and
dialogs; the other 61 were searched for this branch's words and files,
each matching line read. With them, the Deferred lines of ADR-023,
ADR-044, ADR-048, ADR-052, ADR-073, ADR-074, ADR-092 and ADR-093,
ADR-051's watch and Open decisions.

- **Fired, and taken here:**
  - #629 whole.
  - ADR-074's and Open decisions' "a lot received from a supplier stays
    typed": amended below; run numbers and batch codes stay deferred
    (Q7a).
  - ADR-051's watch "Lot search": the supplier's lot joins it, with an
    index led by the organization, as migration 0077's are (R6).
  - #650, `fix-now`, in the function the new moves call (R22).
  - The riders of R24, each because this branch changes its file.
- **Not fired, and left:**
  - #442, #331, #333's picking half, #441 and #552: expired lots'
    batch, and what follows it.
  - The `fix-now` issues in these areas, among them #156, #310, #574,
    #607 and #608: the Fix-ups'. The two new dialogs are built to
    #310's and #564's patterns, and the new refusals name no API field
    (#574), so none adds to those lists.
  - #164, #274, #293, #504, #535, #544, #564, #604, #611, #619, #640,
    #641, #646, #648 and #631's other lines: each waits for its own
    screen, or needs a change of its own.
  - ADR-052's month-precision expiry and least shelf life, ADR-073's
    series per site, ADR-074's product token, ADR-092's barcodes and
    ADR-093's found stock at the item's average: no trigger met. Open
    decisions' barcodes, CSV import, counting a shelf, compliance as
    its own domain and a cost correction carried through production:
    not fired.
- **Found while checking:**
  - A cost given late does not follow stock that changed lot: the old
    receipt's correction finds its pool empty, records a variance, and
    the new lot stays at 0 (3a).
  - An organization with no base currency has every receipt waiting
    for a cost, so refusing a lot change until it is costed would lock
    it out for good.
  - A return and a void read their shipment's cost by lot
    (`shippedAt` in `valuation.ts`), so stock from before tracking must
    read the rows with no lot (R19).
  - Move changes a place, never a lot: 120a's "split out later with
    Move" had no tool (Q3a).
  - R21's column widens a table #617 already finds cut off on a phone.
  - The products rules file and MC-203 say lot tracking never changes
    (#306's 25 and 33).
  - v15's start-tracking board says "nothing waits for a cost", wrong
    where stock already waited; the next row corrects it.

## Decision — our own lot codes, by a format beside document numbering

- **A seventh kind of number, kept as ADR-073 keeps the others:** a
  `lot` series in `document_numbering` and `document_sequences`, its
  default the prefix `L-{YYYY}-{MM}-{DD}-`, one digit and a daily
  reset, so `L-2026-11-21-1`. Its day is the organization's today
  (ADR-072). The screen offers it as Prefix, Date and Number, with the
  next code beside them (R1).
- **Narrower than a document's number:** capital letters, digits and
  hyphens alone, no `_` or `/`, and at most 20 characters with its
  number, so a GS1 barcode's lot field, 20 characters, can carry it
  (R2). The limit is for codes we make. A typed code and a supplier's
  lot stay as printed, up to 64, since GS1's own set allows lower case,
  `/` and `.`, and a supplier's box is not ours to refuse (Q2a).
- **The number is taken when the write is saved,** inside its
  transaction, as a document's is: two receipts at once never share a
  code, and a dialog that is cancelled uses none. Before saving, the
  field reads "Made when you save, like L-2026-11-21-1"; after, the
  message names the code, says "Write this code on the delivery", and
  offers Copy code and Open the lot (E3). A code the item already has,
  typed earlier in the same form, is passed over for the next number.
- **One counter for the organization,** so a made code names one lot
  in the whole organization, though the table's rule stays unique per
  item.
- **A made lot is `is_assigned`,** in Receive stock, an order's Receive
  and Count it in…; the route says a lot must be new or made, never the
  movement's reason (R4).

## Decision — the supplier's lot, beside our code

- `lots.supplier_lot`: optional, as printed, its case kept, searched
  without it. Offered for a lot made here, at receipt and in Edit lot
  details; a lot whose own code is the supplier's has none to add (R5).
- Both codes find the lot, wherever a lot is searched, and ADR-044's
  two sentences on the lot search become one: any part of either code,
  the start first (R6, #308's 37).
- An older lot is marked as made here by a permission of its own,
  `stock.lot_made_here`, the Owner's alone at first as every new
  permission is, given to another role in the role editor. One way,
  audited: it lets a code be renamed, so a recall may no longer match
  the boxes (R7, Q1c).

## Decision — an expiry is a date, not known yet, or none

- `lots.expiry` says which: `date`, `unknown` or `none`, with
  `expires_at` set exactly for `date`. The migration writes `date`
  where a lot has one and `none` elsewhere, so nothing reads
  differently until someone chooses (R8).
- **Not known yet stays usable** (Q5a): it is in no Expired or Expiring
  count and never "expires first"; it is picked as a lot with no date
  is, after the dated ones, until #333 decides picking. A company that
  must hold such stock receives it into a place not available
  (ADR-042).
- **It is not left half done:** the lot reads "Expiry to add" and
  "Supplier's lot to add" until filled, and the Lot view's Details to
  add lists both (R9, E5).

## Decision — a receipt with no order says why, and from whom

- Its reason's detail is `opening`, `returned`, `sample` or `other`, a
  key the screens translate, `other` with a note. "Found in a count"
  opens Count it in… and records no receipt (R11, R12).
- It may name a partner, kept as a sample's recipient is: for a
  receipt, who it came from. The lot's page shows it, so a lot traces
  to its supplier with or without an order (E2).

## Decision — a lot change is one movement, counted in neither In nor Out

- **A ninth reason, `lot_change`,** with two details: `lots_started`
  and `between_lots` (4a). It names the lot it leaves and the lot it
  enters at one place; a code's on hand, Held, Free and stock card
  balance do not move. With a lot chosen, the stock card counts it Out
  of the first and In to the second.
- **It is one new value in the API,** let through by one line in the
  accepted-changes file if an open tab reads a reason it does not know
  as plain text, which step 4 confirms; else the revision is raised.
- **Start tracking lots (R13 to R18):** `products.update` and
  `stock.adjust`; one transaction: the code tracks lots, one lot is
  made for us with the note "Stock on hand when lot tracking started",
  and a `lots_started` movement at each place puts its stock into it.
  With nothing on hand, tracking turns on and nothing else is written.
  Never for equipment (ADR-092).
- **Move to another lot (R20):** `stock.adjust` and a note, as every
  correction (5a). The destination is one of the item's lots or a new
  one, typed or made; a new one starts with the first lot's expiry and
  supplier's lot, to be changed where it really is another run (E7).
- **The trace follows it (R21):** a `between_lots` movement is a joint
  between lots, as a run is: the second lot's page says where it came
  from, and the first lot's Who received it lists the second's
  recipients, each with the lot it came through. Without it a move
  would hide stock from a recall.

## Decision — the cost goes with the stock, and what waits still waits

- **Start tracking moves the code's whole cost history into the lot
  (3a):** its pool and its valuation rows take the lot's id, their
  values and dates untouched, so Stock value is the same, each receipt
  that waited for a cost still waits, and its later cost lands on the
  lot. This is the one write that relabels the value ledger's rows;
  the Activity log records it. Step 4 confirms it against every read
  of those rows before step 12 builds it.
- **Move to another lot carries the value it has today:** the first
  pool's share, out of one pool and into the other. Where the first
  pool has stock still waiting for a cost, the row into the second is
  marked as waiting too, so Stock value lists it and names the lot it
  came from. A cost given later to the old receipt revalues what
  remains in its pool and records the rest as a variance, as ADR-048
  does for stock already gone; the moved stock is costed by its own
  line.
- **A pool with any stock still waiting for a cost gives no average
  (2a, #650):** stock counted into it waits too, and says so.
- **Stock from before tracking comes back at the cost it left at
  (Q4a):** a return and a void read their shipment's rows whatever lot
  those carry.

## Decision — how it behaves

The wireflow and each screen's states are the canvas's next row, drawn
at step 5; v15 holds the confirmed screens. The states are the design
language's, drawn only where they differ: the question while the
places are read; a refusal at its field, focus on it; the message that
names a made code. Each row below is a browser test (step 22).

| Where | You do | What happens | You land | Back |
| --- | --- | --- | --- | --- |
| Receive stock, Lot number | Make a code for us | The field reads "Made when you save, like L-…"; Supplier's lot shows; Expires starts on Not known yet | the dialog | Type one instead: the field empties, focus in it |
| Receive stock, Lot number | Type a code | Under it: an existing lot, with its expiry and what is where, or a new lot | the dialog | — |
| Receive stock, Why is there no order? | Found in a count | Count it in… opens with the item and place | Count it in… | Escape: Receive stock, focus on the reason |
| Receive stock | Receive | Saved; the message names the new lot, with Copy code and Open the lot | Stock, the row open at its lot | — |
| An order's Receive; Count it in… | The same lot fields | As Receive stock's | the dialog | Escape: focus on what opened it |
| The item's page, a code not tracked | Start tracking lots… | The question, its places listed, Supplier's lot and Expires optional | the dialog | Escape or Cancel: focus on the button |
| The question | Start tracking lots | One write; the message names the lot, with Open the lot | the item's page, the code reading Tracked | — |
| Stock, a lot's Actions | Move to another lot… | Quantity, the lot it goes to, Expires as the lot's, a note | the dialog | Escape: focus on Actions |
| Move to another lot | Move to lot | One write; the message names both lots, and says so when the new one waits for a cost | Stock, both lots open | — |
| The Lot view | Details to add | The lots with a supplier's lot or an expiry to add, in the address | the Lot view | Back: the Lot view as it was |
| A lot's Actions | Edit lot details | Supplier's lot, Expires' three choices; the check box for an older code, with the permission | the dialog | Escape: focus on Actions |
| A lot's page, Who received it | The lot a row came through | That lot's page | the lot's page | Back: the first lot's page, focus on its row |
| Organization › Documents, Lot codes | Change the format, Save | The next code as typed; a format past 20 characters refused at its field | the tab | — |

## Decision — held to production practice

- **A code of our own at receipt, the supplier's beside it,** is what
  the US rules for supplements ask (21 CFR 111.155: each lot received
  identified so it traces to its supplier and the day it came) and
  what drug records hold (21 CFR 211.184: the supplier's lot if known,
  and a receiving code).
- **Tracking started with stock:** SAP refuses until the stock is zero
  and every open document closed; Odoo allows it with a warning, then
  two corrections by hand. One audited write that keeps the cost is
  kinder than both and loses nothing either keeps.
- **A move between lots** is SAP's transfer posting from batch to
  batch; the trace following it is what makes it safe.
- **Looser than a regulated plant in one place:** stock whose expiry
  is not known may be used. A place not available holds it where that
  matters; a lot's own status is deferred.

## Considered and not done

- **Tracking refused until the stock is zero,** as SAP has it: honest,
  and a day's work of corrections for each code.
- **Splitting by two corrections (Q3b):** reads as lost and found, and
  the new lot is valued at 0.
- **One lot a place at the start (122b):** a lot is a run, not a shelf.
- **The 20 characters for every lot code (Q2b):** it would refuse what
  some suppliers print.
- **Owner and Admin by role name (Q1a):** roles are made of
  permissions since ADR-080.
- **The code shown before saving,** as v10 drew it: two people would
  see the same one.
- **A filter for each mark (Q5's first wording):** one place for every
  unfinished lot is simpler.
- **A lot change refused while its stock waits for a cost (3b):** it
  locks out a company that keeps no costs.
- **Run numbers and batch codes now (Q7b):** ADR-074 waits for
  production's own work.

## Deferred — each with what brings it in

- **Always our own code at receipt,** the supplier's lot beside it
  (Q9a). Trigger: the first organization that must number each
  delivery.
- **A lot's status,** quarantined, approved or rejected. Trigger: the
  first organization whose quality person releases each lot.
- **Lot labels (#441).** Trigger: its own, sooner now that codes are
  made here.
- **Tracking started for several codes at once.** Trigger: someone
  starting more than a handful.
- **A day-of-year date in the format.** Trigger: the first
  organization whose lot codes use one.
- **A late cost carried across a move between lots,** beyond listing
  the moved stock as waiting. Trigger: Open decisions' cost correction
  carried through production, which is the same question.
- **Which lot a shipment takes among lots with no date.** Trigger:
  #333's picking half.
- **A past expiry at receipt asking for a reason (#442).** Trigger:
  expired lots' batch; the three choices leave room for it.

## Consequences

- **Migrations:** `lots.supplier_lot`, `lots.expiry` and `lots.note`;
  a `lot` series for every organization; `stock_movements`' second lot
  and its reason check; the supplier's lot's index. After each, `npm
  run migrate:all`, then each volume database.
- **Amended with this:** ADR-023 (tracking may start later; a code may
  be made), ADR-044 (the trace follows a lot change; one rule for the
  lot search), ADR-048 (the cost on a lot change; no average while
  stock waits), ADR-056 (the supplier's lot searched), ADR-073 (the lot
  series), ADR-074 and Open decisions (a received lot's code may be
  made), ADR-093 (Count it in's new lot; 120a's split by a move between
  lots).
- **The rules files** for stock and products, the manual checks (MC-203
  rewritten), Help's three languages and the glossary change in the
  commits that change what they describe.
- **The order:** the ADR and the handoff → the dependencies → the
  figures before → the inventory → the canvas row → the schema → the
  lot series → a new lot at receipt → Edit lot details and the mark →
  expiry not known → #650's rule → Start tracking lots → Move to
  another lot → what comes back from before → the trace → the searches
  → the seeds → the screens → the browser tests → Help, the rules files
  and the docs → the figures after → the dependencies again → the
  reviews → the as-built.

## Amendment (November 2026) — as built (#676)

The branch, `adr-094-lots-at-receipt`, built from 21 to 23 November
2026 from `main` at 9002a93d, by its brief, versions 1 to 11, in the
ignored `tmp/adr-094-lots-at-receipt/`: 83 commits, then this
as-built, pull request #676. Where building settled or changed the
decisions above:

### The requirements, each marked

| R | Now |
| --- | --- |
| R1 | Met (0db21bc9, 05f579ed, 84cf7859): the `lot` series for every organization and at registration; one registered while a deploy runs gets the default at its first code or save. Lot codes is Numbering's sixth row, saved with the others in one Activity log entry |
| R2 | Changed (05f579ed, 84cf7859, 36154128): a format that could print more than 20 characters is refused when saved, on the server and in the client's copy; a made code may still pass 20 once its counter outgrows its digits, as a document's number does (1a). The row says the room left, "Room for 9,999,999 codes a day within 20 characters", amber under 10,000 for a series that starts again each year or never (D1, S5) |
| R3 | Met (5171efa3, cc2bba29, 914d86c7): the three routes and dialogs; a clash takes the next number and never merges. Copy code is offered for a made code alone, Open the lot for any |
| R4 | Met (5171efa3): the route reads `mustBeNew`, never the reason. `lot.isAssigned` left the request, with two accepted lines, since no screen ever sent it; a typed code with a supplier's lot is refused |
| R5 | Met (5171efa3, f26b6bac, cc2bba29, fc7abf31, 914d86c7) |
| R6 | Met (038ffd63, 36154128): one matcher for every lot search, an exact match first, then the start of either code; Trace a lot's results name the supplier's lot (S10). At large the lookup with a lot's whole code reads 246 ms. #618's clipped list is still open |
| R7 | Met (0db21bc9, f26b6bac, fc7abf31, 0cb81ddf): its own audit action, "Lot's code marked as made up here"; the role editor warns that the mark lets a code drift from the boxes |
| R8 | Changed (cec738df, 5171efa3, f26b6bac, cc2bba29, 43014944): Expires starts as the item's newest lot had it, on none for a first lot and on Not known yet for a made code and in Start tracking (S6). Every expiry field warns of a day already past or more than 10 years away, and refuses neither (review 10) |
| R9 | Met (4bd8aafa, fc7abf31, 6f2b1cbc): one wording, "Expiry to add", on every screen (D2); Ship warns in amber and still ships; the packing slip prints as before |
| R10 | Met (cc2bba29) |
| R11 | Changed (5171efa3, cc2bba29, 6f2b1cbc, 36154128): why is required on screen. The sender is the From end of Movements' From → to and of its export, For naming the document alone (D3, amending ADR-093's 82a); a reader with no places reads it after the reason (S7), and the export stays without it there (T5) |
| R12 | Met (cc2bba29, 0681f159): Receive stock opens empty again once the count is saved (review 68) |
| R13 | Changed (09d633b8, fc7abf31, 396a30c3, 0b119ccc, ac111249): four doors, not one: the item's Variants table, the code row's Actions on Stock (T2), a line under By place and lot (T3), and a line in Receive stock and an order's Receive for an item not tracked (review 3). Stock at a retired place goes into the lot too (review 74) |
| R14 | Met (fc7abf31, 0b4045eb, f6d3e647, 28d6b949, d98f1144): the question also lists the runs that will close against the lot, says what happens to the cost, and points to Move to another lot for splitting later |
| R15 | Met (09d633b8): every movement reads the code's row for share, so a receipt racing the start ends in the lot; a cost given and a run's close take the same lock first |
| R16 | Changed (09d633b8, fc7abf31, 1ec58737, 82d6f4fc): the row reads as its action, "Lot tracking started", its place written once, "put 3,000 each into a lot, counted in neither"; the Reason filter keeps one option, "Lot changes" (U1) |
| R17 | Met (09d633b8): four reads matched by the movement's lot and now read the value row's own |
| R18 | Met (09d633b8, 5b2c39dd) |
| R19 | Changed (6a0cb7e1): "a released run's unused stock" matched no code path. What comes back from before is a return, an authorized return's receipt or a void, each two movements in one save: as it left, then a lot change into the start lot (Q3a), which is made then where the code started with nothing; and a run released before tracking closes against the start lot (Q2a) |
| R20 | Changed (62e7c8c9, 1b34628d, 98e7455d, 991a4f61): a late cost follows the moved stock (D5, below); a move out of a lot issued to a run still open is refused, the run named (review 73); a new typed code must be new and takes no supplier's lot |
| R21 | Met (ba6da9eb, 6f2b1cbc, 36154128): the recall list's Through lot; the lot's page lists Moved on to, with what each lot still holds (S9) |
| R22 | Met (25126c96) |
| R23 | Met (6c9bcb42, 5b2c39dd; the canvas's rows v16 to v18): the volume seed gives a supplier's lot to 1 lot in 43, since only a made code carries one (R5), and leaves 1 lot in 50 waiting for a cost |
| R24 | Met as chosen: #647, #617, #620 and #650 closed; #618, #160, #282, #649, #627, #306 and #308 in part, each named in the pull request with what is left |
| R25 | Met (the first commit) |

### Decided while building

The chat's answers, each by its label, drawn on the canvas's rows v16
to v18:

- **The inventory's four (Q1a to Q4a, step 4):** a move's value is two
  rows of their own kind; a run released before tracking closes
  against the start lot; stock back from before is recorded as it
  left, then moved into the lot; that lot is the start lot itself, its
  note a key, `tracking_started`.
- **A third detail, `from_before`,** beside `lots_started` and
  `between_lots`: stock back from before tracking, into the start lot.
  It takes no cost by hand; a cost given later to its delivery follows
  it in.
- **A temporary trigger (Q5a):** `lots_expiry_from_date`, before each
  insert or update of a lot, sets the expiry's kind from its date, so
  the release still serving during the deploy writes rows the new
  check accepts. The next branch's first migration drops it and its
  function.
- **The API revision rises from 5 to 6 (Q6):** an open tab on Stock
  value read a lot change's waiting row as "Received with no price".
  So the assumption above, no revision raise, did not hold, and the
  accepted line for the new reason was never needed. Every tab open at
  the deploy reloads once.
- **A screen says only neutral words for a kind it does not know
  (D4):** "Other change", never a guess. The rule is in
  `docs/conventions.md`.
- **A late cost follows stock moved to another lot (D5, b),**
  replacing the variance above and the Deferred line "A late cost
  carried across a move between lots": for each lot change out of the
  pool after the costed receipt arrived, in order, the receipt's units
  among those moved are the moved quantity times the receipt's units
  still in the pool over what the pool then held; they carry their
  share to the row in, through further lots; what is left splits as
  ADR-048 has it. The row in takes no cost by hand, and stops waiting
  once nothing that waited in the first lot before the move still
  waits, worked out when read. A lot holding 60 at 2.00 and 40 with no
  price, 50 moved, then costed at 2.00: 40.00 follows, each lot holds
  100.00 for 50, Stock value 200.00, where it read 240.00.
- **Stock moved away and back is counted once (review 76),** as the
  part that came back; every test of a cost that follows stock checks
  that no lot holds more than its units at the cost given.
- **Stock's open rows come from the address alone (S1):** a receipt
  into a code already listed left its row closed. Two quick clicks
  could then reopen the first place's lots, found by the full verify
  and fixed (2618b1ec).
- **Receiving an item not tracked says so (review 3):** "{sku} doesn't
  track lots, so no lot is asked.", with Start tracking lots… opening
  over the dialog, which keeps what was typed.
- **A lot's former code,** shown and searched after a correction, is
  not built here (T4, #665).

### Built differently, in small

- A Save in Edit lot details that changes nothing writes no "Lot
  updated".
- A lot's own page offers Edit lot details… (review 1).
- A made code is 批次编码 in Chinese, never 批号; French keeps "suivi
  par lot" and "en stock" (T6).
- Details to add's Back follows #341: a filter replaces the address.
- A move's Activity log entry names both lots; its details are listed
  in the order kept, To lot after the lot it left.
- The line under By place and lot is a button drawn as a link, named
  as the Variants table's button is.
- The browser test of a move starts from the Lot view, since a lot's
  Actions on Stock need its place's row open.

### The interaction table, added rows

| Where | You do | What happens | You land | Back |
| --- | --- | --- | --- | --- |
| Stock, a code row's Actions | Start tracking lots… | The question, as from the item's page | the dialog | Escape or Cancel: focus on Actions |
| The item's page, under By place and lot | Start tracking lots… | The question | the dialog | Escape or Cancel: focus on the line's button |
| Receive stock or an order's Receive, an item not tracked | Start tracking lots… | The question over the dialog; afterwards the dialog shows the lot fields, what was typed kept | the receiving dialog | Escape or Cancel: focus on the line's button |
| A lot's page | Edit lot details… | The dialog, as from a lot's Actions | the dialog | Escape: focus on the button |

### Found, and left

- **A late cost counts stock twice after it moved to another lot,
  back, and on again (#678):** the first step of the next branch.
- **A mixed lot valued above its cost by ADR-048's own rule (#677):**
  older than this branch; it needs a decision.
- **A return that waits for a cost cannot be given one (#661).**
- **Four reads past 300 ms at large (#664),** in ADR-051's amendment;
  review 73's read on every pile and review 54's condition were not
  timed at large.
- **What the reviews left (#669),** each by its number, among them the
  API's `recipientPartnerId` holding a receipt's sender (56) and one
  start lot a code held by a unique index (78).
- **Two Linux WebKit tests on the Mac (#643),** the dev server's crash
  on GitHub's every-browser run (#530) and one flaky keyboard test
  (#679): none from this branch.

### Deferred, added

- **A made code stopped at 20 characters.** Trigger: lot labels
  (#441), when a barcode must carry it.
- **A line on the recall list that reconciles what was made, shipped
  and is left.** Trigger: the first mock recall.
- **The partner named on an order's receipt and shipment at
  Movements' outside ends.** Trigger: someone asking who, without
  opening the order.
- **The receiving dialogs' line for an item not tracked, hidden for an
  organization with no lot at all.** Trigger: such an organization
  finding it noise.
- **The 10 years of the expiry warning as a setting.** Trigger: a
  product that keeps longer.

### Checked

At 2618b1ec, the full verify: 1,532 server e2e tests, 1,705 client
unit tests, 767 in Chromium and 171 in Firefox, and 169 of 171 in
Linux WebKit, the two misses #643's. Step 26b (82d6f4fc) ran its own
tests and `--quick`, and #676's own checks run the rest. The panel walked
`receive`, `stock` and `trace` with seven people at the five widths;
the reviews numbered 100 findings, 53 fixed here in 52 commits, the
rest closed or filed. The steps ran about 1,410 minutes in all, the
53 fixes 437 of them.

## Amendment (November 2026) — the branch after: a late cost follows each unit once, Stock value by the page, a lot's former code (#678, #664, #665)

The as-built above left five things for the next branch: #678, the
temporary trigger's drop, #664, #665 and #669's 78. The branch is
`fix-678-after-094`, from `main` at 20619bb2, planned in the chat on 24
November 2026 as one pull request, its costs half built first with a
stop before the lots half (S1b). Its boards are the canvas's rows
"第十九版 · v19" (five boards), "第二十版 · v20", "第二十一版 · v21" and
"第二十二版 · v22" (three boards).

### Requirements, as confirmed

The maintainer confirmed these on 24 November 2026, before drafting,
with the assumptions and what is not included, and answered 1a to 8a;
then E1a to E6a, after the choices were checked against production
practice; then S1b, H1a and M1a; then, the same day, the readings the
inventory (step 3) left, under "Settled after the inventory" below. A
step is the brief's.

| R | What | Done when | Step |
| --- | --- | --- | --- |
| R1 | #678: a late cost follows the costed receipt's units through each lot in time order, each unit carried once; for a cost set, a cost corrected and a batch's cost at its run's close | The issue's case fails first: 10 with no price, 6 shipped, 4 moved A → B → A → C, costed at 10.00; then C holds 40.00 for 4, 60.00 is issued, 100.00 in all. A shipment voided before its cost came leaves nothing issued: 10 with no price, 6 shipped and voided, costed at 10.00, 100.00 held. ADR-048's two examples and review 76's case keep their figures | 6 |
| R2 | Every test of a cost that follows stock checks three things: no lot holds more than its units at the cost given; held and issued add up to the cost given; each pool's value is the sum of its ledger rows, `issued` aside. One test over generated orders of receiving, shipping, moving and returning, written with fast-check (E5a) | One helper holds the three checks; the generated test runs on a fixed seed in verify and CI, and with a new seed in the weekly flake hunt, which reports its seed | 7 |
| R3 | The branch's first migration drops the trigger `lots_expiry_from_date` and its function | A list of every released write to `lots`, each naming the expiry's kind and its day; a server test where a day with the kind `none` is refused; the migrations' linter passes; the schema's comment and the lots rules say so | 3, 5 |
| R4 | #664: the waiting set is worked out more cheaply, by query alone; "waiting" means the same on Stock, Stock value and Home | The tests of what waits pass unchanged; the plan check holds at both sizes | 9 |
| R5 | The four reads timed again at large on the Mac, the median of three rounds, on ADR-094's seed | Stock's counts (371), the Lot view's counts (368), Home (384) and Home for a newcomer (303) each under 300 ms; every budget at small. One still over 300 stops the step: the next remedy is an ADR of its own | 4, 12 |
| R6 | Stock value's pools read by the page, with a find box and a sort by Value, the total worked out by the server (3a, E4a) | A server test of the pages, the find, the sort and the total; the export still whole; a browser test; the first page, a find and the sort timed at large, the sort dropped if it misses its budget | 10, 11, 12 |
| R7 | Timed at large beside them: review 73's read, review 54's condition, a cost given with five moves (review 60), the trace's moved step (review 65); #626 and #630 judged in the same pass | Their figures in ADR-051's amendment, each inside its budget or on the Watch with a trigger; a comment on #626 and on #630 | 4, 12, 23 |
| R8 | #665: a lot's former codes are kept when Edit lot details corrects its code, with when, by whom and why; the reason is asked only when the code changes (E2a) | A migration, the table in the organization's export; a server test corrects a code twice and reads two former codes; a save with a changed code and no reason is refused at its field | 14, 15 |
| R9 | The former code is shown: beside the lot's title with every one listed under Former codes; under the code on Stock by lot and the Lot view; on a search hit; on Movements, for a row from before the correction (M1a); on the recall list and in its export, "shipped as", for what left before it, a row split by the code its stock left under (4a, E3a); on Stock value's rows | A browser test for each place; three languages; the canvas's rows v19, v21 and v22 | 16, 17, 21 |
| R10 | Every lot search finds a lot by a former code: Stock, the Lot view, the top bar, Movements' find box, Trace a lot, and Stock value's find box | A server test for each search, the current code first; an index led by the organization; the plan check; each inside its budget at large; the volume seed holds former codes | 16, 20, 23 |
| R11 | A former code typed again for the same item is never given to another lot (5a), a run's Record output included | A server test for each route that makes or renames a lot; a component test of the field and its Use button; a made code passes over a former code, and Numbering's taken-number check reads former codes | 15, 17 |
| R12 | #669's 78: one start lot a code, held by a partial unique index | The migration stops, naming any code with two; a server test where two writes at once end with one start lot | 14 |
| R13 | Dependencies at the start and before the reviews; the server's typescript-eslint 8.73.0, then both minimatch overrides and ADR-019's line removed (6a) | `npm outdated` in both folders, the 7-day rule package by package; an install without the overrides, then `npm ls minimatch` showing 11.0.5 or later everywhere | 2, 25 |
| R14 | Seeds, Help in three languages, the rules files, the manual checks and the glossary, with what they describe | `seed:demo` holds a lot with a former code and a return that took the lot's average; each rule in the commit that changes it | 20, 22 |
| R15 | The handoff tidied; the session's lessons written into `docs/conventions.md`, `docs/engineering.md` and the planning skill, as one docs commit | The handoff's patch in the first commit; the skill packed and uploaded after the merge | 1, 24 |
| R16 | #661: a return with no shipped cost lands at its pool's unit cost when the pool has one, and otherwise waits and can be given a cost on its own row (1a, E1a) | The issue's two ways in, each a failing test first; the row says where its value came from; `takesCost` is the server's (#669's 58) | 8 |
| R17 | #677: what a lot keeps of a late cost is its share, in proportion (2a) | The corrected example, to the cent: 60 at 2.00 and 40 with no price, 90 shipped, the 40 costed at 2.00; the 10 left hold 20.00 | 6 |
| R18 | The reviews, then the as-built | Each requirement marked met, changed or deferred | 26, 27 |
| R19 | The riders (7a, 8a): #654 with #618's rest; #627's rest with #669's 87, the organization named in every join of the costs reads, eight in all; #544's, #473's and #296's lines for Stock value | Each closed by its commit, or commented with what is left | 9, 11, 18 |
| R20 | The Activity log's "Lot updated" keeps each field the save changed, before and after (#687, H1a) | #687's pull request, by the fix runner before this branch's code, or this branch's step if it stops; a server test reads both codes from the entry | 19 |
| R21 | What is assumed of live data is checked, read only (E6a) | One SQL file in a read-only transaction, run by hand before the merge: no cost given after a round trip between lots, no code with two start lots, how many "Lot updated" entries there are, and how many late costs were given, by kind | 3, 7, 28 |
| R22 | A stop between the two halves (S1b) | After step 12: the full verify, the figures, and the maintainer's own look at Stock value on the dev app, before step 14 starts | 13 |

- **Assumptions:**
  - No new ADR: this amendment holds the plan, with dated amendments
    in ADR-044, ADR-048 and ADR-056, and ADR-051's with the as-built's
    figures.
  - No stored value is repaired: the live organization holds no real
    costs yet (R21 checks it).
  - No former code is filled in from the past: correcting a code
    became possible on 24 November 2026, and the Activity log kept no
    old code (below).
  - A former code is an added field in each answer that names a lot;
    the API revision rises for Stock value's pages alone.
  - #669's other items ride only where a step already changes their
    file, each named in the brief.
- **Not included:** the fix runner's picks; expired lots (#333, #331,
  #442, #670); #671, #674 and #652, with the next branch that changes
  orders; #667 and #668; the counts kept ready (ADR-051's next remedy);
  a cost carried through production (Open decisions); lot labels
  (#441); a former code on a printed document or as an export's column.

### Checked before drafting

On 24 November 2026, from `scripts/adr-check.mjs 094` on
`fix-678-after-094` at b472ae89: the areas `costs`, `stock`, `search`,
`home`, `orders`, `return-authorizations`, `database`, `api`, `i18n`,
`ui`, `help` and `ops`, and the issues 678, 664, 665, 669, 661, 677,
652 and 654; 163 open issues, 100 whole in the file. Of those, 33 were
read whole, every one named and every one on costs, lots, Stock value,
the lookup and paging; the other 67 were searched for this branch's
words and files, each matching line read. With them, ADR-094's own
review, all 100 findings; the Deferred lines of ADR-044, ADR-048,
ADR-056 and ADR-094; ADR-051's Watch; and Open decisions.

- **Fired, and taken here:**
  - #678, #664 with its four comments, #665 and #669's 78; the
    trigger's drop, as the as-built above says.
  - ADR-051's Watch, three lines: Inventory's by-code counts, fired on
    22 November; Valuation, whose trigger, a valuation that no longer
    fits a screen, is met at large with about 14,500 pools; and Lot
    search, which former codes join.
  - #661 and #677, by the maintainer's choice (1a, 2a): both are in
    the walk R1 rewrites.
  - #654, whose trigger named ADR-094's branch and was missed there:
    R10 changes the top bar's search again.
  - The riders of R19, each because this branch changes its file.
- **Not fired, and left:**
  - #652, an orders rules file: this branch changes no rule of orders.
  - #669's 4, 5, 8, 11 to 15, 56, 59, 61, 62, 85, 88 and 100: each
    waits for its own screen or words. Its 57, a reference type of its
    own for a part carried, relabels the value ledger's rows, and is
    its own decision.
  - #648, #604 and #328: R6 comes near each file and changes none of
    their lines.
  - #646, #640, #611, #609, #631's other lines, #649, #641, #509,
    #504, #299, #154, #261, #308's rest, #226, #314, #160 and #479: no
    file of theirs changes here.
  - ADR-048's Deferred, and Open decisions' cost correction carried
    through production, period close, barcodes and generated run
    codes: no trigger met.
- **Found while checking:**
  - #677's example is wrong as filed: 40 shipped leaves 60, and its
    32.00 needs 90 shipped. R17 holds the corrected figures.
  - ADR-051's Watch says a valuation too large for a screen gets "an
    export"; #664's comment says pages. The export exists and stays;
    the screen is paged (3a).
  - #661 has a second way in: a "Returned" receipt on Stock with no
    order (ADR-094's review 75).
  - **The Activity log keeps neither the old code nor the new one**
    when a lot's code is corrected: the route names no fields and the
    save hands over nothing of what was there. #665's text, and the
    chat on 23 November, said it kept both. Filed as #687.
  - Row v19 drew "was" on Stock, the Lot view and the lot's page, and
    not on Movements, where the Activity log and the row then named
    one lot by two codes (M1a, row v21).

### A late cost follows each unit once, in proportion

One rule replaces two readings (R1, R17; ADR-048 amended).

- **The walk is in time order.** A late value, a cost set, a cost
  corrected or a batch's cost at its run's close, follows its
  acquisition's units through the pool's history, row by row. Each row
  out of the pool after the units arrived takes them in proportion:
  the row's quantity times the acquisition's units still in the pool,
  over what the pool then held.
- **What a row takes goes where the stock went.** An issue, a
  shipment, a consumption, a sample or an outbound adjustment, puts
  its share to `issued`. A lot change carries its share to its row in,
  where the same walk goes on. Stock that comes back by a later lot
  change is a later row in, and carries only what its own units carry,
  so a unit is never counted twice (#678).
- **What is still in a pool holds the rest,** which is its share and
  never more (#677). ADR-048 read "still in the pool" as every unit
  the pool holds, up to the quantity costed; that left a mixed lot
  dearer than it was bought at.
- **A return brings back what its shipment took.** A return, or a
  voided shipment's stock coming back, comes back at the cost it
  shipped at. In the walk, when the shipment it reverses took units of
  the acquisition, the row in takes back its part of them: the units
  the shipment took, times the quantity coming back over the quantity
  shipped. Those units count as in the pool again from that row on, so
  their share is held, or goes wherever they go next, and is not
  `issued`. A void's shipment is the one it names; an order's return
  reads its order's shipments from the lot, as its shipped cost does.
  A return whose shipment took none of the acquisition's units, and a
  "Returned" receipt with no order, bring nothing back: a new arrival
  at its own cost.
- **Rounding** to six places, the remainder going to the last part, so
  the parts add up to the value given.
- **Five examples, to the cent.** 10 with no price, 6 shipped, 4
  moved A → B → A → C, costed at 10.00: 60.00 issued, C holds 40.00.
  A lot holding 60 at 2.00 and 40 with no price, 90 shipped at 1.20,
  the 40 costed at 2.00: 8.00 held and 72.00 issued, the 10 left
  holding 20.00, where they held 32.00. 10 with no price, 6 shipped,
  that shipment voided, costed at 10.00: 100.00 held, nothing issued;
  with 3 of the 6 returned instead, 70.00 held and 30.00 issued. The
  mixed lot again, 9 of its 90 returned at 1.20 before the cost comes:
  the return takes back 7.20 of the 72.00, so 64.80 is issued and the
  19 on hand hold 38.00, 2.00 each. And ADR-048's two examples of a
  late cost that follows stock keep their figures.

### A return with no shipped cost

- A return comes back at the cost it shipped at, as before. Two cases
  have none: a shipment from before costs were kept, and a "Returned"
  receipt recorded on Stock with no order (#661).
- **Such a return lands at its pool's unit cost when the pool has
  one,** stock on hand with nothing waiting, and its row says so. Set
  cost may correct it.
- **Otherwise it waits, and can be given a cost on its own row,** as a
  receipt with no price is. Before, Set cost refused it, so it waited
  for ever and its pool gave no average (R16).
- Which rows take a cost is the server's to say, `takesCost` on each
  row, so the client keeps no copy of the rule (#669's 58).

### The waiting set, and Stock value by the page

- **The waiting set by query alone (R4):** plain waiting rows are read
  directly, and the walk that finds when a moved row stops waiting
  starts only from rows that came by a lot change. No flag is stored:
  a kept figure can drift, and ADR-051 keeps that remedy for an ADR of
  its own. Every join in the costs reads names the organization, the
  five in a lot's and a run's cost with the waiting list's three
  (ADR-003).
- **`GET /v1/costs/valuation` answers a page (R6):** 50 pools, at most
  100 a request, by a cursor, with a find by an item's name or code or
  a lot's code, a former code too, and a sort by item or by value.
  `total`, `currency` and `provisional` speak for every pool, whatever
  page or find is read. Each pool names its item in the reader's
  language (#296).
- **The API revision rises from 6 to 7:** a tab opened before would
  take the first page for the whole list. Every tab open at the deploy
  reloads once.
- **The export is unchanged,** every row and the same columns: it is
  the way to read everything at once.
- **The screen:** the find box, the Value header, Show 50 more with
  its failed page (#544), and Back to the row left (#473).

### A lot's former codes

- **Kept in a table of their own, `lot_former_codes` (R8):** the lot,
  the code it had, until when, who changed it and why. Written in the
  save that corrects the code, in Edit lot details, the one place a
  code changes. Only a code made here can be corrected, as before.
- **The reason is asked when the code changes, and only then (E2a).**
  It is kept with the former code and shown on the lot's page; it is
  free text, so it stays out of the Activity log's payload (ADR-018).
- **Shown where the lot is named (R9):** the latest beside the lot's
  title, "was {code}", and every one under Former codes; one grey line
  under the code on Stock by lot and the Lot view, and on Stock
  value's rows; on a search hit found by it. A lot never corrected
  shows nothing. The item's own page, By place and lot, is not one of
  these places.
- **On Movements, a row from before the correction says the code the
  lot had then (M1a),** as a changed item code reads there. The
  Activity log's older entries keep the code as it was; this is what
  lets the two be read together.
- **In a recall, what left before the correction says "shipped as
  {code}" (E3a),** on the page and in the export, since those boxes
  carry the old code. No column is added: the words stand in the
  Through lot cell on the page, and after today's code in the export's
  Lot cell. A recipient's row is split by the code its stock left
  under, so each row names one code.
- **Searched by the one matcher (R10),** `lot-search.ts`: a former
  code matched as typed is an exact match, after the current code;
  any part of it matches, as with a lot's own code, and close matches
  stay on today's code. Its index is led by the organization, as the
  two lot indexes are.

### An old code is never given to another lot

Within one item (R11; a code is unique within an item, ADR-023):

- Typed for a new lot, in Receive stock, an order's Receive, Count it
  in… or Move to another lot, a former code is refused at its field,
  naming the lot that had it, with Use {code}, which takes that lot
  and keeps what else was typed. The refusal carries an error code,
  since its screen offers a way out.
- Typed for another lot in Edit lot details, or for a run's output in
  Record output, it is refused with no button. A lot may take its own
  former code back.
- The lot field knows every former code of the item's lots, the codes
  alone, so it refuses while the code is typed; the server's refusal
  is what holds.
- A made code passes over a former code, as over a code in use, and
  Numbering's taken-number check reads former codes too.

Left alone, a box still labelled with the old code would start a
second lot under it, and a recall would miss half the run.

### The Activity log keeps what changed

"Lot updated" records who, when and which lot, and no values (#687).
It is to keep each field the save changed, before and after: the code,
the supplier's lot, the expiry's kind and its day, each a catalogue
value ADR-018 allows; and to name the lot's item. The fix runner
builds it before this branch's code (H1a), so that no code corrected
on the live application meanwhile loses its old code; this branch
builds on it, and builds it at step 19 if the runner stops (R20).

The log and the former codes are both needed. The log is the evidence
nobody can edit, kept two years; the former codes are read every day,
searched, and kept as long as the lot, since a recall may come later
than two years.

### The top bar's close matches

The top bar shows what matches as typed, alone, when anything does;
its close matches only when nothing does, under "Close matches", each
row no longer marked on its own: the rule Movements' find box has
since ADR-093 (#654, ADR-056 amended). A list cut at the box's edge
says how many more are below (#618).

### How it behaves

The wireflow and the states are the canvas's rows v19 to v22: a lot's
former code; why a code changes, and an old code typed again; Stock
value by the page; the top bar's close matches; the three cost rules
with their figures; the Activity log's entry; "was" on Movements; and,
on v22, a return that brings back its share, the recall's rows split
by code, and Record output's refusal.
The states are the design language's, drawn only where they differ: a
refusal at its field with its one button; a find that matches nothing;
a next page that failed. Each row below is a browser test (step 21).

| Where | You do | What happens | You land | Back |
| --- | --- | --- | --- | --- |
| Edit lot details, Lot number | Change the code | "Why is the code changing?" shows, and is required | the dialog | Put the code back: the question goes |
| Edit lot details | Save, the code changed | One write; the message names both codes, with Open the lot | where the dialog was opened, the lot reading "was {code}" | — |
| Receive stock, an order's Receive, Count it in…, Move to another lot; Lot number | Type another lot's former code | Refused at the field, naming that lot, with Use {code} | the dialog | Use {code}: the field takes it, its lot's line shows, what else was typed kept |
| Stock, the Lot view, the top bar, Movements' find box, Trace a lot | Type a former code | The lot, saying "was {code}" | the list, or the lot | As each list has it |
| Stock value, Find an item or a lot | Type | The pools that match and how many; the total as it was | Stock value, the find in the address | Clear the search |
| Stock value, the Value header | Press | Largest first; again, smallest first | Stock value, the sort in the address | Back: the order before |
| Stock value | Show 50 more | The next page, focus on its first new row; a failed page says so, with Try again | Stock value | Back from a lot: the row left |
| The top bar | Type a whole code that matches | Only what matches | the list | — |
| The top bar | Type text nothing matches as typed | The close matches, under their heading | the list | — |
| Stock value, a return that waits with no shipped cost | Set cost | Saved, "Cost set." | Stock value | — |
| A run's Record output, Lot number | Type another lot's former code, Record | Refused at the field, naming that lot, with no button | the dialog | Type another code |

### Held to production practice

- **A late cost's share.** SAP's moving average keeps a late price
  difference in stock for the units still on hand and posts the rest
  as a difference, which is ADR-048's first reading; its own help
  names the stock priced too high that follows. Business Central
  forwards a changed cost to what left. In proportion is the second
  kind, and it is exact wherever a pool was bought at one cost. No
  single standard exists.
- **A return with no cost to come back at** takes the current cost in
  Odoo; asking a person every time is stricter than practice.
- **A return tied to its sale.** Business Central's exact cost
  reversing values a return at its original sale's cost, and a cost
  added to that sale later changes the return too. A return that
  brings back its share is the same rule for a cost that comes after
  the return; one that comes before it is Deferred below.
- **A change that keeps what was there, and why.** US 21 CFR 11.10(e)
  asks that a change never obscure what was recorded; EU GMP's Annex
  11 asks for the reason. The application claims neither rule; they
  are the practice it copies for a lot's code.
- **Tests over generated cases** are the usual remedy where two bugs
  in a row came from examples chosen by hand: review 76's, then #678.

### Considered and not done

- **ADR-048's reading kept, as SAP has it (2b):** the total is right,
  and stock can read dearer than it cost.
- **A return as a new arrival whatever it shipped at,** this
  amendment's first wording: a shipment voided before its cost came
  would leave its share issued for a sale that never happened, and
  the stock back on hand at nothing. ADR-048's reading had that case
  right, by counting every unit the pool holds.
- **A recall row left whole, saying "shipped as" when any part left
  before,** and **Use {code} in Record output:** the first names a
  code some of the boxes do not carry; the second needs the shared
  lot field there first.
- **Two pull requests (S1a):** the textbook answer for a change to a
  cost rule. One branch with a stop gives most of it while the
  application holds no real costs, without a second merge.
- **The pages added with no revision raise (3b):** an unbounded read
  would stay on the API, and an old tab would show a wrong total.
- **Whether a pool waits, kept as a flag:** a stored figure can drift
  from its rows.
- **Such a return always waiting for a cost typed by hand (1a
  alone),** and an empty lot taking its last unit cost: the first is
  stricter than practice, the second a rule for a rare case.
- **A former code filled in from the Activity log:** it kept none.
- **An old code allowed again with a warning (5b):** one run would
  split across two lots.
- **An orders rules file here (7b):** no rule of orders changes.

### Deferred, added by the branch after

- **"Shipped as" on a printed document.** Trigger: the first reprint
  whose code does not match the boxes.
- **A former code as an export's column.** Trigger: someone asking for
  it in a spreadsheet.
- **The counts kept ready,** an ADR of its own. Trigger: ADR-051's,
  past 300 ms at large in two runs, once more.
- **A reason for a changed code chosen from a list.** Trigger: the
  first organization whose quality person reviews them.
- **A reference type of its own for a part carried (#669's 57).**
  Trigger: the next reader that has to join to tell the two apart.
- **A return after the late cost.** It comes back at what its
  shipment's own rows say, without the share a late cost has since
  put to `issued` for it, as on `main` before this branch; an issue of
  its own, filed on 24 November 2026. Trigger: the first organization
  with real costs, or that issue's turn.
- **Use {code} in Record output.** Trigger: its lot field moving to
  the shared one.

### Settled after the inventory

Step 3's inventory left eleven readings, F1 to F11, in the branch's
working folder. The maintainer answered the eight that were choices on
24 November 2026, before step 4 ran, each the first option; the text
above is changed in place, since nothing of it was built.

- **A return or a void of stock that shipped before its cost came
  (F9):** it brings back its share. The first wording, a new arrival
  at its own cost, was the chat's mistake.
- **The organization in every join of the costs reads (F11):** eight,
  not `needsCost`'s three alone.
- **A recall row split by the code its stock left under (F1).**
- **The lot field knows every former code (F2),** so the refusal shows
  while typing, as row v19 draws it.
- **"was {code}" on Stock value's rows (F4),** as row v19 draws it.
- **A fourth count in the read-only check (F10):** late costs given,
  by kind, since the three counts do not see #677's case.
- **Numbering's taken-number check reads former codes (F6).**
- **A run's Record output refuses a former code (F7),** with no
  button.
- **Read as the inventory read them, with no choice:** the lookup's
  new field is an empty column for every other kind (F3); the item's
  page gains nothing (F5); how a former code matches (F8).

### Consequences of the branch after

- **Migrations:** 0085 drops the trigger and its function; then the
  former codes' table with its index, and the start lot's partial
  unique index. After each, `npm run migrate:all`, then each volume
  database.
- **The API revision at 7:** the merge goes in at an hour when few
  tabs are open, as #676's did.
- **Amended with this:** ADR-048 (a late cost's share, and a return
  with no shipped cost), ADR-044 (a former code in the lot search, and
  a recall's "shipped as"), ADR-056 (the top bar's close matches, and
  a former code searched); ADR-051 with the as-built, its figures and
  its Watch's Valuation line.
- **The order:** this amendment and the handoff → the dependencies →
  the inventory, with the read-only check → the figures before → the
  trigger's drop → the walk → its generated test → a return with no
  shipped cost → the waiting set → Stock value's pages, server then
  screen → the figures after → the stop → the former codes' table and
  the start lot's index → the writes and refusals → the searches,
  Movements and the recall → the screens → the top bar → the Activity
  log → the seeds → the browser tests → Help, the rules files and the
  docs → the figures after → the lessons → the dependencies again →
  the reviews → the as-built.
