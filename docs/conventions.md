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
  and unit prices from their strings and days in UTC.

## Module boundaries

- One folder per module under `core/`, each with its own `*.module.ts`.
- **`common/` must never import from `core/`.** The dependency runs one way. Reversing
  it is how a "shared" folder becomes a second copy of the application.
- **Services must never import `db` directly** (ADR-009). All queries go through
  `TenantDb`, which applies `organization_id`. `UNSAFE_GLOBAL_DB` is refused by a
  lint rule except in the files `server/eslint.config.mjs` lists, each with its
  reason — direct use elsewhere is a review-blocking defect.

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
- `register.dto.ts` and `create-user.dto.ts` repeat the same email, name, and
  password rules, and have already drifted once. Extract to validation constants
  — not a shared DTO, which the rule above forbids — at the fourth DTO, or the
  first time a rule changes in one and not the other.

Test helpers follow the same rule with one addition: extract *knowledge* (a
library's interface shape, a stub that must match a real service) and leave
*structure* alone. `unlimitedThrottler` and `RecordingMailService` are in
`test/utils/` because they mirror interfaces that drift; the `beforeAll` /
`afterAll` / `beforeEach` block is repeated in every suite deliberately, because
hiding it makes the `app.close()` rule above unenforceable by reading.

`registerOrg`, `addViewer`, and `roleIdNamed` are the awkward middle: knowledge
rather than structure, copied into every e2e suite, and past the rule of three.
They belong in `test/utils/` — deferred as a refactor across every spec file
rather than folded into a feature commit.

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
  quote. `npm run i18n:check` fails until all three agree, placeholders
  included. Written by whoever adds the English, reviewed by someone
  fluent before a release (MC-1405, `scripts/i18n-review.mjs`).
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
  - A write that returns the resource returns the same detail class as
    reading it, fetched after the write, never the row from `INSERT` or
    `UPDATE`: one shape per resource, whichever call the client made.
    Where the resource has no read of its own, such as a return, it comes
    back as its list shows it.
  - A list read with `select()` sends every column; select the declared
    fields instead.
  - A raw query's rows get a type of their own (`interface PoolRow`), as
    Postgres returns them, never `Record<string, unknown>`: a response
    built from unknowns cannot be checked against its declaration.
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
- **With a code, the message still says what to do next, but names no
  control on the screen.** The screen, keyed on the code, adds the link or
  the words naming its own control, from the client's catalogue, so
  renaming the control renames them too (#120).

## Tests

- Both sides test with Vitest (ADR-067). On the server, unit tests sit
  beside their source (`users.service.spec.ts`, `npm test`), and
  integration tests live in `test/` and end in `.e2e-spec.ts` (`npm run
  test:e2e`, one file at a time).
- Vitest does not type-check. A type error in a spec fails `npm run
  typecheck`, which CI and `scripts/verify.sh` run, not the test run.
- Every integration test calls `await app.close()` in `afterAll`, or the
  `pg` pool stays open and the run hangs without explaining why.
- One integration test per feature as it's built (ADR-008).
- **`docs/manual-checks.md` moves with the code.** A commit that changes what a
  person sees, or a rule they work under, updates its checks in the same
  commit. A fixed bug that a person could have noticed adds a check under
  *Regressions*. The walkthrough before each release runs that list.
- `scripts/smoke-auth.sh` checks a **running dev server** over HTTP. No database
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
  layer exists to catch.
- `getByRole`, never `getByLabelText`, in a component test: it finds a
  control as assistive technology does, by its role and accessible name,
  so a test also fails when the role is wrong, which a label match alone
  would miss. The one exception is a password field, which has no ARIA role
  for `getByRole` to find: there, `getByLabelText`.

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
  (`useResource` returns it as `failure`). A 404 is "This order doesn't
  exist", in the page's words, with its list and the lookup; a 403 is "You
  don't have access to this", naming who can change the role; no answer at
  all is "Can't reach the server" with Try again. Anything else keeps the
  server's own message, since it says something particular.
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

Rows that mix a label with actions (page headers, the recipe status row) are
two flex groups that wrap as wholes: the text group takes the remaining space
down to a floor, and below it the action group drops to its own line,
right-aligned. Button labels never wrap (set once on `MuiButton`). One filled
button per group at most — the action the current state is waiting for; the
rest are text weight.

---

## The look (ADR-055)

Colours, sizes and corners come from `client/src/theme/tokens.ts` through the
theme. A component asks the palette by name (`color: 'text.secondary'`,
`bgcolor: 'background.paper'`, `<Chip color="warning">`) and never writes a hex
value, a font size or a radius the tokens already name. A value the design needs
and the tokens lack becomes a token first.

- **Two layers.** Brand (the accent, the radius) is what a rebrand, and later an
  organization, changes. Semantic (surfaces, text, borders, the five status
  tones) never takes the brand's colour.
- **Status is a tone, not a colour.** A chip's colour prop names one: default
  neutral, primary info, success positive, warning warning, error critical. The
  words on the chip carry the meaning, so nothing is told by colour alone.
- **Five type sizes:** `h5` for a page title, `h6` for a section, `body1`,
  `body2` and `caption`. No others, and no capitals: `overline` is sentence
  case.
- **Links** take the accent and underline on hover. **Buttons**: one filled per
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

A new screen gets a line in SCREENS in client/e2e/accessibility.spec.ts, which
runs axe for WCAG 2.2 AA in light and dark mode (ADR-055). A violation is
fixed, not excluded: no rule is turned off.

A link inside a sentence (a FormattedMessage `<link>` chunk) is
underline="always": colour alone does not tell it from the words around it.
Links standing alone, in a table cell or a list, keep the theme's underline on
hover. A control without visible text of its own, such as a switch in a table
row, gets an aria-label naming what it acts on.

A password is typed into PasswordField, never a TextField with
type="password": it adds the show and hide button, starts hidden, and keeps
autoComplete for password managers.

## Supported browsers

What the build targets (Vite's default, "baseline widely available"):
Chrome and Edge 107 and later, Firefox 104 and later, Safari 16 and later,
on desktop and phone. In China that includes Edge, the Chromium engines of
360, QQ and Sogou (index.html asks for them, never their old IE engine) and
WeChat's in-app browser on a recent phone. Internet Explorer, and any
browser's IE mode, is not supported.

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
- The product's name in the tab is VITE_APP_NAME in the repository's .env.
