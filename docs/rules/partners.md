# Partners

What the app allows, refuses and works out for partners, the customers and
suppliers an organization trades with, with their addresses, contacts,
price lists and document languages, as the code does it today. Each rule
links the ADR that decided it, the test that proves it, the Help section
where a person meets it, and the manual check that walks it by hand. Why a
rule is so is in its ADR; how to do a task is in the
[Help guide](../../client/src/help/guides/en/partners.md); how a search
matches, in full, is in the search area's rules file. How this file is
kept is in the [README](README.md).

## Adding a partner

- **A partner is anyone the organization buys from or sells to: there is
  no customer or supplier to choose.** One list holds both, and what a
  partner is follows from the orders raised with them.
  [ADR-026](../adr/0026-customers-and-suppliers-are-one-table.md#decision--one-partners-table-and-direction-lives-on-the-order) ·
  [test](../../server/test/partners.e2e-spec.ts) "creates a partner with no kind attached to it" ·
  [test](../../client/e2e/partners.spec.ts) "adds a partner and lists it" ·
  [Help](../../client/src/help/guides/en/partners.md#add-a-partner-add)
- **A partner needs a name, and names need not be unique:** two branches
  of one company are two partners. A blank name is refused.
  [ADR-026](../adr/0026-customers-and-suppliers-are-one-table.md#decision--one-partners-table-and-direction-lives-on-the-order) ·
  [test](../../server/test/partners.e2e-spec.ts) "allows two partners to share a name" ·
  [test](../../server/test/partners.e2e-spec.ts) "rejects a blank name" ·
  [Help](../../client/src/help/guides/en/partners.md#add-a-partner-add)
- **A code is optional, and unique within the organization.** A code
  another partner already uses is refused, the refusal naming it, whether
  on adding or on editing. Any number of partners may have no code, and
  another organization may use the same one.
  [ADR-026](../adr/0026-customers-and-suppliers-are-one-table.md#decision--one-partners-table-and-direction-lives-on-the-order) ·
  [test](../../server/test/partners.e2e-spec.ts) "rejects a duplicate code and names it" ·
  [test](../../server/test/partners.e2e-spec.ts) "refuses a code already used by another partner" ·
  [test](../../server/test/partners.e2e-spec.ts) "creates a partner with no code at all" ·
  [test](../../server/test/partners.e2e-spec.ts) "allows the same code in another organization" ·
  [test](../../client/e2e/partners.spec.ts) "refuses a duplicate code" ·
  [Help](../../client/src/help/guides/en/partners.md#if-something-is-refused-refused)
- **A tax ID is stored as typed:** nothing checks its form, for any
  country.
  [ADR-028](../adr/0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md#consequence) ·
  no test ·
  [Help](../../client/src/help/guides/en/partners.md#add-a-partner-add)

## Changing or retiring a partner

- **Edit changes a partner's name, code, tax ID and notes, but an emptied
  Code, Tax ID or Notes is left as it was.** Once given, each can be
  changed on the screen, not cleared.
  [ADR-026](../adr/0026-customers-and-suppliers-are-one-table.md#decision--one-partners-table-and-direction-lives-on-the-order) ·
  no test
- **A partner is retired, never deleted.** Turning off In use keeps them in
  Partners, marked Retired, and readable on every record that names them;
  turning it on again brings them back. Nobody may delete a partner.
  [ADR-026](../adr/0026-customers-and-suppliers-are-one-table.md#decision--one-partners-table-and-direction-lives-on-the-order) ·
  [ADR-028](../adr/0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md#consequence) ·
  [test](../../server/test/partners.e2e-spec.ts) "retires without deleting" ·
  [test](../../server/test/partners.e2e-spec.ts) "includes retired partners" ·
  [test](../../client/e2e/partners.spec.ts) "keeps a retired partner in the list" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/partners.md#retire-a-partner-retire) ·
  MC-1547
- **A retired partner takes no new order.** Raising one, duplicating one,
  or a replacement from an RMA is refused, naming them. New order's
  Partner and a sample's Given to do not offer them; Plan run's Contract
  manufacturer still does (#304).
  [ADR-026](../adr/0026-customers-and-suppliers-are-one-table.md#decision--one-partners-table-and-direction-lives-on-the-order) ·
  [test](../../server/test/orders.e2e-spec.ts) "refuses a retired partner" ·
  [test](../../server/test/orders.e2e-spec.ts) "refuses to duplicate onto a retired partner" ·
  [test](../../client/src/components/partner-picker.test.tsx) "asks once typing stops, and lists the answer in its order, within what it was given" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/partners.md#retire-a-partner-retire) ·
  MC-3904

## Addresses

- **A partner may have any number of addresses, each marked for
  invoices, for deliveries, or both.** An address needs a street line and
  a two-letter country, stored in capitals ("ca" becomes CA); nothing
  checks a postal code, a city or a region.
  [ADR-028](../adr/0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md#consequence) ·
  [test](../../server/test/partners.e2e-spec.ts) "stores the country uppercased" ·
  [test](../../client/e2e/partner-detail.spec.ts) "adds an address and shows it on the partner" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/partners.md#addresses-and-contacts-addresses)
- **One address at most is the default; making another the default takes
  it from the first.** A partner may also have none.
  [ADR-028](../adr/0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md#consequence) ·
  [test](../../server/test/partners.e2e-spec.ts) "demotes the previous default when a second one is set" ·
  [test](../../client/e2e/partner-detail.spec.ts) "moves the default when a second address claims it" ·
  [Help](../../client/src/help/guides/en/partners.md#words-youll-meet-words) ·
  MC-206
- **The default address cannot be retired: make another address the
  default first.** The refusal shows at the top of the partner's page.
  [ADR-028](../adr/0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md#consequence) ·
  [test](../../server/test/partners.e2e-spec.ts) "refuses to retire the default while it is the only one" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/partners.md#if-something-is-refused-refused)
- **A retired address stays on the partner's page, greyed and marked
  Retired, and is no longer the default.** The page offers no Edit for it,
  and nothing brings it back.
  [ADR-028](../adr/0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md#consequence) ·
  [test](../../server/test/partners.e2e-spec.ts) "retires rather than deletes, and clears the default flag" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/partners.md#retire-a-partner-retire)
- **An invoice bills the customer's default address when invoices go
  there, else their oldest address in use where invoices go.** With none,
  issuing is refused, with a link to the customer for whoever may change
  them.
  [ADR-046](../adr/0046-invoicing.md#decision--snapshots-as-orders-and-movements-already-do) ·
  [test](../../server/test/invoices.e2e-spec.ts) "refuses when the customer has no billing address, with its code" ·
  [test](../../client/src/invoices/issue-invoice-dialog.test.tsx) "links a customer with no billing address to the customer" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/partners.md#addresses-and-contacts-addresses) ·
  MC-702
- **Deliveries go here changes nothing yet:** no order takes a ship-to
  address from the partner, so no packing slip or invoice prints one.
  [ADR-028](../adr/0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md#consequence) ·
  no test

## Contacts

- **A contact needs a name, and an email or a phone; the refusal says so
  in the reader's language.** An email must look like one; a phone is
  free text.
  [ADR-028](../adr/0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md#decision) ·
  [test](../../server/test/partners.e2e-spec.ts) "requires an email or a phone, and says so in the reader’s language" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/partners.md#addresses-and-contacts-addresses) ·
  MC-R51
- **One contact at most is the Main contact; marking another takes it from
  the first.** Retiring the main contact is allowed and leaves none, since
  nothing picks a contact by itself.
  [ADR-028](../adr/0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md#consequence) ·
  [test](../../server/test/partners.e2e-spec.ts) "demotes the previous primary when a second one is set" ·
  [test](../../server/test/partners.e2e-spec.ts) "retires rather than deletes" ·
  [Help](../../client/src/help/guides/en/partners.md#addresses-and-contacts-addresses) ·
  MC-206
- **The same person may be a contact at two partners.**
  [ADR-028](../adr/0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md#decision) ·
  [test](../../server/test/partners.e2e-spec.ts) "allows one person at two partners"
- **A retired contact stays on the partner's page, greyed and marked
  Retired, without Edit or Retire.** Nothing on the screen brings them
  back.
  [ADR-028](../adr/0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md#consequence) ·
  [test](../../server/test/partners.e2e-spec.ts) "retires rather than deletes" ·
  [test](../../client/e2e/partner-detail.spec.ts) "keeps a retired contact on the page" ·
  [Help](../../client/src/help/guides/en/partners.md#retire-a-partner-retire)

## Finding a partner

- **Partners' Search finds a partner by part of its name, its code or its
  tax ID, the closest first, retired partners included.** A name matches
  with accents, case and punctuation aside, and a Chinese name by its
  characters, its pinyin or its initials, one character being enough.
  The search is kept in the page's address, so Show all in Partners from
  the top bar opens Partners narrowed; Retired then narrows what was
  found, and counts within it. A search that finds nothing says so.
  [ADR-056, amended](../adr/0056-search.md#decision--products-partners-and-the-item-pickers-searched-on-the-server) ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a partner by part of its name, its code or its tax ID" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "ignores accents and punctuation in a name" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a Chinese name by characters, pinyin, initials or one character" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "ranks exact, then at the start, then anywhere, then by name" ·
  [test](../../client/src/partners/partners-page.test.tsx) "asks with the address’s search, and lists the answer in its order" ·
  [test](../../client/src/partners/partners-page.test.tsx) "asks again once typing stops, and drops an answer that comes after a newer one" ·
  [test](../../client/src/partners/partners-page.test.tsx) "says nothing matches for an empty answer to a search" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/partners.md#partners) ·
  MC-3902 · MC-1547
- **Every partner picker finds a partner as Partners does, from the first
  character typed:** New order's Partner, a sample's Given to, and Plan
  run's Contract manufacturer. Before anything is typed it lists the
  partners the form offers, and what a search finds stays within them; it
  says Loading… while it asks, and No matching partners only once the
  answer comes. Plan run's We make it ourselves stays the first row.
  [ADR-056, amended](../adr/0056-search.md#decision--products-partners-and-the-item-pickers-searched-on-the-server) ·
  [test](../../client/src/components/partner-picker.test.tsx) "lists what it is given before anything is typed, and asks nothing" ·
  [test](../../client/src/components/partner-picker.test.tsx) "asks once typing stops, and lists the answer in its order, within what it was given" ·
  [test](../../client/src/components/partner-picker.test.tsx) "says it is loading while it asks, and that nothing matches only from an answer" ·
  [test](../../client/src/components/partner-picker.test.tsx) "names the empty choice in words, as the value and as the first row" ·
  [test](../../client/src/orders/create-order-page.test.tsx) "finds a partner by its pinyin" ·
  [test](../../client/src/orders/create-order-page.test.tsx) "finds a partner by its name without accents" ·
  [Help](../../client/src/help/guides/en/orders.md#raise-an-order-raise) ·
  MC-3904

## A partner's price lists and document languages

- **A partner may name one list for sales to them and one for purchases
  from them; a line added without a price takes its price from it.** Each
  must be the organization's own, of the right direction and in use. A
  sale to a partner with no list, or a retired one, takes the
  organization's default list.
  [ADR-049](../adr/0049-price-lists.md#decision--which-list-applies) ·
  [test](../../server/test/price-lists.e2e-spec.ts) "refuses a list of the wrong direction, or another organization’s" ·
  [test](../../server/test/price-lists.e2e-spec.ts) "refuses a retired list, and clears one with null" ·
  [test](../../server/test/price-lists.e2e-spec.ts) "falls back to the organization default, and past a retired list" ·
  [test](../../client/e2e/price-lists.spec.ts) "prices an added item from the customer’s list" ·
  [Help](../../client/src/help/guides/en/price-lists.md#give-a-partner-a-list-partner) ·
  MC-601
- **A partner's documents print in its own pair of languages, or else
  wholly in the organization's: never half of each.** A second language
  needs a first, and never the same one; the screen clears the second
  with the first. A change reaches the next packing slip or invoice and
  none already made, and a credit note keeps its invoice's.
  [ADR-054](../adr/0054-languages.md#decision--a-document-prints-in-one-language-or-two-the-partners-choice-else-the-organizations-stored-on-the-document) ·
  [test](../../server/test/languages.e2e-spec.ts) "keeps a partner pair whole, and clears it as a whole" ·
  [test](../../server/test/languages.e2e-spec.ts) "keeps a partner pair whole and never the same language twice" ·
  [test](../../server/test/languages.e2e-spec.ts) "prints a packing slip in the partner pair, else the organization pair, fixed as the box leaves" ·
  [test](../../server/test/languages.e2e-spec.ts) "issues an invoice in the partner pair on the day it is issued, not the day it was drafted" ·
  [test](../../server/test/languages.e2e-spec.ts) "credits in the invoice languages, even after the partner changed" ·
  [test](../../client/src/components/document-language-fields.test.tsx) "shows the default and Nothing else when neither is chosen" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/partners.md#prices-and-document-languages-settings) ·
  MC-1409

## Exporting partners

- **Export writes the partners the list shows, each with one billing
  address: the default if invoices go there, else the oldest in use where
  invoices go.** It follows the list's search, and holds only the retired
  partners while Retired is pressed; History records each export with its
  Retired filter, never what was typed.
  [ADR-057](../adr/0057-lists-by-date-range-sorted-where-it-helps-exported-as-csv.md#decision--csv-export-of-what-the-list-shows) ·
  [test](../../server/test/exports.e2e-spec.ts) "writes partners with their billing address on one line" ·
  [test](../../server/test/exports.e2e-spec.ts) "writes the partners the list shows: its search and Retired" ·
  [test](../../client/src/partners/partners-page.test.tsx) "exports what the list shows, its search and Retired" ·
  partly tested ·
  MC-1558

## Who may do what, and what History keeps

- **Seeing partners takes See customers and suppliers; adding one, Add a
  customer or supplier; and everything else, Edit or retire a customer or
  supplier,** which covers retiring, addresses, contacts, price lists and
  document languages. The Owner and an Admin hold all three and a Viewer
  sees; of the templates, Sales holds all three and Finance sees; and
  anyone holds what their roles grant. Controls a person may not use are
  hidden, or greyed as Document languages is, and Price lists shows only
  to whoever may see price lists.
  Another organization's partners are never found.
  [ADR-026](../adr/0026-customers-and-suppliers-are-one-table.md#consequence) ·
  [ADR-080](../adr/0080-job-roles.md#decision--roles-an-organization-makes-from-a-template-or-a-copy) ·
  [ADR-003](../adr/0003-multi-tenancy.md#decision) ·
  [test](../../server/test/partners.e2e-spec.ts) "is readable by a Viewer, which holds partners.view" ·
  [test](../../server/test/partners.e2e-spec.ts) "refuses a Viewer, which lacks partners.create" ·
  [test](../../server/test/partners.e2e-spec.ts) "refuses a Viewer, which lacks partners.update" ·
  [test](../../server/test/roles.e2e-spec.ts) "adds roles together, and takes one away" ·
  [test](../../server/test/partners.e2e-spec.ts) "does not show another organization partners" ·
  [test](../../server/test/partners.e2e-spec.ts) "refuses a partner in another organization" ·
  [test](../../server/test/partners.e2e-spec.ts) "does not reach a partner in another organization" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "never finds another organization's products, items or partners" ·
  [test](../../client/e2e/partners.spec.ts) "hides the create and edit controls from a viewer" ·
  [test](../../client/e2e/partner-detail.spec.ts) "hides every write control from a viewer" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/partners.md#prices-and-document-languages-settings)
- **An address or a contact is changed only through its own partner:**
  reached through another partner of the same organization, it is not
  found.
  [ADR-028](../adr/0028-addresses-and-contacts-are-shared-tables-with-an-exclusive-arc.md#decision) ·
  [test](../../server/test/partners.e2e-spec.ts) "refuses an address reached through the wrong partner" ·
  partly tested
- **History keeps who added or changed a partner, and who added, changed
  or retired one of its addresses or contacts, and when, all on the
  partner's own History; and each export of the list, with how many rows.
  Never what was typed.**
  [ADR-018](../adr/0018-audit-log.md#decision--never-record-the-request-body) ·
  [test](../../server/test/audit-coverage.e2e-spec.ts) "audits every write route, or says why not" ·
  partly tested
