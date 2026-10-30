# Tables: users

The tables of users and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  users {
    uuid id PK
    text email
    text password_hash
    text name
    text locale
    timestamptz email_verified_at
    uuid photo_file_id FK
    timestamptz suspended_at
    text suspended_reason
    date deletion_scheduled_at
    uuid deletion_with_organization_id FK
    timestamptz deleted_at
    timestamptz created_at
    timestamptz updated_at
  }
  users }o--o| files : "photo_file_id"
  users }o--o| organizations : "deletion_with_organization_id"
```

From other areas, drawn bare:

- [files](files.md): `files`
- [organizations](organizations.md): `organizations`
