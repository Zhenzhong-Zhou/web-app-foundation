---
status: accepted
date: 2026-09-22
---

# ADR-039 — Component lots: earliest expiry first, with a hand-picked override

## Context

ADR-032 settled which lot a run's *output* goes into and said
nothing about the lots its *components* come from. Release moved each stocked
component with no lot, and the stock service rightly refuses to move
lot-tracked stock without one. So any recipe containing a lot-tracked
component we stock ourselves could not be released at all, and close had the
same hole when consuming. More than an error: "which ingredient lots went into
finished lot 24-118?" is the recall question for a supplement, and it can only
be answered if release and close record the lots they move.

## Decision — the default is earliest expiry first (FEFO)

For each
lot-tracked stocked line, release takes stock from the source location's lots
in order of expiry, with lots that never expire last, then by when the lot was
first seen, then by id so equal dates always sort the same way. When one lot
is not enough it splits across several. Each lot is its own transfer, so the
ledger names every lot that went to the run. If the source cannot cover the
line, release fails with the component and the gap.

FEFO rather than FIFO because what goes wrong with ingredients is expiry, not
age: a lot received last week that expires first should leave first. It is
also what a warehouse does by hand, so the system's pick matches the shelf.

## Decision — a person can replace the pick for a line

The release dialog
previews the FEFO allocation (`GET /:id/issue-plan`) and lets someone choose
lots for a line instead: a damaged box, a lot on hold pending a test result, an
instruction to use up an open container. The chosen amounts must add up to
exactly what the line needs, checked in SQL. Lines nobody touched are
allocated by the server at release time against stock as it is then, not as
the preview saw it; the preview is advice, not a reservation.

## Decision — close consumes the lots the run was given

Consumption is
allocated FEFO among the lots that reached the run's location for this run,
top-ups included, not from whatever else shares the location. A top-up for
consumption over plan follows the same FEFO rule from the source. This keeps
the recall trail exact: every consumed unit traces back through a transfer to
the lot it came from. Close takes no hand-picked lots yet; the run's own lots
are the set, and within them the order rarely matters.

*Amended (#28):* a top-up continues the lots release issued from the same
source, picked by hand or not, earliest expiry first among them, and only
then opens the next to expire. A run given lot NEVER by hand at release is
topped up from NEVER, not from whatever expires soonest.

## Decision — all allocation arithmetic is in SQL

A running total over
numeric(18,4) is exactly what ADR-025 kept out of JavaScript. Stock rows are
locked in lot-id order before allocating: a window function cannot be combined
with FOR UPDATE, and two releases drawing on one shelf must not both plan to
take the same units. Sorted locking follows the same deadlock rule as
transfers.

## Consequences

The run page lists the lots per component: issued while the
run is open, consumed once it closes. Untracked components are unchanged, one
transfer and one consumption each. Revisit when a real case needs hand-picked
lots at close, or reservations that hold a preview's allocation until release.
