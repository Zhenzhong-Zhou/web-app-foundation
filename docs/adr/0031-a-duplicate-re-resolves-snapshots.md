---
status: accepted
date: 2026-09-15
---

# ADR-031 — A duplicate re-resolves snapshots; it never copies history forward

## Context

An order is raised wrong — wrong partner, wrong quantities, wrong
items — and has already been confirmed. Editing it rewrites what was agreed with
the supplier, and partial-line cancellation is still open, so there is no clean
way to amend part of it. The operation people actually want is: make a fresh one
like this, fix it, and cancel the old.

## Decision

`POST /v1/orders/:id/duplicate` returns a new `draft`, and what it
does with each field follows one rule — **a duplicate re-resolves snapshots from
their live source and never copies frozen ones forward.** A snapshot exists to
freeze what happened; a new order has not happened yet.

- Copied: `partner_id`, `notes`, and each line's `variant_id` and
  `quantity_ordered`.
- Re-resolved: `sku`, read from the variant again rather than copied from the
  old line. `ship_to_*`, re-snapshotted from `ship_to_address_id` if that
  address is still active, falling back to the partner's current default if it
  is not — and saying so in the dialog. Copying a dead address into a live order
  is exactly what the snapshot was never meant to enable.
- Reset: `status` to `draft`, every `quantity_fulfilled` to zero, `created_by`
  to the current actor, `expected_at` to null, and `reference` to null. The last
  matters most: a supplier's PO number belongs to the order it was issued
  against, and two orders claiming it is a reconciliation problem.
- Added: `duplicated_from_id`, a nullable self-reference, RESTRICT.
  **Decision — duplicate first, cancel last.** Duplicate, fix the draft, confirm
  it, then cancel the original. Cancel-first leaves nothing behind if the create
  fails, and this is the order people do it in anyway, so it is the dialog's flow
  rather than a note in a manual.

## Decision — one helper, three callers

The same operation makes a new BOM
version (`active` BOM copied to a draft at `version + 1`) and re-raises a
cancelled production run. Written three times it drifts three ways.

## Consequence

`duplicated_from_id` is the one part that cannot be backfilled.
`@Audited` records the create (ADR-018), but the payload is JSONB and searching
it is still an open decision, so "what replaced order X" is unanswerable from
the audit log — and "why was this cancelled, where did it go" are the two
questions asked about every cancelled order.

## Rejected: duplicating a partially received order

Re-ordering what already
arrived. Copying only the shortfall is a backorder, which means something
different, and one button with two behaviours depending on data is how a control
becomes untrustworthy. Open below.
