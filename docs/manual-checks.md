# Manual checks

What a person checks by hand before a release, after a feature lands, and in
the end-of-milestone walkthrough. The automated suites prove the rules hold;
this list proves the app makes sense to someone using it, which no test can.

Each check has an id (`MC-…`) so a commit, an issue or a release note can
point at one. Tick them in a copy of this file or in the release issue, not
here: this file is the list, not a record of one run.

## Keeping it current

The rule, also in `docs/conventions.md`: **a commit that changes what a
person sees or a rule they work under updates this file in the same
commit.**

- **A new feature** adds its checks to the section it belongs in, or a new
  section.
- **A fixed bug that a person could have noticed** adds a check under
  *Regressions* with the issue number, so the walkthrough looks at it again.
- **A changed rule or policy** (a refusal, a limit, a permission, a default)
  rewrites its check. Delete what no longer holds rather than marking it
  old; git keeps the history.
- **A known limitation** goes in the release notes, not here. Check what the
  app should do, not what it can't yet.

## Before you start

From `server/`, on a fresh dev database:

```bash
npm run migrate && npm run seed && npm run seed:demo
```

Then `npm run start:dev` in `server/` and `npm run dev` in `client/`. Sign in
as the demo Owner the seed prints.

The demo leaves known numbers to check against:

- **BF-2609**, the ingredient lot, valued at **1900.00 CAD**.
- **FOC-2609-01**, the batch made from it, costed at **1292.00** over **980**
  bottles: **1.318367** each.
- **SO-DEMO-2**, priced from the **Wholesale CAD** list, the organization's
  default.
- **SO-DEMO-1**, with an RMA received and credited.
- A voided shipment.
- **PO-DEMO-2**, bought in USD at a rate of **1.37**.

Keep a second browser profile, or a private window, for a second user and a
second organization.

---

## 1. Accounts and access

- **MC-101** Register a new account and organization. The verification email
  arrives (Mailpit locally), and its link verifies the account.
- **MC-102** Sign out, sign in. A wrong password is refused with the same
  message as an unknown email: the form never says which one was wrong.
- **MC-103** Forgot password: the email arrives, the link sets a new password,
  and the old one stops working.
- **MC-104** Account → Devices lists this session. Signing out another
  session from here ends it in the other browser on its next request.
- **MC-105** Change password from Account. Other sessions end.
- **MC-106** Members: invite a second user as a viewer. The viewer can see
  stock and orders, but has no buttons for what it may not do, and a direct
  URL to a settings page shows "not allowed" rather than an empty page.
- **MC-107** The last Owner cannot be removed or demoted; the app says why.
- **MC-108** A second organization, in the second profile, sees none of the
  first's products, partners, orders, lots or audit entries, even by pasting
  a URL from the first.

## 2. Catalogue and places

- **MC-201** Products: create a good, a material and packaging. A SKU must be
  unique; a duplicate is refused at the field, not after saving.
- **MC-202** A variant's SKU can be edited inline; leaving the field saves
  it, and Escape cancels.
- **MC-203** Turning lot tracking on is offered only while the variant has no
  stock.
- **MC-204** Locations: a site with bins under it. Stock goes only into a
  place with nothing under it; a place holding stock cannot take children.
- **MC-205** Mark a bin unavailable (returns, retention). Its stock still
  shows on Inventory, but it is not counted as available and nothing ships
  or is picked for production from it.
- **MC-206** Partners: a partner with two addresses. Setting one as the
  default billing address unsets the other; the primary contact behaves the
  same way.

## 3. Stock

- **MC-301** Inventory shows every place and lot with stock, and the
  availability beside it: on hand, held, free, backordered.
- **MC-302** Move stock: a transfer between bins, an adjustment in, an
  adjustment out (a note is required), and a sample to a customer. Each one
  appears under Movements with who, when and why.
- **MC-303** A lot-tracked move asks for the lot; an untracked one does not.
- **MC-304** An adjustment out cannot take more than is on the shelf.
- **MC-305** A movement's history dialog reads in the direction it happened
  (in, out, between).

## 4. Buying

- **MC-401** A purchase order: draft, add lines, confirm. A confirmed order's
  lines cannot be edited.
- **MC-402** Receive part of a line into a new lot with an expiry, then the
  rest into a second lot. The order shows each receipt, and Inventory shows
  both lots.
- **MC-403** Duplicate a confirmed order. The copy is a draft with no
  reference, no quantities received, and the partner's current address. The
  original is untouched until it is cancelled separately (ADR-031).
- **MC-404** A purchase in USD, with no rate entered for today: the receipt
  appears under Stock value as needing a cost. Enter the rate under Exchange
  rates; a later receipt is valued, and the earlier one stays as it was
  until corrected (ADR-048).

## 5. Making

- **MC-501** A recipe (BOM): draft, add lines, promote. A promoted recipe
  cannot be edited; a new version is a duplicate.
- **MC-502** Plan a run from the recipe. Release: the dialog previews which
  lots it will take, earliest expiry first, before anything moves.
