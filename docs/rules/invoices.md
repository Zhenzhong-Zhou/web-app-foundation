# Invoices

What the app allows, refuses and works out for invoices, credit notes and
the pro forma invoice, as the code does it today. Each rule links the ADR
that decided it, the test that proves it, the Help section where a person
meets it, and the manual check that walks it by hand. Why a rule is so is
in its ADR; how to do a task is in the
[Help guide](../../client/src/help/guides/en/invoices.md). How this file
is kept is in the [README](README.md).

## Drafting an invoice

- **An invoice bills one shipment: exactly what it carried, at the
  order's prices.** A draft is created from the shipment on its order; its
  lines and quantities come from what left, its prices from the order.
  [ADR-046](../adr/0046-invoicing.md#decision--one-invoice-per-shipment) ·
  [test](../../server/test/invoices.e2e-spec.ts) "bills exactly what the shipment carried, at the order price" ·
  [test](../../client/e2e/invoicing.spec.ts) "creates an invoice from a shipment on its order" ·
  [Help](../../client/src/help/guides/en/invoices.md#create-and-issue-an-invoice-issue) ·
  MC-701
- **A shipment has one invoice at most, until that one is deleted or
  voided.** A second is refused; delete the draft, or void the issued
  invoice, and the shipment can be invoiced again.
  [ADR-046](../adr/0046-invoicing.md#decision--one-invoice-per-shipment) ·
  [test](../../server/test/invoices.e2e-spec.ts) "refuses a second invoice for the same shipment" ·
  [Help](../../client/src/help/guides/en/invoices.md#if-something-is-refused-refused)
- **Samples are never invoiced.** They ship and trace like sales, but
  nobody pays for them.
  [ADR-046](../adr/0046-invoicing.md#decision--a-sale-is-priced-before-it-is-confirmed) ·
  [test](../../server/test/invoices.e2e-spec.ts) "refuses a sample" ·
  [Help](../../client/src/help/guides/en/invoices.md#if-something-is-refused-refused) ·
  MC-708
- **A voided shipment is not invoiced:** nothing of it left.
  [ADR-046](../adr/0046-invoicing.md#decision--void-shipment-is-refused-while-an-invoice-stands-not-while-the-order-is-closed) ·
  [test](../../server/test/invoices.e2e-spec.ts) "refuses a voided shipment"
- **Only priced goods, in one currency, are billed.** Confirming a sale
  already needs every line priced, in one currency; creating a draft
  checks again, and also refuses a shipment that is not a sale's, or that
  carried nothing.
  [ADR-046](../adr/0046-invoicing.md#decision--a-sale-is-priced-before-it-is-confirmed) ·
  no test
- **A draft's quantities never change; its prices, tax codes, due date
  and note do.** A different quantity is a different shipment. An empty
  due date or note clears it.
  [ADR-046](../adr/0046-invoicing.md#decision--draft-issued-voided) ·
  [test](../../server/test/invoices.e2e-spec.ts) "refuses a quantity change" ·
  [test](../../server/test/invoices.e2e-spec.ts) "changes the due date, note, a price and a tax code" ·
  [test](../../server/test/invoices.e2e-spec.ts) "clears the due date and note with empty values" ·
  [Help](../../client/src/help/guides/en/invoices.md#create-and-issue-an-invoice-issue)
- **A tax code chosen for the invoice goes on every line, and a line can
  take its own.** A retired code, or another organization's, is refused.
  [ADR-046](../adr/0046-invoicing.md#decision--tax-by-code-rounded-once-per-invoice) ·
  [test](../../server/test/invoices.e2e-spec.ts) "applies the chosen tax code to every line" ·
  [test](../../server/test/invoices.e2e-spec.ts) "refuses a retired tax code, and another organization’s" ·
  [Help](../../client/src/help/guides/en/invoices.md#create-and-issue-an-invoice-issue)
- **A draft's totals are what issuing will store.** They are the server's
  preview, by the same calculation.
  [ADR-046](../adr/0046-invoicing.md#decision--amounts-are-stored-at-issue-deliberately-unlike-an-order) ·
  [test](../../server/test/invoices.e2e-spec.ts) "previews on the draft exactly what issuing stores" ·
  MC-701
- **A draft is deleted, not voided.** Nobody outside has seen it and it
  has no number, so deleting it leaves no gap, and its shipment can be
  invoiced again.
  [ADR-046](../adr/0046-invoicing.md#decision--a-mistake-after-issue-is-reversed-by-a-credit-note) ·
  [test](../../server/test/invoices.e2e-spec.ts) "removes it, and the shipment can be invoiced again" ·
  [test](../../client/e2e/invoicing.spec.ts) "refuses to issue until every line is taxed, and deletes a draft" ·
  [Help](../../client/src/help/guides/en/invoices.md#create-and-issue-an-invoice-issue)

## Issuing an invoice

- **Issuing numbers the invoice, stores its amounts and copies the
  seller, the customer and where it shipped; from then on it never
  changes.** A mistake is voided with a credit note and invoiced again.
  [ADR-046](../adr/0046-invoicing.md#decision--draft-issued-voided) ·
  [test](../../server/test/invoices.e2e-spec.ts) "numbers the invoice, stores its amounts and copies both parties" ·
  [test](../../server/test/invoices.e2e-spec.ts) "freezes the invoice once issued" ·
  [Help](../../client/src/help/guides/en/invoices.md#create-and-issue-an-invoice-issue) ·
  MC-701
- **Issued means sent and owed: there is no Paid.** Payments are not
  recorded yet.
  [ADR-046](../adr/0046-invoicing.md#decision--draft-issued-voided) ·
  no test ·
  [Help](../../client/src/help/guides/en/invoices.md#words-youll-meet-words)
- **The person issuing chooses the invoice date, which starts at the
  organization's today.**
  [ADR-072](../adr/0072-each-organizations-time-zone.md#decision--today-is-the-organizations) ·
  [test](../../client/src/invoices/issue-invoice-dialog.test.tsx) "starts the invoice date at the organization's today (ADR-072)" ·
  [Help](../../client/src/help/guides/en/invoices.md#create-and-issue-an-invoice-issue)
- **The due date may not be before the invoice date.**
  [ADR-046](../adr/0046-invoicing.md#decision--snapshots-as-orders-and-movements-already-do) ·
  [test](../../server/test/invoices.e2e-spec.ts) "refuses a due date before the invoice date"
- **Every line needs a tax code.** "No tax" is a code too, Exempt, with
  no components; a blank is refused, and the draft stays as it was.
  [ADR-046](../adr/0046-invoicing.md#decision--tax-by-code-rounded-once-per-invoice) ·
  [test](../../server/test/invoices.e2e-spec.ts) "refuses a line with no tax code, and leaves the draft as it was" ·
  [test](../../client/e2e/invoicing.spec.ts) "refuses to issue until every line is taxed, and deletes a draft" ·
  [Help](../../client/src/help/guides/en/invoices.md#if-something-is-refused-refused)
- **A tax code retired since the draft was made is refused at issue.**
  Choose a code still in use.
  [ADR-046](../adr/0046-invoicing.md#decision--tax-by-code-rounded-once-per-invoice) ·
  no test
- **Issuing needs the organization's registered address.** The refusal
  links to Organization → Profile, for whoever may change it.
  [ADR-046](../adr/0046-invoicing.md#decision--snapshots-as-orders-and-movements-already-do) ·
  [ADR-061](../adr/0061-the-organization-page-in-tabs-and-a-name-that-can-change.md#decision--five-tabs-each-with-its-own-address) ·
  [test](../../server/test/invoices.e2e-spec.ts) "refuses without the organization’s registered address, with its code" ·
  [test](../../client/src/invoices/issue-invoice-dialog.test.tsx) "links a missing address to Organization → Profile for whoever may set it" ·
  [Help](../../client/src/help/guides/en/invoices.md#if-something-is-refused-refused)
- **Issuing needs a billing address for the customer:** their default
  one, or else their oldest active one. The refusal links to the customer,
  for whoever may change them.
  [ADR-046](../adr/0046-invoicing.md#decision--snapshots-as-orders-and-movements-already-do) ·
  [test](../../server/test/invoices.e2e-spec.ts) "refuses when the customer has no billing address, with its code" ·
  [test](../../client/src/invoices/issue-invoice-dialog.test.tsx) "links a customer with no billing address to the customer" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/invoices.md#if-something-is-refused-refused) ·
  MC-702
- **An invoice that charges tax needs the organization's tax number; one
  that charges none issues without it.** The refusal links to
  Organization → Profile.
  [ADR-046, amended](../adr/0046-invoicing.md#amendment-october-2026--an-invoice-that-charges-tax-needs-the-sellers-tax-number) ·
  [test](../../server/test/invoices.e2e-spec.ts) "refuses a taxed invoice without the organization’s tax number, with its code" ·
  [test](../../server/test/invoices.e2e-spec.ts) "issues an invoice that charges no tax without a tax number" ·
  [test](../../client/src/invoices/issue-invoice-dialog.test.tsx) "links a missing tax number to Organization → Profile" ·
  [Help](../../client/src/help/guides/en/invoices.md#if-something-is-refused-refused) ·
  MC-711
- **Every product on it must be named in each language the organization
  requires, if the invoice prints in that language.**
  [ADR-054](../adr/0054-languages.md#decision--a-products-name-and-description-may-be-kept-in-other-languages-which-are-required-is-the-organizations-setting) ·
  [test](../../server/test/languages.e2e-spec.ts) "refuses to issue in a required language until every product is named in it"
- **Tax is worked out per component on the lines that carry it, and
  rounded once for the invoice,** not line by line. A component two codes
  share, such as GST, is one tax line.
  [ADR-046](../adr/0046-invoicing.md#decision--tax-by-code-rounded-once-per-invoice) ·
  [test](../../server/test/invoices.e2e-spec.ts) "rounds tax once per invoice, not per line" ·
  [test](../../server/test/invoices.e2e-spec.ts) "sums a shared component across codes into one tax line" ·
  MC-703
- **Amounts round to the currency's smallest unit:** cents for dollars,
  whole yen, three places for Kuwaiti dinars.
  [ADR-046](../adr/0046-invoicing.md#decision--amounts-are-stored-at-issue-deliberately-unlike-an-order) ·
  [test](../../server/src/modules/invoices/invoice-amounts.spec.ts) "is 0 for a currency with no minor unit" ·
  [test](../../server/src/modules/invoices/invoice-amounts.spec.ts) "is 3 for a currency with three places" ·
  partly tested ·
  MC-703
- **An issued invoice keeps the tax it charged, whatever the code's rate
  becomes.** Each line's taxes are kept at the rates charged that day.
  [ADR-046](../adr/0046-invoicing.md#decision--tax-by-code-rounded-once-per-invoice) ·
  [test](../../server/test/invoices.e2e-spec.ts) "keeps an issued invoice’s tax when the code’s rate changes" ·
  [test](../../server/test/invoices.e2e-spec.ts) "records each line’s tax components at issue"

## Crediting part of an invoice

- **Only an issued invoice is credited, and crediting leaves it issued.**
  A draft owes nothing yet, and is edited instead; a voided invoice was
  credited in full already.
  [ADR-047](../adr/0047-return-authorizations-and-credit-notes-for-what-comes-back.md#decision--a-credit-note-credits-one-invoice) ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "credits two units at the invoice price, and leaves the invoice issued" ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "refuses a credit on a voided invoice" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/invoices.md#credit-part-of-an-invoice-credit) ·
  MC-707
- **Each line is credited by a quantity and a unit price. The price can
  be lowered, never raised, and the quantity is never more than the line
  billed.** A restocking fee is the units at a lower price; a price
  correction, every unit at the difference.
  [ADR-047](../adr/0047-return-authorizations-and-credit-notes-for-what-comes-back.md#decision--what-is-credited-is-decided-when-crediting) ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "credits at a lowered price: a restocking fee and a price correction" ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "refuses a price above the invoice’s, and a quantity above what was billed" ·
  [Help](../../client/src/help/guides/en/invoices.md#credit-part-of-an-invoice-credit)
- **Everything credited on a line, together, never comes to more than
  the line billed.** By value, so any mix of corrections, fees and returns
  is safe. The refusal says what is left.
  [ADR-047](../adr/0047-return-authorizations-and-credit-notes-for-what-comes-back.md#decision--capped-by-value-per-invoice-line) ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "caps every credit on a line at the value it billed" ·
  partly tested ·
  MC-707 · MC-710
- **Tax is credited at the invoice's rates, never today's, and never
  comes to more than the invoice charged,** per component, however many
  credits there are.
  [ADR-047](../adr/0047-return-authorizations-and-credit-notes-for-what-comes-back.md#decision--the-invoices-rates-never-todays) ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "never credits more tax than the invoice charged" ·
  MC-705 · MC-709
- **A credit names each line once, and only lines of its own invoice.**
  [ADR-047](../adr/0047-return-authorizations-and-credit-notes-for-what-comes-back.md#decision--a-credit-note-credits-one-invoice) ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "refuses a line twice, and a line from another invoice" ·
  partly tested
- **A credit note needs a reason, which the customer reads on it, and is
  dated no earlier than its invoice.**
  [ADR-047](../adr/0047-return-authorizations-and-credit-notes-for-what-comes-back.md#decision--credits-without-goods-need-no-rma) ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "refuses a date before the invoice, and a missing reason" ·
  [Help](../../client/src/help/guides/en/invoices.md#credit-part-of-an-invoice-credit)
- **What the preview shows is what is issued.** There is no draft credit
  note: the dialog shows the server's figures before anyone confirms, and
  the credit note stores exactly those.
  [ADR-047](../adr/0047-return-authorizations-and-credit-notes-for-what-comes-back.md#decision--previewed-then-issued-still-no-draft) ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "previews exactly what issuing stores" ·
  [test](../../client/e2e/invoicing.spec.ts) "credits part of an invoice, previewed before it is issued" ·
  MC-709
- **An invoice that will never be paid is credited in full, with the
  reason Uncollectable, and stays issued.** Credit everything —
  uncollectable fills in every line, and is offered only while nothing on
  the invoice is credited.
  [ADR-047](../adr/0047-return-authorizations-and-credit-notes-for-what-comes-back.md#decision--credits-without-goods-need-no-rma) ·
  no test ·
  [Help](../../client/src/help/guides/en/invoices.md#credit-part-of-an-invoice-credit)

## Crediting goods that came back

- **A credit for returned goods settles an RMA line, and never more than
  that line authorized,** less what earlier credits under it took.
  [ADR-047](../adr/0047-return-authorizations-and-credit-notes-for-what-comes-back.md#decision--what-is-credited-is-decided-when-crediting) ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "settles the RMA line, and shows it as credited" ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "refuses more than the RMA line authorized" ·
  [Help](../../client/src/help/guides/en/returns.md#credit-or-replace-resolve) ·
  MC-705 · MC-710
- **Only a credit line of an open RMA, for the same item on the same
  order, settles a credit.** A line resolved as replace or as neither, a
  closed or cancelled RMA, or another item is refused.
  [ADR-047](../adr/0047-return-authorizations-and-credit-notes-for-what-comes-back.md#decision--a-resolution-per-line) ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "refuses a line resolved as replace, a closed RMA, and another item" ·
  partly tested
- **Credit on, on an open RMA, offers the invoice the RMA names, or else
  each issued invoice of its sale.** The dialog opens with each credit
  line filled in with what came back, or what was authorized when no goods
  are expected; a line already partly credited is left for the person to
  fill in.
  [ADR-047](../adr/0047-return-authorizations-and-credit-notes-for-what-comes-back.md#decision--a-credit-note-credits-one-invoice) ·
  [test](../../client/e2e/invoicing.spec.ts) "credits from an RMA, prefilled with what it authorized" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/returns.md#credit-or-replace-resolve)

## Voiding an invoice

- **Voiding issues a credit note for the whole invoice, and both stay on
  record.** The credit note copies the invoice's lines, amounts and tax,
  so the two cancel to the cent. It needs a reason and is dated no earlier
  than the invoice.
  [ADR-046](../adr/0046-invoicing.md#decision--a-mistake-after-issue-is-reversed-by-a-credit-note) ·
  [test](../../server/test/invoices.e2e-spec.ts) "issues a credit note for the whole invoice" ·
  [test](../../server/test/invoices.e2e-spec.ts) "lists the credit note on the invoice" ·
  [test](../../client/e2e/invoicing.spec.ts) "taxes a draft, issues it, and voids it with a credit note" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/invoices.md#void-an-invoice-void) ·
  MC-704
- **Only an issued invoice with nothing credited yet is voided.** A
  draft is deleted instead, a voided one is not voided again, and once
  part of an invoice is credited, what remains is credited instead, so
  nothing is credited twice.
  [ADR-046](../adr/0046-invoicing.md#decision--a-mistake-after-issue-is-reversed-by-a-credit-note) ·
  [test](../../server/test/invoices.e2e-spec.ts) "refuses a draft, a second void, and a date before the invoice" ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "refuses a void once part of the invoice is credited" ·
  [test](../../client/e2e/invoicing.spec.ts) "credits part of an invoice, previewed before it is issued" ·
  [Help](../../client/src/help/guides/en/invoices.md#void-an-invoice-void)
- **Voiding frees the shipment,** to be invoiced again or voided itself.
  [ADR-046](../adr/0046-invoicing.md#decision--a-mistake-after-issue-is-reversed-by-a-credit-note) ·
  [test](../../server/test/invoices.e2e-spec.ts) "frees the shipment to be invoiced again" ·
  [Help](../../client/src/help/guides/en/invoices.md#void-an-invoice-void) ·
  MC-704
- **A shipment cannot be voided while an invoice stands on it.** Delete
  the draft, or void the issued invoice, first.
  [ADR-046](../adr/0046-invoicing.md#decision--void-shipment-is-refused-while-an-invoice-stands-not-while-the-order-is-closed) ·
  [test](../../server/test/invoices.e2e-spec.ts) "is refused while a draft stands, and allowed once it is deleted" ·
  [test](../../server/test/invoices.e2e-spec.ts) "is refused while an issued invoice stands, and allowed once it is voided"

## Numbering

How each series is set up, its prefix, digits and when it starts again,
is the organization's, on Organization → Documents.

- **An invoice takes its number when it is issued; a draft has none.**
  [ADR-046](../adr/0046-invoicing.md#decision--numbers-are-gapless-per-organization-assigned-at-issue) ·
  [test](../../server/test/invoices.e2e-spec.ts) "numbers the invoice, stores its amounts and copies both parties" ·
  [Help](../../client/src/help/guides/en/organization.md#numbering-numbering) ·
  MC-701
- **Invoices and credit notes each have their own series, with no gaps:**
  an issue, credit or void that is refused gives its number back.
  [ADR-046](../adr/0046-invoicing.md#decision--numbers-are-gapless-per-organization-assigned-at-issue) ·
  [ADR-073](../adr/0073-each-organizations-document-numbering.md#unchanged) ·
  [test](../../server/test/invoices.e2e-spec.ts) "numbers in sequence, per organization, with no gap for a refusal" ·
  [test](../../server/test/numbering.e2e-spec.ts) "refuses an invoice dated before the latest, and gives its number back" ·
  partly tested ·
  MC-701
- **A document's own date picks the period it is numbered in:** an
  invoice's date, a credit note's credit date. An invoice dated in an
  earlier year takes that year's next number, with that year's prefix.
  [ADR-073](../adr/0073-each-organizations-document-numbering.md#decision--resets-and-periods) ·
  [test](../../server/test/numbering.e2e-spec.ts) "keeps an earlier year’s prefix for a backdated invoice" ·
  [test](../../client/src/invoices/period-hint.test.tsx) "says a date in another year takes that year’s next number" ·
  MC-2707
- **With Keep invoices and credit notes in date order on, one dated
  before the latest in its series and period is refused.** It is off
  unless the organization turns it on. The refusal links to
  Organization → Documents, for whoever may change it.
  [ADR-073](../adr/0073-each-organizations-document-numbering.md#decision--date-order-a-switch-per-organization-off-by-default) ·
  [test](../../server/test/numbering.e2e-spec.ts) "refuses an invoice dated before the latest, and gives its number back" ·
  [test](../../server/test/numbering.e2e-spec.ts) "lets two issues at once give numbers in date order" ·
  [test](../../server/test/numbering.e2e-spec.ts) "lets a backdated invoice through when the switch is off" ·
  [test](../../client/src/invoices/issue-invoice-dialog.test.tsx) "links a refusal for date order to Organization → Documents (ADR-073)" ·
  MC-2708

## Printing and downloading

- **An invoice and a credit note print as a PDF, from what was stored
  when they were issued,** named by their number.
  [ADR-071](../adr/0071-documents-as-pdf-drawn-on-the-server.md#decision--one-design-per-document-the-pdf-drawn-on-the-server) ·
  [test](../../server/test/invoices.e2e-spec.ts) "draws the invoice as a PDF, to print or to download (ADR-071)" ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "draws the credit note as a PDF, named by its number (ADR-071)" ·
  [test](../../client/e2e/invoicing.spec.ts) "prints and downloads an invoice as its PDF (ADR-071)" ·
  MC-2501
- **A draft prints marked DRAFT; a voided invoice prints VOID, with why
  and the credit note that reversed it; a credit note names the invoice it
  credits.** None can pass for another.
  [ADR-046](../adr/0046-invoicing.md#decision--printable-like-the-packing-slip) ·
  [test](../../server/test/invoices.e2e-spec.ts) "draws a draft marked DRAFT, and another organization’s not at all" ·
  [test](../../server/test/invoices.e2e-spec.ts) "words a draft, a voided invoice and its credit note so none passes for another" ·
  MC-2501
- **An invoice prints in the customer's document languages as they stand
  the day it is issued, and its credit notes, a void's included, in the
  same.**
  [ADR-054](../adr/0054-languages.md#decision--a-document-prints-in-one-language-or-two-the-partners-choice-else-the-organizations-stored-on-the-document) ·
  [test](../../server/test/languages.e2e-spec.ts) "issues an invoice in the partner pair on the day it is issued, not the day it was drafted" ·
  [test](../../server/test/languages.e2e-spec.ts) "credits in the invoice languages, even after the partner changed" ·
  [test](../../server/test/languages.e2e-spec.ts) "voids in the invoice languages, even after the organization changed" ·
  [test](../../server/test/invoices.e2e-spec.ts) "labels a bilingual invoice in both languages, its figures once"
- **The paper is the organization's choice, or else follows the seller's
  country as the invoice copied it:** Letter in Canada and the United
  States, A4 elsewhere.
  [ADR-071](../adr/0071-documents-as-pdf-drawn-on-the-server.md#amendment-october-2026--two-things-the-build-settled) ·
  [test](../../server/test/invoices.e2e-spec.ts) "draws on the paper the organization chose, else its country’s (ADR-071)" ·
  MC-2504
- **Download everything holds every issued invoice and credit note as its
  PDF, and no draft.**
  [ADR-071](../adr/0071-documents-as-pdf-drawn-on-the-server.md#decision--the-export-118-amends-adr-070) ·
  [test](../../server/test/invoices.e2e-spec.ts) "packs every issued invoice and credit note into the export, as its PDF (ADR-071)" ·
  MC-2502

## Making a pro forma invoice

- **A pro forma is made from a sale that is neither a sample nor
  cancelled, with every item priced, in one currency.** The dialog says
  which items need a price, and offers no Print until they have one.
  [ADR-071](../adr/0071-documents-as-pdf-drawn-on-the-server.md#decision--the-pro-forma-invoice-amends-adr-046s-deferral) ·
  [test](../../server/test/documents.e2e-spec.ts) "refuses a purchase, a sample, an unpriced or cancelled sale, and a tax code it cannot use" ·
  [test](../../client/src/orders/pro-forma-dialog.test.tsx) "says which items need a price first, and offers no Print" ·
  [test](../../client/src/orders/pro-forma-dialog.test.tsx) "says when the items are in two currencies, and offers no Print" ·
  MC-2510
- **It is valued as the invoice would be:** every item at the quantity
  ordered, taxed by the one code chosen, or by none.
  [ADR-071](../adr/0071-documents-as-pdf-drawn-on-the-server.md#decision--the-pro-forma-invoice-amends-adr-046s-deferral) ·
  [test](../../server/test/documents.e2e-spec.ts) "values a sale as its invoice would, and records each one made" ·
  MC-2510
- **It says Not a tax invoice, and nothing is owed on it.** It is stored
  nowhere and has no number but its order's, so making it again shows the
  order as it is then. Each one made is in the order's History, with its
  total.
  [ADR-071](../adr/0071-documents-as-pdf-drawn-on-the-server.md#decision--the-pro-forma-invoice-amends-adr-046s-deferral) ·
  [test](../../server/test/documents.e2e-spec.ts) "values a sale as its invoice would, and records each one made" ·
  MC-2510
- **It needs the order's prices:** whoever may not see prices on orders
  cannot make one.
  [ADR-071, amended](../adr/0071-documents-as-pdf-drawn-on-the-server.md#amendment-october-2026--prices-on-orders-adr-080) ·
  [test](../../server/test/roles.e2e-spec.ts) "reads an order without its prices, totals or tax, and refuses its priced documents" ·
  [Help](../../client/src/help/guides/en/orders.md#orders)

## What a sale shows of its invoices

- **A sale's money summary comes from its issued invoices and credit
  notes.** Invoiced and credited include tax; not yet invoiced is before
  tax, the value of what is ordered, not closed short and on no issued
  invoice.
  [ADR-055](../adr/0055-the-look.md#decision--quantities-and-money) ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "sums what was invoiced and credited, and what is still to invoice" ·
  MC-1522 · MC-1523
- **A voided invoice nets to nothing,** and what it billed is not yet
  invoiced again.
  [ADR-055](../adr/0055-the-look.md#decision--quantities-and-money) ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "nets a voided invoice to nothing"
- **Goods returned with no RMA earn no credit by themselves:** the sale
  counts them as not settled until an RMA decides.
  [ADR-047](../adr/0047-return-authorizations-and-credit-notes-for-what-comes-back.md#decision--a-return-may-name-an-rma-and-is-held-to-it) ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "counts a return with no RMA as not settled, by line"
- **A sample has no money summary,** since it is never invoiced.
  [ADR-055](../adr/0055-the-look.md#decision--quantities-and-money) ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "has no money summary on a sample, which is never invoiced"

## Who may do what, and what History keeps

- **Drafting, changing and deleting a draft each take their own
  permission; issuing, voiding and crediting share one, Issue, void or
  credit an invoice.** The Owner holds them all; an Admin drafts, changes
  and deletes drafts; a Viewer reads. Another organization's invoices are
  never found.
  [ADR-046](../adr/0046-invoicing.md#decision--permissions-follow-the-people) ·
  [ADR-047](../adr/0047-return-authorizations-and-credit-notes-for-what-comes-back.md#decision--permissions-follow-the-people) ·
  [test](../../server/test/invoices.e2e-spec.ts) "lets Admin draft and a Viewer only read" ·
  [test](../../server/test/invoices.e2e-spec.ts) "lets only the Owner issue" ·
  [test](../../server/test/invoices.e2e-spec.ts) "lets only the Owner void" ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "lets only the Owner credit" ·
  [test](../../server/test/invoices.e2e-spec.ts) "is not found by any write, and is left as it was" ·
  [Help](../../client/src/help/guides/en/invoices.md#create-and-issue-an-invoice-issue)
- **History keeps who issued, voided or credited an invoice, and when:
  an issue with its invoice date, a void with its credit note's number, a
  credit with its invoice and total, and a draft's old price beside the
  new. Never a reason or a note,** which stay on the documents. A credit's
  preview writes nothing.
  [ADR-018](../adr/0018-audit-log.md#decision--never-record-the-request-body) ·
  [test](../../server/test/invoices.e2e-spec.ts) "records who issued it and on what date" ·
  [test](../../server/test/invoices.e2e-spec.ts) "records the credit note’s number, not the reason" ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "records the credit note against its invoice, and writes nothing on preview" ·
  [test](../../server/test/invoices.e2e-spec.ts) "records a price change with what it replaced" ·
  MC-1101
