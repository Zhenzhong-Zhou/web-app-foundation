---
status: accepted
date: 2026-09-08
areas: [stock, database]
---

# ADR-025 — Quantity is decimal, and the stock cache is the lock

## Context

ADR-023 settled that quantity is a ledger and `stock_levels` is a
derived cache, but not what type a quantity is, and not how two concurrent
movements against the same shelf are serialised. Both have to be answered before
the first movement is written, because the ledger is append-only: a column type
changed later is a data migration across rows we have promised not to rewrite.

## Decision — `numeric(18, 4)`, never a float, never an integer

Inventory is not only countable things. Raw material is weighed, packaging film
is measured in metres, and a production consumption of 2.75 kg is not a
rounding error. An integer column forces every such variant into a fictional
base unit, and the fiction leaks into every screen.

Four decimal places covers kilograms to grams and litres to millilitres, which
is the resolution a warehouse scale actually reports. `numeric`, not `real` or
`double precision`: binary floating point cannot represent 0.1, and a ledger
whose sum drifts from its cache by 0.0000001 is a ledger nobody trusts.

## All arithmetic happens in Postgres

node-postgres returns `numeric` as a
string precisely so it does not pass through a JS double, and that string is
what the API returns. The client formats it; it does not add it up. A `Number()`
anywhere on this path reintroduces exactly the problem the column type avoids.

Nothing constrains a discrete good to whole units — 0.5 of a paperclip is
storable. Enforcing that needs a per-variant rule tied to `unit_of_measure`,
which is the same information unit-of-measure conversion will need, so it waits
for that rather than being guessed at now. Recorded in open decisions.

## Decision — the `stock_levels` row is the concurrency lock, and `CHECK (quantity >= 0)` is the backstop

Two shipments of 8 against a balance of 10, arriving together: both read 10,
both pass a service-level check, both write. The ledger records both truthfully
and the shelf is at −6. Append-only does not prevent this; it only documents it
afterwards.

So the movement transaction takes the `stock_levels` row first —
`INSERT … ON CONFLICT (variant_id, location_id, lot_id) DO UPDATE` — which
acquires a row lock even on the first movement for a shelf that has none yet.
The second transaction blocks until the first commits, then reads the true
balance.

The check constraint is not redundant with that. Locking is a claim about the
service being correct; the constraint is enforced whatever the service believes,
and turns a silent negative balance into an aborted transaction. Same reasoning
as the closed-set constraints on `products.type` and `auth_tokens.purpose`.

## Decision — cross-table invariants are enforced in the service and asserted in e2e, not by trigger

Two rules cannot be expressed as a check constraint, because a constraint cannot
see another table: `lot_id` is non-null exactly when the variant has
`tracks_lots` (ADR-023), and a movement's locations must be leaves (ADR-024).
ADR-023 already chose service-level enforcement for the first. The second gets
the same treatment for consistency — one mechanism for this class of rule, so
there is one place to look when one is violated.

A trigger would be airtight and is rejected for the usual reason: business logic
in two languages, invisible to the test suite that reads TypeScript, and
discovered by whoever is debugging at the time.

## Consequence

Every stock change is one transaction containing a
`stock_levels` upsert and a `stock_movements` insert, in that order. Reads of
current stock hit the cache and never aggregate the ledger. The reconciliation
assertion from ADR-023 — sum of movements equals the stock row — is what proves
the two have not drifted, and it belongs in e2e rather than in a periodic job
while the data is small enough to check on every run.
