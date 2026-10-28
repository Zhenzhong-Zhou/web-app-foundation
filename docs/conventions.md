# Conventions

Only things ESLint and Prettier **cannot** enforce. Formatting, quote style, semicolons,
and import order are the linter's job — run `npm run lint`, don't argue about them here.

If a rule in this file could be a lint rule instead, it should be. Documentation rots;
tooling doesn't.

---

## File names

kebab-case, with a dot-separated type suffix:

```text
users.controller.ts        UsersController
users.service.ts           UsersService
users.module.ts            UsersModule
create-user.dto.ts         CreateUserDto
session.guard.ts           SessionGuard
http-exception.filter.ts   HttpExceptionFilter
current-user.decorator.ts  CurrentUser
users.service.spec.ts      unit test, beside the source
health.e2e-spec.ts         integration test, in test/
```

One exported class per file, named to match the file. A file whose name doesn't
predict its export is a file nobody can find.

---

## Identifiers

| Thing                     | Style             | Example                                   |
|---------------------------|-------------------|-------------------------------------------|
| Classes, DTOs, interfaces | PascalCase        | `UsersService`, `CreateUserDto`           |
| Methods, variables        | camelCase         | `findByEmail`                             |
| Module-level constants    | UPPER_SNAKE       | `SESSION_COOKIE_NAME`                     |
| Database columns          | snake_case        | `organization_id`                         |
| Drizzle schema fields     | camelCase         | `organizationId: uuid('organization_id')` |
| Permission strings        | `resource.action` | `users.create`, `reports.view`            |

The snake_case/camelCase split is deliberate: SQL stays idiomatic SQL, TypeScript stays
idiomatic TypeScript, and Drizzle's column definition is the one place they meet.

---

## Functions

**Class methods are regular methods, never arrow properties.**

```ts
// correct
@Get()
check() { ... }

// broken — @Get() is a method decorator; an arrow property is an
// instance field, so the route is never registered
@Get()
check = () => { ... };
```

This is not a style preference. Nest's decorators and DI read prototype metadata, and
an arrow class property doesn't live on the prototype.

- **Standalone module functions** — `export function name()`. Hoisted, and named in
  stack traces.
- **Callbacks, `.map()`, inline** — arrow.

---

## A new table and the organization's export

- **A table with an `organization_id` is in the organization's export**
  (ADR-070), every column, with nothing to add: unless it belongs to each
  member rather than the organization, and is listed in `NOT_EXPORTED`
  (`core/organizations/organization-tables.ts`) with its reason. A table
  owned through a parent, with no `organization_id` of its own, goes in
  `OWNED_THROUGH_PARENT` beside it, exported by hand or with its reason.
  The export's coverage tests fail on a table that is neither.
- **A file beyond the tables** comes from the module that owns it,
  through `ExportContributions` (`core/organizations/export-contributions.ts`,
  ADR-071): core may not import a module, so the module registers an
  `ExportContributor` in its `onModuleInit`. It lists its entries in the
  export's own transaction, so they are the records the CSVs hold, and
  makes each one only when the archive reaches it, in the request's
  tenant: `invoices/invoice-documents-export.ts`, the invoices' and credit
  notes' PDFs, is the one there is.
- **A table with `updated_at` gets its own trigger** in the migration that
  creates it, written by hand after a `--> statement-breakpoint`: a
  `BEFORE UPDATE` trigger calling `set_updated_at()`, as 0010's do.
  drizzle-kit does not model triggers, so nothing generates it and nothing
  warns: `updated_at` stays at the insert, and every row looks as if nobody
  edited it. Eight tables made in 0003 to 0008 went without one until 0010
  added theirs (`server/src/database/schema/columns.ts`, beside
  `timestamps`). `server/test/schema.e2e-spec.ts` names each table with
  `updated_at` and no trigger.

## A new printed document

Every document is a PDF the server draws (ADR-071), in the same few pieces.

- **A `Printable`** (`core/documents/documents.service.ts`) says what the
  document is: its customer's languages, the seller's country it copied
  at issue or null for the organization's as now, its file's name, its
  `which` for every page's foot ("Purchase order · PO-000045") and its
  `draw`, the pdfmake definition in the document's words. A
  `printableThing(detail)` beside the builder, in `thing-document.ts`,
  makes one from the data its own page reads.
- **Its route** sits beside the document's read, under the same
  permission, with `@PdfResponse()` for the API document and
  `@DownloadAsked()` for `?download=1`, and is one call:
  `documents.send(res, download, read.then(printableThing))`. `send` reads
  the letterhead beside the document, puts the logo above the drawing and
  the foot on every page, and answers inline for Print or as an attachment
  for Download PDF. A builder draws neither the logo nor the foot.
- **Its parts** come from `core/documents/sheet.ts`: `masthead`, `banner`,
  `notice`, `party` and `sellerParty`, `linesTable` or `linesOf` with
  `head`, `cell` and `itemNames`, `totals`, `paragraph`, and `run` for any
  text, which gives each character a font that has it. Who and where it
  names as they are today, the seller, a partner's address, a site, who
  raised it, come from `core/documents/parties.ts`, read in the
  document's own transaction.
- **Its words** are server messages in all three catalogues, through
  `doc.label` and `doc.lines`; its figures go through `format.ts`, money
  and unit prices from their strings. A calendar day, an invoice's date,
  is written as it is; a moment's day, when a slip shipped, goes through
  `doc.dayOf`, in the organization's time zone (ADR-072).

## A new email

Every email is written on one layout, from blocks (ADR-083).

- **Its blocks** are a `MailContent`
  (`server/src/shared/mail/mail-layout.ts`), in the reader's language: a
  greeting by name, paragraphs, at most one button, details, a quote,
  small print, a written-out link and a footer. `writeMail` writes the
  HTML and the text part from the same blocks and escapes every value, so
  a builder never writes HTML. A block whose text part reads otherwise
  gives those words as `plain`, or null for the HTML alone.
- **How it is sent.** The product's emails go through `MailBrand.send`,
  which opens each with the header and its subject as its heading. The
  organization's, the invitation today, are written with `writeMail`
  and sent through `MailService`, with no header, and only they set
  `replyTo`, to the member they come from while still one. One sent to an
  address a member typed needs the sender's own address confirmed first
  (ADR-077).
- **Its words** are server messages in all three catalogues. A link
  inside a sentence is a placeholder the language places, rendered with
  `translateParts`; a button only where the action already has words.
