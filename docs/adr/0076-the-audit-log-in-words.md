---
status: accepted
date: 2026-10-19
areas: [audit, i18n]
amends: [ADR-018, ADR-038, ADR-054, ADR-057]
---

# ADR-076 — The audit log in words: no ids, references named, every field translated (amends ADR-018, ADR-038, ADR-054 and ADR-057)

## Context

The demo seed filled the audit log for the first time, and in
简体中文 it read like this:

```text
发票草稿已创建 · Kits Wellness Co-op · draft
tax code id: 01a15178-47ce-7033-b359-7c4f69f99300 · shipment id: 01a…
```

Three faults, each on every screen that shows an entry (the audit log, a
record's History, Your activity, a person's recent work) and worse in the
CSV:

- **Ids.** A recorded reference prints as a UUID: `orderId`, `invoiceId`,
  `taxCodeId`, `shipmentId`, `roleId`, `deliverToId`, `sendBackToId`,
  `returnId`, `defaultSalePriceListId`, the replacement order in an RMA's
  context, and the ids in an export's filters. The client already hides a
  UUID inside an object, so a line's id vanishes, but at the top level it
  prints. A UUID means nothing to a person, and ADR-054 already says a raw
  id never reaches a screen.
- **English in every language.** Field names are made from the code's own
  names (`label()` turns `taxCodeId` into "tax code id") and never
  translated, and values print as stored: "status: fulfilled", "resolution
  replace", "true". Three labels store English words: an invoice before
  its number ("· draft"), a lot ("FOCUS-60CT lot …") and a movement's
  reason. The handoff lists "field names inside an audit entry" as a known
  edge; #129 is the general case.
- **The CSV is the raw row.** Action and Record type are keys
  (`order.updated`, `return_authorization`), Record falls back to the id,
  and Details is the payload as JSON.

ADR-018 decided which fields are recorded and ADR-038 named the record a
row is about. Neither said what a person sees for an id or a code inside
the details, so the screens printed what was stored.

