# Tables: costs

The tables of costs and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  exchange_rates {
    uuid id PK
    char(3) currency
    date rate_date
    numeric(18,8) rate
    timestamptz created_at
    timestamptz updated_at
  }
```
