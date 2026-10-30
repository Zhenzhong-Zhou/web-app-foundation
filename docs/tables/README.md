# Tables, by area

Every table in the database, one diagram per area: its tables, their
columns and their foreign keys, written from the Drizzle schema in
`server/src/database/schema/` by `npm run diagrams` in `server/`
([ADR-086](../adr/0086-docs-as-code.md#amendment-october-2026--part-2-as-planned)).
Never edited by hand: `scripts/verify.sh` fails when a page is not what
the command writes, or when a table is in no area. Each table's area is
in `server/src/cli/table-diagrams.ts`, named as the ADRs' areas are.

## How to read a diagram

- **A box with columns** is a table of the area: each column's type and
  name, `PK` on its primary key and `FK` on a foreign key's.
- **A box with none** is a table of another area, which one of the
  area's tables points to; the list under the diagram links its area.
- **A line** is a foreign key, labelled with its columns, drawn once, in
  the area of the table that holds it. `}o--||` reads "many rows point
  to one", and `}o--o|` "many rows point to one or none": the column may
  be empty.
- **`organization_id` is left out,** with its foreign key to
  `organizations`: every query is scoped to one organization
  ([ADR-003](../adr/0003-multi-tenancy.md)), and every table has it but
  8: `account_events`, `auth_tokens`, `organization_invitations`, `organizations`, `permissions`, `role_permissions`, `sessions`, `users`.

## The areas

| Area | Tables |
| --- | --- |
| [boms](boms.md) | `bom_lines`, `boms` |
| [costs](costs.md) | `exchange_rates` |
| [invoices](invoices.md) | `credit_note_lines`, `credit_note_taxes`, `credit_notes`, `invoice_line_taxes`, `invoice_lines`, `invoice_taxes`, `invoices` |
| [locations](locations.md) | `locations` |
| [numbering](numbering.md) | `document_numbering`, `document_sequences` |
| [orders](orders.md) | `order_lines`, `order_returns`, `orders`, `shipments` |
| [partners](partners.md) | `addresses`, `contacts`, `partners` |
| [price-lists](price-lists.md) | `price_list_items`, `price_lists` |
| [product-licences](product-licences.md) | `product_licences` |
| [production-orders](production-orders.md) | `production_order_lines`, `production_orders` |
| [products](products.md) | `product_images`, `product_translations`, `product_variants`, `products`, `variant_translations` |
| [recent](recent.md) | `recent_records` |
| [return-authorizations](return-authorizations.md) | `return_authorization_lines`, `return_authorizations` |
| [stock](stock.md) | `lots`, `stock_levels`, `stock_movements`, `stock_valuations`, `valuation_pools` |
| [tax-codes](tax-codes.md) | `tax_code_components`, `tax_codes` |
| [audit](audit.md) | `audit_log` |
| [auth](auth.md) | `account_events`, `auth_tokens`, `sessions` |
| [authorization](authorization.md) | `invitation_roles`, `membership_roles`, `permissions`, `role_permissions`, `roles` |
| [files](files.md) | `files` |
| [invitations](invitations.md) | `invitations`, `organization_invitations` |
| [notifications](notifications.md) | `notifications` |
| [organizations](organizations.md) | `memberships`, `organizations` |
| [users](users.md) | `users` |
