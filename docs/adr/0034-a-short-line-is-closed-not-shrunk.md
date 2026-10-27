---
status: accepted
date: 2026-09-16
---

# ADR-034 — A short line is closed, not shrunk

**Context.** Order 100, receive 40, supplier says the rest is discontinued. The
line is not complete, the order is not received, and nothing lets anyone say
"this is as done as it gets". ADR-027 deferred this as partial-line
cancellation, needing a reason and a decision about what a line means once
fulfilment has started.

The workaround was marking the whole order received, which is honest at small
scale — a person deciding an order is done is ADR-027's own mechanism — but it
records nothing about which line fell short or why.

**Decision — a flag on the line, and the quantities stay true.**
`is_closed_short` with a required `closed_reason`. `quantity_ordered` remains
100 and `quantity_fulfilled` remains 40.

Reducing the ordered quantity to 40 is the shortcut, and it destroys the
variance: nobody can afterwards tell a short shipment from an accurate one, or
report on which suppliers under-deliver. Production keeps `quantity_planned`
beside `quantity_consumed` for exactly this reason (ADR-032), and an order line
is the same shape.

This is what SAP calls the delivery completed indicator and what Oracle and
NetSuite call closing a line, which is some evidence the shape survives
contact.

**Decision — completeness is derived, and the order's status is not.**
`is_complete` becomes `fulfilled >= ordered or is_closed_short`, and
`fully_received` follows. `quantity_outstanding` goes to zero on a closed line,
because outstanding means still expected and nothing is.

The order's own status still moves by a person marking it received (ADR-027).
Deriving it from the lines would make a document close itself, which is the
thing that ADR rejected — but with every line resolved, that decision is now an
easy one rather than a judgement about a half-finished order.

**Decision — closing is allowed with nothing received, which settles the rest
of the deferral.** A line where nothing arrived and never will is the same
operation with `quantity_fulfilled = 0`. Cancelling a whole line and cancelling
its remainder differ only in the number, and giving them separate mechanisms
would mean two ways to record one fact.

That is also why ADR-033 refuses to *remove* a line from a confirmed order:
this is what removal was standing in for, and it keeps the row and the reason
instead of deleting both.

**Decision — reversible while the order is open.** A supplier finding stock
after all is ordinary. Closing writes no movement and changes no quantity, so
reopening costs nothing and the absence of it would mean a database edit the
first time somebody mis-clicks.

**Consequence.** Receiving against a closed line is refused — reopen first, so
the reversal is deliberate and audited rather than implied by a delivery.
