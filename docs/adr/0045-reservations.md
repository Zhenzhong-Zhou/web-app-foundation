---
status: accepted
date: 2026-09-23
---

# ADR-045 — Reservations: available to promise, computed rather than stored

## Context

Two confirmed sales could both count on the same fifty units, and
the second learned otherwise only when its shipment was refused. Nothing
stopped a production run, a hand-out or a one-off shipment from taking stock
a customer had already been promised.

## Decision — per product, across available locations

What can be promised
is stock at locations marked available (ADR-042), minus what open orders
hold. Not per location, because a sale has no location until it ships; not
per lot, because lots are still chosen at ship time, earliest expiry first
(ADR-039), and holding exact lots would stop that rotation.

## Decision — computed, never stored

An open confirmed sale line already
states what is owed: ordered minus shipped, unless closed short. Holds are
derived from those lines and from stock levels on every read, so there is no
reservation table to keep in step with them, and nothing to drift.
"Reserved on confirm, released on ship, close-short or cancel" is not code
anywhere — it is what those transitions already do to the line.

## Decision — first confirmed, first held

When demand exceeds stock, holds
are allocated in order of confirmation: each line holds what is left after
every earlier-confirmed line, up to what it still needs. `orders.confirmed_at`
records the order; existing confirmed orders take their creation time.
Without a priority, every order short of stock would block every other.

## Decision — confirm anyway when short

Confirming never refuses for lack of
stock. The line holds what exists, and the shortfall is shown as a backorder.
A real order is real whether or not the shelf is full today.

## Decision — enforced where stock leaves or is committed

Shipping against
an order may use its own hold and whatever is unheld, but not another order's.
A production release, a hand-out sample or a one-off shipment may use only
unheld stock, and so may a run's top-up at close, which takes from the shelf
as release does (#28). Adjustments and transfers are not checked: they record what
physically happened, and refusing them would put the ledger out of step with
the shelf. The check and the movement run under a per-product advisory lock,
taken in product order, so two transactions cannot both spend the same
unheld units.

## Performance

One product's holds are one query over its open sale lines
(`order_lines` by organization and variant, already indexed) with a window
sum for the priority, and one over its stock levels. Nothing scans the ledger.

## Consequences

Deferred: manual priority overrides, holds on specific lots
for customers who require them, reserving components for planned production
runs, and holds that expire.
