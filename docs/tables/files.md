# Tables: files

The tables of files and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  files {
    uuid id PK
    uuid user_id FK
    text kind
    text content_type
    jsonb sizes
    integer bytes
    text sha256
    text original_name
    uuid created_by FK
    timestamptz created_at
    timestamptz attached_at
    timestamptz released_at
  }
  files }o--o| users : "user_id"
  files }o--o| users : "created_by"
```

From other areas, drawn bare:

- [users](users.md): `users`
