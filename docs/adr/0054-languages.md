---
status: accepted
date: 2026-10-03
areas: [documents, mail, i18n]
amended-by: [ADR-071, ADR-076, ADR-081]
---

# ADR-054 — Languages: the person's language for the app, the customer's for documents

> **Amended by [ADR-081](0081-old-tabs-after-a-deploy.md).**
> A language whose catalogue won't load says so, in its own words, and nothing is saved until it loads; at start the app falls back to English rather than a blank page.

## Context

Everything the app says is in English, from three places that
change in different ways.

- **The client's copy.** About 130 components hard-code their labels. Dates
  and money go through Intl with no locale (`format.ts`, `audit-format.ts`,
  `licence-status.ts`, two `toLocaleString` calls), so the browser picks the
  format and nobody picks the language.
- **The server's words.** About 270 refusals are sentences built around
  names (`refusal()` in `licence-check.ts`), shown as sent by `messageFor`.
  class-validator writes its own English, and so do the custom DTO rules.
  Emails (verification, reset, ADR-037's security mails) and notifications
  are written in English when they are sent.
- **Printed documents.** The packing slip, invoice and credit note are
  rendered by the client from stored data (ADR-041, ADR-046). Their
  language belongs to the customer who receives them, not to whoever
  presses Print.

Two needs bring this in now: staff who read Chinese rather than English,
and selling into Quebec, where the app and the documents a customer
receives are expected in French. Quebec's Charter of the French Language
(as amended in 2022) is generally read as requiring commercial documents
such as invoices in French, with other languages allowed beside it. The
open decision this replaces said to confirm the requirement with an
advisor. That still holds for the two details that depend on it, bilingual
documents and product names. Both are built here as options an
organization turns on, so the answer only decides how they are set. A
brand name or trademark generally stays as it is; what the advisor
settles is whether a Quebec customer's invoice must describe each item in
French. Until then no French product name is entered, and adding them
later is data, not a change to the schema.

Not everything on a screen is the app's to translate. A partner's name, a
note, a reason and an address are data someone typed, and they read the
same in every language. A product's name and description are data too,
but an organization selling to Chinese-reading customers keeps them in
Chinese as well as English, on screen and on the customer's documents.

## Decision — three languages, English the fallback

`en`, `fr-CA` and
`zh-Hans` (Simplified Chinese), as BCP 47 tags. English is the source the
other catalogues are translated from and what anything missing falls back
to; its spelling stays British, as now. One `SUPPORTED_LOCALES` constant on
each side (`server/src/common/locales.ts`, `client/src/lib/locales.ts`),
and the DTOs accept only those.

The columns below are `text` without a CHECK, unlike the licence policies.
A value only arrives through those DTOs or is copied from one that did, so
adding a language is a catalogue and a constant rather than a migration,
and a value no longer offered falls back to English instead of failing.

## Decision — two settings, independent of each other

*The person's
language* is what the app speaks to them: screens, refusals, their emails
and notifications. *The document language* is what a customer's paper is
printed in. A clerk who reads Chinese prints an English invoice for an
Ontario customer; one who reads only English prints a French one for a
Quebec customer. Tying the two would make one of them wrong.

## Decision — the person's language is on the user; null means the browser's

- `users.locale` (`text`, nullable). Null follows the browser:
  `navigator.languages` matched against the supported list, else English.
  Chosen from the account menu, beside the colour mode (ADR-021), and on
  the Account page, through `PATCH /v1/account/profile`, which already
  changes the name and records `account.profile_updated`. Returned by
  `/v1/auth/me`.
- Kept on the server, not in localStorage as the colour mode is, for two
  reasons: it follows the person to another device, and emails and
  notifications are written where there is no browser to ask.
- Signed out (sign in, register, forgot and reset password), the pages
  offer the same picker and keep the choice in localStorage. Registration
  sends it, so the verification email arrives in the language the person
  registered in. Choosing while signed in writes both, so signing out does
  not switch the language back.
- No permission: acting on yourself is not a capability someone grants
  (the account routes' rule).

## Decision — the client: FormatJS (react-intl), ICU messages, explicit ids

- ICU MessageFormat, because plural rules differ in each language: French
  treats 0 and 1 as singular, Chinese has no plural, English has two
  forms. The message states it, rather than an `if` in the component.
  Underneath is Intl, which `format.ts` already uses.
- Each message has an explicit id named by its feature folder
  (`orders.receive.title`) and its English as `defaultMessage` beside it,
  so the component still reads in English and an English copy edit does
  not orphan its translations.
- `formatjs extract` writes `client/src/locales/en.json` from the source.
  `npm run i18n:check`, run in CI, fails when `en.json` is stale, when
  `fr-CA.json` or `zh-Hans.json` lacks a key or keeps one that is gone, or
  when a translation's placeholders differ from the English (`{name}`
  dropped or renamed).
- Catalogues are compiled at build (`formatjs compile --ast`), so the
  browser never parses ICU and the parser stays out of the bundle. English
  ships with the app; French and Chinese are separate chunks fetched when
  chosen, so an English reader downloads nothing extra.
- A message missing from a catalogue shows its English and warns in
  development. A raw id never reaches a screen.
- `eslint-plugin-formatjs` refuses a literal string in JSX. It is switched
  on one feature folder at a time as each is converted, and everywhere at
  the end.
- Vitest renders in English through one provider in `src/test/`, so
  `getByRole(…, { name })` lookups do not change.

## Decision — the rest of the page follows the language

- `<html lang>` is the current language: screen readers pronounce by it,
  and browsers choose Chinese glyph forms by it.
- MUI's own words (pagination, "No options", "Close") come from its locale
  packs (`frFR`, `zhCN`), set on the theme with the language.
- `system-ui` already falls back to the system's Chinese fonts, so no web
  font is added.
- `format.ts` and the other Intl call sites take the current language
  instead of `undefined`. A print page passes the document's.
- Calendar-day inputs stay native `<input type="date">`: the browser shows
  them in its own format, and the value is `YYYY-MM-DD` in every language
  (ADR-052).

## Decision — quantities stay strings, in every language

ADR-025 holds: a
quantity never becomes a JavaScript number. On screen, `formatQuantity`
swaps the decimal point for the language's separator on the string itself
(`35,0000` in French); digits and trailing zeros stay as they arrived, so
English reads exactly as today. A quantity or price field accepts the
language's decimal separator, refuses a grouping separator with a message
rather than guessing what it meant, and sends a point: the API's format
does not change. Money keeps `formatMoney` (ADR-035), now in the chosen
language.

## Decision — the server translates at the edge, in the exception filter

- Services throw a message id and its values instead of a finished
  sentence: `new ConflictException(t('production.licenceExpired', { licence,
  day }))`. `AllExceptionsFilter`, which already gives every error one
  shape, renders it in the request's language. Services stay singletons
  with no request-scoped state, and a rule's wording stays beside the rule.
- The request's language is its `Accept-Language` header, matched against
  the supported list, else English. `api()` sends the current language on
  every request; fetch may set the header, and it is CORS-safelisted. A
  screen and its refusals then always agree, signed in or out.
- No header (curl, an integration, the server e2e suite) means English,
  word for word as today. The e2e suite's message assertions are the proof
  that moving a message changed nothing.
- Days in messages stay `YYYY-MM-DD`, as `refusal()` already notes: they
  read the same in every language and are what was entered. Names are data
  and go in as they are.
- Validation: the `ValidationPipe`'s `exceptionFactory` turns each failed
  constraint into a message id (`validation.isNotEmpty`,
  `validation.maxLength`), with the field's API name left as it is. The
  screens check before sending, so a person seldom sees these, and an
  integrator reads the field names the API uses. The custom rules
  (`IsCalendarDay`, `IsCurrencyCode`, the decimal rules) get ids the same
  way, and a DTO still never restates a rule's message.
- FormatJS on the server too (`@formatjs/intl`), so plural rules and
  placeholders work the same on both sides. The server's catalogues are its
  own, `server/src/i18n/<locale>.json`: the two packages share no files
  (separate `package.json`, no workspaces) and their words barely overlap.
  The same `i18n:check` runs on them.

## Decision — written without a request, in the recipient's language

Emails and notifications are written where there is no browser to ask, so
they use the recipient's `users.locale`; when that is null, the language
of the request that caused them (a sign-in, a reset request), else
English. A notification has one recipient per row (ADR-036), so it is
written once, in that person's language, and stored as now: rendering
stays the writer's job. Changing language later does not rewrite old
notifications, as it does not rewrite emails already sent.

## Decision — a document prints in one language or two: the partner's choice, else the organization's, stored on the document

- Any supported language can be a document's, Chinese included, and a
  document may carry a second one: French with English beside it for a
  Quebec customer, Chinese with English, or English alone.
- `organizations.document_language` (`text`, not null, default `en`) and
  `organizations.document_second_language` (`text`, nullable), on the
  Organization settings page; `partners.document_language` and
  `partners.document_second_language` (both nullable), on the partner form.
- A partner sets a whole pair or nothing: with its first language null it
  takes the organization's pair, never half of each. Two CHECKs say so,
  on both tables: no second language without a first, and never the same
  language twice. They name no language, so adding one still needs no
  migration.
- All four sit under the permissions that already gate those forms
  (`organizations.update`, `partners.update`) and are audited with those
  updates.
- The pair is resolved when the paper becomes a document and stored on it,
  like the seller and bill-to (ADR-046) and every other snapshot (ADR-029,
  ADR-038), so a reprint in a year reads as the original did:
  - `shipments.language` and `second_language` at ship, for the packing
      slip;
  - `invoices.language` and `second_language` at issue. A draft prints in
      the languages it would be issued in today, and is still marked DRAFT;
  - `credit_notes.language` and `second_language` copied from its
      invoice, never resolved again, so an invoice and its credit note read
      as one set (ADR-046's print rule) even if the partner's setting
      changed in between.
- Migration 0039 adds the columns and sets existing shipments, issued
  invoices and credit notes to `en` with no second language, which is how
  they were printed.
- A print page renders its sheet inside a provider fixed to the document's
  first language, with the second language's catalogue beside it. Each
  label prints in the first language, then the second: "Facture /
  Invoice" in a heading, two lines in a table's column header. Both are
  the same size and weight, the first never less prominent than the
  second, which is how the Charter's rule is generally read. Dates and
  money are formatted once, in the first language. Data is printed once,
  as typed, except a product's name, which follows its own rule below.
- The Back link and the Print button never reach the paper and stay in the
  person's language.

## Decision — the app's own names are translated; people's data is not

- Translated on display, by key: statuses, movement kinds, audit actions
  (`audit-format.ts`), permission descriptions, and the three system roles
  (Owner, Admin, Viewer; `roles.is_system`).
- Never translated: partner, location, price-list and tax-code names,
  custom roles, notes, reasons and addresses. Product and variant names
  are the one exception, below, and only where an organization enters
  them. A tax code
  prints the name its organization gave it, so one selling into Quebec
  names its codes as they should read there, in both languages if it
  wishes.

## Decision — a product's name and description may be kept in other languages; which are required is the organization's setting

- `products.name` and `description`, and `product_variants.name`, stay as
  they are: the base text, in whatever language the organization works
  in, and the fallback for every language.
- Other languages go in `product_translations` (`product_id`, `locale`,
  `name`, `description`) and `variant_translations` (`variant_id`,
  `locale`, `name`), one row per item and language, unique on the pair,
  each with `organization_id` (ADR-003). A table rather than a column per
  language (`name_zh`), so a language is rows and never a migration, and
  an organization with no translations has no rows.
- `organizations.required_name_languages` (`text[]`, default empty): the
  languages every product must also be named in, `{zh-Hans}` for a
  business serving Chinese-reading customers. Empty requires nothing,
  which is where French stays unless the advisor says otherwise. The
  product form asks for the required languages and offers the others.
- Issuing an invoice whose first or second language is required, with a
  line whose product lacks a name in it, is a 409 naming the product, as
  a missing billing address already is. Shipping never waits for a name:
  it is a real event (ADR-032), so the packing slip falls back to the
  base name.
- Resolved per language: that language's name, else the base. On screens,
  the person's language; search matches the base and every translation,
  and the SKU stays the identifier everyone shares. On paper, each
  document language in turn, printed once when both come out the same.
- At issue each invoice line's `description` is written in the invoice's
  first language and the new `second_description` in its second (null
  for one language), so a reprint reads as issued. A draft keeps the base
  name, and its print shows what issuing will write. Credit-note lines
  copy both from their invoice line, as they already copy `description`.
- A product's description is translated for its pages; documents print
  names, as they do now.
- Server refusals and audit rows keep the base name (ADR-038): they name
  what the organization calls the product.

## Decision — machine-drafted, reviewed by someone fluent, glossary first

- A glossary per language (`docs/glossary.md`) fixes the domain's terms
  before anything else is translated: lot, batch, run, packing slip,
  credit note, SKU, licence. The commonest fault in a translated app is one
  concept translated three ways.
- Claude drafts `fr-CA.json` and `zh-Hans.json` from the English and the
  glossary. Someone fluent in each reviews it, and that review is a manual
  check in the release walkthrough: a release does not offer a language
  whose review has not passed.

## Consequences

- Built in this order, each step one or more commits that build on their
  own:
    1. Server: migration 0039 (the language columns and their checks,
       `required_name_languages`, `second_description` on invoice and
       credit-note lines, the two translation tables, and the backfill),
       `SUPPORTED_LOCALES`, the DTO fields, `locale` on `/v1/auth/me`, the
       language stored at ship, issue and credit, translations on the
       product routes and the check at issue; e2e tests.
    2. Client foundations: the provider, the English catalogue, extract,
       compile and `i18n:check` in CI, the language picker, MUI's locale
       packs, `<html lang>`, the current language in `format.ts`,
       `formatQuantity` and the decimal input rule.
    3. Strings moved one feature folder per commit, with no change to the
       English; the existing Vitest and Playwright suites are the proof.
       The lint rule is switched on for each folder as it is done.
    4. The glossary, then the French and Chinese catalogues.
    5. Printed documents in their one or two languages, the bilingual
       layout checked on the invoice's lines table, the widest; the
       setting on the partner form and the Organization page.
    6. Server: the filter and `t()`, then refusals one module per commit,
       validation messages, emails and notifications.
    7. A Playwright spec that switches to French and prints a French
       invoice and a French and English one, a manual-checks section for
       languages, and the handoff.
- Every new string on either side goes through an id. That is slower to
  write; the lint rule and `i18n:check` are what stop it being skipped.
- Bundle: react-intl and the English catalogue for everyone, no ICU parser,
  and each other language a chunk fetched once. Server: one catalogue
  lookup per refusal.
- An English wording change leaves the translations present but stale, and
  `i18n:check` cannot see that. Such a commit lists the keys for
  re-translation in the handoff until a translation service tracks it
  (Deferred).

## Deferred — each with what brings it in

- **Product descriptions on documents.** Documents print names today; a
  description line, in the document's languages, waits for a customer who
  needs it.
- **Traditional Chinese** (`zh-Hant`): a catalogue and an entry in the
  constant. Trigger: someone who reads Traditional.
- **An organization's default language for its people** who have not
  chosen one. Trigger: an organization whose staff mostly do not read
  English.
- **Right-to-left languages.** MUI supports right-to-left; every layout
  would need checking. Trigger: an Arabic or Hebrew reader.
- **A translation service** (Crowdin, Lokalise, Tolgee) that tracks stale
  translations. Trigger: a translator who does not work in the
  repository, or a fourth language.
- **Grouped digits in quantities** (`1 234,5`). Trigger: someone misreading
  a large quantity.

## Rejected

- **The browser's own translation** (Chrome's Translate). It translates
  data too (product names, SKUs, lot codes), it rewrites text React owns,
  a known cause of crashes when React next updates that node, and it
  cannot print a French invoice on purpose.
- **Machine translation at run time**, an API call per screen. A cost and
  a delay on every page, the organization's data sent to a third party,
  and one term translated differently on two screens.
- **The English sentence as the key.** Every English copy edit would orphan
  its translations.
- **Translations in the database.** The words would ship apart from the
  code that uses them, and screens and words could disagree between
  deployments. A catalogue is reviewed in the same pull request as its
  screen.
- **Error codes for the client to translate.** Each refusal would be
  written twice, the rule on the server and its words on the client, and
  the two would drift.
- **i18next.** A reasonable choice; ICU is a plugin there and native in
  FormatJS, whose Intl base matches `format.ts`.
- **The person's language in localStorage only.** Emails and notifications
  have no browser to ask.
- **A column per language on products** (`name_fr`, `name_zh`). Every
  language would be a migration and an empty column in every other
  organization; translation rows cost nothing where unused.
- **Bilingual as one more language value** (`fr-CA+en`). Every pair would
  be a new value and a new catalogue; two columns hold any pair of the
  catalogues that already exist.

## Amendment — a notification is written when it is read

Reverses
"written once, in that person's language, and stored as now" above, for
notifications only; emails are unchanged.

A notification is read again, often days later; an email is read once.
Stored as a finished sentence, the bell stays in whatever language the
account had when the event happened: a person who switches to Chinese
keeps a bell of English, and so does anyone who chose their language after
`seed:demo` or an import wrote theirs. Every place that emits one already
passes a message id and its values (`t()`); only the stored text threw
them away.

- `notifications` keeps the message each sentence was written from,
  `title_message` and `body_message` (jsonb: the id, the values and the
  English), beside `title` and `body`. Migration 0041.
- `GET /v1/notifications` writes each sentence in the language the request
  asks for (Accept-Language, which the client sets to the screen's
  language), falling back to English where a catalogue lacks the id, as an
  error does.
- `title` and `body` stay, still written in the recipient's language at
  emit: a row written before this has no message and is shown as it was
  stored, and a body that is not a message (the variance list, "SKU: 13%")
  stays text.
- Quantities in a notification read without padding zeros, as on screen
  (ADR-055): "30 of 40 received", not "30.0000 of 40.0000". Trimmed as
  text, never parsed (ADR-025).

Considered and not done: rewriting old rows into messages. Their sentences
cannot be parsed back into ids and values reliably, and they age out under
retention (ADR-036) within weeks.
