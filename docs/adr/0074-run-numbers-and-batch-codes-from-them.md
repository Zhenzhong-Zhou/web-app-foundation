---
status: deferred
date: 2026-10-17
areas: [numbering, production-orders]
---

# ADR-074 — Run numbers, and batch codes from them (deferred)

## Status

Decided, not built. It waits for its trigger, at the end;
nothing in the code changes until then.

## Context

A run has no number. Its `id` is a UUIDv7, and its
`reference` is typed, optional and not unique ("a batch number or the
maker's works order"); a run without one is titled by its planned
quantity. The code of the batch it makes, the lot, is typed too, at
Record output. In the demo both are typed as the same text,
`FOC-2609-01`: in a GMP batch record the batch number and the lot number
are usually one identifier. Two *Open decisions* entries asked for this,
production order numbering and generated lot codes, and said to answer
both at once. Their forcing function, a production module, has existed
since ADR-032, and ADR-073 builds the series a run's number needs.

## Decision — a sixth series

Production runs join ADR-073's series:
`B-` by default, six digits and no reset, so `B-000124`. A run takes its
number when it is created, its period from the day it was created in the
organization's zone, as an order does (ADR-071, amended). Runs are
cancelled, never deleted, so a cancelled run keeps its number. The
migration numbers existing runs oldest first, per organization, and the
series carries on after them. Every ADR-073 rule applies: the prefix,
tokens, resets, the next number and both refusals, with runs among the
documents one number names.

## Decision — the number names the run

It heads the run's page and
leads the runs list, the lookup (its prefix ranked as ADR-073's are),
Home's recently opened, the lot trace and the runs CSV. `reference`
stays, optional, for the co-packer's works order, and is searched beside
it.

## Decision — a new batch's code starts as the run's number

- At Record output, "Start a new batch" fills the code with the run's
  number. A second new batch from the same run gets `-02`, then `-03`.
- The code stays editable: a co-packer's own lot code, or a business's
  own scheme, is typed over it. A suggestion the item already carries
  (lots are unique per item) moves on to the next suffix.
- The code is a suggestion until saved. Two people recording at once may
  see the same one, and the unique index refuses the second.
- Batch codes are not gapless: a code typed over leaves nothing behind.
- Unchanged: adding output to an existing batch needs no code, and a lot
  received from a supplier stays typed, since its code is printed on the
  box and is not ours to invent.

## Considered and not done

- **A counter per item, with the product in the code,** as `FOC-2609-01`
  reads: it needs a product token and a counter keyed by item, not by
  organization. The run's number gives every batch a unique code without
  either.
- **The number at release rather than creation:** a planned run needs a
  name to be talked about, as a draft order does.
- **Reserving a code when the dialog opens:** codes nobody saved would be
  held for nothing.

## Consequences, once built

- A migration: `production_orders.number`, unique per organization,
  filled for existing runs; a sixth `document_numbering` row for every
  organization; `production_order` joins `DocumentType`.
- The run's page, the runs list, the lookup, Home, the trace and the CSV
  show the number; Record output fills the batch code; the Numbering
  section gains a row.
- Designed on the canvas before it is built, and a manual checks section.
- The number-taken check's list of numbered tables in
  `numbering.service.ts` is raw SQL: `production_orders` joins it by hand,
  or the check stops seeing run numbers without failing to compile
  (ADR-073's review).

## Deferred

A `{PRODUCT}` token, a short product code in a generated
batch code. Trigger: the first organization wanting the product in its
batch codes.

## Trigger

The next production work, or the first organization asking
for run numbers or generated batch codes, whichever comes first.
