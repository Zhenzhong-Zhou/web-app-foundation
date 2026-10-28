---
status: accepted
date: 2026-09-03
areas: [products, stock]
---

# ADR-023 — Stock lives on variants, and quantity is a ledger

## Context

The first application on this foundation is inventory. It has to
hold sellable products, raw materials, packaging, samples, and office supplies,
across warehouses, some with lot numbers and expiry and some without. The
question underneath all of that is one question: at what granularity does a
quantity exist, and how does it change.

## Decision — products group, variants carry stock

```text
products          id, organization_id, type, name, description
product_variants  id, organization_id, product_id, sku, name, unit_of_measure,
                  tracks_batches, weight_grams, dimensions, case_quantity
                  unique (organization_id, sku)
batches           id, organization_id, variant_id, code, expires_at, received_at
                  unique (organization_id, variant_id, code)
locations         id, organization_id, name, type, parent_id
stock             variant_id, location_id, batch_id, quantity
stock_movements   append-only; see below
```

The product is a grouping for display. The variant is the thing counted,
bought, and shipped — "Vitamin D3" is a product, "Vitamin D3, 60ct" is what
sits on a shelf. Shopify, Medusa, and Saleor all landed here; Amazon's
parent/child ASIN is the same shape.

## Every product has at least one variant, including those with no variation

Office supplies and single-size products get one auto-created variant holding
the SKU, and the UI hides it behind a single field. This is the part that feels
like overhead and is not: if stock hung off a product *sometimes* and a variant
*other times*, every query would need a branch, and each branch is a place to
be wrong. One home for quantity, permanently.

## Decision — SKUs are unique per organization, never global, never generated

Global uniqueness would leak the customer list: two customers stocking
`WIDGET-01` and one being rejected reveals the other exists. Same reasoning as
`organizations.slug`.

Not generated, because a SKU is printed on a label, read over a phone, and
typed into a supplier's system. The organization already has one for every
item. A second machine-made identifier means every item has two names and staff
use the wrong one — `id` is UUIDv7 and handles machine identity.

A collision within one organization is a 409 naming the existing variant, not a
silent second row. Two variants sharing a SKU makes every count, order line,
and movement ambiguous forever.

SKUs stay editable. Locking one after first use sounds safer and is worse: a
typo found after the first receipt becomes permanent, and the workaround people
reach for is a duplicate product with the old one discontinued, which splits
stock across two records and loses exactly the history the lock was protecting.

What protects the link to physical reality is snapshotting, not locking. Order
lines and stock movements store the SKU as text alongside `variant_id`, so a
rename affects the catalogue and nothing historical — a purchase order printed
last March still shows what was on the label, and the foreign key still
resolves to the current variant. Same pattern as `audit_log` capturing `ip` at
event time rather than joining to a session row (ADR-012).

A rename is audited, but the audit row carries no payload (ADR-018), so the
previous SKU is not recorded. Acceptable while renames are rare and the log
names who did it. Snapshotting fixes it for SKUs specifically, once
movements store the value as text; for role changes and profile edits there is
no equivalent, which is why the general question stays open.

## Decision — `type` distinguishes what a thing is for, and does not fork the schema

Sellable goods, raw material, packaging, samples, and office supplies
share SKU, stock, location, and movement. They differ in what they *connect*
to — a price and sales orders, or purchase orders and production consumption,
or neither. That is relationships and a check-constrained column, not separate
tables. Duplicating `stock` for supplies would mean two places a quantity can
go negative.

## Decision — batch tracking is a property of the variant, not a global mode

`tracks_batches` on the variant, because a manufactured supplement needs lot
numbers and a box of paperclips does not, and supplier goods vary.

The invariant: **if `tracks_batches` is true, every `stock` row for that
variant has a `batch_id`; if false, every row has null.** A check constraint
cannot see across tables, so this is enforced in the service and asserted in
e2e. Without it a variant ends up with some batched rows and some not, and no
query can answer how much exists.

When a supplier ships without a lot number and the variant tracks batches, the
receiver enters one and it is flagged as assigned rather than printed. Leaving
it null breaks the invariant; inventing one silently is worse — the distinction
is what matters during a recall.

When costing arrives, `unit_cost` belongs on the batch: a variant's cost is
not a fact about the variant, it changes with every purchase, and
overwriting it destroys the ability to value what is actually on the shelf.
Storage and handling are period expenses, not inventory cost, and touch
none of these tables.

## Decision — quantity is a ledger, and `stock` is a cache

```text
stock_movements   id, organization_id, variant_id, batch_id,
                  from_location_id, to_location_id,   -- null marks direction
                  quantity,                            -- always positive
                  reason, reason_detail,
                  reference_type, reference_id,
                  note, actor_id, created_at
```

Append-only, like `audit_log`. `stock` is updated in the same transaction and
is derived — a convenience for reads, never the source of truth.

A mutable quantity column cannot answer "why does the system say 47 when the
shelf holds 45." A ledger can, and that question is the entire job. This is
also the hardest thing to retrofit: added later, every existing quantity has
unexplained provenance.

## `actor_id` is not null

The movement *is* the record; `@Audited` (ADR-018)
sits above it and does not replace it. A manual adjustment with no name
attached is precisely the row someone will ask about.

## `note` is required when `reason = 'adjustment'`

A receipt explains itself;
an adjustment is a person saying the system is wrong, and a blank one is
unauditable.

**Nothing edits `stock.quantity` directly** — not the UI, not a correction, not
a fix. Every change is a movement. A second way to change a quantity is the
moment the ledger stops being authoritative. The e2e assertion is that the sum
of a variant's movements equals its stock row.

## Decision — reason is a closed enum; reference is nullable

Reason says *why*: receipt, shipment, transfer, adjustment, production,
consumption, sample, return. Reference says *what caused it* — a purchase
order, a sales order, a stock count. Damage, theft, expiry, breakage, and
miscounts are all `adjustment` with a `reason_detail`; they are the same
operation and only the explanation differs, and finance treats them
differently.

Direction is not a reason. Inbound and outbound are encoded by which of the two
location columns is null.

Reference is nullable so a movement entered by hand today and one raised by an
order later are the same row. Order management adds a reference; it does not
change the table, and existing rows stay valid.

## Consequence

One extra join on every product read, on an indexed foreign
key — irrelevant at any scale this will see. One extra write per stock change,
in the same transaction.

Three things that follow from this and are *not* decided here, because the
modules that force them do not exist yet: reservations (`available = on_hand −
reserved`, needed before anything can be oversold), costing (batch-level,
moving average, or FIFO), and unit-of-measure conversion (buy cases, stock
eaches). Each is recorded in open decisions.

## Rejected: a flat `products` table with quantity on it

Faster to start and
the thing every first inventory system regrets. Retrofitting variants means
touching every table that references a product, and retrofitting a ledger means
inventing history.

## Amendment (ADR-025)

`batches` is now `lots`, `stock` is `stock_levels`,
and `tracks_batches` on the variant is `tracks_lots`. The interface already
said "lot number" while the schema said batch, and `batch` is also what a bulk
import endpoint will be called — one word carrying two meanings in the same
codebase. `stock` was renamed at the same time because a row there is a balance
for one variant at one location in one lot, which the plural says and the mass
noun does not. Renamed before the stock service read any of them.

Everything above describing `batches`, `batch_id`, or `stock` refers to these
names; the reasoning is unchanged.
