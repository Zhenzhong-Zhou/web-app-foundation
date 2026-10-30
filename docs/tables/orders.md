# Tables: orders

The tables of orders and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  order_lines {
    uuid id PK
    uuid order_id FK
    uuid variant_id FK
    text sku
    numeric(18,4) quantity_ordered
    numeric(18,4) quantity_fulfilled
    numeric(18,4) quantity_returned
    numeric(18,4) unit_price
    char(3) currency
    text price_source
    uuid price_list_id FK
    boolean is_closed_short
    text closed_reason
    timestamptz created_at
    timestamptz updated_at
  }
  order_returns {
    uuid id PK
    uuid order_id FK
    uuid to_location_id FK
    uuid return_authorization_id FK
    text reason
    text note
    uuid created_by FK
    timestamptz created_at
  }
  orders {
    uuid id PK
    uuid partner_id FK
    text direction
    boolean is_sample
    text status
    text number
    timestamptz confirmed_at
    text reference
    date expected_at
    text note
    uuid deliver_to_id FK
    uuid ship_to_address_id FK
    text ship_to_label
    text ship_to_line1
    text ship_to_line2
    text ship_to_city
    text ship_to_region
    text ship_to_postal_code
    char(2) ship_to_country
    uuid created_by FK
    uuid duplicated_from_id FK
    uuid return_authorization_id FK
    timestamptz created_at
    timestamptz updated_at
  }
  shipments {
    uuid id PK
    uuid order_id FK
    uuid from_location_id FK
    text carrier
    text tracking_number
    text note
    text language
    text second_language
    uuid created_by FK
    timestamptz created_at
    timestamptz voided_at
    uuid voided_by FK
    text void_reason
  }
  order_lines }o--|| orders : "order_id"
  order_lines }o--|| product_variants : "variant_id"
  order_lines }o--o| price_lists : "price_list_id"
  order_returns }o--|| orders : "order_id"
  order_returns }o--|| locations : "to_location_id"
  order_returns }o--o| return_authorizations : "return_authorization_id"
  order_returns }o--|| users : "created_by"
  orders }o--|| partners : "partner_id"
  orders }o--o| locations : "deliver_to_id"
  orders }o--o| addresses : "ship_to_address_id"
  orders }o--|| users : "created_by"
  orders }o--o| orders : "duplicated_from_id"
  orders }o--o| return_authorizations : "return_authorization_id"
  shipments }o--|| orders : "order_id"
  shipments }o--|| locations : "from_location_id"
  shipments }o--|| users : "created_by"
  shipments }o--o| users : "voided_by"
```

From other areas, drawn bare:

- [locations](locations.md): `locations`
- [partners](partners.md): `addresses`, `partners`
- [price-lists](price-lists.md): `price_lists`
- [products](products.md): `product_variants`
- [return-authorizations](return-authorizations.md): `return_authorizations`
- [users](users.md): `users`
