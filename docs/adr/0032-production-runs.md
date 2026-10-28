---
status: accepted
date: 2026-09-15
---

# ADR-032 — Production runs: partial output, actual consumption, lot identity

Extends ADR-030, which settled the arrangements a run can have. This settles
how one behaves once it starts.

## Context

A batch does not finish in a day. It yields 400 on Monday and 600
on Wednesday, it consumes more of an ingredient than the recipe planned, and
somebody has to say which lot the Wednesday output belongs to. Each of those
looked like a detail and each turned out to change an endpoint.

## Decision — output is a repeatable event; closing is explicit

`POST /:id/output` records a quantity and can happen many times, accumulating
`quantity_produced` while the run stays `released`. `POST /:id/close` is
separate and terminal.

A run does not finish by reaching a number. A batch yielding 980 against a
planned 1000 is finished, not 20 short, and a status machine that waits for the
planned quantity would leave every real run open forever. Someone says when it
is done.

## Decision — consumption is written once, at close, with actual quantities

The alternative is backflushing: consume proportionally on each output event,
using planned quantities. That writes a number nobody observed. If a line
planned 2400 g and the batch used 2415, backflush consumes 2400, leaves 15 g of
stock that is not on the shelf, and somebody finds it at the next count and
writes an adjustment. The variance becomes a phantom balance instead of a
recorded fact.

So close takes actual quantities per line. `quantity_planned` stays as planned
and `quantity_consumed` records what happened; the difference between two
columns on one row is the variance, computed rather than stored. Nothing needs
reconciling, because nothing ever claimed the plan was consumed.

## Decision — close tops up from source when WIP is short

Release issues planned quantities to the run's location. Consuming 2415 from a
location holding 2400 would hit
`stock_levels_quantity_non_negative_check`, so close first transfers the
shortfall from the source and then consumes — two movements in one
transaction, both describing something that actually happened, and the operator
types one number.

The opposite case is manual on purpose. Issue 2400, consume 2380, and 20 g sits
at the run's location afterwards; the system cannot know whether it went back
on the shelf, was binned, or is still in the mixer, so a person moves it with a
transfer or an `adjustment` carrying a reason.

## Decision — variance warns, it never blocks

Past a threshold, close flags the line, puts the figure in the audit payload,
and lets it through.

A cap that refuses to record a real event does not prevent the event. It makes
the operator type the planned number instead, and the ledger then holds a
fiction that looks clean — a visible anomaly traded for an invisible one. No
threshold survives contact either: a trial batch, a first run on new equipment,
and a recovered rework all blow through 30% legitimately, and the first person
to hit a hard cap on a real batch will find a way around it that is worse than
the variance.

The block that does belong is already there:
`stock_levels_quantity_non_negative_check` refuses consuming more than exists.
That is a physical impossibility rather than a statistical one, which is the
only kind of limit that cannot be wrong about a legitimate case.

No notifications table for this. The audit entry is the record and the close
response carries the figure, which is when someone can act on it. One thing
needing to notify somebody is a feature; two is a pattern, and that is the
trigger to build one.

## Decision — output joins the run's open lot by default

`POST /:id/output` takes an optional lot reference: omitted creates a lot,
given joins one. The default in the UI is the run's most recent lot, with a new
lot as an explicit action.

The reason is an asymmetry in how recalls fail. One physical batch split across
two lots means a recall of the second leaves the first — the same material — on
shelves. Two batches merged into one lot means a recall pulls both: over-broad,
wasteful, and nothing affected stays out there. Merging errs safe, splitting
errs unsafe, so the default is the one that over-recalls. An earlier draft of
this decision had it backwards.

It also matches the common case: a batch that takes three days is usually one
batch, and small operations label it as one.

The dropdown lists the lots this run produced, read from its `production`
movements, not every lot of that variant — a lot belongs to the run that made
it, and offering last month's would let someone file Wednesday's output under
it. `GET /:id` returns those lots for that reason.

## Decision — the picking source is on the line, not the run

`production_order_lines.source_location_id`, set at release, read back by close
when a top-up is needed.

A run's components do not come from one place: the blend is in the cold room,
the bottles are in the packaging aisle, the labels somewhere else again. One
column on the run would hold one value where reality holds several — the same
reason `output_lot_id` was dropped in ADR-030, and a mistake this decision
made once before being corrected. Per line there is genuinely one source, so
the column cannot lie.

Release therefore takes a source per line rather than one for the whole run,
which is what a picker does anyway; the UI defaults every line to one location
and lets the operator change the odd one. An external line has no source, and
a check keeps the column null for those.

## Decision — input-to-output lot linkage stays at run level

The ledger records which input lots a run consumed and which output lots it
produced. It does not record which fed which, because consumption happens once
at close while output may have happened several times.

That is sufficient wherever the run is the recall unit, which is the normal
case. The alternatives are consuming per output event — which asks the operator
for Monday's input quantities before Wednesday has happened — or a link table
between output and input lots. Both wait. The trigger is a regulator requiring
one finished lot to be traced to its specific inputs rather than to its batch.

## Consequence

No schema change beyond what ADR-030 already specified.
Dropping `output_lot_id` is what makes several output lots per run expressible
at all; each `production` movement carries its own `lot_id`, so one lot and
several are the same table.
