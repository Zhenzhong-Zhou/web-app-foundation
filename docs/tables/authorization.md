# Tables: authorization

The tables of authorization and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  invitation_roles {
    uuid id PK
    uuid invitation_id FK
    uuid role_id FK
    timestamptz created_at
  }
  membership_roles {
    uuid id PK
    uuid membership_id FK
    uuid role_id FK
    timestamptz created_at
  }
  permissions {
    uuid id PK
    text key
    text description
    timestamptz created_at
    timestamptz updated_at
  }
  role_permissions {
    uuid role_id PK, FK
    uuid permission_id PK, FK
  }
  roles {
    uuid id PK
    text name
    text description
    boolean is_system
    uuid updated_by FK
    timestamptz created_at
    timestamptz updated_at
  }
  invitation_roles }o--|| invitations : "invitation_id"
  invitation_roles }o--|| roles : "role_id"
  membership_roles }o--|| memberships : "membership_id"
  membership_roles }o--|| roles : "role_id"
  role_permissions }o--|| roles : "role_id"
  role_permissions }o--|| permissions : "permission_id"
  roles }o--o| users : "updated_by"
```

From other areas, drawn bare:

- [invitations](invitations.md): `invitations`
- [organizations](organizations.md): `memberships`
- [users](users.md): `users`
