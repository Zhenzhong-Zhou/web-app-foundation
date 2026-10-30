# Tables: partners

The tables of partners and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  addresses {
    uuid id PK
    uuid partner_id FK
    uuid location_id FK
    uuid owner_organization_id FK
    text label
    text line1
    text line2
    text city
    text region
    text postal_code
    char(2) country
    boolean is_billing
    boolean is_shipping
    boolean is_default
    boolean is_active
    timestamptz created_at
    timestamptz updated_at
  }
  contacts {
    uuid id PK
    uuid partner_id FK
    uuid location_id FK
    text name
    text role
    text email
    text phone
    text notes
    boolean is_primary
    boolean is_active
    timestamptz created_at
    timestamptz updated_at
  }
  partners {
    uuid id PK
    text name
    text code
    text tax_id
    text notes
    boolean is_active
    uuid sale_price_list_id FK
    uuid purchase_price_list_id FK
    text document_language
    text document_second_language
    timestamptz created_at
    timestamptz updated_at
    text name_pinyin
  }
  addresses }o--o| partners : "partner_id"
  addresses }o--o| locations : "location_id"
  addresses }o--o| organizations : "owner_organization_id"
  contacts }o--o| partners : "partner_id"
  contacts }o--o| locations : "location_id"
  partners }o--o| price_lists : "sale_price_list_id"
  partners }o--o| price_lists : "purchase_price_list_id"
```

From other areas, drawn bare:

- [locations](locations.md): `locations`
- [price-lists](price-lists.md): `price_lists`
- [organizations](organizations.md): `organizations`
