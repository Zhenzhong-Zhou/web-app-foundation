# Tables: auth

The tables of auth and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  account_events {
    uuid id PK
    uuid user_id FK
    text action
    inet ip
    text user_agent
    timestamptz created_at
  }
  auth_tokens {
    uuid id PK
    text token_hash
    uuid user_id FK
    uuid invitation_id FK
    uuid organization_invitation_id FK
    text purpose
    timestamptz expires_at
    timestamptz consumed_at
    timestamptz created_at
  }
  sessions {
    uuid id PK
    text token_hash
    uuid user_id FK
    uuid current_org_id FK
    timestamptz issued_at
    timestamptz expires_at
    timestamptz last_seen_at
    boolean keep_signed_in
    inet ip
    text user_agent
  }
  account_events }o--|| users : "user_id"
  auth_tokens }o--o| users : "user_id"
  auth_tokens }o--o| invitations : "invitation_id"
  auth_tokens }o--o| organization_invitations : "organization_invitation_id"
  sessions }o--|| users : "user_id"
  sessions }o--o| organizations : "current_org_id"
```

From other areas, drawn bare:

- [invitations](invitations.md): `invitations`, `organization_invitations`
- [organizations](organizations.md): `organizations`
- [users](users.md): `users`