Checked before drafting, as the working agreements ask: the Open decisions
entry "Audit log export and payload search" (export shipped with ADR-057;
search waits for someone to ask, not fired); the handoff's known edge
above (closed here for the audit log; validation messages keep
theirs); #129 (closed here for the audit log); #133, fields logged as
sent rather than as stored (references are named from the stored row
after the handler, so they read as stored; other values stay #133's).

## Decision — no UUID anywhere a person reads

Not on a screen, not in a
CSV, a PDF, an email or a notification. A UUID appears in two places only:
inside a link's URL, which nobody reads, and in the API's JSON, which is
for programs (ADR-063: CSV is for people; JSON is for programs). A CSV
carries no id column: an integration that needs ids reads the API.

## Decision — a reference is named when it is written

ADR-038's rule
for the record itself, extended to every reference in the payload, as
Odoo's field tracking and Salesforce's field history keep the name a
linked record had at the time:

- After the handler, the interceptor replaces each reference field's id
  with `{ id, label }`, on both sides of a `{ from, to }`, through the same
  one-resolver-per-kind map ADR-038 set up. The history keeps the name the
  record had then; a rename does not reach it, and a deleted record keeps
  a name.
- New resolvers: a shipment (its order's number, and its tracking number
  when it has one), a return (its order's number), a role, an item (its
  SKU) and an order line (its SKU). Deliver to and send back to are sites,
  which already have one. A file reads as what happened to it ("the logo
  replaced"), as product images already do.
- ADR-038's exception stands: no person is named in the log. A filter on a
  person in an export reads as "one person" (or "you", on Your activity),
  never their name.
- A label holds names, numbers and codes, never a word in any language.
  An invoice before its number is labelled with its customer alone; the
  action already says it is a draft. A lot is its SKU and code; a movement
  its SKU, with its reason recorded in the payload; an exchange rate its
  currency, with the day read from the payload.
- A list of lines (an RMA's) is named by item, its SKU and quantity, at
  write time.

## Decision — one vocabulary, declared once, that the code cannot skip

`AUDIT_FIELDS` on the server, beside `AUDIT_ACTIONS`, declares every key a
payload may hold and what it is: text as typed (a reference, a reason), a
day, a moment, money, a quantity, a yes or no, a language, a time zone, a
colour, one of a named set (an order's status, a direction, an RMA's
resolution, a licence policy, a sign-out scope, a rail, a paper size), or
a reference to a kind. `@Audited({ fields })`, `recordPrevious` and
`recordContext` take only declared keys, so recording a new field without
saying how it reads fails to compile, as an undeclared action already
does.

## Decision — the server words every entry, for the screens and the CSV alike

One formatter, in the reader's language, as the server already
words errors, emails, PDFs and CSV headers (ADR-054, ADR-071):

- `GET /v1/audit`, a record's history, Your activity and a person's recent
  work return each entry's action named, its record type named, and its
  details as a list: a field's name, and its value or its change, each
  value as text, a day, a moment (formatted by the client, in the
  reader's own zone), or a reference (`{ kind, id, text }`).
- The client renders that list. A reference is a link, its text the name
  and its id only in the URL, when there is a page for its kind and the
  reader may open it (ADR-016); otherwise plain text. The client no longer
  derives a word from a key, and `AUDIT_ACTION_NAMES` with its check move
  to the server's catalogues.
- The CSV writes the same words: When, By (name, then email, as the
  screens show who, ADR-063), Action and Record type named, Record its
  label, Details the list joined as one line.

Two formatters, one on each side, would drift: the seed's copy of the
interceptor's payload rules did within a day.

## Decision — rows already written are read, not rewritten

ADR-038
rejected joining today's names and refused backfills, because a log must
not claim something was done to a name it did not have then. A bare id in
an old row reads as its kind in words ("an order", "a tax code"), linked
when the record still exists and the reader may open it. Field names and
values are words at read time, so old rows read translated like new ones.
Old labels keep their English words ("· draft"); there are few, and only
in development and demo data.

## Considered and not done

- **Hiding ids on the client.** What the formatter already does inside
  objects: it drops information instead of naming it, and the CSV, written
  on the server, keeps every id.
- **Naming at read time.** ADR-038's reason: a renamed record would rewrite
  its own past.
- **An id column in the CSV, for matching.** The CSV is for people; the
  API is for programs.
- **A formatter on each side.** Shown above.

## Deferred — each with what brings it in

- **Payload search.** As before: when someone asks for it.
- **A page for every kind.** A shipment links to its order and a role to
  Members; a kind with no page is plain text. Trigger: a kind that gains a
  page.

## Consequences

- Built in this order, one PR: the vocabulary and the new resolvers; the
  interceptor naming references; the formatter and the response change,
  with `npm run api` and the client's generated types (ADR-068); the CSV;
  the client rendering, retiring `label()` and the client's action names;
  manual checks. No migration: the payload is JSONB, and old rows are read
  as they are.
- The seed's audit helper shares the interceptor's naming, as it already
  shares `auditPayload`.
- A test renders a sample of every declared field in each language and
  fails on a UUID, a camelCase word, or a value left as its code;
  `npm run i18n:check` already fails on a missing translation.
- ADR-018's allow-list becomes the declared vocabulary; ADR-038's labels
  reach the payload; ADR-054's "a raw id never reaches a screen" now means
  UUIDs too; ADR-057's audit export writes words.

*Amended while building:*

- **References are named in `AuditService.record`**, not in the
  interceptor, so every writer that records through it is covered: the
  routes, the demo seed, and the pro forma and the organization's export,
  which write their own entries. Deleting an account, and scheduling or
  cancelling an organization's deletion, write their rows straight to the
  table inside their transactions; those rows hold no reference.
- **A shipment is named by its order's number**, and its tracking number
  when it has one, and links to its order: it has no page of its own, so
  its order's id is stored beside the shipment's when the row is written.
  A row written before this has no order's id and reads as plain text.
- **The raw payload stays in the API**, beside the words, as the event's
  data for programs; removing it was considered while building and not
  done, since programs read it and no person does.
- **A reference reaches the client as `{ text, link: { kind, id } }`**,
  not as the `{ kind, id, text }` the Decision describes. The link is null
  where there is nothing to link to: a person, a record of no stated
  kind, or a shipment written before its order's id was stored. The
  client follows it only where its kind has a page and the reader may
  open it; a kind with no page, such as a tax code or a site, reads as
  plain text.
- **Dates in a payload are recorded as sent and read as the days they
  name:** an export's From, sent as the organization's midnight
  (ADR-072), in the organization's zone; its To, sent as the start of the
  day after (ADR-057), as the day before, and named To; a day stored as
  UTC midnight before ADR-052, as that day. So an export reads as the
  days chosen. A date is never walked into `{}`.
- **Recording an undeclared field fails to compile** through `@Audited`'s
  fields, `recordPrevious`, `recordContext`, the seed's helper or
  `AuditService.record`, which take only declared keys. The compiler does
  not see a row that deletion inserts into the table directly, or the
  keys inside an export's filters, which are its list's query: an e2e
  test reads a scheduled deletion and an export's search in words. A test
  words every declared field in all three languages, as a value and as a
  change.
- **A time zone reads as its generic name and city**, as the client's
  picker says it: "Pacific Time (Vancouver)", the name in the reader's
  language and the city as the zone's id spells it.
- **A person filter reads as "you" to the reader**, as on Your activity,
  and as "one person" to anyone else; never as a name (ADR-038).
- **Old rows read a reference as its kind in words** ("an order", "a tax
  code"), never as today's name.
