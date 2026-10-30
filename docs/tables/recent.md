# Tables: recent

The tables of recent and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  recent_records {
    uuid id PK
    uuid user_id FK
    text kind
    uuid record_id
    timestamptz opened_at
  }
  recent_records }o--|| memberships : "user_id"
```

From other areas, drawn bare:

- [organizations](organizations.md): `memberships`