- **MC-503** Record output into a new batch number. A second recording
  offers the batch by its code.
- **MC-504** Close over plan: the top-up comes from the shelf, and the
  variance is flagged and notified.
- **MC-505** The run's cost panel shows the material cost posted to the
  batch, and its unit cost.
- **MC-506** A licence on the recipe shows on the run.

## 6. Selling

- **MC-601** A sale to a customer with a default price list: lines added
  without a price take the list's price and show which list it came from.
- **MC-602** Change the list's price. The existing order does not change.
  "Use list price" on a line applies the new one.
- **MC-603** A sample line never takes a list price.
- **MC-604** A line whose list prices it in another currency than the sale is
  added unpriced, with the reason shown.
- **MC-605** One currency per sale: the first priced line sets it, and a
  line in another currency is refused (ADR-046).
- **MC-606** Confirming an unpriced sale is refused, with which line is
  unpriced.
- **MC-607** Two confirmed sales for more than is in stock: the first holds
  what exists, the second shows the rest as backordered, and Inventory's
  availability agrees (ADR-045).
- **MC-608** Ship part of a sale without choosing lots: earliest expiry goes
  first. Ship the rest choosing a lot by hand.
- **MC-609** Shipping cannot take stock held for an earlier order.
- **MC-610** Void a shipment: its stock returns to the shelf and the order's
  shipped quantity goes back down.

## 7. Invoicing, returns and credit

- **MC-701** Invoice a shipment: the draft shows every amount before issuing.
  Issuing gives the next number with no gap, and copies the seller, bill-to
  and ship-to as they are now.
- **MC-702** Issuing to a customer with no billing address is refused, and
  says to add one.
- **MC-703** The printed invoice: amounts rounded to the currency, tax per
  component, the registered address and tax number.
- **MC-704** Void an issued invoice: a full credit note is issued, and the
  shipment can be invoiced again.
- **MC-705** An RMA with one line to credit and one to replace. Receive the
  goods into the returns bin, then credit. The credit is capped at what was
  returned and invoiced, by value and by tax component.
- **MC-706** The replacement is a draft sale at zero for the replaced line.
- **MC-707** A partial credit with no goods back (a price adjustment). A
  second credit cannot take the total past the invoice.
- **MC-708** Samples never appear on an invoice.

## 8. Cost

- **MC-801** Settings → Organization: the base currency can be set, and is
  fixed once anything carries a value.
- **MC-802** Stock value: the total, each pool's quantity, value and unit
  cost, and the needs-cost list. The demo's BF-2609 shows 1900.00 CAD.
- **MC-803** Correct a needs-cost receipt. The correction splits between
  stock still held and stock already gone, and the item leaves the
  needs-cost list.
- **MC-804** Costs and price lists are hidden from a viewer and from any role
  without the permission.

## 9. Recall drill (timed)

A recall arrives as part of a code off a label. Time it from the first
search to having the list of customers; the target is **under two minutes**.

- **MC-901** Lot search: type `2609`. Both BF-2609 and FOC-2609-01 appear,
  each with its SKU; codes starting with the text come first.
- **MC-902** Trace BF-2609: its supplier receipt, the batch it went into
  (FOC-2609-01), and every customer who received that batch, including
  samples and returns.
- **MC-903** Trace FOC-2609-01 back: the run, and the ingredient lots it was
  made from.
- **MC-904** Balances: where every unit of the batch is now.
- **MC-905** Record the time here and in the release notes.

## 10. Audit

- **MC-1001** Audit log: the changes from the walkthrough appear with who,
  what and when, in words a person can read.
- **MC-1002** A viewer cannot open the audit log.

## 11. Real week by hand (end of milestone)

Not a script: use the app for a week's worth of an imaginary business, then
note what was awkward, slow or confusing. At least:

- **MC-1101** An invoice, an RMA, a partial credit and a replacement.
- **MC-1102** A foreign-currency purchase, with its rate entered.
- **MC-1103** A costed batch.
- **MC-1104** A list-priced sale.
- **MC-1105** Anything that felt wrong becomes an issue, or a fix before the
  tag; the fixes are listed in the release notes.

## 12. Performance (ADR-051)

Before a release, or after a change to a list, a ledger query or an index.
The recipe is in `server/perf/README.md`.

- **MC-1201** `seed:volume --scale small` finishes with no refusal and no
  "sales skipped" warning.
- **MC-1202** `npm run perf` passes: every budget, and the concurrency check.
- **MC-1203** `npm run perf:plans` passes, or each scan it reports is fixed or
  allowed with its reason.
- **MC-1204** If a large-scale report exists, nothing grows more than 3×
  without an issue explaining why.

## Regressions

Bugs a person could have noticed, checked again on every walkthrough. Newest
first.

- **MC-R01** *(seed:volume)* Issuing an invoice to a customer created
  without a billing address is refused with the reason, not a server error.
  See MC-702.

---

## Changes to this list

- 2026-10-01: first version, covering v0.4 (money) and ADR-051 (performance).
