# Tables: products

The tables of products and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  product_images {
    uuid id PK
    uuid product_id FK
    uuid file_id FK
    integer position
    timestamptz created_at
  }
  product_translations {
    uuid id PK
    uuid product_id FK
    text locale
    text name
    text description
    timestamptz created_at
    timestamptz updated_at
    text name_pinyin
  }
  product_variants {
    uuid id PK
    uuid product_id FK
    text sku
    text name
    text unit_of_measure
    boolean tracks_lots
    boolean is_active
    integer weight_grams
    integer length_mm
    integer width_mm
    integer height_mm
    integer case_quantity
    integer case_length_mm
    integer case_width_mm
    integer case_height_mm
    timestamptz created_at
    timestamptz updated_at
    text name_pinyin
  }
  products {
    uuid id PK
    text type
    text name
    text description
    boolean is_active
    timestamptz created_at
    timestamptz updated_at
    text name_pinyin
  }
  variant_translations {
    uuid id PK
    uuid variant_id FK
    text locale
    text name
    timestamptz created_at
    timestamptz updated_at
    text name_pinyin
  }
  product_images }o--|| products : "product_id"
  product_images }o--|| files : "file_id"
  product_translations }o--|| products : "product_id"
  product_variants }o--|| products : "product_id"
  variant_translations }o--|| product_variants : "variant_id"
```

From other areas, drawn bare:

- [files](files.md): `files`
