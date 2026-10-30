# Tables: audit

The tables of audit and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  audit_log {
    uuid id PK
    uuid actor_id FK
    text action
    text resource_type
    uuid resource_id
    text resource_label
    jsonb payload
    inet ip
    text user_agent
    timestamptz created_at
  }
  audit_log }o--o| users : "actor_id"
```

From other areas, drawn bare:

- [users](users.md): `users`
