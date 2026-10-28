---
status: accepted
date: 2026-09-11
areas: [locations, partners, database]
---

# ADR-028 — Addresses and contacts are shared tables with an exclusive arc

## Context

Partners need somewhere to put a billing address, a delivery address,
and the people to talk to — the sales rep you order from is not the accounts
payable clerk who chases the invoice, and one customer with three delivery sites
is ordinary rather than an edge case. Our own `site` locations need a postal
address too, for a shipping label or a return slip. Carriers and 3PLs will want
the same two things if they ever become entities of their own.

Three shapes were available.

**Columns on the owner** (`partners.email`, `partners.address_line1`) collapses
immediately. The first question anyone asks is *which* email, and the answer is
"two rows, not one column". It also cannot express a default among several.

**A table per owner** (`partner_addresses`, `location_addresses`) keeps every
foreign key honest at the cost of copying the same eleven columns and the same
indexes for each new owner, and of every query that wants "an address" knowing
which table to look in.

**Polymorphic** (`owner_type` text, `owner_id` uuid) is the usual answer and the
one we are rejecting. It buys the flexibility by giving up the foreign key.
Nothing stops an `owner_id` pointing at a row that does not exist, nothing
cascades when a partner is deleted, and the orphans are invisible because no
constraint can see them. ADR-012 made the organization the owner of its data
through `on delete cascade`; a polymorphic column opts out of that for the two
tables most likely to accumulate rows nobody reads.

## Decision

One `addresses` table and one `contacts` table, each carrying a
real nullable foreign key per owner kind, with a check constraint asserting that
exactly one is set:

```sql
constraint addresses_one_owner_check
  check (num_nonnulls(partner_id, location_id) = 1)
```

Adding an owner — the organization's own registered address, for invoices — is
a column, a widened check, an index on the new column, and a partial unique
index for its default. Four lines in a migration, no data move, every existing
row keeping its foreign key.

`locations` is deliberately not the address table. A `site` is described as "a
building or address", but the tree stores only a name and a code and cannot
print a label — and more importantly `stock_levels` and `stock_movements` point
at it, so a leaf is anywhere stock can sit. Putting a customer's billing address
in the tree makes it selectable in the move-stock dialog, and eventually someone
transfers four hundred units into Acme's accounts payable department. The two
concepts share the word "address" and nothing else.

## Consequence

The schema will look wrong to anyone reading it cold: two
nullable foreign keys and a `num_nonnulls` check invite a tidy-up into
`owner_type`/`owner_id`. That tidy-up is this decision being reversed, and this
entry is the reason not to.

Queries pay a small tax. "The addresses for this partner" filters on
`partner_id`, not on a generic owner column, so a helper that fetches addresses
for an arbitrary entity has to know which column to use. In exchange, deleting a
partner takes its addresses and contacts with it, and no scheduled job is
required to find rows whose owner is gone.

`is_default` is enforced by a partial unique index per owner, not by the
application. Without it, a second default is writable, the picker chooses
arbitrarily between them, and the bug is invisible until a shipment goes to the
wrong dock.

Both tables retire rather than delete. Nothing references an address — the
order snapshots where it shipped, below — so removing one would be safe, and
it is still wrong: an address deleted by accident has to be recoverable, and
"everywhere we have ever shipped this partner" is a question somebody
eventually asks. Contacts retire for a stronger reason, since a person may be
named on an order that already shipped. The `DELETE` routes stay, because that
is what the caller means; only the row survives.

Orders snapshot the resolved address onto their own row at creation and keep
`ship_to_address_id` for provenance. `addresses` holds what is true now; an
order records what was true that day. Without the snapshot, a partner moving
warehouses silently rewrites where last year's deliveries went, and the order
stops being a record of what happened — the same reasoning that retires a
partner instead of deleting it (ADR-026).

Nothing validates a postal code, a phone number, or an address line. A format
check that covers every country is a check nobody can write, and rejecting a
valid address is worse than storing an odd one — the same position `tax_id`
already takes (ADR-026). `country` is the exception: ISO-3166 alpha-2, because
shipping and tax both need a machine-readable answer and two letters is a
vocabulary rather than a format.
