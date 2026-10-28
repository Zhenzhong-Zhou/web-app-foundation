---
status: accepted
date: 2026-09-26
amended-by: [ADR-073]
---

# ADR-047 — Return authorizations, and credit notes for what comes back

## Context

A return is recorded when the goods arrive (ADR-043): a header
and `return` movements, with nothing before it and nothing after it. There is
no step where a customer asks, someone decides, and the goods are expected;
and nothing turns goods coming back into money going back. ADR-043 deferred
the first, because the approval is where credit, replacement or nothing is
decided, and that needed credit notes to exist. ADR-046 built them, but so
far only a void creates one, and it always reverses a whole invoice.

The return policy itself is not decided, and will differ by business: some
credit in full on arrival, some only after inspection, some withhold a
restocking fee. So this ADR decides the records and the limits, and leaves
the policy to the person — what is credited, and at what value, is chosen
when crediting, within caps that make a double credit impossible.

## Decision — an RMA is its own document

A return authorization (RMA,
`return_authorizations`) is raised against a sale when a customer asks to
send something back. It has a number from its own series (`RMA-000001`, a
third type in `document_sequences`), a reason, optionally the invoice the
customer is returning against, and lines naming the order lines, how many
of each may come back, and what happens to them.

The invoice is optional because a customer does not always quote one, and
recorded when they do, because they usually do — "I'm returning part of
INV-000042" — and it is then the obvious invoice to credit.

A flag on the existing return was the alternative, and it is rejected
because the two records describe different moments. The authorization is a
promise made before anything moves — often days before, sometimes for goods
that never come — and the return is what arrived at the dock. One RMA is
often received in more than one box.

## Decision — authorized when raised; no request step

There is no customer
portal, so a request always reaches the business as a call or an email, and
the person entering it is the person deciding. An RMA is created authorized.
A request that is refused is not recorded as an RMA; the reason belongs in
the conversation with the customer, not in a document that authorizes
nothing. A requested-then-approved lifecycle is deferred with any portal
that would give it a second actor.

## Decision — a resolution per line

Each RMA line is one of:

- **credit** — money back for what the customer returns;
- **replace** — the same goods sent again, at no charge;
- **none** — goods back for inspection or disposal, nothing owed either way.

Per line because one box often holds both: a damaged unit credited and a
wrong item replaced. One resolution per RMA was the alternative, and it
would make that box two RMAs for no reason the customer would recognise.
ERP return orders decide per item for the same reason.

## Decision — goods expected, or not

An RMA says whether goods are coming
back. Usually they are. Sometimes the customer is told to destroy a damaged
unit and is credited anyway, and waiting for a box that will never arrive
would block the credit forever.

## Decision — a return may name an RMA, and is held to it

`order_returns.return_authorization_id`, nullable. A return against an RMA
can bring back at most what the RMA authorized for each line, less what
earlier returns against it brought, and only for its lines — refused with
409 otherwise, before any movement. The ADR-043 rules still apply on top:
only what shipped on the order, never more of a lot than went.

A return with no RMA is still recorded. Goods on the dock are a fact, and a
ledger that refuses to record them is a ledger that is wrong. Such a return
earns no credit on its own; if one is owed, an RMA is raised afterwards and
the return is linked to it. That link is the one change a return ever sees,
from empty to set, once — the return stays otherwise immutable, as ADR-043
made it.

## Decision — lifecycle: open, closed, cancelled

An RMA is open until
someone closes it — goods received and resolved, or the customer never sent
the rest. It can be cancelled while nothing has been received against it
and no credit issued; after that it is closed, not cancelled, for the
reason a shipped order cannot be cancelled (ADR-023). Closing is a person's
decision, as closing an order is (ADR-027); arithmetic does not do it.

## Decision — a credit note credits one invoice

Every credit note is
against one invoice, as ADR-046's schema already says, and a customer
reconciling reads each against the invoice it names. A return that crosses
two invoices is two credit notes.

For an RMA the invoice defaults to the one the RMA names; failing that, to
the invoice of the shipment that carried a returned lot, when there is
exactly one; failing that, the person picks from the invoices that billed
the RMA's order lines. Choosing automatically for untracked goods split
across invoices was the alternative, and it is rejected: there is no right
answer there, only a convention, and a wrong convention silently credits
the wrong document.

## Decision — what is credited is decided when crediting

Inspection is
where most return policies are applied, so the quantity and value are the
person's, not the software's, within limits:

- **Quantity** defaults to what came back and has not been credited — or,
  when no goods are expected, to what was authorized. It can be lowered:
  two of five came back used, and are credited as three. It cannot exceed
  what the RMA authorized for a credit line, less what earlier credits
  against that RMA line took.
- **Unit price** defaults to the invoice line's and can be lowered, never
  raised. One rule covers the common cases: a restocking fee is five units
  at 85% of the price; goodwill is one unit at a reduced price; a price
  correction is every unit billed at the difference.

The price never rises above the invoice's because a credit that pays back
more than was charged is not a credit, and would be the easiest way to get
money out of the business with a plausible document.

## Decision — capped by value, per invoice line

