---
status: accepted
date: 2026-09-23
areas: [stock]
---

# ADR-044 — Lot trace

## Context

Every movement records its lot, but answering "this lot is bad —
who has it?" meant crossing four or five screens by hand, and still missed
customers who received a batch *made from* the bad lot, since the
ingredient's own movements never name them.

## Decision — full genealogy, read from the ledger

One read follows a lot
both ways through runs, as far as the chain goes: up to every ingredient lot,
down to every batch, and from those to everyone who received any of them by
shipment or sample, with what came back. Runs are the joints — what a run
consumed is upstream of what it produced — so nothing new is recorded, and
there is no genealogy table to fall out of step with the movements.

## Decision — search by any part of a code, across products

A recall
arrives as a code read off a label, or the part of it people remember — a
batch number, a date — with no product attached, and the same code can exist
for two products; every match is shown with its SKU, codes starting with the
text first.

## Decision — search by the start of a code, across products

A recall
arrives as a code read off a label, with no product attached, and the same
code can exist for two products; every match is shown with its SKU.

## Performance

A recursive query steps from the lots already found, using
the `(organization_id, lot_id)` and `(organization_id, reference_type,
reference_id)` indexes, so its cost grows with the trace rather than the
ledger. A depth limit of ten and a path guard stop a bad record looping.

## Consequences

Deferred: exporting the recipient list for a recall
letter, and quantities per downstream batch proportioned from the ingredient.
