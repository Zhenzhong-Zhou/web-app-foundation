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
