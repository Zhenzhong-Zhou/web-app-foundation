# Tables: production-orders

The tables of production-orders and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  production_order_lines {
    uuid id PK
    uuid production_order_id FK
    uuid component_variant_id FK
    text sku
    text unit_of_measure
    numeric(18,4) quantity_planned
    numeric(18,4) quantity_consumed
    text supply_type
    uuid source_location_id FK
    text external_lot_code
    text notes
    timestamptz created_at
    timestamptz updated_at
  }
  production_orders {
    uuid id PK
    uuid output_variant_id FK
    uuid bom_id FK
    uuid partner_id FK
    uuid location_id FK
    numeric(18,4) quantity_planned
    numeric(18,4) quantity_produced
    text status
    text reference
    uuid licence_id FK
    text licence_number
    text licence_authority
    text licence_status_at_release
    uuid licence_overridden_by FK
    text licence_override_reason
    text notes
    timestamptz created_at
    timestamptz updated_at
  }
  production_order_lines }o--|| production_orders : "production_order_id"
  production_order_lines }o--|| product_variants : "component_variant_id"
  production_order_lines }o--o| locations : "source_location_id"
  production_orders }o--|| product_variants : "output_variant_id"
  production_orders }o--o| boms : "bom_id"
  production_orders }o--o| partners : "partner_id"
  production_orders }o--|| locations : "location_id"
  production_orders }o--o| product_licences : "licence_id"
  production_orders }o--o| users : "licence_overridden_by"
```

From other areas, drawn bare:

- [boms](boms.md): `boms`
- [locations](locations.md): `locations`
- [partners](partners.md): `partners`
- [product-licences](product-licences.md): `product_licences`
- [products](products.md): `product_variants`
- [users](users.md): `users`
