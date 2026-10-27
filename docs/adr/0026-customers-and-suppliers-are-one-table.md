---
status: accepted
date: 2026-09-10
---

# ADR-026 — Customers and suppliers are one table

**Context.** Orders need a counterparty. The obvious modelling question is
whether a customer and a supplier are two kinds of thing or one thing seen from
two directions, and it has to be answered before `orders.partner_id` exists —
a foreign key is not something to re-point later.

The question is not hypothetical. Large systems disagree: Odoo uses one
`res.partner` for customers, suppliers, employees, and companies; NetSuite and
SAP keep customer and vendor masters apart. Both are defensible, and the reason
for the split is specific enough to say whether it applies here.

**Decision — one `partners` table, and direction lives on the order.**

```text
partners  id, organization_id, name, code, tax_id, notes, is_active
          unique (organization_id, code) where code is not null
```

They share almost everything that makes a row: a name, addresses, contact
people, a tax id, notes, an active flag. What differs is what they *connect*
to — purchase orders and lead times, or sales orders and credit limits. That is
relationships and a few nullable columns, not a second table. The same argument
ADR-023 made for `products.type`.

**The forcing case is that one company is often both.** You buy packaging from
a firm and sell them finished goods; a supplier accepting a return is a
customer for that transaction. Two tables make that two rows, two addresses to
keep in step, and no way to see the whole relationship — and merging them
afterwards means reconciling records that already have orders pointing at each.

**No `is_customer` / `is_supplier` flags.** They go stale, because nobody unsets
them, and a stale flag is worse than no flag — it is a filter that quietly
excludes the right answer. What a partner is follows from what has been traded
with them, which is a join over `orders`. If a label is wanted for filtering it
is a label, enforced by nothing.

**Decision — the split, if it comes, is accounting's and not the partner's.**

Receivables and payables are where customers and suppliers genuinely stop
resembling each other: different aging, different reconciliation, different
statutory reporting. That is the reason NetSuite and SAP separate them, and it
is a real reason.

It does not apply yet, because this system moves goods rather than money. When
invoicing arrives the answer is separate accounting tables keyed by
`partner_id`, not a fork of `partners` — a company can owe you and be owed by
you at once, and one identity with two ledgers describes that better than two
identities do.

**Decision — one table now because the migration runs the right way.**

Splitting later is `INSERT INTO suppliers SELECT … FROM partners WHERE …`:
mechanical, reversible, and nothing that references a partner has to change if
the ids are kept. Merging later is not — it means choosing between two names,
two addresses, and two histories for rows that are already referenced.

Under uncertainty, prefer the shape whose migration is the cheap direction.

**Consequence.** A partner list shows customers and suppliers together, and a
name search returns suppliers when someone wanted customers. Filtering by kind
is a join against orders rather than a column, which is slower to write and
slower to run. That friction is the price, and it is paid on a screen rather
than in the schema.

Permissions do not fork either. An operation where different teams manage
customers and suppliers wants different permission scopes — `partners.view`
against a filter — and the role system already expresses that without a second
table.

**Rejected: separate `customers` and `suppliers` tables.** Cleaner to describe
and wrong the first time a company is both. Every field they share would be
duplicated, every "who do we trade with" screen would be a union, and the
correction is the expensive migration rather than the cheap one.

**Deferred, and recorded as open decisions.** Payment terms, lead times, and
credit limits, because each arrives with the module that reads it and a
nullable column added later costs nothing. Addresses, which are their own shape
and are also wanted by locations (ADR-024). Contact people, which are a second
table and not needed until someone has more than one.
