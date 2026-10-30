# Tables: return-authorizations

The tables of return-authorizations and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  return_authorization_lines {
    uuid id PK
    uuid return_authorization_id FK
    uuid order_line_id FK
    uuid variant_id FK
    text sku
    numeric(18,4) quantity
    text resolution
    timestamptz created_at
  }
  return_authorizations {
    uuid id PK
    text number
    uuid order_id FK
    uuid partner_id FK
    uuid invoice_id FK
    text status
    text reason
    boolean expects_goods
    uuid send_back_to_id FK
    text note
    uuid created_by FK
    timestamptz closed_at
    uuid closed_by FK
    timestamptz cancelled_at
    uuid cancelled_by FK
    timestamptz created_at
    timestamptz updated_at
  }
  return_authorization_lines }o--|| return_authorizations : "return_authorization_id"
  return_authorization_lines }o--|| order_lines : "order_line_id"
  return_authorization_lines }o--|| product_variants : "variant_id"
  return_authorizations }o--|| orders : "order_id"
  return_authorizations }o--|| partners : "partner_id"
  return_authorizations }o--o| invoices : "invoice_id"
  return_authorizations }o--o| locations : "send_back_to_id"
  return_authorizations }o--|| users : "created_by"
  return_authorizations }o--o| users : "closed_by"
  return_authorizations }o--o| users : "cancelled_by"
```

From other areas, drawn bare:

- [invoices](invoices.md): `invoices`
- [locations](locations.md): `locations`
- [orders](orders.md): `order_lines`, `orders`
- [partners](partners.md): `partners`
- [products](products.md): `product_variants`
- [users](users.md): `users`