- **Its proof.** A sample in `server/src/cli/mail/mail-samples.ts`, in
  each language it is sent in, and its text part's files under
  `__text__/`, read before they are committed with it (Tests). The first
  run of `npm run mail:text` in `server/` writes them from the new email,
  and says a file is missing; the second is green. `npm run mail:preview`
  then shows it beside the rest, and `-- --send` puts it in Mailpit.

## Module boundaries

- One folder per module under `core/`, each with its own `*.module.ts`.
- **`common/` must never import from `core/`.** The dependency runs one way. Reversing
  it is how a "shared" folder becomes a second copy of the application.
- **Services must never import `db` directly** (ADR-009). All queries go through
  `TenantDb`, which applies `organization_id`. `UNSAFE_GLOBAL_DB` is refused by a
  lint rule except in the files `server/eslint.config.mjs` lists, each with its
  reason — direct use elsewhere is a review-blocking defect.
- **The organization goes in every join's ON clause**, though the base
  table is already scoped. It changes no result; without it, Postgres may
  read every organization's rows of the joined table, a cost that grows
  with the whole database rather than with one customer's data (#186,
  #187). For the same reason, an `exists` that a scan answers at its
  first match is no reason to allow that scan in the plan check: for an
  organization with no such row, it reads every organization's. Order the
  subquery as an index is and take one row instead (ADR-058).
- **The role tables stay in `core/authorization`** (ADR-080).
  `membership_roles`, `invitation_roles` and `role_permissions` are refused
  by a lint rule outside it, except the files `server/eslint.config.mjs`
  lists, each with its reason. What a member may do, and who may do
  something, is asked of `PermissionsService`.

### What a complete module looks like

```text
core/auth/
├── dto/
│   ├── login.dto.ts          request shapes, validated by class-validator
│   └── register.dto.ts
├── auth.controller.ts        HTTP only — parse, delegate, respond
├── auth.module.ts            wiring; `exports` declares what leaves the module
├── auth.service.ts           the actual work
├── session.service.ts        a second service is fine when the concern differs
├── session-cookie.ts         plain constants/functions take no dot suffix
└── password.service.spec.ts  unit test, beside its source
```

DTOs live in `dto/` **inside** the module that uses them, never in a global folder.
A DTO is part of one module's contract; a shared `dto/` directory becomes a place
where unrelated modules quietly start depending on each other's shapes.

**Controllers parse and respond; services decide.** A controller containing an `if`
about business rules is a service method that hasn't been written yet — and it is
untestable without booting HTTP.

Files that export plain functions or constants (`slug.ts`, `permissions.ts`,
`session-cookie.ts`) take no dot suffix. The suffix marks a Nest type, so a file
named `*.service.ts` should be an `@Injectable()` class and nothing else.

---

## Duplication

Two near-identical shapes are fine; three is a signal. Extracting at two usually
costs more than it saves — the abstraction has to guess which parts are shared,
and one of the two then needs an escape hatch.

Pairs currently being watched rather than extracted:

- `AuthenticatedUser` and `CurrentSession.user` share four fields and differ in
  the fifth. Extract the shared fields at the third response shape.
- The kept notice in `DeletionBanner` and `OrganizationDeletionBanner`: the
  status that says what a keep or a cancel kept, focused once it shows.
  Extract at a third banner that keeps something.

Extracted at three: a name's, a new password's and an organization's name's
limits, which every DTO taking them reads from `common/dto/account-rules.ts` as
constants (not a shared DTO, which the rule above forbids).

