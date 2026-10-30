# Tables: stock

The tables of stock and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  lots {
    uuid id PK
    uuid variant_id FK
    text code
    date expires_at
    timestamptz received_at
    boolean is_assigned
    timestamptz created_at
    timestamptz updated_at
  }
  stock_levels {
    uuid id PK
    uuid variant_id FK
    uuid location_id FK
    uuid lot_id FK
    numeric(18,4) quantity
    timestamptz created_at
    timestamptz updated_at
  }
  stock_movements {
    uuid id PK
    uuid variant_id FK
    text sku
    uuid lot_id FK
    uuid from_location_id FK
    uuid to_location_id FK
    numeric(18,4) quantity
    text reason
    text reason_detail
    text reference_type
    uuid reference_id
    text note
    uuid actor_id FK
    timestamptz created_at
  }
  stock_valuations {
    uuid id PK
    uuid variant_id FK
    uuid lot_id FK
    text kind
    uuid movement_id FK
    numeric(18,4) quantity
    numeric(18,6) value
    numeric(18,4) unit_price
    char(3) currency
    numeric(18,8) exchange_rate
    boolean needs_cost
    text reference_type
    uuid reference_id
    text note
    uuid actor_id FK
    timestamptz created_at
  }
  valuation_pools {
    uuid id PK
    uuid variant_id FK
    uuid lot_id FK
    numeric(18,4) quantity
    numeric(18,6) value
    timestamptz created_at
    timestamptz updated_at
  }
  lots }o--|| product_variants : "variant_id"
  stock_levels }o--|| product_variants : "variant_id"
  stock_levels }o--|| locations : "location_id"
  stock_levels }o--o| lots : "lot_id"
  stock_movements }o--|| product_variants : "variant_id"
  stock_movements }o--o| lots : "lot_id"
  stock_movements }o--o| locations : "from_location_id"
  stock_movements }o--o| locations : "to_location_id"
  stock_movements }o--|| users : "actor_id"
  stock_valuations }o--|| product_variants : "variant_id"
  stock_valuations }o--o| lots : "lot_id"
  stock_valuations }o--o| stock_movements : "movement_id"
  stock_valuations }o--o| users : "actor_id"
  valuation_pools }o--|| product_variants : "variant_id"
  valuation_pools }o--o| lots : "lot_id"
```

From other areas, drawn bare:

- [locations](locations.md): `locations`
- [products](products.md): `product_variants`
- [users](users.md): `users`
