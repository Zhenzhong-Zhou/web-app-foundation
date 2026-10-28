---
status: accepted
date: 2026-10-02
amends: [ADR-040]
amended-by: [ADR-072, ADR-081]
---

# ADR-052 — Calendar days are `date`, sent as YYYY-MM-DD (amends ADR-040)

> **Amended by [ADR-081](0081-old-tabs-after-a-deploy.md).**
> The lenient mode is one of two ways through a breaking change; the other raises the API revision. And every migration, not only one on a large table, leaves working what the release still serving reads: expand, then contract.

## Context

Four columns hold a day somebody picked, not a moment:

- a lot's expiry, `lots.expires_at`;
- an order's expected delivery, `orders.expected_at`;
- a licence's dates, `product_licences.issued_at` and `expires_at`.

All four are `timestamptz`. A day is not an instant, so each needs a
convention to survive the trip. The client writes UTC midnight
(`utcMidnight`) and reads it back in UTC (`formatDay`). The server compares
licence dates as UTC days (ADR-040, ADR-050). Each piece is correct, and
each arrived after a bug: a lot expiring 10 Oct showed as 9 Oct in
Vancouver, and five forms sent the bare day, which Postgres stores at
midnight in the session's time zone. Every new form, query and reader has to
remember the convention, and forgetting it fails only away from Greenwich —
never in a test that runs in UTC.

