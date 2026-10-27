---
status: accepted
date: 2026-09-25
amended-by: [ADR-071, ADR-073]
---

# ADR-046 — Invoicing: an invoice bills one shipment, and is reversed, never edited

**Context.** The system moves goods but not money. A shipment leaves with a
packing slip and nothing says what the customer owes for it. Two rules were
waiting on this: Void shipment is refused once an order is marked shipped
(ADR-041, amendment), because nothing else marked the point after which a
shipment is settled; and "Mark shipped" (#24) closes an order under a name
that describes a different act. Prices are already on sale lines (ADR-035),
nullable and per line, which is the input an invoice needs and the source of
two of the decisions below.

**Decision — sales only.** This ADR covers invoices to customers. Supplier
bills and three-way matching (ADR-035's reason for prices on purchase lines)
are the same shape seen from the other side, and wait until someone matches
a supplier invoice in the app rather than on paper.

**Decision — one invoice per shipment.** An invoice is created from a
shipment and bills exactly what that shipment carried: its lines, in the
quantities that left. Billing on delivery is the default in SAP and NetSuite,
and it is the grain the rest of the system already has — a shipment is a
document with one date, one box and one packing slip (ADR-041), so "what did
this invoice bill" and "which shipment is not yet billed" are both one join.

Invoicing per order was the alternative, and it is rejected because orders
ship in parts: an order-level invoice either waits for the last box or bills
for goods that have not left. Consolidating several shipments onto one
invoice — monthly billing for a busy customer — is deferred. It moves the
shipment reference from a column to a join table, which is a migration that
can be reasoned about, since every existing invoice has exactly one.

A partial unique index on `invoices (shipment_id) where status <> 'voided'`
enforces it: at most one standing invoice per shipment, while a voided one
stays beside its replacement.

**Decision — draft, issued, voided.** A draft is a working copy: created from
the shipment, prefilled from the order lines, editable and deletable, with no
number. Quantities come from the shipment and cannot be changed — the invoice
bills what left, and a different quantity is a different shipment. Price and
tax code default from the order line and can be edited on the draft.

Issuing assigns the number and the invoice date, computes and stores every
amount, snapshots every name and address, and freezes the invoice. After
that nothing on it changes. A mistake is corrected by reversing it (below)
and issuing a new one, never by editing — an invoice that has been sent is a
record the customer holds a copy of, and an edit would make the two copies
disagree without saying so.

Paid is not a status. It needs payments recorded against the invoice, which
are deferred (below); "issued" means "sent and owed", nothing more.

**Decision — one currency per invoice, and one currency per sale.** An
invoice is paid in one currency, taxed on one total, and owed as one amount,
so it has a header currency. Every system that issues invoices works this way.

ADR-035 put currency on the line because suppliers price in more than one
currency, and that stays true for purchases. For sales it is enforced at
confirm: every priced line on a sale must share one currency, refused with
409 otherwise. A sale in two currencies would need two invoices per shipment
and has no evidence behind it. The invoice then takes the order's currency,
and a mixed invoice cannot exist.

**Decision — a sale is priced before it is confirmed.** Confirming a sale is
the customer's commitment, and it is the point at which a price is agreed.
Every line on a sale must have a price at confirm, refused with 409
otherwise. Zero is a price — a replacement, free goods — and null is not:
null means nobody decided, and an invoice cannot bill an undecided amount.
Creating an invoice checks again, as defence in depth.

Purchases stay optional. A purchase order is sometimes raised before the
price is known, and the supplier's bill supplies it.

Sample orders (ADR-042) are exempt from both checks and are never invoiced.
They ship and trace like sales; they are not billed. If a customer needs a
valued document for a sample — customs, usually — that is a pro forma
(deferred).

Before the confirm check ships, a query lists confirmed sales with unpriced
lines. If there are none in production, nothing more is needed; if there
are, they are priced by hand before the migration, rather than building a
way around the rule.

**Decision — amounts are stored at issue, deliberately unlike an order.**
ADR-035 computes an order's line totals and never stores them, because an
order can still change and a stored copy would drift. An issued invoice
cannot change, which removes that reason, and the opposite reason applies: an
invoice's amounts are a legal record and must read the same in ten years
whatever happens to rounding code, tax rates or the order it came from.

So issuing writes, per line, the net amount (quantity × unit price, rounded
to the currency's minor units), and per invoice the subtotal, each tax
amount, the tax total and the total. Every later read — the invoice page, a
customer statement, what is owed across all customers — sums stored numbers
and recomputes nothing.

Amounts are `numeric(18, 4)` and strings end to end, as quantities are
(ADR-025). Rounding happens once, in SQL at issue, half away from zero
(Postgres `round`), to the currency's minor units — which the server reads
from `Intl.NumberFormat`, the same source the client uses, so JPY rounds to
whole yen without a table of currencies to maintain.

**Decision — tax by code, rounded once per invoice.** A tax code is
organization data: a name and one or more components, each a name and a
rate, so a code can be one tax or two applied to the same amount (a federal
and a provincial sales tax, say) and "exempt" is a code with none. Each
invoice line carries a tax code, defaulting from one chosen for the invoice,
because a single invoice can mix taxable and exempt items.

Tax is computed per component on the sum of the net amounts of the lines
that carry it, and rounded once — not per line. Rounding per line drifts by
a cent per line on long invoices, and tax authorities that specify a rule
generally ask for the invoice level. The component name and rate are copied
onto the invoice at issue, so a later rate change never rewrites an old
invoice.

Choosing the code automatically — from the ship-to region and the product —
is deferred. Until then a person picks it, which is what a small business
does anyway.

**Decision — numbers are gapless per organization, assigned at issue.** An
invoice number is what the customer quotes and what an auditor counts, so
it has no gaps and no duplicates within an organization, and drafts have
none (a deleted draft would otherwise leave a hole).

A counter row per organization and document type (`document_sequences`),
incremented with `update … returning` inside the issuing transaction. If the
issue fails, the transaction rolls back and so does the number. A Postgres
sequence was the alternative and is rejected: sequences are not
transactional, so a failed issue burns a number, and they are global rather
than per tenant. Credit notes take their own series from the same table.

The cost is that two invoices issued at the same moment by one organization
queue on one row lock for the length of an issue — a few milliseconds, at
the volume a B2B tenant issues invoices.

**Decision — snapshots, as orders and movements already do.** Issuing copies
the seller (organization name, registered address, tax registration number),
the bill-to (the customer's name and default billing address, from
`addresses.is_billing`), the ship-to as the order holds it, and per line the
SKU, item name, quantity, unit price and tax. The organization's own address
is the owner column ADR-028 anticipated. Foreign keys stay for provenance and
are never read to display an issued invoice — the reasoning of the order's
ship-to columns, for the same reason.

The invoice date and due date are calendar days, so they are `date` columns
from the start (#20 is the cost of not doing that). The due date is entered
on the draft; payment terms that compute it are deferred with payments.

**Decision — a mistake after issue is reversed by a credit note.** A credit
note is its own document: its own number series, lines, stored amounts and
snapshots, and a reference to the invoice it credits. Voiding an issued
invoice, with a required reason, issues a credit note for the whole of it in
the same transaction and marks the invoice voided. Nothing is deleted; both
documents stay and print.

This is how SAP cancels an invoice, and it is what countries with strict
invoicing rules require, since they do not allow an invoice to be cancelled
outright. A system that voided by flag alone would work where the rules are
loose and need rebuilding where they are not; one that voids by credit note
works in both.

Voiding frees the shipment: the unique index ignores voided invoices, so the
shipment can be invoiced again (a wrong price: void, then re-invoice) or
itself voided (below). A credit note that is not a void — for a return, a
price correction, a debt that will not be collected — leaves the invoice
issued and the shipment billed, because the goods did leave and were billed.
Those credit notes are decided with returns and RMA in ADR-047; this ADR
fixes only the document's shape and the full reversal.

A draft is simply deleted, since nobody outside has seen it.

**Decision — Void shipment is refused while an invoice stands, not while the
order is closed.** This amends ADR-041's amendment. A shipment can be voided
while no draft or issued invoice references it and nothing from it has been
returned. A draft is deleted first; an issued invoice is voided first. The
order being fulfilled no longer blocks it: voiding a shipment on a fulfilled
order reopens the order to confirmed, because the order was closed on the
understanding that its goods had left, and they had not. The reopen is part
of the void's transaction and its audit row.

The v0.3 workaround — a return with the reason "never left" — is no longer
needed and no longer recommended, since it records goods coming back that
never went.

**Decision — "Mark shipped" becomes "Close order" (#24).** Ship is the box
going to the carrier; closing says no more shipments are coming, with every
line shipped or closed short. The stored status stays `fulfilled` (ADR-041).
Closing locks nothing to do with money: a closed order's shipments can still
be invoiced, since billing after the last box leaves is ordinary.

**Decision — permissions follow the people.** `invoices.view`,
`invoices.create`, `invoices.update` and `invoices.delete` for drafts, and
`invoices.issue` (issue and void). Issuing is the finance act — the one a
customer and an auditor see — and is often held by fewer people than
drafting, the reasoning that gave `orders.ship` and `orders.receive` their
own permissions. Audited as `invoice.created`, `invoice.updated`,
`invoice.line_updated`, `invoice.deleted`, `invoice.issued`,
`invoice.voided` and `credit_note.issued`; the permission-coverage and
audit-coverage tests include every new route.

**Decision — printable, like the packing slip.** An issued invoice and a
credit note each print from their stored snapshot. A voided invoice prints
with VOID and the reason, and the credit note names the invoice it reverses.
A draft prints marked DRAFT with no number, so it cannot be mistaken for a
sent invoice.

**Performance.** Reads never recompute: an invoice, a customer's invoices,
and everything owed are sums over stored amounts. Indexes: unique
`(organization_id, number)` per document; `(organization_id, partner_id,
invoice_date desc)` for a customer's history; `(organization_id, status)` for
what is draft or issued; and the partial unique index on `shipment_id`,
which also answers "is this shipment billed" for the Void check and the
"not yet invoiced" list. Numbering costs one row lock per issue per
organization.

**Consequences.** New tables: `invoices`, `invoice_lines`, `invoice_taxes`,
`credit_notes`, `credit_note_lines`, `credit_note_taxes`, `tax_codes`,
`tax_code_components`, `document_sequences`; an owner column on `addresses`
for the organization; a tax registration number on `organizations`. Confirm
gains two refusals for sales (unpriced line, mixed currency). Void shipment's
rule changes and gains a reopen. The close button is renamed.

**Deferred.**

- **Pro forma invoices** — a valued document that creates no debt: for
  customs, prepayment, a customer's approval, a sample's declared value. Its
  own document type and number series, never counted as owed. Additive, and
  left out only to keep v0.4 to the invoice that carries legal weight;
  bring it forward if it is needed in use.
- **Payments** — amounts received, which invoice they settle, partial
  payments, balances, overdue, payment terms computing the due date, and
  write-off of an uncollectable balance. Until then an uncollectable invoice
  is credited in full with that reason (ADR-047), leaving it issued.
- **Supplier bills** and three-way matching against purchase lines and
  receipts.
- **Consolidated invoices** across several shipments.
- **Charge lines** — freight, handling — which are not goods and have no
  shipment movement; a line kind, additive.
- **Automatic tax determination** from region and product.
- **Exchange rates** and a home currency: invoices are recorded in their own
  currency, and converting for reporting or tax in the home currency waits
  on the exchange-rate question left open by ADR-035.
- **Sending** an invoice by email or e-invoicing network; creating a draft
  automatically on ship.

**Amendment — one currency from the first priced line, not only at
confirm.** Enforcing it only at confirm let a draft sale be built that
confirm must refuse, and the ways a line gets its price disagreed: a list
price in another currency was left off (ADR-049) and "Use list price"
refused one, while a typed price was accepted. Every write now holds a
sale to the currencies its priced lines already use, on a draft as much as
once confirmed; a conflicting list price on an added line is still left
off rather than refused. Purchases keep a currency per line (ADR-035). The
check accepts any currency the sale already uses, so a draft priced in two
before this change can still be brought back to one; confirm keeps its own
check for those. This is how sales documents work elsewhere: one document
currency, chosen per order.

**Amendment (October 2026) — an invoice that charges tax needs the
seller's tax number.** The tax number stayed optional so that a business
not registered for GST/HST, which has none, could still invoice. But such
a business charges no tax either, and a business that charges tax is
registered and has a number: in Canada, an invoice of $100 or more must
show it for the customer to claim the input tax credit (the Input Tax
Credit Information Regulations). So issuing is refused while the
organization has no tax number and the invoice charges any tax, with the
code `organization_tax_number_missing` and the same link to Profile as a
missing address (ADR-061). An invoice with no tax, every line exempt or
zero-rated, issues without one, as before. Every invoice, not only those
over the threshold: the number is the seller's, not the amount's, and a
rule with a figure in it is one more thing to keep up with the law.
Credit notes copy the invoice's seller, so they are unaffected.

*Deferred — tax profiles by country, with what brings them in.* The model
is mostly country-neutral already: tax codes with any components and
rates, any currency rounded to its minor units, snapshots, gapless numbers,
documents in the customer's languages. What is Canadian is a few rules, and
what other regimes need and this lacks: prices that include tax, the
customer's tax number and reverse-charge wording on business invoices,
rounding per line, a label and format for the tax number. When it comes,
the organization's registered country picks a **tax profile** holding
those, with today's behaviour as the Canada profile and a generic one
beside it. One profile per organization: an organization is one legal
entity registered in one country, and a group with entities in several
runs one organization for each, as its books and invoice numbers already
require. The profile also decides what shows: a form offers only the
profile's fields, and a document prints only what is set (the print pages
already leave out an empty value rather than print a blank). A
per-country check on the tax number's format, as a warning that catches a
typo (Canada's business number has a check digit), is the profile's first
use. Government invoicing systems stay out: where the law issues tax
invoices through one (China's fapiao, Mexico's CFDI, Italy's SDI, India's
IRN), this app's invoice is the company's own record and a commercial
invoice, and the tax invoice is issued there. Trigger: the first customer,
or legal entity, outside Canada.

**Amendment (October 2026) — each organization's numbering (ADR-073).**
The prefix, the width and when a series starts again are each
organization's, `INV-` and six digits only the defaults. Invoices stay
gapless within a series and period, rather than within the organization.
