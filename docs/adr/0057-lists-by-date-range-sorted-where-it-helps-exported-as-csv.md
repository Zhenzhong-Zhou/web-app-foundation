---
status: accepted
date: 2026-10-08
areas: [api, ui]
amended-by: [ADR-076]
---

# ADR-057 — Lists by date range, sorted where it helps, exported as CSV

## Context

Every list is newest first, fixed, because keyset paging
(ADR-051) pages by one order. Only the audit log filters by date. An
accountant's questions are about periods: September's invoices, this
quarter's credit notes, the movements on the day of a count, orders
expected next week. Today the answer is paging back until the dates run
out, then copying figures by hand into a spreadsheet, the tool those
questions end in. Search (ADR-056) finds a record; this narrows a list to a
period, puts it in the order the question needs, and hands it over.

The handoff recorded the shape: date ranges are cheap, one more filter on
the same paging; sorting is not, since each sortable column needs its own
cursor and index; CSV export belongs with them, since a filtered month is
what gets exported.

## Decision — a date range on the lists that have a date people ask by

| List | Filtered by | Kind |
| --- | --- | --- |
| Invoices | invoice date | calendar day |
| Credit notes | credit date | calendar day |
| Orders | expected date | calendar day |
| Stock movements | when recorded | instant |
| Production runs | when planned | instant |
| Return authorizations | when raised | instant |

- **Calendar days** (`date` columns, ADR-052) take `from` and `to`, both
  included, as `YYYY-MM-DD`: `from=2026-09-01&to=2026-09-30` is September.
- **Instants** (`timestamptz`) take `from` and `until`, as ISO instants,
  `until` excluded (not `before`, which every list already takes as its
  keyset cursor). The client turns the reader's days into instants in the
  reader's time zone, so "7 October" means the 7th where the person is, as
  the screens already show times.
- Either end may be left open. A range combines with the list's other
  filters and its search, and pages as before.
- A draft invoice has no invoice date yet, so a date range leaves drafts
  out; the status filter still finds them.

## Decision — credit notes get a list

They have pages but no list, so a
quarter's credit notes cannot be shown or exported. `GET /v1/credit-notes`
and a Credit notes page beside Invoices: number, invoice, partner, date,
amount, voided, with the date range and search (ADR-056) like the rest.

## Decision — sorting where it is asked for, not on every column

| List | Sortable by | Why |
| --- | --- | --- |
| Invoices | invoice date, total | a period in order; the largest first |
| Credit notes | credit date, total | as invoices |
| Orders | expected date | what is due next |
| Inventory | expiry | soonest first, the order stock should leave in |

- The default stays newest first everywhere; a sort is chosen in the
  address (`sort=invoiceDate&order=asc`), so a sorted list can be
  bookmarked, and from the column header (MUI's `TableSortLabel`).
- **Keyset paging survives.** The cursor carries the sorted value and the
  id, `(value, id)`, and the next page reads after that pair, so paging a
  sorted list never skips or repeats a row. Rows without a value (an order
  with no expected date) come last in either order.
- **Each sort has an index** on `(organization_id, value, id)`, added by
  migration, and a plan probe in `perf/` (ADR-051).
  *Amended:* a btree read backwards gives `DESC NULLS FIRST`, and the lists
  put blanks last both ways, so a descending sort could not read the
  ascending index and sorted the whole organization instead; the plan check
  caught it on invoices by total. Each sort now has a second index built
  `value DESC NULLS LAST, id DESC` (migration 0046), one per direction.
- Any other column is refused, not ignored: a sort that cannot be paged
  correctly is worse than none.

## Decision — CSV export of what the list shows

- An **Export** button on each list above writes a `.csv` file of every
  row matching the list's current filters, search, range and sort: not
  just the page on screen. `GET /v1/<list>/export` with the list's own
  query parameters, so the export and the list can never disagree.
- **CSV, UTF-8 with a byte-order mark,** so Excel opens Chinese and French
  correctly instead of as mojibake; comma-separated, quoted per RFC 4180.
- **Headers in the reader's language,** from the catalogues; values as data,
  not as the screen formats them: quantities and money as plain decimals
  with a point and no grouping (`1234.5`), a currency column beside money,
  dates `YYYY-MM-DD`, instants ISO 8601. A spreadsheet then reads every
  figure as a number in any locale.
- **Formula injection is neutralized:** a cell beginning with `=`, `+`,
  `-`, `@`, a tab or a carriage return is prefixed with `'`, so a partner
  named `=HYPERLINK(...)` is text, not a formula (OWASP).
- **At most 50,000 rows.** Past that the export is refused with a message to
  narrow the range: a request holds a connection until it finishes, and
  there are no background jobs (ADR-005).
- **Who may export:** whoever may view the list; the permission is the
  list's. Every export is written to the audit log (`list.exported`, which
  list, its filters, how many rows), since it is data leaving the system in
  bulk.