Test helpers follow the same rule with one addition: extract *knowledge* (a
library's interface shape, a stub that must match a real service) and leave
*structure* alone. `unlimitedThrottler` and `RecordingMailService` are in
`test/utils/` because they mirror interfaces that drift; the `beforeAll` /
`afterAll` / `beforeEach` block is repeated in every suite deliberately, because
hiding it makes the `app.close()` rule above unenforceable by reading.

`registerOrg`, `addViewer`, and `roleIdNamed` were the awkward middle: knowledge
rather than structure, once copied into every e2e suite, and past the rule of
three. They now live in `test/utils/fixtures.ts`, `registerOrg` as
`registerOrganization`, with the rest of the server's test helpers under
[Shared pieces on the server](#shared-pieces-on-the-server).

### Shared pieces on the server

Use these rather than writing the thing again. The client's are under
[Shared pieces for screens](#shared-pieces-for-screens-adr-055).

- **`common/`:** `dto/currency.ts` (`IsCurrencyCode`, with
  `isCurrencyCode` in `database/schema/columns.ts` for checks),
  `dto/decimal.ts` (`IsPositiveDecimal`, `IsNonNegativeDecimal`),
  `dto/calendar-day.ts` (`IsCalendarDay`, which reads
  `CALENDAR_DAY_INPUT`), `today.ts` (`todayIn`, `dayIn`),
  `dto/keyset-query.dto.ts` and `keyset.ts` (`pageOf`). A DTO never
  restates a rule's message; `$property` names the field.
- **`core/documents/`:** `sheet.ts` (`masthead`, `party`, `linesTable`,
  `totals`, `banner`, `notice`) for every document's parts, `parties.ts`
  for who and where it names, and `DocumentsService.send` with a
  `Printable` for its route.
- **The lookups every action starts from,** under `modules/`, each
  scoped to the organization in its where clause: `orders/load-order.ts`,
  `invoices/lock-draft.ts`, `production-orders/run-guards.ts`,
  `return-authorizations/lock-open.ts`. Also `stock/rates.ts`
  (`baseCurrency`, `rateOnOrBefore`), `stock/availability.ts`
  (`inVariantOrder`, the one order product locks are taken in),
  `orders/order-line-pricing.ts` (`pricedCurrencies`,
  `assertOneSaleCurrency`), `orders/lot-items.ts` (what a shipment or
  return moved), `return-authorizations/lines-with-progress.ts`,
  `invoices/issued-invoice.ts` (`partiesOf`, `stored`) and
  `invoices/credit-amounts.ts` (`computeCredit`).
- **Services split by job:** orders → `OrdersService` (reads),
  `OrderLifecycleService`, `OrderLinesService`, `OrderReceiptsService`;
  invoices → `InvoicesService` (reads), `InvoiceDraftsService`,
  `InvoiceIssuingService`; production → `ProductionOrdersService`,
  `ProductionExecutionService`, `ProductionCloseService`; shipments →
  `ShipmentsService` (reads), `ShippingService`, `ShipmentVoidsService`;
  RMAs → `ReturnAuthorizationsService`,
  `ReturnAuthorizationReceiptsService`,
  `ReturnAuthorizationReplacementsService`; stock → `StockService` (the
  one write path, kept whole), `StockReadsService`, `LotsService`.
- **The server's tests, `test/utils/`:** `fixtures.ts` (`createE2eApp`,
  `body`, `PASSWORD`, `registerOrganization`, `createPartner`,
  `createLocation`, `createVariant`, `roleIdNamed`, `addMember`,
  `addViewer`), `sales.ts` (`shippedSale`), `valuation.ts` (buy, move,
  pool reads, `expectBooksToReconcile`) and `routes.ts` (the coverage
  walk).

### Reviewed and kept

jscpd still reports these (`.jscpd.json` holds its paths, so a plain
`npx jscpd` gives the report); each was read in the maintainability
rounds of October 2026 and kept on purpose. Re-review one only when the
code around it changes.

- Create and update DTO pairs (address, contact, partner, variant,
  licence, location): required against optional; each DTO states its own
  shape.
- Controller import headers and schema column blocks: declarations, not
  rules.
- The e2e specs' own response interfaces against the generated types:
  separate packages, and the specs describe what a test reads, not the
  whole response.
- Login, register and reset: their form-state and submit blocks skip
  `useSubmit` because they navigate away on success. Forgot-password keeps
  its own message: it must not repeat the server's words.
- The login and forgot-password email field, the two order-line price
  fields, and the "Into" location select in the receive dialogs: two
  copies each, with different help text.
- List pages' loading and empty frames: they vary in skeleton rows and
  wording; a component would need a prop for each difference.
- Dialog plumbing (imports, `useSubmit`, `close`, `handleSubmit`, the
  `update(field)` helper): sharing it would mean a form framework.
- `products/variant-row.tsx` keeps its own `Detail` (label beside value,
  a spec sheet); `LabelledValue` is caption above value.
- The cost panels' top (the `useResource` guard and a six-line heading)
  and the run cost panel's two tables (different columns).
- Stock value's needs-cost list stays off `useKeysetList`: it is read with
  the valuation under one banner. The multi-read pages (order detail,
  members, inventory, exchange rates) stay off `useResource` for the same
  reason.
- Two order lookups stay outside `loadOrder`: one joins the partner for
  its columns, one runs outside a transaction through `TenantDb`.
- Repeats inside a single spec: each test should read on its own.
- `stock.e2e-spec.ts` keeps its own `createLocation` (its own defaults;
  the name also clashes with the fixture).
- `lockOpen` against `lockForReceipt`, and `lockDraft` against void's
  lock: the same lock query, different rules. A path id answers 404, a
  body id 400; the allowed statuses differ; the receipt adds order and
  goods checks.
- Ship's and receive's counter updates on the order line: two limits and
  two constraints (ordered against shipped). Each says so in a comment.
- Closing and reopening a line: the same "confirmed only" skeleton, each
  with its own message.
- The order list against order detail, and the two invoice-line reads in
  issuing and in `InvoicesService`: different columns.
- `users.e2e-spec.ts` keeps its own `addMember` (it returns more than an
  agent).
- `boms/boms.service.ts` stays one service: a separate lines service would
  first need `insertLines`, `assertNoCycle`, `assertDraft` and
  `loadWithin` shared across two files. Revisit if it gains a second job,
  such as costing a recipe.
- The recipe panel's version header stays in the panel (about eight props
  and handlers to pull it out).

---

## Comments

Comment the **why**, never the what. Code already says what it does; it cannot say
what you rejected, or what breaks if someone changes it back.

```ts
// useless — restates the line below it
// set the updated_at column
updatedAt: timestamp('updated_at')

// useful — records a decision, and the failure it prevents
// RESTRICT, not CASCADE: deleting a role must not silently strip access
// from everyone holding it.
roleId: uuid('role_id').references(() => roles.id, { onDelete: 'restrict' })
```

- **File header** — only when the file's purpose isn't predictable from its name.
  `users.ts` exporting a `users` table needs none; the fact that it deliberately has
  no `organization_id` does.
- **Function docstring** — only for non-obvious contracts, side effects, or "why does
  this exist at all". `findByEmail(email)` needs nothing.
- **Reference the ADR** when a line exists because of a decision: `(ADR-011)` is
  shorter than re-arguing it and points at the full reasoning.
- **No section separator banners.** A file that needs `// ===== HELPERS =====` is a
  file that needs splitting.

A comment that repeats the code is worse than no comment: it doubles the edit cost
and silently goes stale.

---

## Adding text

Every word a person reads comes from a catalogue, in English, French and
Chinese (ADR-054). The rules, so a new screen or refusal arrives in all
three:

- **On a screen**, `intl.formatMessage({ id, defaultMessage })` or
  `<FormattedMessage>`, the English beside the code that shows it. A
  helper outside a component uses `intl()` from `src/i18n/intl`. A label
  the lint rule finds typed straight into JSX fails CI.
- **On the server**, throw `t({ id, defaultMessage }, values)` from
  `src/i18n/translate`, never a finished sentence; a DTO rule's own
  message is `rule(defineMessage({ id, defaultMessage }))`, with
  `{property}` for the field. Something written where no browser asks,
  an email or a notification, is rendered with `recipientLocale`.
- **The id** is named by feature folder, dotted, camelCase:
  `orders.ship.title`, `stock.lots.runShort`. Never a hash, never the
  English: a copy edit must not orphan a translation. Reuse an id only
  where the meaning is the same, not merely the words.
- **Values, not sentences.** Data goes in as a value, `{sku}`, `{number}`;
  a count as an ICU plural, never "has"/"have" chosen in code; a status
  or kind as an ICU select over its stored value; a list as a list (the
  server joins it per language); a nested sentence as a message of its
  own. A number for a person is formatted for them (`formatQuantity`,
  `formatMoney`), a calendar day stays YYYY-MM-DD in a server message.
- **Then** `npm run i18n:extract` in that package, and add the same id to
  `fr-CA.json` and `zh-Hans.json`, using `docs/glossary.md`'s words and a
  typographic apostrophe (’), which ICU leaves alone where ' starts a
  quote; English too, where `npm run i18n:check` refuses a straight one
  except where it quotes a brace (#184). It fails until all three agree,
  placeholders included. Written by whoever adds the English, reviewed by
  someone fluent before a release (MC-1405, `scripts/i18n-review.mjs`):
  `export` the first time, then `export --since` the commit the last round
  was exported at, which gives the reviewer only what changed.
- **A printed document** speaks its customer's languages, not the
  reader's: the server draws it, its words through `doc.label` and
  `doc.lines` (`core/documents/document-text.ts`), its figures through
  the document's locale.

## The API contract

The server describes its API in `server/openapi.json`, and the client's
types in `client/src/api/` are generated from it (ADR-068). Both are
committed, and neither is edited by hand.

- **After changing the API** (a route, a DTO, or one of the shared lists:
  permissions, languages, audit actions, error codes), run `npm run api` in
  `server/`, which writes the document and regenerates the client's types,
  and commit both with the change. CI fails if either is out of date.
- **The shared lists are the server's.** The client imports `Permission`,
  `Locale`, `AuditAction` and `ErrorCode` from the generated types and keeps
  no copy of its own.
- **A module's responses** (ADR-068, phase 2; tax codes were the pilot,
  then every module in turn, straight through):
  - Declare each response as a class in the module's
    `dto/*-response.dto.ts`, named as the client knows it (`TaxCode`), with
    an envelope class for the body (`TaxCodeList`, `CreatedTaxCode`). The
    CLI plugin describes them from their types. Names are global in the
    document, so name a class by what it is.
  - Give the controller's methods those return types.
  - Project in the service: return exactly the declared fields, never a
    spread table row, which would also send `organizationId` and
    timestamps the client never reads.
  - A paged list returns a page class per item type, `InvoicePage` with
    `entries` and `nextCursor`, since the document cannot describe a
    generic.
  - A write returns the detail its read returns, or as its list shows it
    where there is no read, such as a return's; or 204 when the screen
    reads again anyway (a delete, a state change, a settings section).
    CLAUDE.md and `/code-review` say the same. The detail is fetched after
    the write, never the row from `INSERT` or `UPDATE`: one shape per
    resource, whichever call the client made.
  - A list read with `select()` sends every column; select the declared
    fields instead.
  - A raw query's rows get a type of their own (`interface PoolRow`), as
    Postgres returns them, never `Record<string, unknown>`: a response
    built from unknowns cannot be checked against its declaration.
- **The API revision** (ADR-081). One number,
  `server/src/common/api-revision.ts`, carried as the document's
  `info.version` (`1.<revision>`) and written by `npm run api` into
  `client/src/api/revision.gen.ts`. The client sends it as
  `X-Api-Revision`; the server refuses a lower one (`client_outdated`) and a
  higher one (`api_updating`) before anything else, and serves a request
  without it. An additive change keeps it. A breaking change raises it by
  one in the commit that makes it, or keeps the old shape working for a
  while instead. CI's "Against main" job holds the rule with oasdiff; a
  change reviewed and accepted as harmless goes in
  `server/openapi-breaking-accepted.txt`, with its reason.
- **The e2e suite checks every response against the document** (ADR-068,
  amended): each object schema is closed, so a field the contract does
  not declare fails the test that made the request, as does a declared
  one missing or mistyped. The failure names the route and the field. Fix
  the projection; if the API changed on purpose, run `npm run api` first,
  since the check reads the committed `openapi.json`.
  - `npm run api`, then import the generated types where the client
    reads them, from `client/src/api/types.gen`. A name a screen switches
    on goes in `client/src/lib/api-names.ts`, read from a generated type
    (`OrderSummary['status']`), never written out again.

## Migrations against the running release (ADR-081)

A migration runs while the previous release still serves, so it leaves
working everything that release reads.

- **Expand, then contract.** In one deploy, add; never take away. Dropping
  or renaming a column or a table, changing a type, making a column
  required without a default, or replacing or dropping a key or unique
  index that a released `ON CONFLICT` names waits for a later migration,
  once no released code reads the old shape.
- **squawk** checks each new migration in CI and in `scripts/verify.sh`
  (`server/.squawk.toml` says which rules are off, and why). A statement
  the running release truly does not read takes squawk's ignore comment
  directly above it, with the reason on the line before.
- **squawk cannot see a key a query names,** so `/code-review` checks that
  by reading, as ADR-080's 0073 and ADR-073's 0067 show it must.
- **A snapshot copied by hand gets a fresh `id`, and the previous
  snapshot's as its `prevId`.** Each snapshot in
  `server/src/database/migrations/meta/` names itself and the one before,
  and drizzle-kit generates against that chain. Copying one, the obvious
  fix for a numbering mistake, copies both: two snapshots claim one
  identity, and drizzle-kit refuses to generate, with a collision that
  names the files without saying what is wrong.
  `server/scripts/check-snapshots.js` walks the chain before every
  `migrate:new`, in `npm run checks` and in CI, and says which `prevId` to
  repoint.

## Error codes

A refusal's message is for a person: it changes with the language
(ADR-054) and with the copy. Where a screen can offer the way out, such as
a link to the setting that is missing, the server adds a `code` beside the
message, and the screen keys on the code, never on the words.

- **Opt in, one at a time.** `withCode(t(...), ERROR_CODES.x)` on the
  thrown response. Most refusals carry none, and need none.
- **One list, on the server:** `server/src/common/error-codes.ts`. The
  client's `ErrorCode` type is generated from it (ADR-068), and a screen
  checks a refusal with `hasCode(errorCode, '…')`, so a code the server no
  longer sends fails to compile. The exception filter sends only the codes
  on the list.
- **snake_case, named for what is wrong**, not for the screen that offers
  the fix: `organization_address_missing`.
- **Never renamed or removed once released:** a browser still running the
  previous client may be keying on it.
- **A code may also mark the field a refusal is about,** as
  `password_incorrect` does (#120). The field takes `error`, and its
  `aria-describedby` points at the refusal's words through `FormError`'s
  `id`, which sits on the words rather than the alert, whose own label,
  "Error", would be read instead.
- **Details, when the way out needs a value.** `withCode(t(...), code,
  details)` adds what the screen acts on beside the code: which series a
  numbering refusal is about, in the API's names (`creditNote`), and the
  least next number it accepts (ADR-073). Declared in `ErrorDetails`
  (`server/src/openapi/error-body.ts`), so the client's type is generated;
  read on the client as `errorDetails` from `useSubmit`, and only behind
  `hasCode`. Values only, never words, and the filter passes them only
  beside a code on the list.
- **Two codes are the client's, whatever the screen:** `client_outdated`
  and `api_updating` (ADR-081). `send()` marks the tab, reads the version
  file and lets `messageFor` word them as they render; a screen does
  nothing of its own for either.
- **With a code, the message still says what to do next, but names no
  control on the screen.** The screen, keyed on the code, adds the link or
  the words naming its own control, from the client's catalogue, so
  renaming the control renames them too (#120).

## Tests

- Both sides test with Vitest (ADR-067). On the server, unit tests sit
  beside their source (`users.service.spec.ts`, `npm test`), and
  integration tests live in `test/` and end in `.e2e-spec.ts` (`npm run
  test:e2e`, one file at a time). CI's server job runs both.
- The repository's own scripts test with Node's runner:
  `scripts/*.test.mjs`, run by `node --test scripts/` from
  `scripts/verify.sh` and CI's server job (ADR-082).
- Vitest does not type-check. A type error in a spec fails `npm run
  typecheck`, which CI and `scripts/verify.sh` run, not the test run.
- Every integration test calls `await app.close()` in `afterAll`, or the
  `pg` pool stays open and the run hangs without explaining why.
- One integration test per feature as it's built (ADR-008).
- **Every email's text part has a proof** (ADR-083).
  `server/src/cli/mail/mail-samples.spec.ts` builds each email in each
  language it is sent in and compares its text part with its file under
  `__text__/`. A change of layout or code never rewrites one, ADR-083's
  layout included: a difference is the change's bug. A branch that changes
  an email's words on purpose, as #255 or a translation corrected, runs
  `npm run mail:text -- --update` in `server/` and commits the files with
  the words, in a commit that changes nothing else and names them.
- **The client's unit tests run in Tokyo**, `TZ` set in
  `vitest.config.ts`, so a test that assumes the computer is in UTC, or in
  the organization's zone, fails everywhere, not only on someone else's
  machine. A test about days sets the organization's zone itself
  (`setOrganizationTimeZone`). Server tests pass the zone and the clock
  (ADR-072). A test about a clock change uses one that has already
  happened: a law can drop one to come, as British Columbia did with
  1 November 2026's, and machines with older time-zone data still expect
  it.
- **`docs/manual-checks.md` moves with the code.** A commit that changes what a
  person sees, or a rule they work under, updates its checks in the same
  commit. A fixed bug that a person could have noticed adds a check under
  *Regressions*. The walkthrough before each release runs that list.
- `server/scripts/smoke-auth.sh` checks a **running dev server** over HTTP. No database
  access, no setup — if it needs `psql`, it is an e2e test wearing a shell script.
  Localhost only: it registers real accounts, and pointed at a deployment it
  fills production with them.
- e2e tests own the database: they reset between tests and assert on rows,
  including the negative cases smoke cannot reach.
- Component tests sit beside their source: `receive-stock-dialog.test.tsx`, run
  by Vitest against jsdom with the network mocked by MSW.
- **Write one when you fix a bug, not as a sweep.** They exist so a branch that
  is expensive in the browser — a 409, an empty list, a field that appears only
  sometimes — costs milliseconds. The value is somewhere to put a test at the
  moment one is needed, not coverage of every dialog on principle.
- Nothing is mocked in a Playwright spec. A mocked API there only proves the UI
  agrees with our assumptions about the server, which is the class of bug that
  layer exists to catch. The API is never replaced; a spec may replace the
  static host's own file, `/version.json`, to stand for a deploy, or abort a
  chunk to stand for a dropped connection (ADR-081).
- `toBeVisible` passes while a popover or a menu is still fading in, so axe
  run on one just opened measures it halfway: wait until it has settled.
- **A spec that switches the browser's session clears its cookies first:**
  `clearCookies`, then `addCookies`, as `signInAs` does
  (`client/e2e/support/api.ts`). The page arrives with the shared owner's
  `sid` from storageState, and a second cookie of the same name for the
  same host leaves it unspecified which one the browser sends, a coin flip
  that shows up as an unrelated test failing now and then.
- **A limit the browser suite reaches is `limit(n)` in `@Throttle`**
  (`server/src/core/auth/throttle-limits.ts`), multiplied by
  `THROTTLE_FACTOR`. A decorator's arguments are evaluated when its class
  is defined, before Nest builds its injector, so `ConfigService` cannot
  serve them and `limit()` reads `process.env` itself. The suite registers
  an organization for every worker and every `freshOrg`, and sign-up's 5 a
  minute would fail it rather than the feature, so
  `client/playwright.config.ts` sets 1000. Absent, the factor is 1: a
  multiplier rather than an override, so a missing variable leaves the
  real limits in place. Production never sets it above 1, which nothing
  enforces.
- **The account spec's password tests under `--repeat-each`** meet
  ADR-011's limit by design: the password change allows five tries in
  five minutes, a limit `THROTTLE_FACTOR` does not raise
  (`server/src/core/auth/account.controller.ts`). Repeat only the display
  name's test, or wait five minutes between runs.
- `getByRole`, never `getByLabelText`, in a component test: it finds a
  control as assistive technology does, by its role and accessible name,
  so a test also fails when the role is wrong, which a label match alone
  would miss. The one exception is a password field, which has no ARIA role
  for `getByRole` to find: there, `getByLabelText`.
- **A test waits for what an effect does.** Focus moved, an element marked
  or scrolled, a timer set, a request sent: each comes a moment after the
  render a `findBy…` or an event waits for, and later still on a slow
  runner. Check it with `await waitFor(…)` or a `findBy…`, never on the
  next line; act on it (Esc in a panel, a click in a dialog) only once it
  has happened; and move a fake clock only once the timer it should fire
  exists, by `vi.getTimerCount()` or the effect's first visible result
  (#206, #210). A test that passes on a fast machine and fails on CI is
  most often this.
- **A CI failure in code the PR did not touch** is re-run once. If it
  passes, it is filed as a "Flaky:" issue the same day, naming the test,
  the run and the line; it is never retried automatically, skipped or
  bypassed to get a pull request green.
- **The flake hunt** (`.github/workflows/flake-hunt.yml`) looks for those
  failures before a pull request meets them. On main, Sundays at 09:00
  UTC and by hand (Actions → Flake hunt → Run workflow), it runs the
  client's unit tests five times and the server's end-to-end suite three
  times (`server/scripts/e2e-flake-hunt.sh`). A test that fails in any run
  turns the run red, and the run's summary names it and how often it
  failed. The hunt files nothing and retries nothing: each test it names is
  filed by hand as a "Flaky:" issue, as above.

---

### What is worth a component test

Pure functions first — no rendering, most logic per test:
`lib/validation.ts`, `lib/format.ts`, `locations/tree.ts` including the
orphan case, `edit-location-dialog`'s `eligibleParents` (a real graph walk,
currently covered only by one expensive e2e test), and `lib/api.ts` —
`ApiError` construction, the 204 path, the array-message flattening.

Then components with real branching: `move-stock-dialog` (three modes, the
adjust direction flip — most branches of anything here),
`change-password-form` (the mismatch logic, and a security path),
`variant-row` (inline SKU edit and its blur commit),
`movement-history-dialog` (the direction reconstruction in `describe`).

Not worth it: pages, which are mostly loading and dialog state that e2e
already covers; the simple create dialogs, which fill fields and POST; and
`error-boundary`, `color-mode-select`, `form-error`, `auth-layout`.

---

## Seeds

Two seeds grow with the app, and every feature adds what it needs to both
(ADR-081). Its build brief has a step for them; a feature with nothing to
add says so in its PR.

- **`npm run seed:demo`** fills a dev database with a demo organization
  whose screens, manual checks and walkthroughs work without setup: a
  feature's new screens open on real-looking records, in every state its
  checks name. CI runs it on an empty database, so a service it calls that
  changes shape fails there; run it locally after changing one ([engineering.md,
  *Moving code*](engineering.md#moving-code)). Each seeded step writes the
  audit row its route would, built with the interceptor's own
  `auditPayload`, but names the route's action, resource type and fields
  by hand, copied from its `@Audited` (`seed-demo-audit.ts`): change a
  route's `@Audited`, change the seed.
- **`npm run seed:volume`** fills a database of its own with a year at
  realistic scale (`server/perf/README.md`). A new table gets rows in the
  proportions a customer would have, and a new hot query, one run on every
  request or every list, is added to `npm run perf:plans` and timed
  against ADR-051's budgets at both scales.

---

## Keys that rebuild a component

A component keyed by a value, so it starts again when the value changes,
gets a prefix naming what it is: `currency-${baseCurrency ?? ''}`,
`issue-closed`. Two siblings keyed by bare values collide as soon as both
are empty or closed, and React warns that it may drop one (#127).

A dialog's key goes on the component the page renders, as Ship's does
(`<ShipOrderDialog key={…}>`), never on MUI's `Dialog` inside it. The
fields are that component's state, and a key on the `Dialog` it returns
rebuilds only what is below it: the fields would open with what was typed
the last time.

## Loading states

Block only on what cannot be rendered around.

- **Whole-app** — the boot check alone. Until `/v1/auth/me` answers, the app
  does not know whether to draw itself or the login page (ADR-020).
- **Inline** — form submits. The page is already correct; only the button
  changes. Never replace a form with a spinner: the user loses sight of what
  they typed, and a failure leaves them re-orienting.
- **Progressive** — data inside a rendered page. Shell, nav, and headings draw
  immediately; the table area holds its space and fills in. A full-page spinner
  here discards structure already known to be correct, and flashes on every
  navigation.

Indicators are delayed ~250ms (`useDelayedFlag`). A response in 80ms should
never flash one — the flash reads as jank, no indicator reads as instant. The
delay is not optional in the other direction either: a spun-down free instance
takes about a minute to wake, and a blank page for that long reads as broken.

---

## Unsaved changes

A form that builds something a person would be sorry to lose (an order, a
product, a run, an RMA, a recipe) asks before it is thrown away (issue #54):

- `useUnsavedChanges(dirty)` with `UnsavedChangesDialog`, its message saying
  what would be lost in the page's words. Inside the app it holds the
  navigation (React Router's `useBlocker`, which is why the app uses a data
  router); closing the tab or reloading gets the browser's own prompt.
- `dirty` is anything typed or chosen; an untouched form leaves without a
  word. Stay is the default button; Leave is red.
- Call `release()` just before navigating away on purpose, after a save or
  on Cancel: a state change arrives a tick too late. A dialog that saves
  and closes needs none of this; its own Cancel already asks nothing.

## Status pages

When a page cannot show what was asked for, it says so in one shape, not a
bare heading or the server's raw error. `client/src/errors/` holds it:
`StatusPage` (an icon, a short title as the page's one heading, one sentence
of what to do, one or two actions, three on a crash, a reference where a
failure needs reporting) and the cases built on it.

- **An unknown address:** "Page not found", Go home and Search everything.
  Signed in, inside the app with the rail and the lookup; signed out,
  centred on its own with Sign in (`NotFoundRoute`).
- **A record that did not load:** `LoadFailure` with the error itself
  (`useResource` returns it as `failure`). A 404 is "This order doesn’t
  exist", in the page's words, with its list and the lookup; a 403 is "You
  don’t have access to this", naming who can change the role; no answer at
  all is "Can’t reach the server" with Try again. Anything else keeps the
  server's own message, since it says something particular.
- **A page whose code will not load** (ADR-081): every lazy import goes
  through `loadChunkOrReload`, which tries once more, then reads the
  version file. Unreadable is the offline page, which tries again by itself
  on the browser's `online` event, as `LoadFailure`'s does; a newer build
  loads the page in full once, then "A new version is ready"; the same build
  is a crash.
- **A tab outdated by the API** (ADR-081): "A new version is ready" with
  Reload, or, while the new build is still on its way, "A new version is
  being installed", which tries again by itself every minute while in
  front.
- **A crash:** the error boundary's "Something went wrong", with Reload, Go
  back when there is a page to go back to, and Go home, and a reference to
  quote (the server's request id, or one made and logged). Three, since a
  broken page is left most often for the one before it, and it clears when
  the address's path changes.
- Tones: calm (info) for what is not there, amber for what is not yours,
  red only for a real failure.

A new record page passes its load error to `LoadFailure` rather than
rendering it in an Alert.

## Responsive layout

MUI's breakpoint props (`sx={{ py: { xs: 3, sm: 8 } }}`), applied where a
layout actually breaks — not pre-emptively. A rule added for a width nobody
checked is a rule nobody can safely remove later.

Navigation is a rail beside the page from `lg` up (ADR-055), in three groups
defined once in `layout/navigation.ts`: the work, the records and places to look
something up, and the organization's settings. It folds to its icons, each named
in a tooltip, and each device remembers that. Below `lg` the same groups open in
a left drawer behind a menu button: narrowing the window moves the links and
never hides one. The person's own things (profile, devices, language, colour
mode, sign out) stay behind the avatar at every width. The top bar is slim and
sticky and never hides on scroll: the organization's name, where its logo will
go, then the bell and the avatar. Which elements show is CSS `display` at the
breakpoint, not a `useMediaQuery` branch, so the first paint is right; the hook
is used only to close an open drawer when the window widens past `lg`. A new
destination goes into a group in `navigation.ts`, never into the bar.

Rows that mix a label with actions (page headers, the recipe status row) are two
flex groups that wrap as wholes: the text group takes the remaining space down
to a floor, and below it the action group drops to its own line, right-aligned,
and wraps among itself if it is still too wide. A button never shrinks, so its
label does not wrap beside other buttons; it breaks onto a second line only when
it alone is wider than all its space, as on a phone at Larger text (set once on
`MuiButton`). A row of buttons wraps (`flexWrap: 'wrap'` with `useFlexGap`). One
filled button per group at most — the action the current state is waiting for;
the rest are text weight.

---

## The look (ADR-055)

Colours, sizes and corners come from `client/src/theme/tokens.ts` through the
theme. A component asks the palette by name (`color: 'text.secondary'`,
`bgcolor: 'background.paper'`, `<Chip color="warning">`) and never writes a hex
value, a font size or a radius the tokens already name. A value the design needs
and the tokens lack becomes a token first.

- **A colour given as a path goes in `sx`:**
  `sx={{ color: 'text.secondary' }}`. A `color` prop takes only a name
  (`primary`, `error`, `inherit`): MUI 9 ignores a path in Typography's
  prop and draws primary text (#196), and lint refuses one on any
  component. Lint cannot follow a path kept in a variable, returned by a
  function or spread in, so write it where the colour is used.
- **Muted text on a highlighted row** (a focused or selected option, a
  menu entry the keyboard is on) draws in the main text colour, set once
  in the theme: muted on MUI's state tints falls under 4.5 : 1.
- **A menu holds only its entries.** A title or an action beside them goes
  in a Popover above a MenuList, a dialog named by its title, its trigger
  with `aria-haspopup` and `aria-expanded`: in a menu, Tab closes it and
  the arrows skip anything but an entry.
- **Focus, when a control removes itself** (Mark all read once nothing is
  unread), moves to the next useful place, not to the page. A key pressed
  while a list loads stops the list taking focus when it arrives.
- **Two layers.** Brand (the accent, the radius) is what a rebrand, and later an
  organization, changes. Semantic (surfaces, text, borders, the five status
  tones) never takes the brand's colour.
- **Status is a tone, not a colour.** A chip's colour prop names one: default
  neutral, primary info, success positive, warning warning, error critical. The
  words on the chip carry the meaning, so nothing is told by colour alone.
- **Five type sizes:** `h5` for a page title, `h6` for a section, `body1`,
  `body2` and `caption`. No others, and no capitals: `overline` is sentence
  case.
- **Text that grows** (ADR-075). A font size is rem, through the theme's
  variants, and never px on a page: px ignores the person's text size. A
  width beside or around text (a field, a label column, a panel, a flex
  basis) is `rem(px)` from `theme/rem.ts`, so it grows with the text and
  cuts or wraps where it does at Standard. Spacing, borders, icon-only boxes
  and images stay px.
- **Links** take the accent and underline on hover; a link drawn in the
  colour of the text around it is always underlined. **Buttons**: one filled per
  group, as above; the rest text weight.
- **Density** is the theme's: compact with a mouse, 44px targets under a finger
  (`pointer: coarse`). Don't set a control's height on the page.
- **Focus** is one ring, drawn by the theme on everything that takes focus.
  Never remove an outline.
- **Contrast.** `tokens.test.ts` checks WCAG AA for every pair a reader reads,
  in both modes; a new token adds its pair there.
- **Paper** is a PDF the server draws (ADR-071), from its own sheet in
  `core/documents/sheet.ts`, and never the screen's theme or tokens. A
  printed document changes only on purpose.

### Shared pieces for screens (ADR-055)

Use these rather than writing the thing again on a page:

- **`StatusChip`** with a tone from `STATUS_TONES` (`theme/status.ts`). A new
  status adds its row to that table.
- **`ExpiryChip`** for any lot's expiry: days left within 90 days (amber, red
  within 30 or past) with the date beside it; the date alone further off. The
  thresholds are `EXPIRY_DAYS` in `lib/expiry.ts`.
- **`displayQuantity`** for a quantity people read: no padding zeros, grouped.
  **`formatQuantity`** for a quantity in a field, which must stay what
  `toApiDecimal` accepts.
- **`useTab`** and **`DetailLayout`** for a record with three or more sections
  of different kinds: tabs kept in the address, a summary beside them. Fewer
  sections stay one page.
- **`FilterRow`** above a list: search, the list's selects, quick filters with
  counts. Never a column of full-width fields.
- **`EmptyState`** inside the list's panel when it is empty: the first-time
  message with no filter, "nothing matches" with one.
- **`ListError`** above a list whose read failed. When the first page failed
  (`useKeysetList`'s `failed`), it carries Try again and the panel is not
  drawn, so the page never says both that it failed and that there is
  nothing (#195); a failed Load more keeps its rows, without Try again.
- **`Reference`** around a document's number, a SKU or a lot code placed in a
  message (`{ sku: <Reference>{sku}</Reference> }`), so it never breaks at its
  hyphen; **`ReferencesWhole`** for text the server wrote, which keeps every
  hyphenated word whole (ADR-081). A code over 16 characters may still
  break, rather than run off a phone's screen; a page heading is left alone.
- **`UndoSnackbar`** for the message after something that can be undone: its
  timer waits while focus or the pointer is on it, and runs again only once
  both have left (WCAG 2.2.1). MUI's `Snackbar` runs again when either does.

A new screen gets a line in SCREENS in client/e2e/accessibility.spec.ts, which
runs axe for WCAG 2.2 AA in light and dark mode (ADR-055). A violation is
fixed, not excluded: no rule is turned off. Each line is its own test in each
mode, so one slow screen or browser cannot time out the rest (#230), and the
spec runs with reduced motion, so axe measures what has finished appearing,
never a dialog still fading in.

A link inside a sentence (a FormattedMessage `<link>` chunk) is
underline="always": colour alone does not tell it from the words around it.
Links standing alone, in a table cell or a list, keep the theme's underline on
hover. A control without visible text of its own, such as a switch in a table
row, gets an aria-label naming what it acts on.

A password is typed into PasswordField, never a TextField with
type="password": it adds the show and hide button, starts hidden, and keeps
autoComplete for password managers.

## Supported browsers

What the build targets (Vite 8's default, "baseline widely available"):
Chrome and Edge 111 and later, Firefox 114 and later, Safari 16.4 and
later, on desktop and phone (iOS 16.4). In China that includes Edge, the
Chromium engines of 360, QQ and Sogou (index.html asks for them, never
their old IE engine) and WeChat's in-app browser on a recent phone.
Internet Explorer, and any browser's IE mode, is not supported.

- Code holds to that floor, not to the browser in hand. An API newer than
  the floor is used only where the browser has it, with a fallback
  elsewhere: `lib/person-initials.ts` builds an `Intl.Segmenter`, which
  Firefox has only from 125, when there is one, and otherwise splits text
  into letters with their combining marks. Built unguarded as the module
  loads, it would stop the whole app in those browsers. ESLint now holds
  the floor: `eslint-plugin-compat`, set to these browsers in
  `client/eslint.config.js`, fails such an API unless an `if` guards it,
  though its data stops near ES2022 and it cannot see a method called on
  a variable (`list.toSorted()`) or check CSS (#197).
- Nothing loads from another site: the font is bundled, Chinese uses the
  system's, and no analytics, CDN or Google service is called. A page that
  needs one would fail in mainland China; keep it that way, or make it
  optional.
- Playwright runs every spec in Chromium, accessibility.spec in WebKit and
  Firefox, and mobile.spec on an iPhone's screen and engine. A spec that
  shares the owner's organization runs in Chromium only. Firefox runs in CI
  and with E2E_FIREFOX=1; Playwright's build of it cannot start on some
  macOS versions. In CI a pull request runs Chromium only, in three shards;
  every browser runs on main, nightly, and on a pull request labelled
  full-e2e (layout, mobile, sign-in).
- **Firefox on such a Mac,** and Linux WebKit as CI has it, run from
  Playwright's Linux image as a remote browser, the tests still on the
  Mac and no file changed (#231, #232). The image's version and the
  `playwright` it runs are the client's, as `npx playwright --version`
  in `client/` prints it:

  ```bash
  docker run -d --rm --init --name pw-browsers -p 127.0.0.1:3333:3333 --ipc=host \
    mcr.microsoft.com/playwright:v1.64.1-noble \
    /bin/sh -c "cd /tmp && npx -y playwright@1.64.1 run-server --port 3333 --host 0.0.0.0"

  # in client/
  E2E_FIREFOX=1 PW_TEST_CONNECT_WS_ENDPOINT=ws://127.0.0.1:3333/ \
  PW_TEST_CONNECT_EXPOSE_NETWORK='<loopback>' \
  npx playwright test e2e/accessibility.spec.ts --project=firefox
  ```

  `<loopback>` lets the container's browser reach the Mac's
  `localhost:5273` and `:3100`, so the session cookies stay on
  `localhost`. Without `E2E_FIREFOX` and with `--project=webkit`, it is
  Linux WebKit, which showed a flake macOS WebKit never did (#232).
- The product's name is VITE_APP_NAME in the repository's .env, with one
  per language as `VITE_APP_NAME_<TAG>` (`VITE_APP_NAME_ZH_HANS`,
  `VITE_APP_NAME_FR_CA`), each falling back to it. A tab's title comes
  from `lib/tab-title.ts`, in the reader's language (ADR-082).

## Versions

What each version in the project means, where it lives, and who moves it.

| Version | Where | Moves when | Read it live |
| --- | --- | --- | --- |
| Release | `server/package.json`, `client/package.json`, git tags, `docs/releases/` | Bob tags a release | `/api/health`'s `version`; Help's foot |
| API, major | the URL, `/v1` (ADR-013) | a break an outside program would meet | the URL |
| API revision | `server/src/common/api-revision.ts`; `info.version` `1.<n>` | a breaking change for the app's own client (ADR-081) | `/api/health`'s `apiRevision`; `version.json` |
| Build | the deployed commit | every deploy | `/api/health`'s `commit`; `version.json`'s `build`; Help's foot |
| Database schema | `server/src/database/migrations/` | each migration | `drizzle.__drizzle_migrations`, one row per file |
| Runtime | `engines`, `.node-version` (Node); ADR-002 (Postgres) | an upgrade, by its own PR | `node -v`; `select version()` |

`/api/health` and `/version.json` must name the same commit once a deploy
has finished; `deploy.yml` waits for the first before starting the second.

A report of a problem names the line in Help's foot (the release, the
build and its date), which finds the exact code the person ran. A
document that leaves the app, such as a PDF manual or a written
specification, names the release and the date it describes; the guides
inside the app need nothing, since they ship with the build Help's foot
names.

## Dependencies

- **Every branch** takes the in-range updates as a commit of its own at its
  start, and again before the reviews (`npm outdated`, then `npm update`, in
  `server/` and `client/`). No overrides, except a patched release of the
  same major under a package that pins the vulnerable one exactly, as
  js-yaml's and multer's are (ADR-019, amended); a major version is a
  change of its own.
- **Only versions at least 7 days old** (ADR-081): a freshly published
  version is where a hijacked package hides, and most are caught within
  days. Package by package: for each one `npm outdated` lists in range,
  `npm view <package> time --json` gives when its Wanted version was
  published; take it with `npm update <package>` only when that was at
  least 7 × 24 hours ago, and say on which day each of the rest comes of
  age. Never move back a version already locked: the rule keeps new
  releases out, it does not undo what is installed (#196's steps 1 and
  8). Not `npm update --before`: it resolves every package to its
  cutoff, so it moves back whatever is newer, or fails where nothing in a
  range is that old, and a date alone cuts off at midnight UTC, about 8
  days (the square logo's step 2, 25 October 2026). A security fix is
  taken at once, its publisher and diff looked at first; any other
  exception is Bob's, named in its commit message.
- **A new tool or package** is pinned to a release at least 14 days old.

## Production readiness

`/production-readiness` (ADR-081) reports on what real users need. It runs:

- **in every feature's review step,** after `/code-review`, on the sections
  the change touches (deploys for CI or deploy changes, performance for a
  new hot query, security for anything near sign-in or permissions);
- **on the whole app once before real users,** with its device pass
  (tablets, foldables, a phone held sideways), and again **before each
  release tag**;
- **on the sections a change of host or plan touches,** such as a paid
  database or a new region.
