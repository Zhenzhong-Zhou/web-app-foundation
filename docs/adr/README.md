# Architecture Decisions

An ADR records one structural decision as it was made: the situation,
what was chosen and why, what was considered and not done, what was
deferred with what brings it in, and what it commits us to. Each is a
file of its own and is not rewritten: what it decided changes by a
dated amendment at its end, written there whether the change comes
from building it or from a later ADR, which lists it in its `amends`.
Some older ADRs carry only a note at their top naming the later ADR. A
decision replaced whole is a new ADR, and the old one's status says
so. A path or link that moves is corrected in place
([ADR-086](0086-docs-as-code.md)).

Status is `accepted`, `deferred` (decided, waiting for its trigger) or
`superseded by ADR-NNN`.

A new ADR, after the check
[engineering.md, Process](../engineering.md#process) asks for: copy
[the template](template.md) to `NNNN-<slug>.md`, its number in four
digits and its slug from its title as
[ADR-086](0086-docs-as-code.md#decision--one-file-per-adr) makes it; fill
it in, its `areas` from the list in `scripts/adr-index.mjs`; list in
its `amends` each ADR it changes; in each of those, add it to
`amended-by` and write the change as a dated amendment at the end,
naming this ADR; then run `node scripts/adr-index.mjs`.

Both indexes below are written by that script from each file's front
matter and heading, never by hand, and `scripts/verify.sh` fails when
either differs from the files. What is not yet decided is in
[Open decisions](open-decisions.md).

## By number

<!-- adr-index:start -->

| ADR | Title | Status | Date | Amends | Amended by |
| --- | --- | --- | --- | --- | --- |
| [ADR-001] | NestJS as the server framework | accepted | 2026-08-24 | | |
| [ADR-002] | PostgreSQL as the database | accepted | 2026-08-24 | | |
| [ADR-003] | Multi-tenancy: shared schema with `organization_id` | accepted | 2026-08-24 | | |
| [ADR-004] | Roles scoped through membership | accepted | 2026-08-24 | | [ADR-080] |
| [ADR-005] | No background jobs in V1; email sends synchronously | accepted | 2026-08-24 | | |
| [ADR-006] | Self-serve registration is the only onboarding path in V1 | accepted | 2026-08-24 | | [ADR-077], [ADR-078] |
| [ADR-007] | React SPA on Vite, not Next.js | accepted | 2026-08-24 | | |
| [ADR-008] | Testing scaffolding lands in V1 | accepted | 2026-08-24 | | |
| [ADR-009] | Drizzle for schema, migrations, and queries | accepted | 2026-08-24 | | |
| [ADR-010] | UUIDv7 primary keys | accepted | 2026-08-24 | | |
| [ADR-011] | Opaque session cookies, not JWT | accepted | 2026-08-24 | | [ADR-015] |
| [ADR-012] | Account deletion, audit retention, and cascade defaults | accepted | 2026-08-24 | | [ADR-069], [ADR-070] |
| [ADR-013] | API versioning by URL prefix | accepted | 2026-08-24 | | [ADR-081] |
| [ADR-014] | CSRF: a custom header, not a token | accepted | 2026-08-26 | | |
| [ADR-015] | Multiple concurrent sessions per user | accepted | 2026-08-26 | [ADR-011] | |
| [ADR-016] | Permissions resolved per request | accepted | 2026-08-27 | | [ADR-079], [ADR-080] |
| [ADR-017] | Email verification and password reset | accepted | 2026-08-28 | | |
| [ADR-018] | Audit log: an interceptor, and silence by default | accepted | 2026-08-28 | | [ADR-076] |
| [ADR-019] | Peer dependency conflicts are never overridden | accepted | 2026-08-31 | | [ADR-067], [ADR-082] |
| [ADR-020] | Client routes fall into three categories, not two | accepted | 2026-08-31 | | |
| [ADR-021] | Material UI as the component library | accepted | 2026-09-02 | | [ADR-055] |
| [ADR-022] | Account events are a separate table from the audit log | accepted | 2026-09-02 | | |
| [ADR-023] | Stock lives on variants, and quantity is a ledger | accepted | 2026-09-03 | | [ADR-025] |
| [ADR-024] | Locations are one tree, and stock sits only at leaves | accepted | 2026-09-04 | | |
| [ADR-025] | Quantity is decimal, and the stock cache is the lock | accepted | 2026-09-08 | [ADR-023] | |
| [ADR-026] | Customers and suppliers are one table | accepted | 2026-09-10 | | |
| [ADR-027] | Orders are purchase and sale, and nothing else | accepted | 2026-09-10 | | |
| [ADR-028] | Addresses and contacts are shared tables with an exclusive arc | accepted | 2026-09-11 | | |
| [ADR-029] | A bill of materials is a header plus lines, and nesting is data | accepted | 2026-09-15 | | |
| [ADR-030] | Who supplies a component is a property of the run | accepted | 2026-09-15 | | |
| [ADR-031] | A duplicate re-resolves snapshots; it never copies history forward | accepted | 2026-09-15 | | |
| [ADR-032] | Production runs: partial output, actual consumption, lot identity | accepted | 2026-09-15 | | |
| [ADR-033] | A line is editable until something depends on it | accepted | 2026-09-16 | | |
| [ADR-034] | A short line is closed, not shrunk | accepted | 2026-09-16 | | |
| [ADR-035] | A price and its currency belong to the line | accepted | 2026-09-16 | | [ADR-080] |
| [ADR-036] | A notification belongs to a person, not a tenant | accepted | 2026-09-18 | | |
| [ADR-037] | Security events are emailed too; notifications expire | accepted | 2026-09-21 | | |
| [ADR-038] | An audit row names its resource as it was at the time | accepted | 2026-09-21 | | [ADR-076] |
| [ADR-039] | Component lots: earliest expiry first, with a hand-picked override | accepted | 2026-09-22 | | |
| [ADR-040] | Product licences: a table, dated, and fixed once a run relies on one | accepted | 2026-09-22 | | [ADR-050], [ADR-052] |
| [ADR-041] | Shipping: a shipment is a document, and stock leaves by lot | accepted | 2026-09-23 | | |
| [ADR-042] | Samples, and stock that is not for sending | accepted | 2026-09-23 | | |
| [ADR-043] | Customer returns | accepted | 2026-09-23 | | |
| [ADR-044] | Lot trace | accepted | 2026-09-23 | | |
| [ADR-045] | Reservations: available to promise, computed rather than stored | accepted | 2026-09-23 | | |
| [ADR-046] | Invoicing: an invoice bills one shipment, and is reversed, never edited | accepted | 2026-09-25 | | [ADR-071], [ADR-073] |
| [ADR-047] | Return authorizations, and credit notes for what comes back | accepted | 2026-09-26 | | [ADR-073] |
| [ADR-048] | Cost: value is a ledger, like quantity | accepted | 2026-09-28 | | |
| [ADR-049] | Price lists: a default that becomes the line's price | accepted | 2026-09-28 | | |
| [ADR-050] | Licence status at release | accepted | 2026-09-30 | [ADR-040] | |
| [ADR-051] | Performance: a volume seed, response-time budgets, plan checks | accepted | 2026-10-01 | | [ADR-081], [ADR-082] |
| [ADR-052] | Calendar days are `date`, sent as YYYY-MM-DD | accepted | 2026-10-02 | [ADR-040] | [ADR-072], [ADR-081] |
| [ADR-053] | Backups: an encrypted nightly dump we own, at another provider, restored monthly | accepted | 2026-10-02 | | |
| [ADR-054] | Languages: the person's language for the app, the customer's for documents | accepted | 2026-10-03 | | [ADR-071], [ADR-076], [ADR-081] |
| [ADR-055] | The look: tokens, a side rail, tabs and a summary beside the work | accepted | 2026-10-07 | [ADR-021] | [ADR-071], [ADR-075], [ADR-081], [ADR-082] |
| [ADR-056] | Search: one lookup in the top bar, and a search on every list | accepted | 2026-10-07 | | [ADR-073] |
| [ADR-057] | Lists by date range, sorted where it helps, exported as CSV | accepted | 2026-10-08 | | [ADR-072], [ADR-076] |
| [ADR-058] | Home: what needs attention, first | accepted | 2026-10-08 | | [ADR-072], [ADR-079] |
| [ADR-059] | Files: one store for every file, on R2, served through the app | accepted | 2026-10-08 | | [ADR-070] |
| [ADR-060] | Branding: each organization's logo, colour and expiry days | accepted | 2026-10-09 | | [ADR-082] |
| [ADR-061] | The Organization page in tabs, and a name that can change | accepted | 2026-10-09 | | |
| [ADR-062] | Product images: a gallery per product, thumbnails in lists | accepted | 2026-10-09 | | |
| [ADR-063] | People: a photo of one's own, initials otherwise, and a People page | accepted | 2026-10-09 | | [ADR-079] |
| [ADR-064] | Licence expiry reminders: told at 60, 30 and 7 days, and on the day | accepted | 2026-10-09 | | |
| [ADR-065] | Staying signed in: the person's choice, and the organization's policy | accepted | 2026-10-09 | | |
| [ADR-066] | Covers in the lookup | accepted | 2026-10-13 | | |
| [ADR-067] | The server's tests on Vitest, then Nest 12 | accepted | 2026-10-13 | [ADR-019] | [ADR-082] |
| [ADR-068] | OpenAPI from the server, the client's types generated (#19) | accepted | 2026-10-13 | | [ADR-081] |
| [ADR-069] | Deleting your account, and leaving an organization | accepted | 2026-10-14 | [ADR-012] | [ADR-070], [ADR-077], [ADR-079] |
| [ADR-070] | Deleting an organization | accepted | 2026-10-15 | [ADR-012], [ADR-059], [ADR-069] | [ADR-071], [ADR-078], [ADR-080] |
| [ADR-071] | Documents as PDF, drawn on the server | accepted | 2026-10-16 | [ADR-046], [ADR-054], [ADR-055], [ADR-070] | [ADR-072], [ADR-073], [ADR-080] |
| [ADR-072] | Each organization's time zone | accepted | 2026-10-16 | [ADR-052], [ADR-057], [ADR-058], [ADR-071] | |
| [ADR-073] | Each organization's document numbering | accepted | 2026-10-17 | [ADR-046], [ADR-047], [ADR-056], [ADR-071] | |
| [ADR-074] | Run numbers, and batch codes from them (deferred) | deferred | 2026-10-17 | | |
| [ADR-075] | Text size: the person's choice, and text that grows | accepted | 2026-10-18 | [ADR-055] | |
| [ADR-076] | The audit log in words: no ids, references named, every field translated | accepted | 2026-10-19 | [ADR-018], [ADR-038], [ADR-054], [ADR-057] | |
| [ADR-077] | Invitations: how a person joins an organization | accepted | 2026-10-19 | [ADR-006], [ADR-069] | [ADR-078], [ADR-079], [ADR-080], [ADR-083] |
| [ADR-078] | Registration: open, or by invitation | accepted | 2026-10-20 | [ADR-006], [ADR-070], [ADR-077] | [ADR-079] |
| [ADR-079] | A newcomer's first sign-in: a welcome on Home, and help on every page | accepted | 2026-10-20 | [ADR-016], [ADR-058], [ADR-063], [ADR-069], [ADR-077], [ADR-078] | [ADR-080] |
| [ADR-080] | Job roles: roles an organization makes, several to a member | accepted | 2026-10-21 | [ADR-004], [ADR-016], [ADR-035], [ADR-070], [ADR-071], [ADR-077], [ADR-079] | |
| [ADR-081] | Old tabs after a deploy: a newer build noticed, an outdated client told | accepted | 2026-10-22 | [ADR-013], [ADR-051], [ADR-052], [ADR-054], [ADR-055], [ADR-068] | [ADR-082] |
| [ADR-082] | The product's brand: Panivo before sign-in, the organization's after | accepted | 2026-10-24 | [ADR-019], [ADR-051], [ADR-055], [ADR-060], [ADR-067], [ADR-081] | [ADR-083] |
| [ADR-083] | The emails: one layout for every email | accepted | 2026-10-26 | [ADR-077], [ADR-082] | |
| [ADR-086] | Docs as code: one file per decision, and links that are checked | accepted | 2026-10-27 | | |
| [ADR-087] | The rules written down: `docs/rules/` for people, `.claude/rules/` for Claude | accepted | 2026-10-27 | | |

[ADR-001]: 0001-nestjs-as-the-server-framework.md
[ADR-002]: 0002-postgresql-as-the-database.md
[ADR-003]: 0003-multi-tenancy.md
[ADR-004]: 0004-roles-scoped-through-membership.md
[ADR-005]: 0005-no-background-jobs-in-v1.md
[ADR-006]: 0006-self-serve-registration-is-the-only-onboarding-path-in-v1.md
[ADR-007]: 0007-react-spa-on-vite-not-next-js.md
[ADR-008]: 0008-testing-scaffolding-lands-in-v1.md
[ADR-009]: 0009-drizzle-for-schema-migrations-and-queries.md
[ADR-010]: 0010-uuidv7-primary-keys.md
[ADR-011]: 0011-opaque-session-cookies-not-jwt.md
[ADR-012]: 0012-account-deletion-audit-retention-and-cascade-defaults.md
[ADR-013]: 0013-api-versioning-by-url-prefix.md
[ADR-014]: 0014-csrf.md
[ADR-015]: 0015-multiple-concurrent-sessions-per-user.md
[ADR-016]: 0016-permissions-resolved-per-request.md
[ADR-017]: 0017-email-verification-and-password-reset.md
[ADR-018]: 0018-audit-log.md
[ADR-019]: 0019-peer-dependency-conflicts-are-never-overridden.md
[ADR-020]: 0020-client-routes-fall-into-three-categories-not-two.md
[ADR-021]: 0021-material-ui-as-the-component-library.md
[ADR-022]: 0022-account-events-are-a-separate-table-from-the-audit-log.md
[ADR-023]: 0023-stock-lives-on-variants-and-quantity-is-a-ledger.md
[ADR-024]: 0024-locations-are-one-tree-and-stock-sits-only-at-leaves.md
[ADR-025]: 0025-quantity-is-decimal-and-the-stock-cache-is-the-lock.md
[ADR-026]: 0026-customers-and-suppliers-are-one-table.md
[ADR-027]: 0027-orders-are-purchase-and-sale-and-nothing-else.md
[ADR-028]: 0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md
[ADR-029]: 0029-a-bill-of-materials-is-a-header-plus-lines-and-nesting-is-data.md
[ADR-030]: 0030-who-supplies-a-component-is-a-property-of-the-run.md
[ADR-031]: 0031-a-duplicate-re-resolves-snapshots.md
[ADR-032]: 0032-production-runs.md
[ADR-033]: 0033-a-line-is-editable-until-something-depends-on-it.md
[ADR-034]: 0034-a-short-line-is-closed-not-shrunk.md
[ADR-035]: 0035-a-price-and-its-currency-belong-to-the-line.md
[ADR-036]: 0036-a-notification-belongs-to-a-person-not-a-tenant.md
[ADR-037]: 0037-security-events-are-emailed-too.md
[ADR-038]: 0038-an-audit-row-names-its-resource-as-it-was-at-the-time.md
[ADR-039]: 0039-component-lots.md
[ADR-040]: 0040-product-licences.md
[ADR-041]: 0041-shipping.md
[ADR-042]: 0042-samples-and-stock-that-is-not-for-sending.md
[ADR-043]: 0043-customer-returns.md
[ADR-044]: 0044-lot-trace.md
[ADR-045]: 0045-reservations.md
[ADR-046]: 0046-invoicing.md
[ADR-047]: 0047-return-authorizations-and-credit-notes-for-what-comes-back.md
[ADR-048]: 0048-cost.md
[ADR-049]: 0049-price-lists.md
[ADR-050]: 0050-licence-status-at-release.md
[ADR-051]: 0051-performance.md
[ADR-052]: 0052-calendar-days-are-date-sent-as-yyyy-mm-dd.md
[ADR-053]: 0053-backups.md
[ADR-054]: 0054-languages.md
[ADR-055]: 0055-the-look.md
[ADR-056]: 0056-search.md
[ADR-057]: 0057-lists-by-date-range-sorted-where-it-helps-exported-as-csv.md
[ADR-058]: 0058-home.md
[ADR-059]: 0059-files.md
[ADR-060]: 0060-branding.md
[ADR-061]: 0061-the-organization-page-in-tabs-and-a-name-that-can-change.md
[ADR-062]: 0062-product-images.md
[ADR-063]: 0063-people.md
[ADR-064]: 0064-licence-expiry-reminders.md
[ADR-065]: 0065-staying-signed-in.md
[ADR-066]: 0066-covers-in-the-lookup.md
[ADR-067]: 0067-the-servers-tests-on-vitest-then-nest-12.md
[ADR-068]: 0068-openapi-from-the-server-the-clients-types-generated.md
[ADR-069]: 0069-deleting-your-account-and-leaving-an-organization.md
[ADR-070]: 0070-deleting-an-organization.md
[ADR-071]: 0071-documents-as-pdf-drawn-on-the-server.md
[ADR-072]: 0072-each-organizations-time-zone.md
[ADR-073]: 0073-each-organizations-document-numbering.md
[ADR-074]: 0074-run-numbers-and-batch-codes-from-them.md
[ADR-075]: 0075-text-size.md
[ADR-076]: 0076-the-audit-log-in-words.md
[ADR-077]: 0077-invitations.md
[ADR-078]: 0078-registration.md
[ADR-079]: 0079-a-newcomers-first-sign-in.md
[ADR-080]: 0080-job-roles.md
[ADR-081]: 0081-old-tabs-after-a-deploy.md
[ADR-082]: 0082-the-products-brand.md
[ADR-083]: 0083-the-emails.md
[ADR-086]: 0086-docs-as-code.md
[ADR-087]: 0087-the-rules-written-down.md

<!-- adr-index:end -->

## By area

Written by the same script from each file's `areas`: a line per area,
its ADRs in number order. An area is a folder of `server/src/modules/`,
`server/src/core/` or `server/src/shared/`, or `api`, `database`,
`docs`, `help`, `i18n`, `ops` or `ui` for what crosses them; the rules
files take the same names. An area no ADR names has no line.

<!-- adr-areas:start -->

- `boms`: [ADR-029], [ADR-030], [ADR-040]
- `costs`: [ADR-048]
- `home`: [ADR-058], [ADR-079]
- `invoices`: [ADR-046], [ADR-047], [ADR-071], [ADR-073]
- `locations`: [ADR-024], [ADR-028], [ADR-030], [ADR-042]
- `numbering`: [ADR-073], [ADR-074]
- `orders`: [ADR-026], [ADR-027], [ADR-031], [ADR-033], [ADR-034], [ADR-035], [ADR-041], [ADR-042], [ADR-043], [ADR-045], [ADR-046], [ADR-049], [ADR-071]
- `partners`: [ADR-026], [ADR-028]
- `price-lists`: [ADR-049]
- `product-licences`: [ADR-029], [ADR-040], [ADR-050], [ADR-064]
- `production-orders`: [ADR-030], [ADR-032], [ADR-039], [ADR-050], [ADR-074]
- `products`: [ADR-023], [ADR-062], [ADR-066]
- `recent`: [ADR-058]
- `return-authorizations`: [ADR-047]
- `search`: [ADR-056], [ADR-066]
- `stock`: [ADR-023], [ADR-024], [ADR-025], [ADR-032], [ADR-039], [ADR-041], [ADR-042], [ADR-043], [ADR-044], [ADR-045], [ADR-048]
- `tax-codes`: [ADR-046]
- `audit`: [ADR-012], [ADR-018], [ADR-022], [ADR-038], [ADR-076]
- `auth`: [ADR-006], [ADR-011], [ADR-014], [ADR-015], [ADR-017], [ADR-020], [ADR-022], [ADR-037], [ADR-065], [ADR-078]
- `authorization`: [ADR-004], [ADR-016], [ADR-080]
- `documents`: [ADR-054], [ADR-071]
- `files`: [ADR-059], [ADR-062], [ADR-063]
- `invitations`: [ADR-077], [ADR-078], [ADR-079], [ADR-083]
- `notifications`: [ADR-036], [ADR-037], [ADR-064]
- `organizations`: [ADR-003], [ADR-004], [ADR-006], [ADR-060], [ADR-061], [ADR-065], [ADR-069], [ADR-070], [ADR-072], [ADR-080]
- `people`: [ADR-063]
- `users`: [ADR-012], [ADR-069]
- `mail`: [ADR-005], [ADR-017], [ADR-037], [ADR-054], [ADR-069], [ADR-070], [ADR-077], [ADR-078], [ADR-082], [ADR-083]
- `api`: [ADR-001], [ADR-013], [ADR-014], [ADR-052], [ADR-057], [ADR-068], [ADR-081]
- `database`: [ADR-002], [ADR-003], [ADR-009], [ADR-010], [ADR-012], [ADR-025], [ADR-028], [ADR-051], [ADR-052], [ADR-056], [ADR-081]
- `docs`: [ADR-086], [ADR-087]
- `help`: [ADR-079]
- `i18n`: [ADR-054], [ADR-072], [ADR-076]
- `ops`: [ADR-005], [ADR-008], [ADR-019], [ADR-051], [ADR-053], [ADR-059], [ADR-067], [ADR-070], [ADR-081]
- `ui`: [ADR-007], [ADR-020], [ADR-021], [ADR-055], [ADR-057], [ADR-060], [ADR-075], [ADR-082]

<!-- adr-areas:end -->
