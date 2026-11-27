---
status: accepted
date: 2026-10-03
areas: [documents, mail, i18n]
amended-by: [ADR-071, ADR-076, ADR-081, ADR-092]
---

# ADR-054 — Languages: the person's language for the app, the customer's for documents

> **Amended by [ADR-071](0071-documents-as-pdf-drawn-on-the-server.md).**
> Documents are PDFs drawn on the server, which applies these rules from its own catalogues, rather than print pages rendered in a provider fixed to the first language. Everything else stands.
>
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

## Amendment (November 2026) — what documents will refuse, shown before they do (ADR-092)

A line refused for a missing name was found only when its document was
refused (#526): the product's page listed the product's names and not
its variations'. From ADR-092 the item's page shows the product and
each variation with a name of its own, by language, marks the languages
the organization requires, and says when one is missing; Edit names
marks them too. The 409 names whether the product's name or the
variation's is missing. "The product form asks for the required
languages" becomes this: Add item does not ask for them, and the new
item's page, opening right after, shows what is missing.

## Amendment (November 2026) — the translations settled with no fluent reader: ChatGPT leads, two checks stand in

ADR-054 asked someone fluent in each language to review its catalogue
before a release offered it. No one was found, so French and Chinese
have shipped as beta since v0.5.0 (MC-1405), and machines reviewed them
instead:

- **Round 1,** 2 November 2026: Claude through the API, against the
  glossary, then a pass for how natural each language reads. Its
  findings are #371 to #398 and #419 to #423, one area each, the guides'
  in #398.
- **Round 2,** 6 and 7 November: ChatGPT on its website and Claude
  each reviewed the full export at `19e1b7aa` (6 November), 3,193
  messages a language, on their own and by the same rules. So it holds
  nothing `main` changed after that commit, Customise Home and Items
  among it. The workbooks are in the ignored `review/`, each language's
  two reviews and a merge of them, the French merge written on 12
  November.
- **The reviewer who reads only Chinese** was to check the Chinese
  corrections before they were imported, and the first screens a
  newcomer sees. On 12 November that check stopped, before any of it was
  read, and no one else reads either language.

Round 2's two reviews seldom wrote the same text ("close": at least
85 % of the characters the same):

| Messages | 中文 | Français |
| --- | --- | --- |
| Changed by either review | 713 | 704 |
| The same new text from both | 38 | 31 |
| Both changed it, close | 53 | 53 |
| Both changed it, far apart | 146 | 200 |
| Only ChatGPT changed it | 340 | 301 |
| Only Claude changed it | 136 | 119 |

On what a machine can check, the two are even: all 1,938 corrections
pass the import's check of ICU and placeholders, and both use 产品
outside the licences at about the same rate, ChatGPT in 22 of 577 and
Claude in 12 of 373, since the export came before ADR-092's glossary.
The maintainer, who reads Chinese, finds ChatGPT's wording the more
accurate, and chose it to lead. Planned on 12 November 2026 on
`fix-ups-i18n`: the maintainer confirmed the requirements before
drafting and left the check's choices to the recommendation.

### Requirements, as confirmed

Confirmed by the maintainer on 12 November 2026, with the assumptions,
what is not included and the questions' answers below. Each names its
step in the brief, and the as-built marks each met, changed or deferred.

| R | What | Done when | Step |
| --- | --- | --- | --- |
| R1 | This amendment, as the branch's first commit, with the handoff's tidy | The amendment with its requirements, its check and its decisions; `scripts/verify.sh --docs` passes | 1 |
| R2 | One decided text for each message and language, by *Decision — ChatGPT leads* | A decided workbook for each language and round in `review/`, each message's reason beside it; no person needs to read it | 10, 11 |
| R3 | `import` refuses a correction whose English or translation changed since its export, naming its row, as it refuses a removed message | A test in `scripts/i18n-review.test.mjs`; the Chinese merge's 16 such corrections and the French 15 set aside | 3 |
| R4 | A check of the words and punctuation the glossary sets, run by `scripts/verify.sh` | It fails on a word the glossary forbids, half-width punctuation in Chinese, an ASCII apostrophe and Quebec spacing broken, in both catalogues and the guides, with its test; the catalogues pass it | 5 |
| R5 | A meaning check, on the API credit, of every decided text that differs from today's | A text that adds, drops or reverses what the English says falls back, and the decided workbook says so; its test runs with no key | 10, 11 |
| R6 | An extra round through ChatGPT alone: what `main` added or changed since `19e1b7aa`, this branch's new words, and the guides whole (#150) | Its decided workbooks imported; nothing a person reads left out of every round | 4, 11, 12 |
| R7 | Round 1, by *Decision — round 1, where no later round changed a message* | Each of #371 to #398 and #419 to #423 closed with a comment saying what went in and what a later round overtook | 13, 18 |
| R8 | The glossary: its writing rules from round 1's second pass, ADR-090's rule for Chinese beside Latin letters, the words settled here, and a table of the words not to use | The glossary says each; R4 reads the table | 5, 6 |
| R9 | A pseudo-language in development and tests only, and a browser test for cut text on a newcomer's first screens | The test passes in French, Chinese and the pseudo-language at 390 × 844, each cut fixed or listed with its issue | 14 |
| R10 | What was set aside for the reviewer who reads only Chinese, settled here | *Decision — the words settled here* says each; the phone checks stay owed by name | 6 |
| R11 | The riders in *Decision — what rides along* | Each closed, or its part said, in the pull request | 6, 7, 8, 9 |
| R12 | The guides' bold phrases are screen labels (decided on 3 November) | A test in `client/src/help/guides.test.ts`: each bold phrase is a message's text in the guide's language | 4 |
| R13 | #531 on a branch of its own, next; `scripts/adr-check.mjs` naming its folder by branch filed | The handoff says the first; the issue is filed | 1 |
| R14 | French and Chinese stay beta; MC-1405 stays owed | The language picker unchanged; MC-1405 says why, in `docs/manual-checks.md` | 12 |

