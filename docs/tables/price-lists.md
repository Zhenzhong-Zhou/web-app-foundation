# Tables: price-lists

The tables of price-lists and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  price_list_items {
    uuid id PK
    uuid price_list_id FK
    uuid variant_id FK
    numeric(18,4) unit_price
    timestamptz created_at
    timestamptz updated_at
  }
  price_lists {
    uuid id PK
    text name
    text direction
    char(3) currency
    boolean is_active
    timestamptz created_at
    timestamptz updated_at
  }
  price_list_items }o--|| price_lists : "price_list_id"
  price_list_items }o--|| product_variants : "variant_id"
```

From other areas, drawn bare:

- [products](products.md): `product_variants`