The net amounts of all
credit notes against an invoice line can never exceed that line's net.
Checked in SQL before any write, summed over `credit_note_lines` for that
invoice line — the index ADR-046 put there — and refused with 409 beyond it.

By value rather than by quantity, because credits at a lowered price break
a quantity cap: a price correction on all six units, then a return of two,
would count eight of six while crediting less than was billed. The value
cap is what makes any mix of corrections, fees and returns safe, and it is
what stops a unit being credited twice even across two RMAs.

## Decision — the invoice's rates, never today's

A credit line's net is
quantity × its unit price, rounded to minor units. Tax is summed per
component and rounded once per credit note, the invoice rule, using the
rates the invoice was issued with — never the tax code's current rates,
which may have changed by law since.

That needs something the schema does not yet hold: which components applied
to each invoice line at issue. `invoice_taxes` sums them per invoice, and
`invoice_lines.tax_code_name` keeps only the code's name. So issuing also
writes `invoice_line_taxes` — per line, each component's name and rate —
from the same calculation. Invoices already issued are backfilled from
their lines' tax codes in the migration; there are none in production.

Per component, a credit note's tax is capped at what the invoice charged
less what earlier credit notes took. Partial credits each round on their
own, and without the cap three of them could total a cent more than the
invoice ever charged.

## Decision — credits without goods need no RMA

A price correction,
goodwill, and a debt that will not be collected move no goods, so there is
nothing to authorize: the credit route takes an invoice, lines, quantities,
unit prices and a reason, with no RMA. The same caps apply. This replaces
"void and invoice again" as the way to fix a wrong price, though that still
works.

The uncollectable stopgap from ADR-046 is the case where every line is
credited at its full remaining value with the reason "Uncollectable". The
invoice stays issued and its shipment stays billed, because the goods did
leave; only the money is written off. It stands until payments exist.

## Decision — previewed, then issued; still no draft

ADR-046 created
credit notes issued, and that stays. A partial credit has figures worth
checking, so the server offers a preview — the same calculation, returned
and not stored — and the dialog shows it before anyone confirms. What the
preview showed is what issuing stores, the rule the invoice's draft preview
follows. A draft credit note would add a status, relaxed checks and a
delete path for a document checked in one dialog.

## Decision — replacement is a sale at zero

For the lines resolved as
replace, Raise replacement creates a draft sale, each line priced at zero in
the order's currency, linked to the RMA (`orders.return_authorization_id`).
It then confirms, ships and traces as any sale does, and invoices at zero if
anyone invoices it — ADR-046 already treats zero as a price and null as
undecided, so the replacement passes confirm without a special case.
Sending the replacement before the faulty goods arrive is the person's
choice, not a rule.

A new document type for replacements was the alternative. It would ship,
trace and hold stock exactly as a sale does, and every one of those paths
would need to learn it.

## Decision — samples and uninvoiced goods

A sample (ADR-042) can have an
RMA whose lines are replace or none, never credit: nothing was billed. Goods
from a shipment not yet invoiced are credited after that shipment is
invoiced, not before; the invoice bills what left (ADR-046), and the credit
takes back what returned. Netting returns into the invoice instead was
rejected because it makes an invoice's quantity differ from its shipment's,
which is the property invoicing rests on.

## Decision — permissions follow the people

An RMA is customer service:
`return_authorizations.view`, `.create` and `.update` (cancel, close, link a
return, raise a replacement). Receiving against one stays `orders.receive`,
the dock's permission (ADR-043). Issuing a credit note, with or without an
RMA, stays `invoices.issue`, the finance permission voiding already uses —
whoever may send an invoice is who may take money back on it. Audited as
`return_authorization.created`, `.cancelled`, `.closed`,
`return_authorization.return_linked`, `return_authorization.replacement_raised`
and `credit_note.issued`, the last being the action ADR-046 held back until
a route recorded it.

## Consequences

New tables `return_authorizations` and
`return_authorization_lines` (each line with its resolution), and
`invoice_line_taxes`; nullable `return_authorization_id` on `order_returns`
and on `orders`; `credit_note_lines.return_authorization_line_id`, nullable,
so a credit for goods says which RMA line it settles; `return_authorization`
added to `document_sequences`' types. Issuing writes per-line tax
components. The returns route learns an optional RMA and its limits. The
credit note routes gain a preview and a create beside the void.

## Deferred

- **A free-standing amount** — "$50 off this invoice" — not tied to any
  line. Every credit in v0.4 credits a line; a discount on the whole is
  spread across its lines by hand.
- **Refunds** — paying a credit back rather than setting it against the
  next invoice. They need payments.
- **A request step and a customer portal**, and choosing the invoice
  automatically for untracked goods.
- **Inspection as a recorded step** — accepted, rejected, restocked or
  scrapped per unit. Until then the result is what the person credits, and
  restocking or scrapping is an ordinary move or correction (ADR-043).
- **Returns to suppliers** as a document (ADR-043, still deferred).
- **Pro forma invoices** (ADR-046, still deferred).

## Amendment (October 2026) — their own series (ADR-073)

Credit notes
and RMAs follow their series' settings, as invoices do; a credit note's
period is its credit date, an RMA's the day it is raised in the
organization's zone.