- What each export holds:
  - invoices: number, status, invoice date, due date, partner, order,
      currency, subtotal, tax, total, credited, net;
  - credit notes: number, invoice, partner, credit date, currency, amount,
      voided;
  - orders: reference, direction, status, partner, expected date, lines,
      quantity ordered, quantity received or shipped, created; no money,
      since a line carries its own currency and one total could be wrong;
  - stock movements: when, reason, SKU, lot, quantity, from and to
      location, by whom, note;
  - inventory: SKU, item, variant, lot, expiry, location, quantity, unit;
      costs are the stock value export's, beside the valuation;
  - products: SKU, product, variant, type, unit, tracks lots, discontinued,
      and the names in each language the product has;
  - partners: name, code, tax ID, document language, retired, and the
      billing address;
  - a price list: its items, SKU, item, unit, price, currency; one export
      per list;
  - stock value (the costs page): SKU, lot, quantity, unit cost, value,
      currency, provisional, as at the moment of export;
  - the audit log: when, by whom, action, record type, record, and the
      fields the entry recorded as JSON (their shape differs per action),
      under `audit.view` like the page, filtered by its own date range and
      action.

  Products, partners, price lists, stock value and the audit log were
  added before step 5 was built: once one CSV writer exists, each is a
  choice of columns, not new work, and each answers a request an
  accountant or an auditor makes (a catalogue to check, a contact list,
  prices to send a customer, month-end valuation, who changed what). The
  audit log and partners hold personal data, which is one more reason
  every export is itself audited. Members, roles, tax codes, locations and
  settings are not exported: small, read on screen, and asked for by
  nobody yet.

## Decision — in the browser

- The filter row gains a **date range**: From and To date fields and a few
  presets (This month, Last month, This quarter, This year), in the
  reader's language and week; on a phone it folds under a Dates button.
- **Column headers** that can sort show it; the others do not pretend to.
- **Export** sits in the page header's actions; it downloads with the
  current filters, and says how many rows it holds before the file starts
  only when it is refused.

## Consequences

- Built in this order, each its own commit:
    1. Migration: the sort indexes; the audit action `list.exported`.
    2. Date ranges on the six lists, with e2e cases for both kinds and
       open ends.
    3. The credit notes list, server and page.
    4. Sorting with the `(value, id)` cursor on the four lists, with e2e
       cases paging a sorted list across pages.
    5. CSV writing in one place (BOM, quoting, injection, plain values) with
       unit tests, and the export endpoints, with e2e cases and the audit
       entry.
    6. The client: the date range, sortable headers, the Export button,
       with unit tests and an e2e flow (September's invoices exported).
    7. Perf probes for each sort and a range; manual checks for Excel and
       Numbers opening a Chinese export.
- The *Open decisions* entry on sorting is settled by this ADR; CSV import
  stays open there.

## Considered and not done

- **Excel files (.xlsx).** Typed cells and formatting, at the price of a
  library and a format to keep right; every spreadsheet opens CSV.
  Deferred below.
- **Exporting only the loaded rows, in the browser.** Simple, and wrong:
  an export of "September" that holds the first 50 rows is worse than none.
- **A background export emailed when ready.** Needs the background jobs
  ADR-005 put off; the row limit covers today's sizes.
- **Every column sortable.** A cursor and an index per column on every
  list, for sorts nobody asked for.
- **Dates by the organization's time zone.** Organizations have none; the
  reader's is what the screens already use.

## Deferred — each with what brings it in

- **Excel files.** Trigger: an accountant whose spreadsheet mangles CSV
  (leading zeros, long numbers), or who asks.
- **Exports past 50,000 rows**, in the background. Trigger: an organization
  that reaches it, with background jobs decided.
- **Export to the books** (QuickBooks, Sage), already deferred in ADR-048.
  Trigger: an accountant asking to stop re-keying.
- **More sortable columns.** Trigger: asked for, one at a time, each with
  its index.

## Amendment (October 2026) — an instant as a spreadsheet opens it

Instants were written as ISO 8601, `2026-10-15T18:54:11.123Z`, which
Excel and Numbers keep as text: the `T`, the `Z` and the fractions stop
them reading a date. ADR-071 writes the organization's full export's
times as `2026-10-15 18:54:11`, in UTC, which both open as a date; every
CSV now does the same, through one helper, `csvMoment`, so the
per-screen exports and the full one agree. Days stay `YYYY-MM-DD`.

## Amendment (October 2026) — ranges of moments at the organization's midnight (ADR-072)

A date range over moments, such as movements, runs,
RMAs and the audit log, turned its days into times at the reader's
midnight. It now turns them into times at the organization's, so "This
month" is the same stretch of time for every member, and the presets
count in the organization's calendar. The end stays exclusive, the next
day's midnight, correct across a clock change, including a midnight that
never happens, as in Santiago. The audit log, its export and Your
activity had kept their own `to`, compared with `<=` at UTC midnight, so
"To 7 October" left the 7th out; they take `from` and `until` like the
rest now.