- **Assumptions:**
  - A1: a correction reaches a catalogue or a guide only through
    `import`, with its checks, never by hand.
  - A2: the glossary wins over any suggestion, from any round (10
    November's rule, widened).
  - A3: no person reads either language; the maintainer may glance at
    a decided workbook, and need not.
  - A4: no API change and no migration, #531 having its own branch.
  - A5: the pseudo-language covers the client's catalogue; the server's
    messages fall back to English in it.
- **Not included:**
  - N1: a paid fluent reviewer; the project stays free (October 2026).
  - N2: the beta mark taken off either language.
  - N3: a translation service, ADR-054's Deferred, its trigger not fired.
  - N4: Movements and what follows it in the handoff's order.
- **The questions' answers:** the check in the reviewer's place, ChatGPT
  leading with two checks (asked in place of a blind third vote, which
  would have voted on style); round 1 where no later round changed a
  message; #531 on its own branch; of 3 November's three riders, the
  guides' bold labels taken, `adr-check.mjs`'s folder filed, and round
  1's two passes left in `tmp/i18n-review/` (*Considered and not done*).

### Checked before drafting

On 12 November 2026, from `scripts/adr-check.mjs 054`: the areas
`files`, `docs`, `help`, `i18n` and `ui`, and the issues 148, 149 and
249, each `when-touched` issue in them read whole; with them, the
Deferred lines of ADR-054, ADR-079, ADR-090 and ADR-092, ADR-051's watch
list and Open decisions.

- **Fired, and taken here:**
  - #148, #149 and #249, named for this batch. #149's eight words left,
    and its Show all in Lots that opens Inventory, are settled below.
  - #150: the review's export leaves out the guides; the extra round
    takes them (R6).
  - ADR-090's *Chinese beside Latin letters or digits*, "applied in the
    translation batch": in the catalogues, and #501's lists of Latin
    names joined with no space beside 或 and 和.
  - #548: "the glossary's singulars still come first, in the
    translations' batch": each type's singular, used where one item is
    meant (the item's page, Edit's Type, Add's choice). The type as a
    word on a row's second line stays #548's.
  - #511: Help on Home, its word list first and "lot" explained, written
    before the guides' round so ChatGPT reads the result.
  - #505's 13: the welcome's trade words, in plain words or glossed the
    first time.
  - #486's two about words: the gap beside 品桥 in the rail's foot, and
    the photo's help in plain words with a no-break space in "5 MB". Its
    tooltip after Escape and its "Saved." stay with it.
  - #512's placeholder: the date fields' "yyyy-mm-dd" in the reader's
    language. Back's and Refresh's words stay with it.
  - ADR-083's two questions, which #486 and the handoff held for the
    reviewer who reads only Chinese: settled below.
- **Not fired, and left:**
  - #324, one sign-in worded three ways: with #255, #258 and #326, which
    change the security emails' lines too, as the handoff orders them.
  - #541, the browser's own bubble on an empty form, and #543, a
    language saved with no message: a form's behaviour, with #310's
    dialogs and the Account page's next change.
  - #154 and #261: what search finds, each with a decision of its own;
    #263 with #198, later in the handoff's order.
  - #490, the organization's name cut on a phone: a design it holds to
    choose; the cut-text test lists it as known (R9).
  - #170, #507, #510 and the other screens' issues of `ui`: none of
    their screens changes here. #467's 14, 17 and 25 and #292's two:
    their files are not changed. #285 is `later`, and #531 has its own
    branch (R13).
  - The Deferred lines: ADR-054's translation service comes closest, its
    trigger "a translator who does not work in the repository", but the
    export and import already hand a reviewer outside it the words and
    check what comes back. ADR-079's, ADR-090's and ADR-092's
    (categories' names in other languages): none fired. ADR-051's watch
    has nothing that reads the catalogues; Open decisions, nothing on
    languages.
- **Found while checking:**
  - The Chinese merge has no column for what to set aside: 16 of its
    corrections are on messages `main` changed since the export, one of
    them, `products.skuSkuUse`, removed by Items, so `import` would
    refuse the whole file. The French merge set its 15 aside by hand.
  - `import` refuses a removed message but not a changed one (R3).
  - 232 messages are new on `main` since the export (Customise Home,
    Items, the refused document's page): no round saw them (R6).
  - `main`'s Chinese uses 产品 only in the licences' four messages, as
    the glossary asks, and names a person's picture 照片 in four
    messages, where Home says 头像.

### Decision — ChatGPT leads; two checks stand in for a fluent reader

Each message takes its text from what the two reviews did:

| The two reviews | What goes in |
| --- | --- |
| The same fix | That fix |
| Both changed it, differently | ChatGPT's |
| Only ChatGPT changed it | ChatGPT's |
| Only Claude changed it | Today's, unless a check finds today's wrong; then Claude's |
| Neither | Today's |

- **A message only Claude changed is one vote against one:** ChatGPT
  read it and kept it, and ChatGPT leads.
- **Two checks judge what is right or wrong, never style,** so neither
  overrules ChatGPT's wording:
  - the rules check (R4): the glossary's words, Chinese punctuation,
    apostrophes, Quebec spacing and placeholders;
  - the meaning check (R5): Claude, through the API, asks of each text
    whether it says what the English says, with nothing added, dropped
    or reversed, numbers, names, a "not" and "before tax" among them.
- **A text that fails either falls back** to the other review's, where
  that one passes, else to today's. The decided workbook lists each
  fallback with its reason, for a glance, not a reading.
- **The meaning check runs on the current Sonnet,** `--model` changing
  it, and its answers are kept beside the workbook, so a second run
  costs nothing. The merges' "Claude picked" is not used.

### Decision — no correction lands on newer text

- The decide step sets aside a message whose English or translation is
  no longer what its workbook was exported with, and `import` refuses
  one, naming its row, as it refuses a removed message (R3).
- A message set aside is in the extra round, at its new text.

### Decision — the extra round, and the guides in it

- **Exported after this branch's own new words and before any import:**
  `export --since 19e1b7aa`, with the guides whole. Exported after an
  import, the round would hand back every correction just made.
- **ChatGPT alone reviews it,** one chat per language, by the same
  rules, and both checks run on it as on round 2. A second review would
  be outvoted wherever it differed.
- **The guides, by section (#150):** a sheet in each language's
  workbook, a row for each section by its `{#id}`, the English beside
  it; `import` writes a section back, and the guides' check still passes
  after it (the same section ids in every language, the Markdown subset
  only).

### Decision — round 1, where no later round changed a message

- A later round read the same text, so its change or its keep stands.
- Round 1's glossary findings go in only on a message no later round
  changed, where the finding still holds against today's text. Its
  natural-wording suggestions, the guides' 436 among them, are
  overtaken.
- Each round-1 issue closes `completed`, its comment saying what went
  in, what a later round overtook, and what no longer held. This
  replaces 3 November's "every suggestion applied".

### Decision — the words settled here

| What | Now | Why |
| --- | --- | --- |
| A person's picture | 头像, wherever a message means it | Your account said 照片 where Home says 头像 |
| The refused document's page, signed out | 您尚未登录 | It fits someone who never signed in, too |
| A missing name's language, in Chinese | Named in Chinese: 没有英文名称, as the exports' columns say | 没有English名称 ran Latin into Chinese |
| The invitation email's last day | 有效期到 {date}结束 | ADR-090's space beside digits, as the page writes 到 2026年 |
| The product's name in a Chinese email | Panivo, kept | ADR-082's trigger, a reader finding it out of place, has not fired |
| Keep me signed in; Stay signed in | « Garder ma session ouverte »; « Rester connecté » · 保持登录; 继续使用 | Two controls had one name |
| Create invoice (a draft) | 创建发票; Issue stays 开具 | 开具发票 read as Issue |
| Billing address | 开票地址, every place | 账单地址 sat beside 开票 |
| Not available (a location) | 不可发货 | 可用 and 不可用 read as opposites |
| Retire; Retired | 归档; 已归档. Discontinue keeps 停用 | 已停用 named two things |
| Ship out, with no order | « Sortie de stock » · 出库 | It read as an order's Ship |
| Tax number | 税号, on the screen and the PDF | The PDF said 税务登记号 |
| The page at `/lots` | Trace a lot, Tracer un lot, 追溯批次, in Help's guide name and its links; its Show all names Inventory, the page it opens | One page had two names |
| An item's type, for one item | Raw material, Matière première, and each type's singular; Chinese unchanged | The plural read wrong on one item (#548) |

- **The phone checks set aside for that reviewer** (MC-2406's close
  dialog, Roles and the role editor in 中文, 品牌, product photos, 同事,
  and MC-2710's 编号) stay owed in `docs/manual-checks.md`, by name.
- **Each word above goes through the extra round,** so ChatGPT reads
  them too.

### Decision — a pseudo-language, and cut text found by a test

- `en-XA`: English with accents, about 40 % longer and bracketed at each
  end, its placeholders kept; in development and the browser tests only,
  never in a production build or its picker, which a test holds.
- A browser test walks a newcomer's first screens (signing in, accepting
  an invitation, Home with its welcome and Getting started, Help, the
  Account page) at 390 × 844 in French, Chinese and `en-XA`, and lists
  each text cut by its box: wider than the box with its overflow hidden,
  or ended by an ellipsis. Each is fixed, or listed with its issue, as
  #490's name is.

### Decision — what rides along

- **Closed by the pull request:** #148, #149, #150, #249, #501 and #511,
  and round 1's #371 to #398 and #419 to #423.
- **In part, said in the pull request:** #548's singulars, #505's 13,
  #486's two about words, #512's placeholder.
- **The guides' bold phrases are screen labels** (R12), decided on 3
  November with the guides' pass.
- **Filed, not ridden:** `scripts/adr-check.mjs` naming its folder by
  branch, `when-touched` under `docs`, since it changes the planning
  skill and its upload.

### Interaction table

| Where | You do | What happens | You land | Back |
| --- | --- | --- | --- | --- |
| Branding, the Account page, an item's photos | Choose a file past its limit, such as a 2.6 MB photo for a 2 MB logo | Refused before it is kept, in the reader's language, naming the limit and what to do: "A logo can be up to 2 MB. Choose a smaller file, or save it smaller first." | The same place, nothing kept | — |
| The language picker, in development and the browser tests | Choose `en-XA` | Every screen in longer, accented English; a server message in plain English | The same page | Choose another language |

No screen gains a step, so there is no wireflow board; the refusal is
the design language's failed state at its field, in new words, and no
screen's states differ from its States section.

### Considered and not done

- **A blind third vote on every message the reviews split on.** It
  would vote on style too, and overrule the maintainer's choice of
  ChatGPT's wording.
- **The maintainer reading the 198 Chinese messages the reviews split
  on.** About two hours, for Chinese alone.
- **Only what both reviews agree on, 38 and 31 messages.** Most of both
  reviews unused.
- **Claude's review in the extra round.** Outvoted wherever it differed;
  the checks still run.
- **Round 1's two passes moved into `scripts/`,** decided on 3 November.
  ChatGPT and the rules check now do their work, so they stay in
  `tmp/i18n-review/`; the meaning check is the one script here that
  calls a model.

### Deferred — each with what brings it in

- **A fluent reader's review (MC-1405), and the beta mark off.**
  Trigger: someone fluent in the language, or a first customer working
  in it.
- **A pseudo-language for the server's messages.** Trigger: a refusal,
  an email or a PDF found cut in a language.
- **A right-to-left pseudo-language.** With ADR-054's right-to-left
  trigger.

### Consequences

- `review/` holds every round's workbooks and their decided files; it
  stays ignored, and what lasts lands as commits to the catalogues and
  the guides.
- The next round: `export --since` this branch's export commit, ChatGPT,
  the decide step with its two checks, then `import`.
- Built in this order, each step one commit or more: this amendment and
  the handoff; dependencies; `import` refusing a changed message; the
  guides in the review and their bold labels; the rules check and the
  words not to use; the words settled here; the server's refusals (#148,
  #249); the client's words; the guides' words; the decide step with the
  meaning check; the extra round, by the maintainer; the imports; round
  1 where no later round changed a message; the pseudo-language and the
  cut-text test; dependencies again; the reviews; the as-built; after
  the merge, round 1's issues closed and `/triage`.

## Amendment (November 2026) — as built (#577)

Built on 12 and 13 November 2026 on `fix-ups-i18n`, from the brief's 18
steps, with follow-ups where a step's summary raised a decision. Steps 2
to 10 ran in a row in 2 h 47 min, about 40 % of the brief's guess. Every
change to a translation went in through `import`, never by hand (A1).

### Each requirement

| R | As built | Mark |
| --- | --- | --- |
| R1 | This amendment and the handoff's tidy, the branch's first commit, with two small fixes before it: round 2's dates, and a handoff line read as a link definition | met |
| R2 | A decided workbook for each language's round 2, extra round and guides, each message's Reason and Fallback beside it; the table as decided, with four additions below | met, changed |
| R3 | `import` refuses a correction whose English or translation changed since its export, naming its row (`6c4622d6`); quotes alone count as the same | met |
| R4 | `scripts/i18n-rules.mjs`, in `scripts/verify.sh`, the Docs workflow and `ci.yml`; it holds more than R4 named, below | met, changed |
| R5 | The meaning check judged too strictly on its first real run and was rebuilt, below; calibrated on three sets before it decided anything | met, changed |
| R6 | The extra round through ChatGPT alone, exported at `fe6c7e1d`: 326 French and 369 Chinese messages, and the guides whole, 151 sections a language, in a guides workbook of its own (#150) | met, changed |
| R7 | Round 1 where no later round changed a message, widened to any message that still breaks the glossary (A2): 21 findings went in, 1,252 were overtaken, 13 no longer held; a closing comment for each of 32 issues, #380 having closed with #477 | met, changed |
| R8 | The glossary's How it reads, ADR-090's rule for Chinese beside Latin letters, Words not to use, Settled messages, Placeholders filled with Chinese words, each type's singular, and the words settled here | met |
| R9 | `en-XA` in development and the browser tests only, a production build refusing it; the cut-text test in 16 walks: 390 and 320 px, Standard and Larger text, four languages | met |
| R10 | Each word settled as the table says, but a missing name's language, below; the phone checks in 中文 stay owed in MC-2406 and MC-2710 | met, changed |
| R11 | #148, #149, #150, #249, #501 and #511 closed; #486's two, #505's 13, #512's placeholder and #548's singulars in part | met, changed |
| R12 | `client/src/help/guides.test.ts` holds each bold phrase to a client message in the guide's language, the phrases bold on purpose listed with why | met |
| R13 | #531 on a branch of its own, next; `adr-check.mjs`'s folder filed as #571, `when-touched` under docs | met |
| R14 | Both languages beta; MC-1405 says no fluent reader yet, and how the rounds went in | met |

### Built differently

- **The decide step's table gained four rules,** each holding a choice
  made on the branch:
  - a message in the glossary's Settled messages keeps its text, whatever
    a review says, and `import` refuses a correction to it: four, the
    refused page's 您尚未登录, a missing name's sentence, the invitation's
    last day and the Account page's 我的账户;
  - a translation identical to its English is refused (translation
    tools' "source equals target" check), with 100 messages listed as
    exceptions, each with why, in `SAME_AS_ENGLISH`;
  - a space between Chinese and a placeholder that Chinese fills with
    Chinese words is taken out, the placeholders listed in the glossary;
  - a plural branch the language never uses, read from
    `Intl.PluralRules`, is dropped: Chinese shows only `other`, so a
    `one` branch never shows, and `=1` stays only where the words for
    exactly one differ.
- **The meaning check, rebuilt (version 2).** Its first run turned down
  15 to 32 % of ChatGPT's corrections; the chat read 50 of them and about
  4 in 5 were false alarms, a text stating what the English only
  implies. Version 2 writes its reason before its verdict, rejects only
  a serious change (meaning reversed; a number, date, name, role, screen
  label or tax word changed; needed information dropped; a claim the
  English and the message's id do not support), and reads each
  message's id and the glossary's Terms. Its calibration has three sets:
  20 planted errors to catch, 20 unchanged texts and 20 of ChatGPT's
  correct rewrites to pass. It caught 19 and flagged none; the miss was
  a dropped "can be used once", so a dropped clause can still pass.
  Fallbacks by meaning fell under 1 %. The API refuses a temperature
  from version 2026-10-21, so the answer comes as structured output, which
  always parses, and saved answers are keyed by the model and the check's
  version.
- **The amendment's "nothing added"** now allows stating what the
  context implies; only a claim nothing supports is refused.
- **A missing name's language** went from three messages, to
  `Intl.DisplayNames`, to a small table: Chinese names a language for a
  name written in it 英文, 法文 and 中文, as the exports' columns do, where
  Intl's 英语 names the spoken language. English and French keep Intl's
  names. The table is code, copied on the server and the client (#583).
- **Lists.** Every list a person reads joins in one place on each side,
  `makeIntl`'s `formatList` and the server's `joinList`, which space a
  Latin name from 和 and 或 in Chinese; lint refuses any other join. A
  value filled in beside a Chinese message's own words is #573's.
- **Validation.** The server's own rules say what to fix in words, with
  no field path; Work phone and Extension have rules of their own. The
  23 built-in class-validator rules keep the field's API name, as ADR-054
  decided, 7 of them reachable from a screen (#574).
- **Tests read a message by its id,** through the catalogue (`said()`,
  `saidOn()`, `saidBy()`; `docs/conventions.md`, Tests), so a later round
  changes no test; only a test whose point is the exact words, a mail
  snapshot's, types them.
- **A password field's label sits raised from the start,** in the shared
  `PasswordField`, as MUI advises beside an adornment; one long French
  label at 320 px and Larger text is listed as known with #566, which
  holds the case for labels above the field.
- **An empty date field shows no format** until typed in: no browser
  draws its placeholder in the page's language (#512).
- **ChatGPT's Chinese workbooks** came back with namespace-prefixed tags,
  which the review's reader now accepts.

### Found

- **The imports ran `--quick`,** which runs no end-to-end test, so a
  changed word reached tests and manual checks nothing ran until the
  reviews: 5 server tests, 1 browser test and 11 manual checks. Fixed by
  reading messages by id; the next round's import step ends with the
  server and browser suites.
- **CodeQL** flagged the rules check's tag strip, which ran once, so a
  nested tag left one behind; it repeats until stable (`48671b7b`).
- **The cut-text test was proven on the Mac's fonts only;** on CI's
  Linux fonts the long French label is cut at Standard text too, so its
  known entry holds the label at 320 px at any text size, and the full
  verify runs the test in Playwright's Linux image.
- **multer reads an oversize upload to its end** before answering 413,
  where ADR-059 says it is cut off at the limit (#584).
- **Dependencies:** both dependency steps took nothing; no update in
  range was 7 days old before 16 November.
- **The cost:** the meaning check and its calibrations used about 1.1
  million tokens in and 120,000 out on the API credit, inside the brief's
  US$4 to US$9; Claude Code ran on the plan.
- **Issues filed:** #573 (a filled-in value's spacing in Chinese), #574
  (the built-in rules), #575 (a deleted person stored as "Deleted
  User"), #576 (guides naming a label by its id), #578 to #582 (the
  walkthroughs' screens), #583 (language names in catalogues), #584
  (multer) and #585 (left from the reviews).

### The next round

`export --since 29cf53a7`, the word fixes' last commit, in a new
ChatGPT chat per language with the glossary; `--calibrate` first, then
the decide step with `--meaning`; `import`; then the server and browser
suites before the commit is pushed. The hand-made fixes after the
export at `fe6c7e1d` are this as-built's decisions; the one a round
must not undo, `account.title`, is settled.

## Amendment (November 2026) — an item's own name in the organization's language (#531)

An item's own name, the one typed when it is added, has no language: it
is shown in every language that has no name of its own (*Decision — a
product's name and description may be kept in other languages*). A
language the organization requires on its documents is met only by a
name kept in that language, never by the own name
(`server/src/modules/invoices/line-names.ts`). So an organization that
names its items in Chinese and requires Chinese on its documents types
every Chinese name twice, and the two copies drift apart (#531).

This amendment gives each organization the language its items are named
in, so that an item's own name is its name in that language, as Shopify
and Odoo do: content is written in one language, and translations exist
only for the others. Planned on 14 November 2026 on `fix-531-base-name`:
the maintainer confirmed the requirements before drafting, and chose
each decision as recommended.

### Requirements, as confirmed

Confirmed by the maintainer on 14 November 2026, with the assumptions,
what is not included and the questions' answers below. Each names its
step in the brief, and the as-built marks each met, changed or deferred.

| R | What | Done when | Step |
| --- | --- | --- | --- |
| R1 | This amendment, as the branch's first commit, with the handoff's tidy: #577 merged and its after-merge steps; Inventory and Movements after #531, with #587 | The amendment with its requirements, its check and its decisions; `scripts/verify.sh --docs` passes | 1 |
| R2 | The dependencies step takes the fix for Dependabot alerts 11 and 12 at once (#446, minimatch below 11.0.1, dev tools only), in `client/` and `server/` | `npm ls minimatch` in each shows no copy below 11.0.1; an override, if one is needed, named as the maintainer's in its commit; after the merge, both alerts seen fixed | 3, 14, 17 |
| R3 | Each organization says which language its items are named in, on the Documents tab; not set for an organization from before, the registering person's language for a new one; once set, never back to not set; audited | Server tests save and read it, refuse not set once set, and give a new organization the request's language; the Documents tab shows and saves it | 6, 9 |
| R4 | Choosing it says first what it will do: how many own names will count as that language's, and nothing translated; a kept name the same as the own one removed; one that differs listed beside it, one name chosen per row, with a choice for every row at once; refused while a row is unchosen, when the list changed since it was shown, or past 500 rows; a names save meanwhile waits for it | Server tests for each case, the two writes at once among them; client tests for the confirmation | 7, 9 |
| R5 | In that language the own name is the name, for an item, a named variant and a description alike: a document requiring it prints; the item's page shows it in that column, marked as the own name with its `lang`, never Missing; Edit names does not ask for it, and the server refuses a kept name in it; what documents will refuse comes from the server alone (#551's 65) | An invoice in that required language issues with own names only; server and client tests for the rest | 8, 10 |
| R6 | Add item, Edit and the variant dialogs say the language a name is typed in, once it is set | A client test | 10 |
| R7 | The items export's columns for that language hold the own names | A server test | 8 |
| R8 | The Items guide and a Documents section in the Organization guide, in three languages; the rules files and the manual checks; where a required language is ticked and none is set, the section says to choose one | `client/src/help/guides.test.ts` and `scripts/check-docs.mjs` pass; each manual check in its step's commit | 7, 8, 9, 10, 12 |
| R9 | `seed:demo`: the demo organization starts not set, with one kept English name the same as its item's own and one that differs, so the choice is walked from the demo; `seed:volume` adds nothing, and says why | The seed runs in CI; the manual check starts from it | 13 |
| R10 | The canvas row "物品名称的语言 第一版 · Item names' language v1"; each row of the interaction table a browser test | The boards drawn; each row's test passes | 2, 11 |
| R11 | The riders in *Decision — what rides along* | Each closed, or its part said, in the pull request | 4, 5, 8, 9, 10, 12 |
| R12 | The reviews, the as-built and the pull request, closing #531, #446 and #571 | The pull request open, its `Closes` lines checked against its commits | 15, 16 |

- **Assumptions:**
  - A1: an amendment, with no number of its own; the branch's working
    files in `tmp/fix-531-base-name/`, as #571 makes the check write.
  - A2: search, sorting, History, refusals and CSV exports other than
    the items export keep the own name, unchanged.
  - A3: the reads in the reader's language need no change: with no name
    kept in the organization's language, its readers already see the own
    name.
  - A4: one migration, a column; the API grows by a field, two routes
    and a field on the item's detail, all additive, so the API revision
    stays (ADR-081).
  - A5: the new messages are drafted in three languages on the branch,
    checked by `scripts/i18n-rules.mjs`, and reviewed in the next round's
    export.
  - A6: the setting covers items' and variants' names and items'
    descriptions; categories, tax codes and partners are unchanged.
- **Not included:**
  - N1: names swapped when the language changes (*Deferred*).
  - N2: a default language for the organization's people, this ADR's
    *Deferred*, its trigger not fired.
  - N3: categories' names in other languages (ADR-092's *Deferred*).
  - N4: the CSV import (#552), which will read names in this language.
  - N5: Inventory and Movements (#587), planned next in a chat of their
    own while this branch builds.
- **The questions' answers:** one name per language; an organization
  from before not set until its Owner chooses; a new one in the
  registering person's language; one section on the Documents tab, with
  the required languages; a name that differs chosen in the list, as
  #531 asked, in place of a refusal naming the items; a small canvas
  row; the setting apart from the document language. With them, the
  improvements a check against Shopify's change of a default language
  brought: the confirmation with its counts, no way back to not set, the
  lock, a description as a difference too, the own name's `lang`, the
  Organization guide's Documents section, the line in place, and for the
  list a choice for every row, a list that changed refused, and 500 rows
  at most.

### Checked before drafting

On 14 November 2026, from `scripts/adr-check.mjs 054`: the areas
`products`, `invoices`, `documents`, `organizations`, `database`,
`help`, `i18n` and `ui`, 102 open issues, and the issues 531 and 571,
each `when-touched` issue in them read whole, 69 in all; with them, the
Deferred lines of ADR-054, ADR-056, ADR-061, ADR-071 and ADR-092,
ADR-051's watch list and Open decisions.

- **Fired, and taken here:**
  - #531 itself, which proposed the document language as the items'
    language; this amendment keeps them apart (*Considered and not
    done*). Its "listed for the organization to choose, never chosen for
    it" is *Decision — choosing the language*.
  - #446, the minimatch alerts, made `fix-now` for this branch by the
    triage of 14 November (R2).
  - #551's 65: the client copies the rule for what documents will
    refuse, which this branch changes; the rule moves to the server once.
  - #282's extract: the organization's settings are listed in two reads
    in `server/src/core/organizations/organizations.service.ts`, and
    this branch adds one; one column map first.
  - #306's 37, the rest of it: the Items guide's names paragraph,
    rewritten here, says the screens follow the reader's language; and
    its 12: a unit test for Edit names refusing a description in a
    language with no name in it.
  - #487, two parts on the Documents tab: "No logo yet. Add one on
    Branding." under Logo on documents; and that tab's Save buttons off
    until something changes.
  - #505's 91 and 94: What we do as a one-line field, and a test that
    saving the same words records nothing, on the page and the service
    this branch changes.
  - #571: the check writes into the branch's folder. This is the first
    branch amending an ADR since it was filed, and its check sits in
    `tmp/adr-054/`; it changes the planning skill, packed and uploaded
    after the merge.
- **Not fired, and left:**
  - Items' screens, #533, #535 to #537, #546, #548's rest, #563, #569
    and #570: their files are not changed. #562, Add and add another, is
    a flow with its own browser test, for Items' next turn; this branch
    changes one line of Add item.
  - #164 and #264 (invoices), #161 (a design of its own), #278 (no new
    document) and #555 (documents), #168, #169 and #490
    (organizations), #314 (database), and of `help`, `i18n` and `ui`
    #154, #170, #261, #263, #324, #486, #507, #512, #541, #543, #583 and
    #585: their files are not changed, or not in their part.
  - #18, #162, #233, #277, #285, #441, #553 and #573 to #576: `later`.
  - The Deferred lines of ADR-054, ADR-056, ADR-061, ADR-071 and
    ADR-092; ADR-051's watch, where nothing reads differently; Open
    decisions, "Bulk create and CSV import" among them, which will read
    names in this language with #552: none fired.
- **Found while checking:**
  - #531's example, the own name "Calm 90ct" beside an English name
    "Calm", is not in the demo seed: "Calm" is its category's English
    name. R9 gives the demo a case of each kind.
  - #226's rule holds for the new reads: the preview, the removal and
    the lock name the organization in every join and subquery.

### Decision — each organization says which language its items are named in

- **`organizations.item_name_language`,** a supported tag, or null for
  not set. The DTOs check the tag, as every language column's
  (`server/src/database/schema/columns.ts`).
- **An organization from before is not set,** and keeps today's rule
  until its Owner chooses: no guess about names already typed.
- **A new organization takes the registering person's language,** the
  request's, as its time zone takes the browser's (ADR-072), through
  `startOrganization`, so registration, an organization invitation and
  Start an organization alike. It can be changed at once, before any
  item exists.
- **Once set, it is never set back to not set:** the choice offers
  languages only. Not set would make documents refuse again what the own
  names met.
- **On the Documents tab, one Item names section,** for those who may
  change the organization: "Items are named in", then the languages
  documents require, the items' own language shown as met by each item's
  own name. Where a required language is ticked and none is set, the
  section's line says to choose one.
- **Audited** as the organization's other settings are, with the counts
  of *Decision — choosing the language* beside it.

### Decision — in that language, an item's own name is its name

- **Documents:** a required language that is the items' own is met by
  the own name; only another required language can still refuse.
- **No name is kept in it:** saving a name or a description in the
  items' own language is a 409, "Items are named in 中文, so an item's
  own name is its 中文 name. Change it with Edit.", and Edit names does
  not offer it; it shows the own name there instead, read only.
- **The reads stay:** the reader's language, else the own name
  (ADR-056, amended), already gives the own name in that language.
- **The item's page:** the names table's column for that language holds
  the own name, marked as the item's own and carrying its `lang`, never
  Missing; the base row's words, "the name it was added with, used in
  any language without its own name", go.
- **Add item, Edit and the variant dialogs** say the language a name is
  typed in, "In 中文", once it is set.
- **What documents will refuse is worked out once, on the server**
  (#551's 65): the item's detail carries its missing names, by the rule
  the issue refuses with, and the page shows them; `missingNames` on the
  client goes.
- **The items export:** its columns for that language hold the own
  names, the variants' too.

### Decision — choosing the language: the same names removed, different ones chosen

- **First, what it will do:** `GET
  /v1/organization/item-name-language?language=<tag>` answers how many
  own names will count as that language's, how many names kept in it
  are the same as their own, and each that differs: the item or the
  variant, its code, both names and both descriptions.
- **The confirmation says it in words:** "The own names of 214 items
  will count as 中文 names. Nothing is translated." A kept name the same
  as its own, its description empty or the same, is removed as a copy.
- **One that differs is listed beside the own one,** and the Owner
  chooses one per row, or Keep every own name, or Use every 中文 name;
  never chosen for them (#531). Choosing the kept one renames the item,
  as Edit does, and its History says so.
- **`PUT /v1/organization/item-name-language`** takes the language and
  each row's choice with the two names it showed. In one transaction,
  with the organization's row locked: the list worked out again; refused
  with `item_names_changed` when it differs from what was shown, the
  confirmation reading it again and keeping each choice whose row still
  stands; then the copies removed, each choice applied and the language
  set.
- **Refused too:** a row with no choice, and more than 500 rows,
  several at once's limit, naming how many.
- **A names save waits for it:** Edit names reads the organization's
  row under a shared lock before it writes, so no name is kept in a
  language while that language is being chosen.
- **Changing from one language to another is the same choice:** the
  confirmation says the own names typed so far will count as the new
  language's.

### Decision — what rides along

- **Closed by the pull request:** #531, #446 and #571.
- **In part, said in the pull request:** #551's 65, #282's extract of
  the organization's settings, #306's 37 and 12, #487's two on the
  Documents tab, #505's 91 and 94.
- **For #571:** `scripts/adr-check.mjs` writes `tmp/<branch>/check.txt`;
  the planning skill, its `reference/brief.md`, `docs/engineering.md`
  and ADR-089, amended, name that folder.

### Interaction table

Its wireflow is the canvas row "物品名称的语言 第一版 · Item names'
language v1": the Item names section, the confirmation and the names on
the item's page. Each screen's five states follow the States section of
`docs/design-language.md`; the board draws only the confirmation's,
which differ: Loading while it reads what the change will do, Failed
with Try again, As it should be with nothing to choose, and with rows to
choose.

| Where | You do | What happens | You land | Back |
| --- | --- | --- | --- | --- |
| Organization › Documents, Item names | Choose 中文 under "Items are named in", then Save | The confirmation reads what it will do: "The own names of 214 items will count as 中文 names. Nothing is translated.", and the copies it removes | The confirmation | Cancel: nothing changed |
| The confirmation, nothing differing | Confirm | Saved: "Items are named in 中文."; 中文 shows as met under the required languages | The Documents tab | — |
| The confirmation, names that differ | Choose a name on each row, or Use every 中文 name, then Confirm | Confirm stays off until every row has a choice; saved; each item whose 中文 name was chosen is renamed, its History saying so | The Documents tab | Cancel: nothing changed |
| The confirmation, a name changed meanwhile | Confirm | "The names changed since this list was shown." The list is read again, each choice kept where its row still stands | The confirmation | Cancel |
| The confirmation, more than 500 rows | Save | Refused, saying how many differ, at most 500 at once | The Documents tab | — |
| Item names, a required language ticked and none set | Open the Documents tab | The section's line says to choose the language items are named in, so it is met by their own names | The Documents tab | — |
| An item's page, Names in other languages | Read the 中文 column | The own name, marked as the item's own, never Missing | The item's page | Back to Items |
| Edit names | Open it | No 中文 field: a line says the item's own name is its 中文 name, changed with Edit | Edit names | Cancel |
| An invoice in 中文, required | Issue it, its items named only by their own names | Issued | The invoice | — |
| Add item | Type the name | The field says "In 中文" | Add item | Cancel |
| Items | Export | "Name in Chinese" holds the own names | The file | — |

### Considered and not done

- **The document language as the items' language,** as #531 proposed.
  Changing what documents print in would quietly relabel every own name:
  a Chinese company printing English documents for export would find
  its Chinese names counted as English.
- **Refusing the change while any kept name differs,** each fixed in
  Edit names, as first confirmed. One trip per item, where #531 asked
  for the list.
- **Choosing for the organization,** every own name or every kept one.
  Shopify's change of a default language deletes the translations in
  the new one, and they do not become the content; here nothing is
  chosen without the Owner.
- **A trigger refusing a kept name in the items' language.** No trigger
  in this database enforces a business rule; one service writes the
  kept names, and the lock holds the one race.
- **Every name kept per language, with no own name,** as SAP and
  Akeneo do. The own name feeds search, pinyin, sorting, History and the
  refusals; a far larger change for the same result.
- **The language filled in for every organization from before,** from
  its document language: a guess about names already typed, wrong for
  the example above.
- **Not set offered again once set.** Documents would refuse what the
  own names met.

### Deferred — each with what brings it in

- **Names swapped when the language changes:** each item named in the
  new language taking that name as its own, its own kept in the old.
  Trigger: an organization changing the language it works in.
- **More than 500 names to choose at once.** Trigger: an organization
  with more.
- **An item's name marked with its language on every screen** (`lang`,
  WCAG 3.1.2), not only on its page's table. Trigger: the review of the
  whole app, or a screen-reader user meeting a name read in the wrong
  voice.

### Consequences

- **Migration 0081:** `organizations.item_name_language`, nullable, no
  backfill; `npm run migrate:all`, and `foundation_perf_large` migrated
  as `server/perf/README.md` says.
- **API:** the field on the organization, the two routes, the missing
  names on the item's detail; `npm run api`; the revision stays.
- **Rules files:** `docs/rules/products.md` for the names,
  `docs/rules/invoices.md` for what issuing refuses, each in its step's
  commit.
- **No `seed:volume` rows:** no new table, and the preview is read when
  the language is chosen, not on any screen's way; timed once at large
  in its step.
- **Built in this order,** each step one commit or more: this amendment
  and the handoff; the canvas row; dependencies, the security fix first;
  the check in the branch's folder (#571); the organization's settings
  from one column map; the setting; choosing it; the own name as that
  language's, on documents, the item's detail and the export; the
  Documents tab; the item's page and the dialogs; the browser tests; the
  guides; the seeds; dependencies again; the reviews, with the `set-up`
  and `items` journeys; the as-built; after the merge, the alerts seen
  fixed, the skill packed and uploaded, and `/triage`.

## Amendment (November 2026) — as built (#595)

Built on 14 November 2026 on `fix-531-base-name`, 36 commits with this
one, from the brief's 17 steps: steps 3 to 14 in a row, each on the model
its row named, then the reviews in two prompts. Steps 3 to 14 took 181
minutes, about 44 % of the brief's 410; the reviews 141, about 78 % of
their 180. The code's names follow the glossary's rule that in code an
item is a product: `organizations.product_name_language`,
`productNameLanguage`, `/v1/organization/product-name-language` and
`product_names_changed`, where the decisions above wrote `item`.

### Each requirement

| R | As built | Mark |
| --- | --- | --- |
| R1 | This amendment and the handoff's tidy, the branch's first commit (`a3931a33`) | met |
| R2 | eslint 10.15.0 in `client/` and `server/`, the server's unused `@eslint/eslintrc` removed, and typescript-estree's copy held at minimatch ^11.0.5 by a scoped override, ADR-019 amended below; every copy at 11.0.5 (`599601e1`); both alerts to be seen fixed after the merge | met |
| R3 | Migration 0081 and the organization's field, a new organization's language from the request's Accept-Language (`1e81dbf3`); the Documents tab's Item names section (`2470f8c0`) | met |
| R4 | The preview and the choice under the lock (`c083ef2e`); the confirmation as the canvas row v2 draws it (`2470f8c0`), below | met, changed |
| R5 | Documents, the detail's missing names and the export (`3dfe1920`); the item's page and Edit names (`75a3ecb6`); the rule's one home in `products/` (`70111f49`) | met |
| R6 | "In {language}" under the name in Add item, Edit and the variant dialogs, and under Add item's Size or variation | met, changed |
| R7 | The export's columns for the items' language hold the own names, a variant's too | met |
| R8 | `docs/rules/products.md` and `docs/rules/invoices.md`; MC-214, MC-216, MC-1407, MC-1408, MC-1411, MC-1425, MC-1558 and MC-3611; the Items guide and the Organization guide's Documents section in three languages (`c1ffc364`); the line while not set (`68b3e101`) | met |
| R9 | `seed:demo` starts not set, Vitamin D3 1000 IU, 120 softgels keeping an English name the same as its own and Calm 90ct keeping "Calm, 90 capsules", the seed checking both through the preview (`73cd1d0a`); `seed:volume` adds nothing | met |
| R10 | The canvas rows v1, v2 (the confirmation, the tones, the phone) and v3 (the item's page while not set); 10 browser tests for the 11 rows, the 500 row a server test, since no test hook lowers the limit (`0771580d`) | met, changed |
| R11 | #571 (`f58d995a`); #282's extract (`6fac2ca6`); #505's 94 (`e64906ad`) and 91 (`40a478d9`); #487's two (`fd077fc4`, `b36b1c9d`); #306's 12 and 37; #551's 65 on the server and the client | met |
| R12 | The reviews: 39 findings, 24 fixed, each its own commit, the rest filed as #588 to #594 or said in the pull request; the full verify, CI and Claude Code Review green; #595 open, its `Closes` lines checked against its commits | met |

### Built differently

- **The confirmation, as the canvas row v2 draws it.** The interaction
  table's rows 1 and 3 read as v1: its button is never off once the
  preview is read, and says what it does, "Name items in {language}".
  Pressed with rows left, it sends nothing, says "Choose one to keep"
  under each, names them in a line above with links, and focuses the
  first one's first choice. The rows are a table, each column's heading
  choosing it on every row shown, with "All" and "Only those left", and
  "N of M chosen" at its foot; a description that differs is shown and
  chosen with its name. The saved message counts what was done, its
  parts joined with "and".
- **The lock.** The choice reads the organization's row `FOR NO KEY
  UPDATE`, not `FOR UPDATE` as first built: a foreign key's check takes
  `FOR KEY SHARE` on the row it points at, which `FOR UPDATE` blocks, so
  every new row in the organization waited for the choice. A names save
  reads it `FOR SHARE`, which still waits for the choice.
- **The choice answers 200 with its counts:** copies removed, names
  removed and items renamed, which its message needs and no read gives.
  `docs/conventions.md`, `CLAUDE.md` and `/code-review` gain the case: a
  write over many rows whose message counts what it did returns those
  counts. Sent again once made, it answers 200 with nothing done; before
  the reviews it answered 409.
- **A row's choice:** `keep` missing or null is a row with no choice; a
  row missing from the body is a list that changed. A row carries its
  descriptions, so a changed description changes the row, and a row
  whose names changed comes back New, its choice cleared.
- **The choice removes every name kept in the language:** under the
  lock those are exactly the copies and the rows chosen.
- **History:** a renamed item's row records its name from and to and
  names its cause, "Renamed by choosing the items' language", a new
  audit field; the rules line says so. A language reads by its full
  name there, "Simplified Chinese", as every language field does.
- **The routes live in the products module,** under `organization/`, as
  numbering's do; `MAX_CHANGED_AT_ONCE` stays in the products module,
  which alone uses it.
- **The item's page while not set** (the reviews' finding 1, the canvas
  row v3): the own name is labelled in both states, "Item's own name" or
  "Variant's own name", and a grey line above the table, its
  description, says why each language reads "—", with a link to Item
  names for whoever may change the organization's settings and the
  place in words for anyone else. The place is written "Organization →
  Documents", as the app's other place names are; the interaction
  table's "›" reads "→".
- **Edit names says "the item's own name",** never "the base name".
- **One Save changing the language and the required languages** saves
  the language first; the items' own language is drawn ticked under the
  required ones while its stored value is kept as it was.
- **The confirmation opens** once the preview has come, or after 250 ms,
  so over 500 is refused at the field with no dialog shown.
- **A new organization's language** is the request's Accept-Language,
  not the registration's own `locale`; the client sends the app's
  language as both.
- **#505's 94:** the service marks a save with nothing to write by
  `recordUnchanged()`, and the interceptor and the demo seed's auditor
  then write no row; an empty body records none either. Another route
  whose only field is kept out of the log would need the same call;
  none is known.
- **The 中文 guide** describes the confirmation's button in plain words:
  its message has the language in the middle, and the guides' check
  bolds only a message with a value at an end.
- **`seed:demo` with an email** whose organization's language is set
  keeps no English names, since a name kept in the items' own language
  is refused.

### Found

- **Dependencies:** minimatch held at 11.0.5 and brace-expansion at
  5.0.12, the 7-day rule's versions, by setting their lock entries from
  the same locks' own entries where npm had resolved releases 3 days
  old; neither dependency step found anything else 7 days old, the
  first coming of age on 15 November, 23:12.
- **ADR-019's October amendment (#270)** already allows an override
  across a major for a development tool's copy, every command using it
  shown working; `docs/conventions.md` still said the same major only,
  and says both now.
- **The screenshots skipped the item's page** from step 13, finding Calm
  90ct by an English name the seed had changed; they find it by its code
  now (`7defd673`).
- **The preview, timed once at large:** 15 to 23 ms on 5,000 items,
  2,500 French names that differ.
- **The small volume database** named in `server/perf/volume-small.json`
  no longer existed; `foundation_perf_large` alone was migrated.
- **A step judged its own time wrongly:** steps 9 and 10 said they ran
  past the 30-minute stop rule, about 65 and 55 minutes, where the
  loop's clock says 35 and 18. The loop's clock is the one to read.
- **The brief's own sum was wrong:** its table adds to 410 minutes for
  steps 3 to 14, not the 6 hours 10 minutes it said.
- **The canvas row v3** writes "›", the chat's slip; the app writes
  "→".
- **47 messages are drafted in French and Chinese with no reviewer**
  yet: 1 in step 6, 8 in step 7, 32 in step 9, 3 in step 10 and 3 from
  the reviews, for the next round's export.
- **The reviews' panel:** every walker finished every task at every
  size; the main finding was the item's page while not set, which all
  four items walkers misread. The 21 smaller findings, from before this
  branch, are #594's boxes; #590, Items' stock badges, waits for
  Inventory.
- **Issues filed:** #588 (Documents shows no saved logo), #589 (the
  names table on a phone), #590 (Items' stock badges), #591 (a category
  line on a type's tab), #592 (the Documents tab's order and a helper's
  words), #593 (`subtitle2` to the five type sizes) and #594 (left from
  the reviews).

## Amendment (November 2026) — `en-XA` in the browser tests' own build (#530)

R9 kept `en-XA` "in development and the browser tests only, never in a
production build". The browser tests now load a build
([ADR-008's amendment of November 2026](0008-testing-scaffolding-lands-in-v1.md)),
so "development" no longer covers them.

- `en-XA` is on in `npm run dev` and in the browser tests' own build,
  by one setting, which takes `import.meta.env.DEV`'s place wherever it
  guarded the pseudo-language.
- A production build still neither has it nor offers it, and
  `withoutPseudoLanguage` still stops every build but the tests' whose
  chunks carry it.
- `cut-text.spec.ts` and `languages.spec.ts` are unchanged: `en-XA` is
  where they look for it.

### As built (#721, 26 November 2026)

- The setting is `__DEV_AND_TESTS__`, compiled in by
  `client/vite.config.ts`: on in `npm run dev`, in the browser tests'
  build and in the component tests, off in every other build. It took
  `import.meta.env.DEV`'s place in `client/src/lib/locales.ts`,
  `client/src/i18n/catalogues.ts`,
  `client/src/i18n/language-provider.tsx` and
  `client/src/layout/bar.ts`; the warning for a missing message keeps
  `import.meta.env.DEV`.
- It is not `en-XA`'s alone: the page that throws on purpose, which the
  browser tests open to reach the crash page before sign-in, shares it
  (ADR-008's as-built for #721).
- `withoutDevAndTests` took `withoutPseudoLanguage`'s place: one check
  stops every build but the tests' that carries either, naming each
  and where.
