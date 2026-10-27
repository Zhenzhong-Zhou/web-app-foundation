---
status: accepted
date: 2026-10-17
amends: [ADR-046, ADR-047, ADR-056, ADR-071]
---

# ADR-073 — Each organization's document numbering (amends ADR-046, ADR-047, ADR-056 and ADR-071)

**Context.** Every number the app gives is fixed in code: `INV-`, `CN-`,
`RMA-`, `SO-` and `PO-` in `document-numbers.ts`, six digits, one counter
per organization and series that never restarts (ADR-046, ADR-047,
ADR-071 amended). That suits a new business in Canada and few others. A
business moving from another system must carry on from its last number.
Many keep a year in the number and start again each January; Chinese
businesses often number orders by the day (`XS20261017-001`), and Odoo
writes `INV/2026/00452`. France and Italy take at most 20 characters,
France refuses a period, and France requires invoices in a continuous,
chronological sequence. ADR-071 deferred numbering settings to this ADR,
after ADR-072 gave each organization its day: which year or day a number
belongs to is a calendar question.

**Decision — five series, today's numbers as their defaults.**

| Series | Default | Its date |
| --- | --- | --- |
| Invoice | `INV-` | its invoice date |
| Credit note | `CN-` | its credit date, a void's included |
| Return authorization | `RMA-` | the day it is raised |
| Sale order | `SO-` | the day it is created, a duplicate or an RMA's replacement included |
| Purchase order | `PO-` | the day it is created |

Each has a prefix, a minimum width and a reset. The defaults are six
digits and no reset, so nothing changes until an Owner changes it.

**Decision — the prefix.**

- Capital letters, digits, `-`, `_` and `/`. It starts with a letter or a
  digit, ends with anything but a digit, and has no `//`; or it is empty.
  Ending in a non-digit means a number splits one way only: `INV-000050`
  is `INV-` and 50, which the refusals below rely on.
