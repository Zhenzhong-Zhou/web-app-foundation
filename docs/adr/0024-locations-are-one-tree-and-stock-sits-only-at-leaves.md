---
status: accepted
date: 2026-09-04
---

# ADR-024 — Locations are one tree, and stock sits only at leaves

**Context.** Stock has to be somewhere: a warehouse, a bin on a shelf, a
quarantine area, a supply cupboard. Layouts differ — one operation has a single
room, another has aisles and bins across two sites — and defective or
in-process units need a home that is still countable.

**Decision — one `locations` table, self-referencing.**

```text
locations  id, organization_id, name, code, type, parent_id,
           is_available, is_active
```

Warehouses, zones, aisles, shelves, and bins all need a name, a parent, and a
status, so they are one table with a `type`. Separate tables would force
`stock.location_id` to reference one of several, which is the problem ADR-023
avoided by putting stock only on variants.

`type` is a label, not a rule. It does not enforce depth, and it does not
determine leaf-ness. `parent_id` null means top level, and that single nullable
column is the entire hierarchy.

`ON DELETE RESTRICT` on the parent: removing a warehouse must not silently take
every bin under it, along with whatever those bins held.

**Decision — stock references only a location with no children.**

40 units "in Warehouse A" and 10 "in Bin 1" is a system that cannot say whether
the warehouse holds 40 or 50, and every report will answer differently. One
place a quantity lives; a parent's total is the sum of its descendants.

Leaf is computed, not declared, and that is what makes it workable at any
scale: an operation with one room has one location, which is itself a leaf and
holds stock directly. When bins are added later it gains children and stops
being a leaf — at which point its stock must move down, and a location holding
stock may not gain a child until it does.

Enforced in the service with e2e coverage, not by a trigger. A check constraint
cannot see other rows, and a trigger would be stronger but would hide the rule
in SQL where nobody reviewing a service will look for it. ADR-023's batch
invariant is enforced the same way, and two cross-table rules enforced two
different ways is worse than either.

**Decision — quarantine, returns, and work in progress are locations, not a
status on the stock row.**

A status does not say where the units physically are, and changing one leaves
no trace. Moving stock to Quarantine is a movement: an actor, a time, a reason,
and a place an auditor can go and look. Warehouse totals include them, because
they are on the shelf; availability filters on `is_available`.

Named `is_available` rather than `is_sellable`, because raw materials are
consumed rather than sold.

**Consequence.** Rollups are a recursive CTE over a table of tens or hundreds
of rows — irrelevant at any scale this will see. If it ever is not, the answer
is a materialized path column making "everything under Warehouse A" a prefix
match on an index, which is an optimisation to measure rather than assume.

**Known gap: the leaf check is not atomic.** `LocationsService` reads whether a
parent holds stock, then inserts the child, with nothing holding a lock in
between. Two concurrent requests can each see a stock-free shelf and both add a
bin, or a receipt can land on the shelf between the check and the insert —
leaving stock at a branch, which is precisely what this ADR forbids.

This is the same race ADR-025 closes for movements by locking the
`stock_levels` row, and the fix here is the same shape: take that row, or an
advisory lock keyed on the parent, inside the create transaction. Left open
because adding a child location is rare, done by one person at a time, and the
recovery is a movement rather than data loss. The trigger to fix it is
concurrent location editing by more than one member, or the first time it
happens.

**Deferred, and recorded as open decisions.** Pallets and license plating,
because whether a pallet is a label or a container that moves as a unit depends
on how a given warehouse works and both are real. Capacity, because enforcing
it needs a unit and a rule about whether a pallet counts as one or as its
contents. Addresses, which arrive with customers and suppliers.

**Amendment.** `warehouse` is now `site`. The type enum answers where a location
sits in the tree, and `warehouse` was quietly answering what kind of facility it
is as well — which left an office with a supply cupboard, or a shop with a back
room, with no correct value. `site` covers a building or address of any kind;
what happens there is a separate question and stays unasked until something
forces it.
