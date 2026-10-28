---
status: accepted
date: 2026-09-23
---

# ADR-042 — Samples, and stock that is not for sending

## Context

"Sample" covers four different situations, and treating them as
one either invents a flow nobody needs or hides stock from a recall. The
`sample` movement reason existed with nothing using it, and
`locations.is_available` was recorded but never enforced.

## Decision — a posted sample is a sale

Sent to a customer or prospect
with an address, it ships, prints a packing slip and is traced exactly like a
sale, so it is one: an order with `is_sample`, usually priced at zero. The
flag exists only so reports can tell samples from revenue. A check keeps it
off purchases.

## Decision — a hand-out is a `sample` movement

A trade show, a visitor, a
bottle opened for a test: stock leaves with no paperwork. Sent from the
inventory row like Ship out, with an optional recipient. The recipient is a
partner, checked against the organization and stored as a `partner`
reference, because a lot handed out free is exactly what a recall must still
find.

## Decision — references are the server's to set

The public movement
endpoint no longer accepts `referenceType` or `referenceId`. Shipments, runs
and orders read "every movement referencing me" as fact, and a client naming
a reference could attach a movement to any document, another tenant's
included. The client states intent — a recipient — and the server records
it. The columns stay, so a new kind of reference still needs no migration.

## Decision — unavailable locations hold stock that is not for sending

`is_available` is now enforced: a location marked unavailable can hold stock
and move it, but cannot be the source of a shipment, a sample, or a
production issue. Consumption is not refused, because a run's own location is
often marked unavailable precisely as work in progress. Retained samples —
which GMP requires for supplements — are then just stock in such a bin,
recorded by an ordinary move, and never counted as gone.

## Decision — anything not in inventory stays out of it

A prototype or a
brochure that was never received has no stock to move. Recording it as
movement would put a fiction in the ledger; it belongs in a partner's notes,
or in the catalogue once it is stocked for real.

## Consequences

Nothing here is specific to supplements: showroom samples,
press samples and archive rails in clothing map onto the same four cases
unchanged, and only location names differ. Deferred: filtering samples out
of sales reports (the flag is there to do it), and a returns flow for the
existing `return` reason.
