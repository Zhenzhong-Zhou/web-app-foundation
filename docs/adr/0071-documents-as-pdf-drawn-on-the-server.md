---
status: accepted
date: 2026-10-16
areas: [invoices, orders, documents]
amends: [ADR-046, ADR-054, ADR-055, ADR-070]
amended-by: [ADR-051, ADR-072, ADR-073, ADR-080]
---

# ADR-071 — Documents as PDF, drawn on the server (amends ADR-046, ADR-054, ADR-055 and ADR-070)

> **Amended by [ADR-080](0080-job-roles.md).**
> The purchase order's and the pro forma invoice's PDFs need `orders.view_prices` beside their document's read permission; every other PDF is served under that permission alone. Everything else stands.

## Context

Three documents print today: the packing slip (ADR-041),
the invoice (ADR-046) and the credit note (ADR-047). Each is a page the
browser prints, in the look ADR-055 settled and the customer's languages
(ADR-054). There is no PDF. A person who needs one chooses Save as PDF in
the print dialog, one document at a time, and what lands on paper varies
with the browser: its margins, its headers and footers, where it breaks a
page. The server cannot make a PDF at all, so ADR-070's export carries an
organization's data but not its documents as issued, which a bookkeeper
expects to keep (#118, from the walkthrough in Chinese).

Three more documents have no printed form. A return authorization
(ADR-047) is something a customer is sent and quotes back. A purchase
order is something a supplier is sent. A pro forma invoice was deferred
by ADR-046: a valued document that creates no debt, sent before goods
ship, for prepayment, an import permit or a customer's own approval.

## Decision — one design per document: the PDF, drawn on the server

The server draws every document as a PDF with pdfmake (MIT, built on
pdfkit), from the same data its page reads, the snapshots of an issued
document included. Print opens that PDF in a new tab and the browser's
PDF viewer prints it; Download PDF saves the same file; the export puts
the same files in its ZIP. The print pages and `PrintSheet` retire, so
each document has one design, and paper looks the same from every
browser.

Each PDF is served beside its document's read route, under the same
permission, `inline` for Print and `attachment` for Download PDF, named by
the document's number. A draft invoice's PDF is marked Draft on every page
and in its file name; a voided invoice keeps the mark it prints with now.

## Decision — six documents

The packing slip, the invoice and the credit
note keep the look approved in ADR-055, carried over to the PDF and
checked against screenshots of the print pages. The other three are
designed on the canvas and approved before they are built:

- **Return authorization:** its number, to quote on the parcel; the
  customer; the lines authorized and their quantities; where to send them.
- **Purchase order:** the order's number; the supplier; the lines and
  quantities, each price where one is set and blank where not, since a
  purchase is sometimes raised before its price is known (ADR-046); the
  expected date; where to deliver.
- **Pro forma invoice:** below.

## Decision — the pro forma invoice (amends ADR-046's deferral)

Made on
demand, from any sale order that is not cancelled, draft or confirmed, as
long as every line has a price; an unpriced line is refused with what to
do, as confirming is. It is titled Pro forma invoice and says Not a tax
invoice; it carries the order's number and the date it was made, for
SO-1234, 15 October 2026, and no number series of its own; it is stored
nowhere, so making it again shows the order as it is then. Its tax is
what the invoice would charge, worked out by the invoice's own code, and
it prints in the customer's document languages. Each one made is an audit
entry, `order.pro_forma_made`, with its total: the trail of what was sent.

ADR-046's deferral gave it its own type and number series. Neither is
needed for a document that is never owed and never in the books, and
business software of this size makes it the same way, from the order:
Odoo offers it on any quotation or sales order. A sample order (ADR-042)
has no prices, so it gets no pro forma until declared values come with
customs details (deferred).

## Decision — the words, the rules and the paper

The words a document
prints move to the server's catalogues in all three languages, under the
ids they have now, and the server applies ADR-054's rules: each label in
the first language, then the second, the same size and weight; dates and
money once, in the first; data as typed; a product's name by its own
rule. The logo is ADR-060's: the organization's own when the PDF is made,
if it prints logos. A page left the paper size to the printer, and a PDF
has to choose, so each organization gets one, Letter or A4, set where its
branding is and defaulting from its registered address: Letter in Canada
and the United States, A4 elsewhere.

## Decision — fonts in the repository

Noto Sans, for English and
French, and Noto Sans SC, for Simplified Chinese, in Regular and Bold,
under the SIL Open Font License, are committed to `server/assets/fonts`
with their licence: about 20 MB. They load once, when the server starts,
and each PDF embeds only the characters it uses. Nothing is fetched at
build or at run time, so documents render offline, on any host, and in
mainland China.

## Decision — the export (#118, amends ADR-070)

The ZIP adds a
`documents/` folder: every invoice and credit note as a PDF, named by its
number, exactly as Download PDF gives it. A time in the CSVs is written
`2026-10-15 18:54:11`, in UTC, rather than as Postgres writes it with
fractions and an offset, so a spreadsheet opens it as a date. The README
gains a glossary in the Owner's language: what the main tables' columns
hold, that times are UTC, and how an audit action is named (the thing,
then what happened to it, as `user.created`), the Audit log showing each
in words. The CSV headers stay as stored, so a later import maps them back
to the database. The download link carries `?locale=` with the app's
language, which the README follows, since a plain link cannot otherwise
say which language the Owner reads.

## Decision — performance

Drawing a PDF is work for the processor, not
the database. The export draws its documents one at a time as it streams,
so an organization with thousands of invoices takes longer but never holds
them all in memory. Each PDF route and the export are budgeted as every
route is under ADR-051, the figures set from their first measurement on
the volume seed, with a probe for one invoice and one for the export.

## Rejected

- **A headless browser on the print pages,** which would keep one layout
  in the browser's hands: Chromium is hundreds of megabytes and needs a
  lot of memory per page, against a 512 MB server; it would need a second
  way to sign in to those pages; and it ties the deploy to one platform's
  setup.
- **The print pages kept beside the PDFs:** two designs of every document,
  kept in step forever.
- **Storing each PDF when its document is issued:** the snapshots already
  freeze everything a document prints but the logo, which ADR-060 already
  takes from the day it is printed. Storage and a migration for nothing.
- **@react-pdf/renderer:** React on the server, and more dependencies than
  pdfmake for the same tables.
- **pdfkit alone:** tables, repeated headers and page breaks by hand,
  which pdfmake already does on top of it.

## Deferred

- **Emailing a document** to its customer from the app. Trigger: the first
  customer who asks.
- **Declared values and customs details:** a sample's value, HS codes,
  country of origin. Trigger: the first shipment that needs them.
- **An organization's own typeface** on its documents, uploaded and
  checked to cover its languages, since a font that lacks a character
  prints an empty box. Until then every document uses Noto Sans and Noto
  Sans SC. Trigger: the first customer who asks.
- **Traditional Chinese**, which has no locale yet (ADR-054).
- **An electronic invoice format** that some countries require, such as
  China's fapiao. Trigger: the first customer who must issue one.
- **A PDF kept exactly as sent.** Trigger: a customer, or a law, that
  needs the file itself rather than the document drawn again.
- **Tagged PDFs,** with a structure tree and a document language, which
  pdfmake does not write (#162). Trigger: a customer or an authority that
  asks for accessible documents.
- **The budgets for the PDF routes and the export,** and their probes for
  one invoice and one export (*Decision — performance*): nothing is
  measured yet, so no figure is set. Trigger: the first `npm run perf` on
  the volume seed after this ADR's pull request merges (ADR-051), or
  sooner, a PDF or the export reported slow.

## Consequences

- pdfmake is a new dependency, with pdfkit and fontkit under it, its
  peers resolving without an override (ADR-019).
- The server grows by its fonts, about 20 MB.
- The client loses `PrintSheet` and three print pages; the printed words
  leave its catalogues for the server's.
- A migration adds each organization's paper size.
- The manual checks for printing are rewritten for the PDFs, and gain the
  three new documents and the export's.

## Amendment (October 2026) — orders get numbers of their own

This ADR
assumed an order had a number to print. It has only its partner's
reference, which an order placed by phone lacks and two suppliers may
share. A purchase order sent to a supplier needs ours, and a pro forma
names its order by it.

Each order now takes a number when it is created, a draft included, from
the organization's series beside the invoice's (ADR-046): SO-000001 for a
sale, PO-000001 for a purchase. A deleted draft leaves a gap, which an
order may have; an invoice may not, and takes its number at issue as
before. Existing orders are numbered by the migration, oldest first, per
organization and direction, and each series carries on after them.

The number heads the order's page, leads the orders list, the lookup's
results, Home's recent records and the orders CSV, and is searched
beside the reference, which stays as theirs.

Deferred: **numbering settings**, what each organization may change of
its numbers: its prefixes, digits and next number. Trigger: ADR-073,
after the organization's time zone that its periods need (ADR-072).
*Built by ADR-073 (October 2026):* each organization sets each series'
prefix, width, reset and next number.

## Amendment (October 2026) — where goods go, and what every page says

The designs approved on the canvas settle what the three new documents
print where the decisions above left it open.

Where to deliver and where to send back is a *site*'s address, not the
registered one, which is often a head office the goods never see. A site
(ADR-024) holds an address of its own, set on it in Locations; the
deferral of per-site addresses in ADR-024's open items ends here, since
these documents force them. A purchase order chooses Deliver to, a site,
set for it when the organization has one; an RMA chooses Send back to,
from the site its goods shipped from unless changed. Each prints the
site's name and address, and the registered address only when the site
has none yet.

Every document, the six of them, carries its kind, its number and the
page, "Page 1 of 2", at the foot of each page, so a second page cannot
pass for a loose sheet. An RMA whose goods are expected ends with a
label to cut out and tape to the box: the RMA's number, large, and where
it goes. A purchase order and an RMA say who raised them, by name, job
title and work phone from the membership; not by email, which may be
personal, on a document that leaves the organization.

Deferred: **payment details** on invoices and pro formas, a free text
saying how to pay, which a pro forma sent for payment in advance needs.
Trigger: the first customer who pays from one.

## Amendment (October 2026) — two things the build settled

A packing
slip's times, the day it says the goods shipped and names its file by,
are read in UTC. The print page read them in the browser's time zone,
which a server does not have, and an organization keeps no time zone of
its own yet, so a shipment made in the evening in Vancouver prints the
next day's date. It follows the organization's time zone once there is
one (#41).

Automatic paper takes its country from what the document copied at
issue: an invoice's or a credit note's seller country. The other four
copy nothing, and take the registered address's country when they are
printed. An organization that moves keeps its issued invoices on the
paper they were issued on, as everything else they print stays as
issued; a size the organization chose still wins for every document.

## Amendment (October 2026) — order numbers by their series (ADR-073)

Sale and purchase orders follow their series' settings, their period the
day each is made in the organization's zone. A `/` in a number is written
`_` in a document's file name, and in the export's `documents/`.

## Amendment (October 2026) — prices on orders (ADR-080)

The purchase
order's and the pro forma invoice's PDFs need `orders.view_prices` beside
`orders.view`. The packing slip, which shows no prices, does not.

## Amendment (November 2026) — a refused document opened from a link (#526)

Print and Download PDF are plain links, as this ADR chose, so the browser
follows them itself. When a PDF route refuses, the browser shows the
API's JSON as it is: on 9 November 2026 an order's Print opened a tab
reading `{"statusCode": 409, …}`, its message inside in Chinese, about a
variation's missing English name (#526). A newcomer cannot read it, and
Download PDF, which opens in the same tab, leaves nothing to click. Every
document's PDF does the same, and so do the packing slip's two links.
ADR-092 (#532) took the issue's second half: the refusal says whether
the item's name or the variant's is missing, and the item's page shows
each variant's names.

The maintainer chose the page on 10 November 2026, in #526's comment,
and the decisions below the same day, as recommended.

### Requirements, as confirmed

The maintainer confirmed these on 10 November 2026, before drafting,
with the assumptions, what is not included and the questions' answers.
Each names its step in the brief, and the as-built marks each met,
changed or deferred. The 30-minute look at #521 rides here, so its two
are here too; #547's are in ADR-051's amendment, its own branch's first
commit.

| R | What | Done when | Step |
| --- | --- | --- | --- |
| R1 | The handoff records #554's merge, this branch, the translations' exception to every suggestion applied, Movements' and flows and states' inputs, and the playback's commit in that docs pull request | `scripts/verify.sh --docs` passes, and the handoff says each | 1 |
| R2 | ADR-089's as-built line for Linux WebKit, with its third run | Committed on its own | 2 |
| R3 | The working agreements: CI's own settings read before a push, and each issue's kind label | engineering.md and the triage skill say both | 3 |
| R4 | A PDF route that refuses a page visit answers with a readable page, not JSON | A server test with `Sec-Fetch-Mode: navigate`, and one with `Accept: text/html` alone, each gets the page | 7 |
| R5 | The app's own requests keep their JSON | The same request without those headers gets the JSON as before; the suite's check of every response passes | 7 |
| R6 | The page keeps the refusal's status, escapes the message, is never cached and holds no script | Tests: 409, 401 and 404; a code typed with `<b>`; `no-store`; no `<script>` | 7 |
| R7 | The page is in the app's language, from `?locale=` on the four links | A server test with `?locale=zh-Hans`; the client's test of the links; MC-2513 with a browser set to English | 7, 8 |
| R8 | The way back is the document's page in the app, reading Sign in after a 401 and returning there | Tests of each document's link; MC-2513's sign-in and return | 7 |
| R9 | The way out: the missing-name refusal carries `item_name_missing` with the item's id, and the page links to the item | A server test for the item's and a variant's missing name; the page's link tested | 6, 7 |
| R10 | Every one of the six PDF routes, and the packing slip's links | `PdfResponse` takes the document's page as a required argument, so the type check proves each route names one | 7, 8 |
| R11 | Download PDF, which opens in the same tab, shows the page with its way back | The browser test | 8 |
| R12 | The page has the status pages' shape, light and dark | Pictures in the pull request, light and dark, in English and in 中文 | 7, 11 |
| R13 | The docs: MC-2513, conventions.md's "Status pages", the invoices and products rules files | In the same commits; `scripts/check-docs.mjs` passes | 6, 7, 8 |
| R14 | #551's item 91: the joins name the organization | The plans at large before and after, in the step's summary; the tests stay green | 5 |
| R15 | Dependencies in range and 7 days old, the pins on Playwright 1.64.1 and jsdom 30.1.3 kept | Steps 4 and 10 say what they took | 4, 10 |
| R16 | #521: the container and the Mac measured before any fix is chosen | The look's report gives the limits, the peaks, and each failure against the samples | the look |
| R17 | #521: the fix its cause asks for | The full verify's Linux browsers pass 116 of 116, in Firefox and in WebKit, three runs in a row | 9 |

- **Assumptions:**
  - A1: the decisions below are the ones recommended on 10 November,
    and ADR-071's missed budget rides with #547.
  - A2: a page visit is `Sec-Fetch-Mode: navigate`, or an `Accept` that
    prefers HTML where that header is missing; every current browser,
    Safari from 16.4, sends the first.
  - A3: `CLIENT_URL` names the app on every environment, CI and the
    browser tests' servers included.
  - A4: #547's check before drafting is read from github.com's issue
    pages, and ADR-051's amendment is its branch's first commit.
  - A5: `foundation_perf_large` is current, seeded on 10 November and
    migrated through 0080; this branch adds no migration.
  - A6: the look runs on Playwright 1.64.1, and Docker Desktop's
    settings are the maintainer's to change.
- **Not included:**
  - N1: the issue dialog's link to the item, and N2: a way out for a
    document's other refusals, each deferred below.
  - N3: #161, what the document actions are called and what the packing
    slip prints, and #162, tagged PDFs.
  - N4: #551's other items, 65 among them.
  - N5: a Playwright raise before 12 November, and any on this branch
    unless the look finds the crash comes from resources.
  - N6: the Help guides: the page explains itself.
  - N7: #547's own riders, the category filter's counts that ignore the
    search and #546's icons.
- **The questions' answers:** Q1a, the bar in R17: one run cannot tell
  a fix from luck, after two runs failed and two passed. Q2a and Q3a are
  #547's, in ADR-051's amendment: the watch closes only when the search
  is back under 100 ms, and the missed budget is one invoice's PDF,
  timed at both scales.

Checked before drafting, for the areas invoices, documents, api, i18n
and ops, on 10 November 2026, from github.com's issue pages, since
GitHub's API had no requests left for the chat's container:

- **Fired, and taken here:**
  - #526, its first half, as its comment of 10 November decided.
  - #551's item 91 (`when-touched`): `line-names.ts`, which this branch
    changes, joins the variants, the products and both translations
    tables without naming the organization, as `stockRowsOf` does, the
    item's other half; one fix for both.
  - #521: the 30-minute look the handoff owed after #554's merge, run
    beside this branch. The fix its cause asks for rides here, as a
    commit of its own, when it is code.
- **Not fired, and left:**
  - #551's item 65, the missing-names rule copied on the client: its fix
    moves the rule into the item's detail, an API change in Items' area.
  - #161: what the document actions are called and what the packing
    slip prints, a design of its own; this changes only what a refusal
    shows.
  - #328: the new code reaches the API document through `ERROR_CODES`'
    own list, not a union, so its order cannot move.
  - #164, #264, #278, #282 and #487 (invoices and documents), #177, #314,
    #504 and #546 (api), #149, #150, #324, #486, #501, #512, #541, #543
    and #548 (i18n), and #226 and #253 (ops), each `when-touched`: their
    files are not changed. #278 waits for a new document, which this is
    not; the i18n ones go with the translations' batch.
  - #142, #162, #197, #263, #284, #320, #336, #446, #516, #522, #530 and
    #531: their files are not changed. #142 is the client's policy; the
    page is the API's, under helmet's.
  - This ADR's Deferred lines, but one below; those of ADR-054, ADR-068,
    ADR-081 and ADR-084; ADR-051's watch list; and Open decisions: none
    bears on a refusal met outside the app.
- **Found while checking:**
  - This ADR's Deferred "budgets for the PDF routes and the export"
    fired at the first `npm run perf` after its merge, in October, and
    was not taken: no scenario times a PDF. The branch for #547, which
    adds a scenario, takes it.
  - The missing-name refusal carried no code, so a page could not offer
    the item's names as the way out.
  - A plain link sends the browser's Accept-Language, not the app's: a
    person who chose 中文 in a browser set to English would read the
    page in English.
  - The API's helmet allows inline styles and no script, so the page is
    styled inline and needs none.

### Decision — a readable page for a refused document opened from a link

- When a PDF route refuses a page visit, `Sec-Fetch-Mode: navigate` or,
  from a browser that sends no such header, an `Accept` preferring
  `text/html`, it answers with a short page instead of the JSON: a
  title, the refusal's message, the way back, and the way out when the
  refusal carries one.
- The app's own requests keep the JSON, the API's one error shape, and
  Print and Download PDF stay plain links.
- The page keeps the refusal's status code; escapes the message, which
  can hold typed text such as a code; is sent `Cache-Control: no-store`;
  and carries no script. A failure (500) shows its reference, as the
  app's own crash page does.
- It has the shape of the app's status pages (conventions.md, "Status
  pages"): a short title as its one heading, one sentence of what to
  do, one or two links; in ADR-055's colours, light or dark as the
  browser is set. No new board on the canvas: it repeats a design
  already built.

### Decision — the page's language, from the link

- Print and Download PDF, and the packing slip's two links, carry
  `?locale=` with the app's language, as the export's link does
  (*Decision — the export*). The page reads it; without it, the
  request's Accept-Language; then English.
- The PDF itself does not change with it: a document prints in its
  customer's languages.

### Decision — the way back, and the way out

- **The way back** is the document's own page in the app: the order,
  for an order's, a pro forma's, a purchase order's and a packing slip's
  PDF; the invoice, the credit note or the return authorization, for
  theirs. After a 401 the same link reads Sign in: the app signs the
  person in and returns there, as it does for any page.
- **The way out** comes from the refusal's code. The missing-name
  refusal gains one, `item_name_missing`, with the item's id in its
  details, and the page links to the item's page, where its names are.
  Every other refusal offers the way back alone.

### Considered and not done

- **The PDF fetched by the app,** then shown from memory: the file would
  pass through the page, which this ADR chose against, and a large
  document would wait in the tab's memory.
- **A redirect to a page of the app:** the status code is lost, and a
  redirect after a refusal reads as success to the browser and to any
  tool that follows it.
- **The person's saved language:** there is none after a 401, nor for a
  person who never chose one.
- **The browser's Back:** Print opens a tab with no history.
- **A code for every refusal a PDF can meet:** more than #526 asks; codes
  are added one at a time, where a page has something to offer.

### Deferred — each with what brings it in

- **The issue dialog's link to the item,** from the same code. Trigger:
  a person who cannot find the item from that refusal in the app.
- **A way out for a document's other refusals,** an address or a tax
  number missing. Trigger: one met through a PDF link.

### Consequences

- The PDF routes' own exception filter, bound by `PdfResponse`, with the
  page beside it, and their server tests; the page's words in the three
  catalogues.
- `item_name_missing` in `error-codes.ts`, thrown by `line-names.ts`;
  `npm run api`.
- The client's four PDF links carry `?locale=`.
- A manual check walks the page; the invoices rules file and
  conventions.md's "Status pages" gain it.
- No migration, and no seed: nothing new is stored, and the manual check
  reaches the refusal by clearing a required name.
- Built on `fix-526-refused-document-page`, in this order: this
  amendment, with the handoff; ADR-089's as-built line; the working
  agreements; dependencies; #551's item 91; the code; the page; the
  links; #521's fix, as its look finds; dependencies again; the reviews;
  the as-built.

### As built

Built on 10 November 2026 on `fix-526-refused-document-page`, 16 commits
with this as-built, pull request #556.

- **The requirements,** each marked:

  | R | Now |
  | --- | --- |
  | R1 | Met, c737a3ab |
  | R2 | Met, 20661140 |
  | R3 | Met, 66a2abe1 |
  | R4 | Met: a page visit by `Sec-Fetch-Mode: navigate`, and by `Accept: text/html` alone, each gets the page |
  | R5 | Met: without those headers the JSON as before, its keys, code and details tested |
  | R6 | Met: 409, 401, 403 and 404 tested as pages, 500 in the unit spec; a code typed with `<b>` comes back escaped; `no-store`; no script |
  | R7 | Met: the server's, the client's and the browser's tests, and MC-2513 walked by hand with the browser in English |
  | R8 | Met: each of the six routes' way back tested; MC-2513 found that signing in landed on Home, which a11bffa6 fixed, `client/e2e/sign-in-return.spec.ts` proving the return |
  | R9 | Met: the code and the item's id for the item's and a variant's missing name; the page's link to the item |
  | R10 | Met: `PdfResponse`'s required argument, typed as the union of the four pages; the packing slip's links tested |
  | R11 | Met: the browser test, 5 of 5 in Chromium, Mac WebKit, Linux Firefox and Linux WebKit |
  | R12 | Met: the four pictures in #556's description, light and dark, in English and in 中文 |
  | R13 | Met: MC-2513, conventions.md's "Status pages" and "Supported browsers", the invoices and products rules files |
  | R14 | Met: the plans at large the same before and after (e1fc385f) |
  | R15 | Met: no update in range was 7 days old at either step, so no commit; the two pins kept |
  | R16 | Met: the look's report gives the limits and the peaks; no run failed, so no failure could be read against them |
  | R17 | Changed: the look found neither memory nor CPU behind Linux WebKit's rare miss, so nothing is tuned; a failed Linux run now keeps what Playwright left (f6edebc2, 6a53bf90) |

- **Measured against the brief's guesses,** minutes and the tokens the
  Agent tool counted:

  | Step | Model | Minutes (guess) | Tokens |
  | --- | --- | --- | --- |
  | 4 | sonnet | 3 (3), no commit | 54,627 |
  | 5 | opus | 16 (15) | 141,555 |
  | 6 | opus | 7 (15) | 100,649 |
  | 7 | opus | 24 (40) | 259,958 |
  | 8 | opus | 17 (30) | 200,075 |
  | 10 | sonnet | 1 (3), no commit | 56,038 |
  | 11, findings | opus | 9 (20) | not shown |
  | 11, fixes | opus | 30 (45) | not shown |

  Opus's steps took about two thirds of their guess, against a third on
  #554, whose steps were scripts.
- **Built differently:**
  - The links read `useLanguage().locale`, not `useIntl().locale`, which
    is the formatting tag with the browser's region (`en-US`), a tag the
    page does not accept.
  - A3 was false on the Mac: the browser tests' API read `CLIENT_URL` at
    port 5173 from the root `.env`. `client/playwright.config.ts` now
    gives it the test client's address, 5273, as CI already did.
  - The page sends its own Content-Security-Policy, stricter than
    helmet's: helmet's `upgrade-insecure-requests` sent WebKit's way back
    at `http://localhost` to https, where nothing answers.
  - A 5xx shows the page's own sentence and the reference, not the
    body's message, which is either "Internal server error" or a
    developer's sentence.
  - No `text/html` response in the API document: the suite's check of
    every response reads only successful ones.
  - `productId` was already in `ErrorDetails`, for `code_in_use`
    (ADR-092); only its comment was widened.
  - The browser test runs in every engine, so `EVERY_ENGINE` in
    `client/playwright.config.ts` names the specs WebKit and Firefox run,
    and the full verify's Linux browsers run by project, 117 tests each.
  - The six routes' way back is one named test, since `check-docs.mjs`
    cannot cite an `it.each` name (#306, item 40).
  - **Sign-in did not return to the page asked for,** found by MC-2513
    and older than this branch: signed out, any page of the app opened
    Home after signing in. Setting the session made `AuthOnly`, around
    the sign-in page, send the now signed-in visitor to `/`, and that
    move landed after the form's own move to the page remembered, so `/`
    won. `AuthOnly` now goes to the page remembered too (a11bffa6). Its
    browser test, in every engine, failed on `/` in Chromium and Mac
    WebKit before the fix, and passed 5 of 5 in each after, a list's
    search in the address kept too. MC-2101 already said it.
- **#551's item 91** (e1fc385f): `perf:plans` at large ran before, after,
  and before again; every plan and its buffers stayed the same, and
  `namedLines` and the stock count, read by hand with `EXPLAIN`, kept
  theirs. The stock list's own query and its cursor read join the same
  way: a new item of #551, from its comment of 10 November. Home's
  Expiring-soon count has two plans of nearly equal cost at large, 0.03
  ms or about 24 ms, and a fresh `ANALYZE` picks one; so before this too,
  and inside its budget: for ADR-051's watch, with #547.
- **#521's look,** 10 November, 18:36 to 18:56, on 1.64.1: the container
  peaked at 5.03 GiB of Docker's 7.65 GiB at 6 workers and 5.88 GiB at 9;
  the slowest screen waited 2.75 s against 5 s with the Mac about 98%
  busy; none of 696 tests failed. The miss, about 1 in 500, reads as a
  stall, so a longer wait would hide it; #521's comment of 10 November
  has the figures and the next look's plan. Firefox's crash keeps its
  trigger, a Playwright release after 1.65.0, 7 days old. The full
  verify on a11bffa6 then missed once in Linux WebKit, Credit notes
  still on the boot screen past 5 s, the first miss whose output a
  failed run now keeps (f6edebc2): a stall at boot, before the screen,
  recorded on #521. The Linux browsers' part, run again, passed 119 of
  119.
- **The reviews:** 11 findings, none must-fix; security sound; `/doctor
  prompt-audit` clean. Fixed: 1, the page's language through
  `recipientLocale`; 2, its kind worked out once; 3, tidy-ups, `verify.sh`'s
  `linux_browsers` among them; 8, the 403 page tested; and, from step 9,
  the copy only when Playwright left something. Filed: 4 and 5 as #555.
  Left: 6, the filter made per route outside Nest's injection, the test
  "JSON as before" holding its reply to the global filter's; 7, four
  small notes; 10, a hand-typed id that is not a UUID answering 400 in
  Nest's English, which no link of the app reaches.
- **Checks:** `scripts/verify.sh` in full on 6a53bf90: the server's 534
  unit and 1,311 end-to-end tests, the client's 1,195 unit and 486
  Playwright tests, and 117 in each of Linux Firefox and Linux WebKit;
  every browser by hand, run 42957074056, passed. On a11bffa6, the full
  verify again, its one Linux WebKit miss above and the part run again
  passing, 119 of 119; and every browser by hand once more, passed.
  MC-2513 walked by hand on 10 November, its four parts, its sign-in's
  return after the fix.
- **Found, for later:**
  - The missing-name message in Chinese reads 没有English名称, no space
    beside the Latin name (ADR-090's rule), from before this branch; and
    the page's signed-out title, 您已退出登录, reads oddly to someone who
    never signed in, where 您尚未登录 fits both. The page's French and
    Chinese words are drafts for the fluent review (MC-1405); all three
    go with the translations' batch.
  - `gh` cannot put pictures into a pull request; the maintainer drags
    them in from Finder (engineering.md, "The review step").

## Amendment (November 2026) — one invoice's PDF budgeted, and the export's own trigger (ADR-051)

*Deferred*'s "budgets for the PDF routes and the export" fired at the
first `npm run perf` after this ADR's merge, in October, and was missed
(the amendment for #526, "Found while checking"). ADR-051's amendment
for #547 takes the routes' part: one invoice's PDF is timed at both
scales, its budget set from its first median on GitHub's runners, and
it stands for the six routes, which share the renderer. The export stays
deferred, now until a person reports an export slow, or `render.md`'s
"Before real customers' data" times one at large first. The same
amendment corrects the as-built's N7: neither #533 nor #546 rides with
the branch for #547, since each changes the API.
