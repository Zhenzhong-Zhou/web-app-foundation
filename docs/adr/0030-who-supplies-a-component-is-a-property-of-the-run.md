---
status: accepted
date: 2026-09-15
---

# ADR-030 — Who supplies a component is a property of the run

## Context

Manufacturing arrives in three arrangements, and only one of them
is a production order.

We buy the ingredients and hold them. We send some of our own material to a
contract manufacturer who supplies the rest. Or the manufacturer buys
everything and hands over finished goods.

The third is not a run. Nothing of ours was consumed, no stock moved, there is
nothing to explode. It is a purchase order against that partner for the output
variant — identical to buying a finished bottle from a wholesaler — and forcing
it into a production order invents consumption that never happened. The BOM for
that product still exists as the recipe, for the label claim and for the day it
comes in-house. It simply does not fire.

The second is the case that decides the schema. It is free-issue: our stock is
consumed at somebody else's site alongside inputs we never owned.

## Decision — `supply_type` on the line, defaulted by the BOM, actual on the run

`stocked` means ours: we buy it, hold it, and the run writes a `consumption`
movement. `external` means whoever manufactures provides it: it never enters our
stock and the run writes no movement, but the line is still there, so the record
of the batch is complete and the arrangement is visible.

This cannot live on the variant. The same herb extract is bought by us this
quarter and by the co-packer next quarter because their price changed — who
supplies a component is a fact about a run, not about a thing. The BOM line
holds the usual case; the production order line holds what happened.

A check constraint carries the consequence: an external line's
`quantity_consumed` must stay zero. A non-zero value would mean a `consumption`
movement for material we never received, which is exactly how a ledger stops
balancing.

## Decision — `partner_id` on the production order, null meaning in-house

One nullable column separates outsourced from in-house, the way
`stock_movements` encodes direction by which location column is null. A `kind`
column alongside it would state the same fact twice and let the two disagree.

## Decision — the manufacturer's facility is a `site` in the locations tree, with `locations.partner_id` marking it as theirs

Issuing material is then an ordinary transfer, leaf to leaf, and consumption
happens when the run completes. This is what makes "how much of our material is
sitting at the co-packer" a query rather than a spreadsheet, which is money that
otherwise goes untracked.

ADR-028 warned against putting partner locations in the tree. That warning is
about *addresses* — a billing address becoming selectable in the move-stock
dialog, and four hundred units transferred into Acme's accounts payable
department. A co-packer's facility is genuinely somewhere our stock sits, which
is the definition of a location under ADR-024. The two cases share a word and
nothing else, and a check keeps `partner_id` to `site` rows so nobody hangs one
off a bin.

Nor is this the consignment question ADR-027 deferred. Ownership never changes:
free-issued material is ours the whole time it is there. Consignment is stock
that is physically elsewhere *and* owned by someone else, and it still waits.

## Decision — a manufacturer's lot code is text on the line, not a `lots` row

A supplement recall traces through every input, including the ones we did not
buy, so the code has to be recorded. A `lots` row for material we never held has
no stock balance anywhere, and creating one to hold a code puts phantom quantity
in the ledger. `external_lot_code` is free text that cannot be mistaken for
stock, constrained to external lines.

## Decision — a run's output lots are read from the ledger, not stored on it

A column for the lot produced assumes one lot per run, and a run splits: it
spans two days, QA holds part of it, some is packed to a different expiry. The
`production` movements already carry `lot_id` individually, and ADR-023 made the
ledger the record. A pointer alongside it can hold one value where the ledger
holds several, which makes it a cache that can only disagree. The lots for a run
are the movements referencing it.

## Consequence

Two tables, one column on `bom_lines`, one on `locations`.
`stock_movements.reason` already carried `production` and `consumption`
(ADR-023), and `reference_type` was built nullable for precisely this — a run
attaches a reference, it does not change the ledger.

Our books only ever hold half of an outsourced batch. That is correct, and it
means finished-good cost for those runs arrives inside the price on the
manufacturer's invoice rather than being rolled up from components. Cost rollup
is open, and this is one of the reasons it is not simple.
