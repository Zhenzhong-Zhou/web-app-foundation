# Tables: tax-codes

The tables of tax-codes and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  tax_code_components {
    uuid id PK
    uuid tax_code_id FK
    text name
    numeric(7,4) rate
    timestamptz created_at
    timestamptz updated_at
  }
  tax_codes {
    uuid id PK
    text name
    boolean is_active
    timestamptz created_at
    timestamptz updated_at
  }
  tax_code_components }o--|| tax_codes : "tax_code_id"
```
