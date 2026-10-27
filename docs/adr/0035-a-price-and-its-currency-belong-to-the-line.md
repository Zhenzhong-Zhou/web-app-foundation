---
status: accepted
date: 2026-09-16
amended-by: [ADR-080]
---

# ADR-035 — A price and its currency belong to the line

**Context.** ADR-027 scoped orders to purchase and sale without money, which
was right for a stock ledger and is now the largest gap in the domain. A
purchase order without a price cannot do the one control that matters in
procurement: three-way matching. You agreed 1000 at 1.20, you received 1000,
the invoice says 1.35 for 980 — and nothing catches it.

It also blocks everything downstream. No price at receipt means no cost on the
lot, which means no per-batch cost, which is the chain the costing entries have
been waiting on.

And unlike a selling price, it is unrecoverable. The price was agreed when the
order was raised; reconstructing it later means reading old paperwork. Same
class as licence history (ADR-029).

**Decision — `unit_price` and `currency` both on the line.**

An order header currency was the alternative, and it is the tidier one: a
purchase order is usually one agreement with one supplier in one currency, and
a header currency gives every order a single total.

It is rejected because it cannot represent an order that is genuinely mixed,
and the previous system's data says mixed happens — both
`packaging_material_suppliers` and `packaging_material_batches` carry a
currency per row, so a supplier relationship here spans currencies rather than
sitting in one. A header currency would force such an order to be split into
two documents that are really one, or to record a currency that is wrong for
half its lines.

This is the same grain the previous system used, and it is right for the same
reason: the price of an item is agreed per item.

**Decision — the consequence is accepted rather than worked around: an order
has subtotals, not a total.**

With one currency per line there is no meaningful sum across an order unless
every line agrees. Adding CAD 500 to USD 300 needs a rate, and applying one at
display time means the number changes every day the page is opened.

So `findById` returns an array of `{ currency, amount }`, one per currency
present, and the screen renders each. An order in one currency shows one row,
which is the common case and reads as a total; a mixed one shows two, which is
the truth.

Converting them into a single reporting figure is the exchange rate question,
still open, and deliberately not answered by a display-time division.

**Decision — the subtotals are absent when any line is unpriced.** A sum over
the priced half of an order looks complete and is not, and somebody will
reconcile against it. A `totalsComplete` flag says which, so the screen can
explain rather than showing a number that quietly excludes a line.

**Decision — both nullable, and no default currency.**

Existing lines have neither and neither can be invented. A default currency
would be worse than null: it would assert that an old line was priced in a
currency nobody chose, which is the kind of quiet wrong answer a report
repeats.

A check keeps them together — a price with no currency is a number with no
unit, and a currency with no price says nothing:

```text
(unit_price is null) = (currency is null)
```

**Decision — the line total is computed, never stored.** `unit_price ×
quantity_ordered` is derivable, and a stored copy is a third number free to
disagree with the two it came from — the same reasoning that keeps
`quantity_outstanding` in Postgres rather than subtracted in JavaScript
(ADR-025).

Returned unrounded. Rounding to two places is currency-specific — JPY has no
minor unit, so ¥1500 is 1500 and not 1500.00 — and doing it in the query would
bake one currency's convention into every order. `Intl.NumberFormat` knows each
currency's minor units and has the currency to hand; the query does not.

**Decision — a price freezes when the line does.** The existing guard already
refuses to amend a line once anything has been received against it (ADR-033),
and price rides on the same route, so this comes free. It is also right for its
own reason: by then the price has been matched against a supplier invoice, and
changing it afterwards breaks that link silently — exactly the argument that
froze the order reference.

**If mixed orders turn out never to happen**, moving currency to the header is
a migration that can be reasoned about: every line on an order already agrees,
so the header value is unambiguous. The reverse — splitting a header currency
onto lines — is equally safe. Neither direction loses information, which is why
this was worth choosing on how the work actually goes rather than on which
schema is tidier.

**Deferred.** Price *lists* — what you would pay by supplier or charge by tier —
are policy that feeds an order rather than part of one. Exchange rates are a
third thing again: a rate is meaningless without the pair it converts, so
storing a bare number the way the previous system did breaks the moment a base
currency changes.

**Amendment (October 2026) — prices on orders (ADR-080).** A line's price,
an order's totals and its tax reach only whoever holds `orders.view_prices`;
the server sends them to nobody else. An order's invoice money follows
`invoices.view`.
