---
status: accepted
date: 2026-09-15
---

# ADR-029 — A bill of materials is a header plus lines, and nesting is data

## Context

Production consumes components to produce something else: one
bottle of Vitamin D3 60ct is 60 capsules, one bottle, one cap, one label. Open
decisions carried this as a join table — `(parent_variant_id,
component_variant_id, quantity)` — with two questions named as expensive to
retrofit: whether a BOM is **versioned**, since a recipe changes and a run from
last year consumed the old one, and whether it **nests**, since a sub-assembly
is itself made of components. "Assuming flat and unversioned is the cheap start
and the costly mistake" was the note.

Both questions turn out to be answerable without knowing this organization's
answer, which matters because this foundation is meant to be re-pointed at
another industry (ADR-001's premise) and the recipes there are not yet imagined.

## Decision — components point at `product_variants`, the same table outputs do

Nesting then costs nothing and needs no schema support. A blend that feeds three
finished SKUs is a variant with its own BOM; a component that is simply bought
is a variant without one. Whether this organization nests is a fact about its
rows, and an explosion is a `WITH RECURSIVE` query written the day someone asks,
against a table that already holds the tree.

The version that costs a migration is a separate `raw_materials` or `components`
table, on the reasoning that raw materials "are not products". A sub-assembly is
both, so it belongs in both, and the day something bought becomes something
made, its history is in the wrong one. This is ADR-023's granularity test
passing again: the BOM needs no change to products or variants.

## Decision — the output is a variant, not a product

Stock, lots, and movements all sit at the variant (ADR-023). A BOM naming a
product could not tell a production order what to increment. 60ct and 120ct are
different recipes in any case.

## Decision — a header table, and versioning by snapshot at consumption

```text
boms       id, organization_id, output_variant_id, output_quantity,
           version, status, notes
bom_lines  id, organization_id, bom_id, component_variant_id,
           quantity, supply_type, notes
```

The header is what a bare join table has nowhere to put: a version, a status, a
yield. Splitting it out after the table holds data is the retrofit the open
decision warned about.

Versioning is then mostly not the header's job. A production order copies its
lines from the BOM at release and reads its own copy forever after — the same
move 0012 made for the order ship-to snapshot, for the same reason. A run from
last year keeps showing what it actually consumed no matter what happened to the
recipe since. Given that, `version` is an integer for people to read and
`status` is what stops a draft being released against; neither is load-bearing
for history. Effective-date ranges were considered and rejected as two columns
answering a question nobody asks ("which recipe was current on 3 March"), and
they remain two nullable columns whenever someone does.

`output_quantity` is yield, not per-unit. A recipe stated per single unit forces
a division at data entry, someone rounds 2.4 / 1000 to four places, and the
rounding reappears as stock drift. Batch quantities are also what people say out
loud, which is what they will type.

At most one `active` BOM per output variant, enforced by a partial unique index
rather than in the service — the reasoning `addresses.is_default` got in
ADR-028. A second active row is writable, the picker chooses between them
arbitrarily, and the bug is invisible until a batch is made wrong.

## Decision — a `product_licences` registry, referenced from the BOM header

A regulated formulation is made under a registration, and which one a given lot
was made under is history — the one kind of fact that cannot be backfilled. In
Canada the alignment is exact: under the NHP Regulations a change to the
quantity of a medicinal ingredient per dosage unit requires a new product
licence application and, if approved, a new NPN, which is the same event that
produces a new BOM version. Runs point at a `bom_id`, so the trace from lot to
licence already exists.

A table, not a column, because one licence covers several recipes. A licence
attaches to a formulation, dosage form, and recommended use — pack size is none
of those, so 60ct and 120ct of the same product are two BOMs under one number.
A column would copy that number into both and leave the next amendment to
update each, which is the kind of maintenance that is skipped once and wrong
thereafter. A licence is an entity with its own lifecycle; the first version of
this decision made it a string, and the flaw appeared on the first product with
two pack sizes.

The test for what belongs in the registry is whether the registration changes
when the formulation changes — a cosmetic notification number, a DIN, an FCC ID
whose filing is invalidated by a design change, a furniture flammability
certification all pass. A site licence, a food safety permit, and an export
permit all fail: they are properties of a facility or a shipment and belong on
the location, the partner, or the order.

`authority` is free text and `number` is never parsed, because the point is that
schemes differ between markets. The table is identity only — amendment history,
renewals, submission tracking, label versions, and certificates of analysis are
the compliance domain, still open below, and this is what they would hang off
rather than a first instalment of them.

Barcodes are a different axis and are not this. A GTIN identifies a sellable
unit, so it belongs on the variant, two pack sizes have two of them, and two
products sharing one is a GS1 violation rather than a shape worth modelling.

## An empty registry is the expected case in most industries, not a fault

Grocery licenses the facility rather than the product, clothing licenses almost
nothing, furniture mostly self-certifies. Those tenants leave this table with no
rows and every `licence_id` null, which is what `lots` already does for an
organization that tracks nothing by lot. The portability test was never that
every industry uses every table — it is that no table blocks an industry and
nothing needs renaming. An `npn_registrations` table with monograph IDs and
declared ingredients would have failed that; free-text `authority` is what
avoids it.

The limit worth knowing: this assumes a certification attaches to a
*formulation*. Some attach to a *batch* — kosher and halal supervision are per
run, and organic certification often is too. That is a lot-level or run-level
record and a different table when it arrives, not a widening of this one. It is
the case most likely to surface first in food.

## Decision — no unit column on `bom_lines`

A line's quantity is in the component variant's own `unit_of_measure`. A second
unit on the line invites grams against stock kept in kilograms, and nothing
converts yet — unit-of-measure conversion is still open (ADR-023). The
production order snapshots the unit because a run is a document; a recipe is a
live definition and reads the variant.

## Decision — a cycle guard in the service, not a constraint

A BOM whose components reach its own output through any path is an infinite loop
in the exploder. A check constraint cannot see across tables, so this is a
recursive query at write time, in the same class as the `tracks_lots` invariant
ADR-023 put in the service for the same reason.

## Consequence

Two tables, both of which a future industry can use unchanged.
The naming carries that: `boms` not `formulas` or `recipes`, `supply_type`
values `stocked` and `external` not `we_buy` and `copacker_buys`,
`output_variant_id` not `finished_product_id`. Industry lives in rows, the way
`locations.type` holds five generic words rather than warehouse vocabulary
(ADR-024). A clothing tenant free-issuing fabric to a cut-and-sew factory writes
the same rows as a supplement brand.

What a different industry will want is line *attributes* — a size and colour
matrix for apparel, overage and allergen flags for food, revision and ECO
numbers for engineering. Every one of those is a column added to `bom_lines`, or
its own table keyed on it. None of them changes the two tables above, which is
the test this decision was built to pass.

## Rejected: the bare join table

Faster, and it is the version that has to be
split the first time a recipe changes.

## Rejected: assuming flat

Not because nesting was needed, but because
avoiding it required actively choosing a separate component table. Pointing at
`product_variants` is both the simpler choice and the one that leaves the door
open.
