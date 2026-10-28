---
status: accepted
date: 2026-09-28
---

# ADR-049 — Price lists: a default that becomes the line's price

## Context

Every sale line is priced by hand today (ADR-035), and a sale
cannot be confirmed until each one is (ADR-046). That is correct about where
a price belongs — on the line, agreed per order — and slow and error-prone
about where it comes from: whoever raises the order types 24.99 from memory,
or from a spreadsheet, for every line. Two customers on different terms are
two numbers to remember per SKU. ADR-035 deferred the answer: price lists are
"policy that feeds an order rather than part of one".

Purchases have the same gap from the other side. The supplier's current price
is typed on each purchase line, and since ADR-048 that typed number is what
stock is valued at.

ADR-048 also makes this the point where margin becomes possible: a sale price
and a batch's cost now both exist, which raises what, if anything, should
show the two together.

## Decision — a price list proposes; the line decides

A list supplies the
*default* price when a line is added. The line stores its own `unit_price`
and `currency` exactly as now (ADR-035), editable until it freezes, and
nothing reads the list again after that. So:

- Changing a list never changes an order, draft or confirmed. The line is
  the agreement; the list is where its first number came from.
- A line priced by hand is as valid as one priced from a list. Nothing
  requires a list, and the confirm checks are unchanged.
- Invoices, credit notes and costs read the line, never the list.

The alternative — orders that re-price from the list until confirmed — makes
a draft's total change under someone who has not touched it, and makes
"why is this line 22.50" depend on when you asked. A snapshot at the moment
the line is added answers that from the line alone, the way ADR-048's
valuation snapshots a purchase price rather than reading through to it.

## Decision — the shape

```text
price_lists       id, organization_id, name, direction ('sale' |
                  'purchase'), currency, is_active, timestamps
price_list_items  id, organization_id, price_list_id, variant_id,
                  unit_price, timestamps
                  unique (price_list_id, variant_id)
```

- **One currency per list.** A sale must be single-currency at confirm
  (ADR-046), so a list that mixed them would propose orders that cannot be
  confirmed. A customer billed in USD gets a USD list.
- **A direction per list.** What a customer is charged and what a supplier
  charges are different policies with different owners; one list serving
  both would be edited for one reason and silently change the other.
- **Net of tax.** A list price is the line's `unit_price`, before tax, as
  every line is (ADR-046). Tax comes from the tax code at invoicing.
- **Per variant, one price.** Quantity breaks are deferred (below).
- `unit_price` is `numeric(18,4)`, non-negative, as on lines. Zero is a
  price.
- Retired with `is_active: false`, never deleted, for the reason tax codes
  are not: a line's audit history may name the list its price came from.

## Decision — which list applies

A partner may name one sale list and one
purchase list (`partners.sale_price_list_id`, `partners.purchase_price_list_id`,
both nullable, each checked to point at a list of the right direction). The
organization may name a default sale list for customers with none
(`organizations.default_sale_price_list_id`). No default purchase list:
supplier prices are specific to the supplier, and a general one would be a
guess dressed as a price.

When a line is added to an order and the request carries no price:

1. The partner's list for the order's direction, if it has one and it is
   active; for a sale, else the organization's default sale list.
2. If that list has the variant, its price and currency are copied onto the
   line.
3. Otherwise the line is added unpriced, as today.

A price in the request always wins, and a request that sends one is never
second-guessed. Samples and zero-priced replacements (ADR-047) never take a
list price: they are priced at zero on purpose.

## Decision — currency conflicts leave the line unpriced, not refused

On a
sale whose priced lines are already in CAD, a USD list price is not copied:
the line is added unpriced and the response says why. Refusing the line
would block the person for a pricing policy they may not control; copying it
would build an order that cannot be confirmed. Unpriced is the state the
order already knows how to handle — the confirm check names the line.

## Decision — the price is resolved on the server

The add-line routes
(and order creation, for each line) resolve the default themselves, rather
than the client fetching the list and filling the field. One rule in one
place, and an API caller gets the same price the screen would. The response
says where each price came from (`priceSource: 'list' | 'manual' | null`),
so the screen can show "from Wholesale CAD" and the person can see it is a
default they may change.

Where the line already exists and someone wants the list's price again — a
list corrected after the order was drafted — that is an explicit action on
the line ("Use list price"), not a background refresh.

## Decision — margin is shown only where cost is visible

A sale line's
margin is its unit price against its item's current unit cost. It is shown
on a sale order to people holding `costs.view` (ADR-048), and nowhere else;
the order's own response stays free of cost, fetched separately as the cost
panels are. It is labelled as against current cost: the batch that ships
may cost something else, and the invoice is where the real figure could one
day be snapshotted. Stock with no lot uses its pool's average; a pool still
waiting for a cost shows margin as provisional.

## Decision — permissions: `price_lists.view`, `price_lists.create`, `price_lists.update`

Owner-only by default, as every new permission is.
Reading a list is not needed to use one: the price arrives on the line
through the order routes, which keep their own permissions. So a person who
raises orders gets list prices without being able to browse or change the
lists. Widening view or update to Admin is a deliberate edit when someone
asks.

## Performance

Adding a line gains two indexed reads: the partner's list
id, and one row from `price_list_items` by `(price_list_id, variant_id)`,
which the unique index serves. A list's page reads its items by
`price_list_id`; a list of a few thousand items needs no paging beyond the
existing keyset pattern if it grows past that.

## Consequences

- Migration 0035: `price_lists`, `price_list_items`, three nullable columns
  on `partners` and `organizations`, checks for direction, currency format
  and a non-negative price.
- That a partner's list has the right direction is a cross-table rule,
  enforced in the service and asserted in e2e (ADR-025).
- The order line gains `price_source`, stored, so the history of how a line
  was priced survives the list changing.
- Client:
  - a Price lists page with items;
  - the list pickers on the partner and organization pages;
  - order line dialogs showing where a price came from;
  - a margin column on sale orders for `costs.view`.
- Three permissions and their audit actions.

## Deferred

- **Quantity breaks** — a lower price from a quantity up. The line
  snapshots its price when added, so a break would need re-resolving when
  the quantity changes, which is the re-pricing this ADR rejects.
  Trigger: a customer on case pricing.
- **Dated prices** — a new price from 1 January, entered in December. For
  now a change applies from when it is saved, and the audit log keeps what
  it was. Trigger: a price change that has to be prepared before it takes
  effect.
- **Discounts** as a percentage off a list, per customer. A second list is
  the workaround.
- **Margin snapshotted on the invoice**, and margin reporting over a period.
  Needs ADR-048's open decision on period close first.
- **Importing a list from a spreadsheet**, and a supplier's price file.

## Amendment — margin deferred, and derivable either way

Showing margin to
`costs.view` holders is not built in v0.4. Production systems show two
figures, and both are already derivable here without storing anything new:

- **Estimated margin** on a sale line — its price against the item's current
  pool cost. A decision aid while pricing; it moves as costs move.
- **Actual margin** per shipment or invoice — invoice net revenue against the
  value of the outbound valuation rows for the lots that shipped (ADR-048),
  less credits and plus returns. Exact, and fixed once written, because the
  ledger is append-only; no snapshot is needed.

Both are computed on read, so landed cost, conversion cost or another costing
method (all deferred in ADR-048) reach margin with no change here. Revenue in
another currency converts at the invoice date's rate; with none on file the
margin shows as unconverted rather than guessed. Which to build first is
what the first real week will show.
