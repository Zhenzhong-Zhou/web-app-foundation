# Tables: locations

The tables of locations and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  locations {
    uuid id PK
    uuid parent_id FK
    text type
    text name
    text code
    uuid partner_id FK
    boolean is_available
    boolean is_active
    timestamptz created_at
    timestamptz updated_at
  }
  locations }o--o| locations : "parent_id"
  locations }o--o| partners : "partner_id"
```

From other areas, drawn bare:

- [partners](partners.md): `partners`
