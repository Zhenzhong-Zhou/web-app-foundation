# Tables: boms

The tables of boms and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  bom_lines {
    uuid id PK
    uuid bom_id FK
    uuid component_variant_id FK
    numeric(18,4) quantity
    text supply_type
    text notes
    timestamptz created_at
    timestamptz updated_at
  }
  boms {
    uuid id PK
    uuid output_variant_id FK
    numeric(18,4) output_quantity
    integer version
    text status
    uuid licence_id FK
    text notes
    timestamptz created_at
    timestamptz updated_at
  }
  bom_lines }o--|| boms : "bom_id"
  bom_lines }o--|| product_variants : "component_variant_id"
  boms }o--|| product_variants : "output_variant_id"
  boms }o--o| product_licences : "licence_id"
```

From other areas, drawn bare:

- [product-licences](product-licences.md): `product_licences`
- [products](products.md): `product_variants`
