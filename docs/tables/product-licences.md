# Tables: product-licences

The tables of product-licences and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  product_licences {
    uuid id PK
    text number
    text authority
    boolean is_active
    date issued_at
    date expires_at
    date expiry_notice_for
    integer expiry_notice_days
    text notes
    timestamptz created_at
    timestamptz updated_at
  }
```
