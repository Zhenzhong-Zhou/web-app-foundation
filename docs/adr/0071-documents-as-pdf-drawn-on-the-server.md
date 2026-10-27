---
status: accepted
date: 2026-10-16
amends: [ADR-046, ADR-054, ADR-055, ADR-070]
amended-by: [ADR-072, ADR-073, ADR-080]
---

# ADR-071 — Documents as PDF, drawn on the server (amends ADR-046, ADR-054, ADR-055 and ADR-070)

**Context.** Three documents print today: the packing slip (ADR-041),
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

**Decision — one design per document: the PDF, drawn on the server.**
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

**Decision — six documents.** The packing slip, the invoice and the credit
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

**Decision — the pro forma invoice (amends ADR-046's deferral).** Made on
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

**Decision — the words, the rules and the paper.** The words a document
prints move to the server's catalogues in all three languages, under the
ids they have now, and the server applies ADR-054's rules: each label in
the first language, then the second, the same size and weight; dates and
money once, in the first; data as typed; a product's name by its own
rule. The logo is ADR-060's: the organization's own when the PDF is made,
if it prints logos. A page left the paper size to the printer, and a PDF
has to choose, so each organization gets one, Letter or A4, set where its
branding is and defaulting from its registered address: Letter in Canada
and the United States, A4 elsewhere.

**Decision — fonts in the repository.** Noto Sans, for English and
French, and Noto Sans SC, for Simplified Chinese, in Regular and Bold,
under the SIL Open Font License, are committed to `server/assets/fonts`
with their licence: about 20 MB. They load once, when the server starts,
and each PDF embeds only the characters it uses. Nothing is fetched at
build or at run time, so documents render offline, on any host, and in
mainland China.

**Decision — the export (#118, amends ADR-070).** The ZIP adds a
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

**Decision — performance.** Drawing a PDF is work for the processor, not
the database. The export draws its documents one at a time as it streams,
so an organization with thousands of invoices takes longer but never holds
them all in memory. Each PDF route and the export are budgeted as every
route is under ADR-051, the figures set from their first measurement on
the volume seed, with a probe for one invoice and one for the export.

**Rejected.**

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

**Deferred.**

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

**Consequences.**

- pdfmake is a new dependency, with pdfkit and fontkit under it, its
  peers resolving without an override (ADR-019).
- The server grows by its fonts, about 20 MB.
- The client loses `PrintSheet` and three print pages; the printed words
  leave its catalogues for the server's.
- A migration adds each organization's paper size.
- The manual checks for printing are rewritten for the PDFs, and gain the
  three new documents and the export's.

**Amendment (October 2026) — orders get numbers of their own.** This ADR
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

**Amendment (October 2026) — where goods go, and what every page says.**
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

**Amendment (October 2026) — two things the build settled.** A packing
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

**Amendment (October 2026) — order numbers by their series (ADR-073).**
Sale and purchase orders follow their series' settings, their period the
day each is made in the organization's zone. A `/` in a number is written
`_` in a document's file name, and in the export's `documents/`.

**Amendment (October 2026) — prices on orders (ADR-080).** The purchase
order's and the pro forma invoice's PDFs need `orders.view_prices` beside
`orders.view`. The packing slip, which shows no prices, does not.