- Lowercase is refused, not changed: `INV-1` and `inv-1` must never be
  two numbers, and what is saved is exactly what was sent (#133). The
  field writes capitals as they are typed.
- Date tokens `{YYYY}`, `{YY}`, `{MM}` and `{DD}`, each at most once, and
  never `{YYYY}` with `{YY}`. A token prints digits, so a prefix may start
  with one and may not end with one: `INV-{YYYY}-` prints `INV-2026-`,
  `SO{YYYY}{MM}{DD}-` prints `SO20261017-`.
- Printed, the prefix is at most 16 characters, and at most 20 with the
  minimum width: Italy's field and France's portal take 20. Tokens have
  fixed widths, so the printed length is known when it is saved.
- `/` is for numbers carried over from Odoo. A file name writes it as
  `_`: `INV_2026_00452.pdf`, in the export's `documents/` too.
- Not `.`, which France refuses, nor `+`, which a web address reads as a
  space.

**Decision — the width.** At least 1 to 10 digits, padded with zeros. A
longer number simply grows: `999999`, then `1000000`.

**Decision — resets and periods.**

- Per series: never, yearly, monthly or daily. A reset needs its period
  in the prefix: a year for yearly, the year and month for monthly, all
  three for daily. Otherwise `INV-0001` would come back each January and
  collide. A date with no reset is allowed: the counter carries on, and
  the date is shown.
- **The document's own date** picks the period and fills the tokens. An
  invoice's and a credit note's date are calendar days already (ADR-046,
  ADR-052). An order's and an RMA's is the day it was made, in the
  organization's zone, through `dayIn` (ADR-072).
- **Earlier periods stay open.** An invoice dated 31 December and issued
  on 5 January takes 2026's next number, `INV-2026-0453`, not 2027's
  first. A number and its date then always agree, which is what an
  auditor counting a year's invoices checks.
- **Each period's counter keeps the prefix and width it numbers with.** A
  change applies to today's period and every later one. An earlier period
  goes on as it was, so that backdated invoice reads like the rest of
  2026, not with this year's prefix.

**Decision — the next number.**

- Shown for each series as it will be taken today, in full:
  `INV-2026-0453`.
- It sets today's period; a period not yet begun starts at 1.
- Never lower than where the counter stands, except under a printed
  prefix no document carries yet: a restart by hand, such as moving to
  `F-` and starting at 1.
- Sent only when changed. A form left open while invoices are issued then
  neither drags the counter back nor is refused over a number nobody
  touched.

**Decision — refusals, before anything is written.** Malformed settings
are a 400. Two conflicts are a 409, each with its code (conventions.md,
"Error codes"):

- **Two series that could print the same prefix**
  (`numbering_prefix_shared`, naming the other series): the same text once
  each token counts as its digits. `SO-` beside `SO-` clashes, two empty
  prefixes clash, and so do `S{YY}-` and `S26-`. This holds across all
  five series, not only the two that share `orders`: a number names one
  document in an organization, and a customer quoting it never means two.
- **Numbers a document already carries** (`numbering_number_taken`, naming
  the document and the lowest next number that would be accepted): any
  document in the organization whose number the series would print from
  today on, in today's period at or above the next number, or in a later
  one at or above where it stands. Values are compared, not text, so
  `INV-0050` is refused beside `INV-000050`, and a gap left by a deleted
  draft is no hole to fall through.
- The unique indexes on each table stay, as the last guard.

**Decision — date order, a switch per organization, off by default.**

- When it is on, an invoice or credit note dated before the latest issued
  in its series and period is refused (`numbering_date_order`, naming that
  document and its date). This is France's rule.
- It is checked after the number is taken, under the counter's lock, so
  two issues at once cannot both pass. A refusal hands the number back
  with the rest of the transaction.
- Orders and RMAs are numbered as they are made, so they are always in
  order.
- Off by default: Canada has no such rule, and a forgotten invoice dated
  last week must go through.

**Decision — where it is kept.**

- `document_numbering`: a row per organization and series, holding its
  prefix as written (tokens included), its width and its reset. Written
  for every organization by the migration and at registration, so taking
  a number always reads a real row. The switch is
  `organizations.documents_in_date_order`.
- `document_sequences` gains `period` in its primary key (`''` for no
  reset, then `2026`, `2026-10`, `2026-10-17`), and the printed `prefix`
  and `digits` the period numbers with. Existing rows become period `''`,
  with today's prefix and six digits. Counters are made on first use, as
  now. `document_type` gains `$type<DocumentType>()` (#131).
- `takeNumber` stays one locked statement: an insert from the series' row
  that, on conflict, increments the period's counter and returns its
  prefix, width and number. It is given the document's day; SQL only
  writes the day out, never converts it (ADR-072, amended). The cost is
  still one row lock per document, now per series and period.
- A save locks today's counter for each series it changes, so a number
  taken meanwhile lands wholly before the change or wholly after it.

**Decision — the screen.**

- A Numbering section on Settings → Organization → Documents. For each
  series: its prefix, with the tokens a tap away; its width, reset and
  next number; and the number it will take today. Then the date-order
  switch.
- One Save sends all five series, so two series can swap prefixes in one
  save.
- Every member can read it; `organizations.update` changes it (ADR-061).
- `GET` and `PUT /v1/organization/numbering`, audited as
  `organization.numbering_updated` with each series as stored before and
  after.
- Designed on the Claude Design canvas before it is built.

**Decision — what else reads the prefixes.**

- **The lookup (ADR-056, amended):** a query starting with a series'
  printed prefix puts that kind first. The prefixes are read from the
  organization's settings rather than `inv-`, `cn-` and `rma-` in code,
  and order numbers join them.
- **File names** of each document and of the export's PDFs write `/` as
  `_`.

**Unchanged.**

- A number already given never changes: it is stored on its document.
- Drafts take no number.
- Invoices and credit notes stay gapless, now within each series and
  period (ADR-046, ADR-047 amended).
- An order may still have a gap left by a deleted draft (ADR-071,
  amended).

**Considered and not done.**

- **A pattern with the counter anywhere,** as Odoo's `%(year)s` allows:
  text after the digits stops a number splitting one way only, and the
  refusals above stop being exact.
- **Periods by the day a document is issued:** a December invoice issued
  in January would print 2027.
- **Settings on the counter table:** each period's row would repeat them,
  and a series with no number yet would have nowhere to keep them.
- **A Postgres sequence per series:** not transactional, as ADR-046
  found.

**Consequences.**

- Migration 0067: `document_numbering` with every organization's five
  rows; `document_sequences`' period, prefix, digits and primary key;
  `organizations.documents_in_date_order`.
- `takeNumber`'s six callers pass the document's day: issue, void,
  credit, an order's creation and duplication, an RMA, and an RMA's
  replacement order.
- Three error codes in `error-codes.ts`; `npm run api` for the new routes.
- Both tables join the export without a change (ADR-070). Its column
  glossary names the new columns.
- Tests:
  - each refusal, and a restart by hand;
  - a backdated invoice across New Year;
  - an order made at 23:30 on 31 December in Vancouver;
  - two issues racing with date order on;
  - a save racing an issue.
- Manual checks: a new section 27.

**Deferred.**

- **A series per site.** Invoices and credit notes have no site, and a
  sale has none until it ships. A `{SITE}` token and a site on the
  counter fit later. Trigger: the first organization numbering each
  warehouse apart, likely with ADR-072's zone per site.
- **Invoices and credit notes on one counter.** Trigger: the first
  organization whose law or accountant asks for it.
- **A year that starts in another month,** such as India's from April or
  any fiscal year: a yearly reset from a chosen month, printed as
  `2026-27`. Trigger: the first organization whose year does not start in
  January.
- **Run numbers, and batch codes from them:** decided in ADR-074, which
  waits for its own trigger. A run's number becomes a sixth series here.

**Amendment (October 2026) — settled while building, and in review.**

- **The counter keeps the prefix as written, not as printed.** A series
  that never starts again, or starts again each year but shows the month,
  prints several prefixes within one counter's period, so
  `document_sequences.prefix` holds the prefix with its tokens
  (`INV-{YYYY}-`) and each number prints it from its own date. The rule
  stands: an earlier period goes on with what it numbered with.
- **A save takes today's counters first, as decided.** Before reading
  anything, a save takes today's counter for each series it changes,
  opening it at 1 if it is not yet open, so an issue waits for the save or
  the save's checks see the issue. First built locking only the settings,
  which taking a number never waits for: an issue during a save could open
  today's period with the old prefix and keep it for the rest of the
  period. The review found it; a test holds a save open while an issue
  waits, and fails without the lock.
- **Refusals carry details.** `numbering_number_taken` and
  `numbering_prefix_shared` name their series in the API's names
  (`invoice`, `creditNote`), and the first the least next number accepted,
  in `details` beside the code (conventions.md, "Error codes"), for the
  screen's Use. `numbering_date_order` has its way out too: Change it on
  Organization → Documents, for those who may change the numbering.
- **Going below the numbers given is the same refusal.** Below where the
  counter stands, while documents carry the prefix, `numbering_number_taken`
  says the numbers up to the last given; a number a later period would give
  again is refused the same way, with no least number.
- **Date order sits in `takeNumber`,** for invoices and credit notes
  alike, read after the counter's lock rather than inside its statement:
  an issue that waited for a save then follows a rule the same save turned
  on.
- **Where the code lives.** `takeNumber` moved from `modules/invoices` to
  `modules/numbering`, beside the rules in `numbering-format.ts`; the
  client's `lib/numbering.ts` holds the same rules, so the screen says what
  the server would refuse as it is typed. `DEFAULT_NUMBERING` is in the
  schema file. `dispositionOf` writes `/` as `_` for every download, and
  the export takes the same helper from `core/files`.
- **What the screen added, from the canvas.** The last number given under
  each next number, and the next period's first under Prints as; three
  common formats per series, keeping its letters, none with `/`; Change
  the numbering? before a change to a series is saved, the date-order
  switch alone saving straight away; each field in error says why, and
  names it to a screen reader; under an invoice's or credit note's date, a
  line when the date falls in another period than today's, read only once
  the date moves off today; and issuing says the number given: "Invoice
  issued as INV-2026-0453".
- **Accepted.** The number-taken check reads every matching number back
  into Node, and the last numbers given take five queries, three on
  unindexed columns: both run only when the numbering is saved or opened.
- **Tested otherwise than planned.** An order made at 23:30 on 31 December
  in Vancouver needs the server's clock pinned, which the end-to-end suite
  cannot do; an organization in Kiritimati, whose daily prefix prints its
  own day rather than UTC's, shows the same thing, beside ADR-072's tests
  of `dayIn` either side of midnight.
