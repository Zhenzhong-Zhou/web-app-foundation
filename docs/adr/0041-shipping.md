---
status: accepted
date: 2026-09-23
---

# ADR-041 — Shipping: a shipment is a document, and stock leaves by lot

## Context

A sale could be raised and confirmed, but nothing fulfilled it:
receiving refused a sale, and there was no outbound counterpart. The order
status that ended a purchase, `received`, was the wrong word for a sale, and
every rule that read it would have had to learn a second one.

## Decision — one lifecycle, labelled by direction

`received` became
`fulfilled`: every line received or shipped, or closed short, which remains a
person's decision rather than a calculation. The client reads it as
"Received" on a purchase and "Shipped" on a sale. One stored value means one
rule for what can still change; a separate `shipped` status would have meant
`status in ('received', 'shipped')` everywhere, and a forgotten one breaking
the other direction silently. Migrated with the constraint dropped, rows
updated, and the constraint re-added.

## Decision — a shipment is its own record

Receiving stays per line, because
a supplier's delivery is checked in line by line. Outbound goods travel
together — several lines in one box, one date, one tracking number — so a
`shipments` row is the header (order, source, carrier, tracking, note, who),
and what it carried is the `shipment` movements that reference it, one per
lot per line. The ledger stays the single record of stock leaving (ADR-023);
the shipment is only what those movements hang from. Immutable apart from a
void (below), so no `updated_at`.

## Decision — all or nothing, in one transaction

If any line cannot be
covered, nothing moves and nothing is recorded as sent. Half a box recorded
as shipped is the record a customer disputes. Lines are processed in variant
order, so two shipments touching the same products take row locks in one
global order and cannot deadlock — the rule transfers already follow.

## Decision — partial by default

A shipment carries any subset of the
outstanding lines in any quantities; what is not sent stays outstanding on
the line (a backorder) for a later shipment, or is closed short. Over-shipping
is refused by the existing `order_lines_fulfilled_within_ordered_check`.

## Decision — lots leave by the ADR-039 rule

Earliest expiry first; a lot
with no expiry sorts after every dated one and then by arrival, so
non-perishable stock leaves oldest first (FIFO) without a setting. A person
can replace the pick for a line; the amounts must add up, checked in SQL.
The allocation moved to the stock module, since production and shipping now
share it. A preview (`POST …/shipments/preview`, which writes nothing and is
listed as such in audit coverage) shows the pick first; ship recomputes
against the shelf as it is then. Every shipment movement names its lot, so
"which customers received lot X" is read straight from the ledger — the
forward half of the recall that ADR-039 answered backwards.

## Decision — `orders.ship` is its own permission

It is for the reason
`orders.receive` is: the person packing boxes is not usually the person
raising orders.

## Consequences

Two indexes on `stock_movements` — by lot, and by
reference type and id — keep recall and per-document reads fast as the
ledger grows; the second also serves the production run page. Deferred, each
additive: a printable packing slip, carrier integration, a
minimum-remaining-shelf-life rule per customer, idempotency keys on the ship
endpoint, reservations, a samples screen for the existing `sample` reason,
and a returns flow for the existing `return` reason.

## Amendment (v0.3) — voiding a shipment recorded too early

A shipment
can be voided while its order is still confirmed and nothing from it
has come back. Nothing is deleted: each shipment movement gets an adjustment
back into the bin it left, referencing the same shipment and carrying the reason;
the lines' fulfilled quantities drop, which returns the order's holds;
and the shipment is marked voided and kept. Lot trace and returns ignore
voided shipments, because nothing left. A shipment that has had anything
returned did leave, and is corrected with a return instead.
