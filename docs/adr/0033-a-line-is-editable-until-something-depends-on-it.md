---
status: accepted
date: 2026-09-16
---

# ADR-033 — A line is editable until something depends on it

## Context

`UpdateOrderDto` has said since it was written that "lines are
edited through their own routes". Those routes were never built, so a draft
with a wrong quantity has one remedy: cancel it and raise another. Duplicating
does not help — it copies the wrong quantity.

ADR-027 deferred **partial-line cancellation**, which is a different question:
what a line means once fulfilment has started, and what reason it needs. That
deferral was read as covering line editing generally. It does not.

## Decision — the same rule that froze the order reference

What other records
depend on becomes immutable; what nothing depends on stays editable.

```text
add a line       draft only
change quantity  draft or confirmed, refused once anything is received
remove a line    draft only, and never the last one
```

A draft line is not a record of anything that happened. No movement references
it, no snapshot copies it, and the order has not been sent. Correcting one is
the same act as correcting a draft BOM's lines (ADR-029), and forcing a
cancelled document for a typo is the outcome worth avoiding.

A confirmed order is different but not frozen. The supplier saying they can
only do 800 is an ordinary amendment to a live agreement, and the audit entry
records who changed it. Removing a line is where this stops: deleting an item
from an order somebody has already been sent is not a correction, it is a
partial cancellation, and that is ADR-027's open question — it needs a reason,
and possibly a status of its own.

## Decision — anything received freezes the line

`quantity_fulfilled > 0`
refuses both edit and removal, whatever the order's status. Below what has
arrived is nonsense; above it is a renegotiation that should be visible as one.
The `order_lines_fulfilled_within_ordered_check` constraint would catch the
first case anyway, but as a constraint violation rather than an explanation.

## Decision — the last line cannot be removed

An order with no lines is a
document that orders nothing, which is why `create` writes the header and its
lines in one transaction (ADR-027). Removing the last line would produce by
deletion the state that cannot be produced by creation. Cancel the order
instead.

## Consequence

No schema change. `variant_id` is not editable for the reason
`UpdateBomLineDto` gives: changing which item a line points at is not an edit
but a different line, and it would have to re-snapshot the SKU and re-check the
unique constraint. Remove and add, both audited, so the trail says what
happened rather than showing one line that quietly became another.

## Rejected: editing a received line with a reason

That is partial-line
cancellation with a different name, and taking it here would settle ADR-027's
open question by accident rather than by deciding it.
