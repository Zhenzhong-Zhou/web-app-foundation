# Tables: notifications

The tables of notifications and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  notifications {
    uuid id PK
    uuid user_id FK
    text type
    text resource_type
    uuid resource_id
    text title
    text body
    jsonb title_message
    jsonb body_message
    timestamptz read_at
    timestamptz created_at
    timestamptz updated_at
  }
  notifications }o--|| users : "user_id"
```

From other areas, drawn bare:

- [users](users.md): `users`