Invoices, credit notes and exchange rates have used `date` since ADR-046 and
ADR-048 and need none of this. One more place depends on a time zone without
saying so: a receipt costed as it arrives looks up its rate on or before
`current_date`, the database session's day, because a movement has no day of
its own (#20).

## Decision — `date` for every calendar day

The four columns become
`date`. Drizzle declares them `date(..., { mode: 'string' })`, as invoices
do, so a day is a `'YYYY-MM-DD'` string from the column to the screen and
never passes through a JS `Date`.

Moments stay `timestamptz`: `lots.received_at`, every `*_at` stamp on a
document, `created_at` and `updated_at`. The test is how a person would
write it. If it is written without a time — on a box, on a licence, in a
supplier's promise — it is a `date`.

## Decision — converted at UTC, in one migration

0038 changes each
column's type `USING (column AT TIME ZONE 'UTC')::date`. The zone is
explicit because a plain cast uses the session's time zone, which is the
dependency this ADR removes.

- Values written since `utcMidnight` are UTC midnight, and convert to the
  day that was picked.
- Anything else converts to its UTC day. That is the day `formatDay` has
  been showing, so no screen changes.
- Both licence columns change in one statement. Postgres rebuilds the
  ordering check and the partial expiry index in the same step.
- One-way. The only thing lost is a time of day nobody meant to record.

The change rewrites each table under an exclusive lock, which takes
milliseconds at today's sizes. On a large live table the production
procedure is expand and contract instead: add the `date` column, backfill it
in batches, write both, switch the reads, then drop the old one. ADR-051
makes the same point about building indexes.

## Decision — one format on the wire, `YYYY-MM-DD`

ISO 8601's calendar
date: what ERP and accounting APIs use for a day, and what
`<input type="date">` gives. Responses return the day as stored. Requests
are checked by `IsCalendarDay()`, which invoices already use: the shape
first, then a real date, so 2026-02-30 is a 400 rather than a 500.

The format is the same for every organization and every industry. What a
day *means* is what differs between them (see Deferred), and keeping the
format fixed is what lets those meanings change without touching the API or
the columns again.

## Decision — how strict is a deployment setting

`CALENDAR_DAY_INPUT` in
`.env`:

- **`strict`**, the default: only `YYYY-MM-DD`.
- **`lenient`**: also an instant at exactly UTC midnight (`…T00:00:00Z`,
  with or without milliseconds), the shape the client sent before this ADR.
  It is stored as its day, and a warning names the route and the field, so
  whoever runs the deployment can see when nothing sends it any more and
  switch to strict.

Any other instant is refused in either mode. Turning 07:00Z into a day means
choosing a time zone, which is the guess this ADR removes.

Lenient is for a transition — a browser tab still holding the old client
after a deploy — and for a deployment fed by an integration that sends
instants. Render runs strict: nothing outside the app calls it yet. The
pattern is the usual one for changing an API contract: accept the old shape
for a while, log every use, refuse it once the log is quiet.

## Decision — a `date` is read as a string everywhere

node-postgres turns a
`date` into a JS `Date` at the server process's local midnight. In
Vancouver that serialises as 07:00Z, so a raw query on a developer's machine
would disagree with Drizzle, and with Render, which runs in UTC. One type
parser for `date` (OID 1082), registered in `database.module.ts` where the
pool is created, returns the text untouched for every query, Drizzle or raw.
Raw reads type the value as `string | null`. One registration rather than a
cast in each query, so a raw read written next year cannot forget it.

## Decision — "today" on the server is one function

It returns the UTC day
as `YYYY-MM-DD`. Licence status at release (ADR-050) and the rate looked up
when a receipt is costed both ask it, instead of `new Date()` in one place
and `current_date` in the other. Two such strings compare as days, so
neither needs a `Date`. The rate lookup stops depending on how the database
session is configured. When an organization gets its own time zone, this
one function changes.

## Decision — the audit log reads both shapes

Rows written before 0038
hold instants for these fields; rows after hold days. Neither is rewritten:
ADR-038 does not backfill history. The audit log reads a bare `YYYY-MM-DD`
as a day whatever its key, and keeps reading the old instants of the known
calendar-day fields in UTC.

## Consequences

- `utcMidnight` and its tests go. Nine forms send the date input's value as
  typed and prefill from the value as it arrives, without `.slice(0, 10)`.
  `formatDay` keeps formatting in UTC, which reads a bare day exactly.
- The client and the server must agree on the format, so they deploy from
  the same merge. An old bundle reads the new values correctly; under
  strict, its writes are refused until the page reloads.
- Server first, with e2e tests:
  - every route that writes one of these days returns it exactly as sent;
  - an instant is refused under strict;
  - under lenient, an instant at UTC midnight is stored as its day, and any
      other instant is still refused;
  - a schema test asserts every calendar-day column, the older `date` ones
      included, is `date`, so a future `timestamptz` day fails the suite.
- The server's licence-status unit test and the client's keep pinning the
  same days either side of today, now as strings.
- Manual checks: the day picked is the day shown on every screen, the audit
  log included, wherever the browser is.

## Deferred — what a day means

None of these changes the column or the
format. Each is a rule or a setting on top, and each waits for its trigger.

- **An organization's time zone for "today".** Licence status, the rate at
  receipt, and any day the server fills in itself use the UTC day, so a
  receipt at 5pm in Vancouver reads tomorrow's rate if one was entered
  early. The likely shape is a time zone on `organizations` read by the one
  function above. A receipt day the person enters, as an invoice date is
  entered, is the alternative. Trigger: users in two time zones, or the
  first day decided wrongly near midnight.
  *Built by ADR-072 (October 2026):* each organization has a time zone,
  and the one function asks it.
- **Expiry inclusive or exclusive.** The printed day is the last usable day
  ("use by"), for lots and licences alike. Some regimes read it as the
  first day the product may not be used. Trigger: a customer or a regulator
  who reads it the other way.
- **Month-precision expiry.** Labels often print `EXP 06/2027`, and GS1
  barcodes encode the end of a month as day `00`. Stored as the last day of
  the month; a precision flag only if it must print as the label did.
  Trigger: receiving by barcode, or printing an expiry on our own documents.
- **Minimum remaining shelf life at shipment** — a retailer refusing stock
  with less than six months left. A rule on earliest-expiry-first picking
  (ADR-041), per customer or per organization. Trigger: the first customer
  who asks.

## Amendment — settled while building

Three points:

- **No type parser.** Drizzle 0.45's node-postgres driver already returns
  `date` and `timestamptz` as text for every query that goes through it,
  `tx.execute` included, so registering one would duplicate it. The raw
  reads that typed a lot's expiry as `Date` were in fact returning text
  such as `2026-10-10 00:00:00+00`; they now return `2026-10-10` and are
  typed `string | null`. What holds the guarantee is a test, not a
  registration: `calendar-days.e2e-spec.ts` reads one expiry through
  Drizzle, lot search and the lot trace, and expects the same text from all
  three. A driver change that broke it would fail there.
- **One switch for every calendar day.** `CALENDAR_DAY_INPUT` applies
  wherever `IsCalendarDay()` does, so invoice, due, credit and rate dates
  follow it too. Their client already sends `YYYY-MM-DD`, so nothing
  changes for them.
- **The warning names the field.** A decorator cannot see the route; the
  line is logged inside the request, so the request's log context carries
  it.
