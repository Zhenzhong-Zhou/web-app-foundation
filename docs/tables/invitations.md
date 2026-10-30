# Tables: invitations

The tables of invitations and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  invitations {
    uuid id PK
    text email
    text locale
    text note
    uuid invited_by FK
    text link
    timestamptz expires_at
    uuid membership_id FK
    timestamptz accepted_at
    timestamptz revoked_at
    timestamptz created_at
    timestamptz updated_at
  }
  organization_invitations {
    uuid id PK
    text email
    text organization_name
    text locale
    timestamptz expires_at
    uuid started_organization_id FK
    timestamptz accepted_at
    timestamptz revoked_at
    timestamptz created_at
    timestamptz updated_at
  }
  invitations }o--|| users : "invited_by"
  invitations }o--o| memberships : "membership_id"
  organization_invitations }o--o| organizations : "started_organization_id"
```

From other areas, drawn bare:

- [organizations](organizations.md): `memberships`, `organizations`
- [users](users.md): `users`
