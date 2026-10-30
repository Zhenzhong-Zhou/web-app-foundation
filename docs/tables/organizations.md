# Tables: organizations

The tables of organizations and their foreign keys, written from the Drizzle
schema by `npm run diagrams` in `server/`. [The index](README.md) says
how to read the diagram.

```mermaid
erDiagram
  memberships {
    uuid id PK
    uuid user_id FK
    text job_title
    text department
    text location
    text work_phone
    text extension
    timestamptz last_active_at
    timestamptz welcome_dismissed_at
    timestamptz created_at
    timestamptz updated_at
  }
  organizations {
    uuid id PK
    text name
    text slug
    text tax_registration_number
    char(3) base_currency
    uuid default_sale_price_list_id FK
    text licence_not_in_force_policy
    text licence_expired_policy
    boolean licence_required
    text document_language
    text document_second_language
    text[] required_name_languages
    timestamptz getting_started_dismissed_at
    timestamptz team_step_skipped_at
    uuid logo_file_id FK
    uuid square_logo_file_id FK
    text accent_color
    text rail
    boolean logo_on_documents
    text paper_size
    text time_zone
    boolean documents_in_date_order
    integer idle_sign_out_minutes
    text idle_sign_out_scope
    integer expiry_warning_days
    integer expiry_critical_days
    date deletion_scheduled_at
    timestamptz deletion_reminded_at
    timestamptz deletion_started_at
    timestamptz created_at
    timestamptz updated_at
  }
  memberships }o--|| users : "user_id"
  organizations }o--o| price_lists : "default_sale_price_list_id"
  organizations }o--o| files : "logo_file_id"
  organizations }o--o| files : "square_logo_file_id"
```

From other areas, drawn bare:

- [price-lists](price-lists.md): `price_lists`
- [files](files.md): `files`
- [users](users.md): `users`
