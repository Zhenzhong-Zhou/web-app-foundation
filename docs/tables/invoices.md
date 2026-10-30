# Tables: invoices

The tables of invoices and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  credit_note_lines {
    uuid id PK
    uuid credit_note_id FK
    uuid invoice_line_id FK
    uuid return_authorization_line_id FK
    text sku
    text description
    text second_description
    numeric(18,4) quantity
    numeric(18,4) unit_price
    text tax_code_name
    numeric(18,4) net_amount
    timestamptz created_at
  }
  credit_note_taxes {
    uuid id PK
    uuid credit_note_id FK
    text name
    numeric(7,4) rate
    numeric(18,4) taxable_amount
    numeric(18,4) amount
    timestamptz created_at
  }
  credit_notes {
    uuid id PK
    uuid invoice_id FK
    uuid partner_id FK
    text number
    char(3) currency
    date credit_date
    text reason
    boolean is_void
    numeric(18,4) subtotal
    numeric(18,4) tax_total
    numeric(18,4) total
    text seller_name
    text seller_tax_number
    text seller_line1
    text seller_line2
    text seller_city
    text seller_region
    text seller_postal_code
    char(2) seller_country
    uuid bill_to_address_id FK
    text bill_to_name
    text bill_to_line1
    text bill_to_line2
    text bill_to_city
    text bill_to_region
    text bill_to_postal_code
    char(2) bill_to_country
    text language
    text second_language
    uuid created_by FK
    timestamptz created_at
  }
  invoice_line_taxes {
    uuid id PK
    uuid invoice_line_id FK
    text name
    numeric(7,4) rate
    timestamptz created_at
  }
  invoice_lines {
    uuid id PK
    uuid invoice_id FK
    uuid order_line_id FK
    uuid variant_id FK
    text sku
    text description
    text second_description
    numeric(18,4) quantity
    numeric(18,4) unit_price
    uuid tax_code_id FK
    text tax_code_name
    numeric(18,4) net_amount
    timestamptz created_at
    timestamptz updated_at
  }
  invoice_taxes {
    uuid id PK
    uuid invoice_id FK
    text name
    numeric(7,4) rate
    numeric(18,4) taxable_amount
    numeric(18,4) amount
    timestamptz created_at
  }
  invoices {
    uuid id PK
    uuid order_id FK
    uuid shipment_id FK
    uuid partner_id FK
    text status
    text number
    char(3) currency
    date invoice_date
    date due_date
    text note
    numeric(18,4) subtotal
    numeric(18,4) tax_total
    numeric(18,4) total
    text seller_name
    text seller_tax_number
    text seller_line1
    text seller_line2
    text seller_city
    text seller_region
    text seller_postal_code
    char(2) seller_country
    uuid bill_to_address_id FK
    text bill_to_name
    text bill_to_line1
    text bill_to_line2
    text bill_to_city
    text bill_to_region
    text bill_to_postal_code
    char(2) bill_to_country
    text language
    text second_language
    text ship_to_label
    text ship_to_line1
    text ship_to_line2
    text ship_to_city
    text ship_to_region
    text ship_to_postal_code
    char(2) ship_to_country
    uuid created_by FK
    timestamptz issued_at
    uuid issued_by FK
    timestamptz voided_at
    uuid voided_by FK
    text void_reason
    timestamptz created_at
    timestamptz updated_at
  }
  credit_note_lines }o--|| credit_notes : "credit_note_id"
  credit_note_lines }o--|| invoice_lines : "invoice_line_id"
  credit_note_lines }o--o| return_authorization_lines : "return_authorization_line_id"
  credit_note_taxes }o--|| credit_notes : "credit_note_id"
  credit_notes }o--|| invoices : "invoice_id"
  credit_notes }o--|| partners : "partner_id"
  credit_notes }o--o| addresses : "bill_to_address_id"
  credit_notes }o--|| users : "created_by"
  invoice_line_taxes }o--|| invoice_lines : "invoice_line_id"
  invoice_lines }o--|| invoices : "invoice_id"
  invoice_lines }o--|| order_lines : "order_line_id"
  invoice_lines }o--|| product_variants : "variant_id"
  invoice_lines }o--o| tax_codes : "tax_code_id"
  invoice_taxes }o--|| invoices : "invoice_id"
  invoices }o--|| orders : "order_id"
  invoices }o--|| shipments : "shipment_id"
  invoices }o--|| partners : "partner_id"
  invoices }o--o| addresses : "bill_to_address_id"
  invoices }o--|| users : "created_by"
  invoices }o--o| users : "issued_by"
  invoices }o--o| users : "voided_by"
```

From other areas, drawn bare:

- [orders](orders.md): `order_lines`, `orders`, `shipments`
- [partners](partners.md): `addresses`, `partners`
- [products](products.md): `product_variants`
- [return-authorizations](return-authorizations.md): `return_authorization_lines`
- [tax-codes](tax-codes.md): `tax_codes`
- [users](users.md): `users`
