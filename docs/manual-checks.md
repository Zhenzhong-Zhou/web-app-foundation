# Manual checks

What a person checks by hand before a release, after a feature lands, and in
the end-of-milestone walkthrough. The automated suites prove the rules hold;
this list proves the app makes sense to someone using it, which no test can.

Each check has an id (`MC-…`) so a commit, an issue or a release note can
point at one. Tick them in a copy of this file or in the release issue, not
here: this file is the list, not a record of one run.

## Keeping it current

The rule, also in `docs/conventions.md`: **a commit that changes what a
person sees or a rule they work under updates this file in the same
commit.**

- **A new feature** adds its checks to the section it belongs in, or a new
  section.
- **A fixed bug that a person could have noticed** adds a check under
  *Regressions* with the issue number, so the walkthrough looks at it again.
- **A changed rule or policy** (a refusal, a limit, a permission, a default)
  rewrites its check. Delete what no longer holds rather than marking it
  old; git keeps the history.
- **A known limitation** goes in the release notes, not here. Check what the
  app should do, not what it can't yet.

## Before you start

From `server/`, on a fresh dev database:

```bash
npm run migrate && npm run seed && npm run seed:demo
```

Then `npm run start:dev` in `server/` and `npm run dev` in `client/`. Sign in
as the demo Owner the seed prints.

The demo leaves known numbers to check against:

- **BF-2609**, the ingredient lot, valued at **1900.00 CAD**.
- **FOC-2609-01**, the batch made from it, costed at **1292.00** over **980**
  bottles: **1.318367** each.
- **SO-DEMO-2**, priced from the **Wholesale CAD** list, the organization's
  default.
- **SO-DEMO-1**, with an RMA received and credited.
- A voided shipment.
- **PO-DEMO-2**, bought in USD at a rate of **1.37**.

Around those, for the screens rather than the figures: a dozen more items,
lot **ELD-24A** expiring in 20 days and **PRB-0731** in 60 (red and amber
expiry chips), **THE-0915** waiting for a cost (PO-DEMO-5), **PO-DEMO-4**
partly received and mixing kilograms with bottles, run **CALM-RUN-01**
released and **CALM-RUN-02** planned, **SO-DEMO-3** a draft, **SO-DEMO-4**
cancelled, **SO-DEMO-5** shipped with its invoice in draft and a closed
RMA, **SO-DEMO-6** with a voided invoice and its full credit note,
**PO-DEMO-6** with a line closed short, a discontinued product and a
retired partner. Every state the redesigned screens draw (ADR-055) has
one example among them.

Around those, a team of nine, whose addresses the seed prints; each signs in
with the demo password. **Anika Sharma** is a second Owner; **Daniel
Okafor**, **李静**, **Marc-André Gagnon**, **王建国** and **Sarah Chen** are
Admins, Sarah promoted from Viewer; **Chloé Tremblay**, **Tom Becker** and
**Fatima Haddad** are Viewers, and Fatima has never signed in. Each record
above has its creation in History, by the Owner, and what the team did is in
History as theirs: the **Richmond warehouse**, with zones, an aisle,
shelves, a fridge and a **Quarantine**; **MAGCAP** in three sizes;
**PO-DEMO-7** bought in euros, and **PO-DEMO-9** three days late, priced
from **Lakeshore Packaging 2026**; lot **VC-0301** expired and quarantined;
**SLEEP-BLEND-01** issued from hand-picked lot **CHA-0522**, and
**SLEEP-60-01** made in two outputs, 970 of 1000; a draft second version of
the Calm recipe; **CALM-RUN-03** cancelled; a licence expiring in 6 days and
one lapsed; **SO-DEMO-7** priced from **Co-op members CAD**, with an RMA to
replace two bottles; **SO-DEMO-8** invoiced in US dollars; and **Retail CAD
2025** retired. Exchange rates, price lists and issuing invoices are the
Owner's, as the roles allow.

Keep a second browser profile, or a private window, for one of the team or
a second organization.

---

## 1. Accounts and access

- **MC-101** Register a new account and organization. The verification email
  arrives (Mailpit locally), and its link verifies the account.
- **MC-102** Sign out, sign in. A wrong password is refused with the same
  message as an unknown email: the form never says which one was wrong.
- **MC-103** Forgot password: the email arrives, the link sets a new password,
  and the old one stops working.
- **MC-104** Account → Devices lists this session. Signing out another
  session from here ends it in the other browser on its next request.
- **MC-105** Change password from Account. Other sessions end.
- **MC-106** Members: invite a second user as a viewer. The viewer can see
  stock and orders, but has no buttons for what it may not do, and a direct
  URL to a settings page shows "not allowed" rather than an empty page.
- **MC-107** The last Owner cannot be removed or demoted; the app says why.
- **MC-109** Invite an Admin, accept in a private window, and sign in as
  them. They can manage members and invite, but changing or removing the
  Owner is refused.
- **MC-108** A second organization, in the second profile, sees none of the
  first's products, partners, orders, lots or audit entries, even by pasting
  a URL from the first.

## 2. Catalogue and places

- **MC-201** Products: create a good, a material and packaging. A SKU must be
  unique; a duplicate is refused at the field, not after saving.
- **MC-202** A variant's SKU can be edited inline; leaving the field saves
  it, and Escape cancels.
- **MC-203** Turning lot tracking on is offered only while the variant has no
  stock.
- **MC-204** Locations: a site with bins under it. Stock goes only into a
  place with nothing under it; a place holding stock cannot take children,
  so moving a location under one that holds stock is refused.
- **MC-205** Mark a bin unavailable (returns, retention). Its stock still
  shows on Inventory, but it is not counted as available and nothing ships
  or is picked for production from it.
- **MC-206** Partners: a partner with two addresses. Setting one as the
  default billing address unsets the other; the primary contact behaves the
  same way.

## 3. Stock

- **MC-301** Inventory shows stock 50 rows at a time, by location, then SKU,
  then lot. Load more continues with no row repeated or skipped, and the
  location filter, "Show emptied" and the search apply to the whole list,
  not only the rows on screen (ADR-051).
- **MC-308** Inventory search finds a row by any part of its SKU, its product
  name or its lot code; a search with no match says so.
- **MC-309** "Promised to customers" lists only products something is held or
  backordered for, with on hand, held, free and backordered, and it updates
  after a receipt or a sample.
- **MC-302** Move stock: a transfer between bins, an adjustment in, an
  adjustment out (a note is required), and a sample to a customer. Each one
  appears under Movements with who, when and why.
- **MC-303** A lot-tracked move asks for the lot; an untracked one does not.
- **MC-304** An adjustment out cannot take more than is on the shelf.
- **MC-305** A movement's history dialog reads in the direction it happened
  (in, out, between).
- **MC-306** Movements pages back through the history: the next page follows
  on with no gap and no repeat.
- **MC-307** Editing a lot's expiry saves, and the new date shows on
  Inventory and in earliest-expiry-first order. Reopening the edit dialog
  shows the same day that was typed.
- **MC-310** As a Viewer, a row's actions on Inventory offer History, and
  Trace lot on a lot's row, and nothing that changes stock. As an Admin,
  they also offer Move, Ship out, Send sample, Correct the count and, on a
  lot's row, Edit lot details.

## 4. Buying

- **MC-401** A purchase order: draft, add lines, confirm. A confirmed order's
  lines cannot be edited.
- **MC-402** Receive part of a line into a new lot with an expiry, then the
  rest into a second lot. The order shows each receipt, and Inventory shows
  both lots, each with the expiry typed — the same day on the lot trace.
- **MC-403** Duplicate a confirmed order, typing a new reference and an
  expected date in the dialog. The copy is a draft with that reference and
  date (none if the fields were left blank), no quantities received, and
  the partner's current address. The original is untouched until it is
  cancelled separately (ADR-031).
- **MC-404** A purchase in USD, with no rate entered for today: the receipt
  appears under Stock value as needing a cost. Enter the rate under Exchange
  rates; a later receipt is valued, and the earlier one stays as it was
  until corrected (ADR-048).

## 5. Making

- **MC-501** A recipe (BOM): draft, add lines, promote. A promoted recipe
  cannot be edited; a new version is a duplicate.
- **MC-502** Plan a run from the recipe. Release: the dialog previews which
  lots it will take, earliest expiry first, before anything moves.
- **MC-503** Record output into a new batch number. A second recording
  offers the batch by its code.
- **MC-504** Close over plan: the top-up comes from the shelf, and the
  variance is flagged and notified.
- **MC-505** The run's cost panel shows the material cost posted to the
  batch, and its unit cost.
- **MC-506** A licence on the recipe shows on the run as it stood at
  release: *Made under 80012345 (Health Canada), current at release*, the
  number linking to Licences. A run released before migration 0037 reads
  *state at release not recorded*, never current.
- **MC-507** Products → a variant → Recipe: duplicate the active version to a
  draft, then add, edit and remove a line. The active version is untouched.
- **MC-508** Licences → Edit the licence on a recipe: set *Valid until* to
  yesterday. Plan a run from that recipe and open Release, then pick a
  source. The dialog says the licence expired and on which day, and asks
  for a reason; Release stays disabled until one is typed. Release: the run
  page and the batch's lot trace both read *expired at release, released
  by* you, with the reason. Signed in as an Admin instead, the dialog says
  an override is needed and Release stays disabled (ADR-050).
- **MC-509** Switch the same licence's *Current* off (withdrawn). The release
  dialog refuses it, with no reason field, whatever the organization's
  licence policy.
- **MC-510** Settings → Organization → *Licences at release*: set *Expired*
  to Refuse and save. The release dialog now refuses the expired licence
  outright. Turn on *A recipe must carry a licence*: a run whose recipe has
  none is refused at release. An Admin or a Viewer sees the section without
  a Save button.
- **MC-511** Products → a variant → Recipe: the licence the recipe is made
  under carries its status (Current, Expires in N days, Expired, Withdrawn),
  so a lapse is seen before a run is planned. With *Valid until* set to
  today it reads *Expires today*, and release treats it as current.

## 6. Selling

- **MC-601** A sale to a customer with a default price list: lines added
  without a price take the list's price and show which list it came from.
- **MC-602** Change the list's price. The existing order does not change.
  "Use list price" on a line applies the new one.
- **MC-603** A sample line never takes a list price.
- **MC-604** A line whose list prices it in another currency than the sale is
  added unpriced, with the reason shown.
- **MC-605** One currency per sale: the first priced line sets it, and a
  line in another currency is refused (ADR-046).
- **MC-606** Confirming an unpriced sale is refused, with which line is
  unpriced.
- **MC-607** Two confirmed sales for more than is in stock: the first holds
  what exists, the second shows the rest as backordered, and Inventory's
  availability agrees (ADR-045).
- **MC-608** Ship part of a sale without choosing lots: earliest expiry goes
  first. Ship the rest choosing a lot by hand.
- **MC-609** Shipping cannot take stock held for an earlier order.
- **MC-610** Void a shipment: its stock returns to the shelf, the order's
  shipped quantity goes back down, and the shipment shows as voided.
- **MC-611** The shipment dialog previews the lots before anything moves,
  earliest expiry first. The shipments list and the packing slip name each
  SKU and lot (demo: SO-DEMO-1).
- **MC-612** Returns on a sale list each returned unit with its lot (demo: the
  5 units back on SO-DEMO-1).
- **MC-613** Duplicate a sale: a new draft with the same lines and the same
  prices, whatever the price list says now (ADR-049).

## 7. Invoicing, returns and credit

- **MC-701** Invoice a shipment: the draft shows every amount before issuing.
  Issuing gives the next number with no gap, and copies the seller, bill-to
  and ship-to as they are now.
- **MC-702** Issuing to a customer with no billing address is refused, and
  says to add one; under it, "Open {customer} to add one" opens the
  customer's page. Add a billing address there, go Back and issue: it goes
  through.
- **MC-703** The invoice's PDF: amounts rounded to the currency, tax per
  component, the registered address and tax number.
- **MC-704** Void an issued invoice: a full credit note is issued, and the
  shipment can be invoiced again.
- **MC-705** An RMA with one line to credit and one to replace. Receive the
  goods into the returns bin, then credit. The credit is capped at what was
  returned and invoiced, by value and by tax component.
- **MC-706** The replacement is a draft sale at zero for the replaced line.
- **MC-707** A partial credit with no goods back (a price adjustment). A
  second credit cannot take the total past the invoice.
- **MC-708** Samples never appear on an invoice.
- **MC-709** A credit's preview shows each tax component (GST and PST in the
  demo, on INV-000001), and the issued credit note's totals equal the
  preview exactly.
- **MC-710** Crediting more than is left on an invoice, or on an RMA line, is
  refused with a message that says what is left, not a server error.
- **MC-711** A taxed invoice needs the seller's tax number (ADR-046,
  amended). Clear the tax number on Organization → Profile and issue a draft
  with GST: it is refused, saying to set the tax number, and "Set it on
  Organization → Profile" opens Profile. Set the number, go Back and issue:
  it goes through and prints the number. A draft whose lines are all
  exempt issues without a number. In 中文 the link reads 前往“组织 → 概况”设置.

## 8. Cost

- **MC-801** Settings → Organization: the base currency can be set, and is
  fixed once anything carries a value.
- **MC-802** Stock value: the total, each pool's quantity, value and unit
  cost, and the needs-cost list. The demo's BF-2609 shows 1900.00 CAD. A
  pool with a receipt still needing a cost is marked provisional, and the
  mark goes once the cost is set.
- **MC-803** Correct a needs-cost receipt. The correction splits between
  stock still held and stock already gone, and the item leaves the
  needs-cost list.
- **MC-804** Costs and price lists are hidden from a viewer and from any role
  without the permission.

## 9. Recall drill (timed)

A recall arrives as part of a code off a label. Time it from the first
search to having the list of customers; the target is **under two minutes**.

- **MC-901** Lot search: type `2609`. Both BF-2609 and FOC-2609-01 appear,
  each with its SKU; codes starting with the text come first.
- **MC-902** Trace BF-2609: its supplier receipt, the batch it went into
  (FOC-2609-01), and every customer who received that batch, including
  samples and returns.
- **MC-903** Trace FOC-2609-01 back: the run, and the ingredient lots it was
  made from.
- **MC-904** Balances: where every unit of the batch is now.
- **MC-905** Record the time here and in the release notes.

## 10. Audit

- **MC-1001** Audit log: the changes from the walkthrough appear with who,
  what and when, in words a person can read.
- **MC-1002** A viewer cannot open the audit log.

## 11. Real week by hand (end of milestone)

Not a script: use the app for a week's worth of an imaginary business, then
note what was awkward, slow or confusing. At least:

- **MC-1101** An invoice, an RMA, a partial credit and a replacement.
- **MC-1102** A foreign-currency purchase, with its rate entered.
- **MC-1103** A costed batch.
- **MC-1104** A list-priced sale.
- **MC-1105** Anything that felt wrong becomes an issue, or a fix before the
  tag; the fixes are listed in the release notes.

## 12. Performance (ADR-051)

Before a release, or after a change to a list, a ledger query or an index.
The recipe is in `server/perf/README.md`.

- **MC-1201** `seed:volume --scale small` finishes with no refusal and no
  "sales skipped" warning. At large scale a handful of skipped sales is
  expected: now and then no aisle has two goods free to sell.
- **MC-1202** `npm run perf` passes: every budget, and the concurrency check.
- **MC-1203** `npm run perf:plans` passes, or each scan it reports is fixed or
  allowed with its reason.
- **MC-1204** If a large-scale report exists, nothing grows more than 3×
  without an issue explaining why.

## 13. Backups (ADR-053)

Monthly, after the restore drill has run, and after any change to the
backup scripts or workflows. The steps are in `docs/runbooks/restore.md`.

- **MC-1301** Actions → Backup: last night's run is green, and the backup
  it made is in the destination (an artifact, or the bucket), with its
  `.sha256`.
- **MC-1302** Actions → Restore drill: the last run is green, and its
  summary shows the organizations restored and how long it took, under 4
  hours (ADR-053's RTO); with `s3`, its step "Check every file has
  its copy" passed too.
- **MC-1303** On a Mac, following the runbook's section 3, the newest
  backup restores into the local database and `restore.sh` reports the
  organizations it found.
- **MC-1304** The private key is in the password manager and on paper, and
  nowhere in the repository, an issue or a chat.

## 14. Languages (ADR-054)

Most screens stay in English until their words move into the catalogue,
folder by folder; these check what is already in place.

- **MC-1401** The account menu and the sign-in page each offer English,
  Français (Canada) and 简体中文, every language in its own name. Choosing
  French turns the picker's own label to « Langue » and MUI's own text
  (a table's "Rows per page") to French, at once, with no reload.
- **MC-1402** Signed in, choose 简体中文, sign out: the sign-in page is
  still in it. Sign in on another browser: it opens in 简体中文 too.
- **MC-1403** Signed out, choose Français on the register page and create
  an account: after signing in, and on another browser, it is in French.
- **MC-1404** In English, nothing has changed: dates read as the browser's
  English writes them (10 Oct 2026 with a British browser, Oct 10, 2026 with
  an American one), and quantities and money as before.
- **MC-1407** On a product with a named variant, Edit names: give it a
  name and description in 简体中文 and its variant a name, and leave
  Français blank. The page lists the Chinese name; reopening the dialog
  shows all three as saved. Clear the Chinese name and save: it is gone.
  A description typed with no name in that language is refused before
  saving, saying which language.
- **MC-1408** With 简体中文 checked under Product names required on
  invoices, on the Organization page, and a customer set to Chinese,
  issuing an invoice for a product with no Chinese name is refused naming
  the SKU; after Edit names adds one, it issues, and its printed lines
  show the Chinese name.
- **MC-1409** On a partner, Document languages: the first offers the
  organization's default and each language; the second is greyed out
  until a first is chosen and never offers the first again. Set Français
  then English and save; ship to that partner: the shipment carries
  fr-CA and en. Set the first back to the default: the second clears with
  it, and the next shipment takes the organization's pair. The earlier
  shipment keeps its own. A role without partners.update sees the section
  but cannot save it.
- **MC-1410** In Français, receive 2,5 of an item: it is recorded as 2.5
  (the API's form) and shown as 2,5000 everywhere it appears — the stock
  list, the movements page, the history. Typing 1 234 or 1.234,5 is refused
  on the field itself, before anything is sent, with an example written
  1234,5. In English, 2.5 behaves exactly as before, and 1,234 is refused
  the same way. The same holds for an order's quantities and prices: raising
  one, adding a line, editing a line, which also opens showing its numbers
  the reader's way; receiving a line; shipping, whose quantities and lot
  picks open the reader's way and whose stock preview still works with a
  French 2,5; and taking a return. An invoice line's price, and a credit's
  quantities and prices, likewise: the credit's figures wait, and say why,
  while a number holds a thousands separator. Authorizing a return's
  quantities, likewise; and a run's planned quantity, its output, the
  amounts used at close, and the lot amounts chosen at release, which open
  the reader's way and must still add up exactly. A recipe's batch size and
  its components' quantities per batch, likewise; and a cost's unit price
  and exchange rate; a price on a price list; and a tax rate and an
  exchange rate in settings, which open the reader's way.
- **MC-1411** On the Organization page, Document languages: the first
  has no "default" option and Save stays off without one; the second
  behaves as on a partner. Set Français then English and save; ship to a
  partner with no languages of its own: the shipment carries fr-CA and en.
  A partner with its own pair is unaffected. Product names required on
  invoices: checking and unchecking back leaves Save off; checking 简体中文
  and saving survives a reload. A role without organizations.update sees
  both sections but cannot save them.
- **MC-1412** Documents follow the customer, not the reader. With the
  screens in English, a partner set to Français then English: ship, open
  the shipment's Packing slip — every heading in the PDF reads "French /
  English" at the same size, figures once with a decimal comma, the unit
  named in both. Invoice it: the draft's PDF is already French and
  English, with no item names in French yet; issue it with a French name
  on one product, and its line shows the French name and the English
  under it at the same weight, the other product's name once. Credit it,
  change the partner to 简体中文 alone, and print the credit note: still
  French and English, as its invoice was. A partner in 简体中文 alone
  prints Chinese only, glyphs Chinese rather than Japanese forms. A PDF
  holds the document only, nothing of the app, in any language.
- **MC-1413** Signed out, in 简体中文, sign in with a wrong password: the
  banner reads 邮箱或密码错误。请检查后重试。, not English; in Français,
  Courriel ou mot de passe invalide. Vérifiez les deux et réessayez. Signed
  in, in Français, try to remove yourself from Members: the refusal is
  French. In 简体中文, ship more than an order has outstanding, cancel an
  order goods have moved against, and release a run under an expired
  licence: each refusal is Chinese, the statuses in it too (已确认, not
  "confirmed"). A request with a field the server refuses, such as a
  quantity of -1 sent with curl and `Accept-Language: fr-CA`, names the
  field as the API does (lines.0.quantity) in a French sentence. The same
  requests with no Accept-Language answer in English word for word.
- **MC-1414** With the account's language set to Français, request a
  password reset: the email (Mailpit) is French, subject included. Sign
  out, switch the page to 简体中文, and request one for an account with
  no language chosen: Chinese. Sign in from a new browser: the security
  email and the bell's notification are in the account's language. Close
  an order line short: a member set to English reads "will not be
  delivered in full" while a member set to Français reads it in French.
  Signed in to an account with no language chosen
  (`update users set locale = null`), the browser's language set to
  Français: change the password, then delete the account and keep it.
  The three emails are in French.
- **MC-1405** *Skipped for now (6 October 2026): no fluent reviewer is
  available, so French and Chinese ship as unreviewed drafts, and release
  notes say so.* When one is: someone fluent in each language reads every
  message, screens and server both, and `docs/glossary.md`, and their
  corrections are in the catalogues:
  `node scripts/i18n-review.mjs export` writes `review/fr-CA.xlsx` and
  `review/zh-Hans.xlsx`; each reviewer fills in the Correction column;
  `node scripts/i18n-review.mjs import review/fr-CA.xlsx` writes them
  back, refusing the whole file if any correction loses a placeholder;
  then `npm run i18n:check` in client/ and server/, and one commit.
- **MC-1406** In Français and in 简体中文, every area converted so far
  reads entirely in that language, with no English left on it:
  - signed out: sign-in, register, forgot-password, reset and verify,
      including the rate-limit message after too many sign-ins;
  - the frame: the navigation bar, the drawer on a narrow window, the
      account menu, the notification bell, the email-confirmation banner,
      the page-not-found screen and the could-not-reach-the-server screen.
  - shared pieces: the colour-mode choices, Cancel and Saving… in every
      dialog and settings section, Load more, the Back button, a picker's
      "no matching items", and the page shown when a screen breaks;
  - the account: the Account page with its language picker, the
      password form and its devices-signed-out message, Your devices
      and Recent activity;
  - products: the list, the detail page with its variants, and the
      add-product, add-variant and edit-variant dialogs, including each
      product type and unit of measure by name;
  - partners: the list, the detail page with its addresses and contacts,
      and the partner, address and contact dialogs;
  - locations: the tree with its chips, and the add and edit dialogs,
      each location type by name;
  - inventory: the stock list and what is promised, the action menu, the
      receive, move, sample, correct and lot dialogs, a pile's history,
      the movements page with its reasons, and tracing a lot;
  - orders: the list with its filter and statuses, raising an order,
      the order page with its lines, and the edit, duplicate, close, add,
      edit and close-short dialogs; receiving a line, shipping with its lot
      preview, the shipments and returns on an order, voiding a shipment,
      taking a return with its reasons, and linking a return to an RMA. The
      packing slip is a PDF in the customer's languages, not the
      reader's (MC-2501);
  - invoices: the list with its status tabs, an invoice with its lines,
      totals, parties and credit notes, the draft's details and tax code,
      the line, issue, void, credit and delete dialogs, and a credit note's
      page. The invoice's and the credit note's PDFs are in the customer's
      languages instead (MC-2501);
  - returns: the RMA list with its status tabs, raising an RMA with each
      line's resolution by name, an RMA's page with closing, cancelling,
      linking a return and raising a replacement;
  - production: the runs list with its statuses, planning a run, a run's
      page with its components, lots and variances, and the release (with
      its licence warnings), record-output, close and cancel dialogs;
  - recipes: the recipe panel on a product with its versions and statuses,
      the new-recipe, add-component and edit-component dialogs, archiving,
      new version and promote with their tooltips, and the licence on a
      version;
  - costs: the stock value page with what waits for a cost and why, a
      lot's and a run's cost panels, and setting a cost;
  - licences: the register with each licence's status (Current, Expires
      in N days, Expired, In force from, Withdrawn), adding and editing one,
      and what a batch was made under on a run and a lot trace;
  - price lists: the lists, a list with its prices, creating and editing
      one, setting a price, the picker (a retired list marked so), a
      partner's lists and the organization's default;
  - settings: the Organization page's sections and licence policy, tax
      codes with their rates (9,975 % in French), and exchange rates;
  - members: the list, changing a role and inviting a member, with the
      built-in roles (Owner, Admin, Viewer) named in the language and a
      role the organization named itself shown as named;
  - audit: the audit log with its filters and the History panel on a
      record, timestamps, action names, field names and their values in
      the language ("Commande expédiée", not "Order shipped"), and no id
      anywhere (ADR-076, section 29).

  A refusal from the server (a wrong password, a rule broken) stays in
  English until the server translates (ADR-054, step 6), and so do
  notifications written before that.

## 15. The look (ADR-055)

The screens are being redesigned in steps; these check what is in place.
Paper is checked first because it must not change at all.

- **MC-1501** Open the demo's INV-000001 and press Print, in light mode
  and again in dark: the PDF opens in a new tab, black on white with
  nothing of the app, the same in both modes, with the layout ADR-055
  approved (ADR-071). The packing slip and the credit note the same.
- **MC-1502** In light and in dark, walk Inventory, SO-DEMO-1 and INV-000001.
  Every word is readable; the page is tinted and its panels white (dark grey in
  dark), with borders rather than shadows; table heads are tinted and quieter
  than the rows; figures line up down their columns.
- **MC-1503** The orders list with Show set to All: Confirmed is a quiet blue
  tint, Draft and Cancelled grey, Shipped and Received green, each chip with
  dark text in light mode and light text in dark.
- **MC-1504** Press Tab through a page: every button, link, field and menu shows
  the same ring as it takes focus, in both modes.
- **MC-1505** In 简体中文 the text is the system's Chinese font (PingFang on a Mac,
  Microsoft YaHei on Windows), never a serif fallback, with more room between
  lines than in English.
- **MC-1506** On a phone or tablet, buttons, icon buttons and table rows are at
  least a fingertip tall; with a mouse they are compact.
- **MC-1507** From 1200px wide the navigation is a dark rail beside the page:
  the daily work first (Inventory to Production), then Records (Products,
  Partners, Locations, Trace a lot, Stock value, Audit log), then Settings
  (Organization, Members, Tax codes, Exchange rates, Price lists). The current
  page is highlighted, and the rail stays put while the page scrolls.
- **MC-1508** Fold the rail with the arrows at its top: only icons remain,
  each naming itself when pointed at, and following one still works. Reload:
  it stays folded. Unfold it again.
- **MC-1509** Below 1200px the rail is gone and a menu button opens the same
  three groups in a drawer; choosing a page closes it. Widen the window past
  1200px with the drawer open: it closes and the rail appears.
- **MC-1510** As a Viewer, groups with nothing the role may see are left out
  entirely, heading and all; nothing in the rail leads to a refusal.
- **MC-1511** The account menu holds the email, Account, Devices, the colour
  mode, the language and Sign out, and no settings. In Français and 简体中文 the
  rail's headings and Collapse/Expand read in that language.
- **MC-1512** Open SO-DEMO-1: its title is SO-DEMO-1, Confirmed beside it in a
  quiet blue, and "Selling · Northside Pharmacy" under it. The sections are
  tabs (Items, Shipments, Returns) beside a summary that stays in view while
  the page scrolls.
- **MC-1513** The summary holds the order's actions (Close order, Edit,
  Duplicate, History), then Complete 0 of 1, then Money (CAD): order value
  14,994.00 before tax, invoiced 10,495.80 and credited 52.48 including tax,
  net invoiced 10,443.32, not yet invoiced 4,998.00 before tax. Each label
  says whether tax is in it.
- **MC-1514** "1 return not yet settled" is amber under the items figures;
  choosing it opens the Returns tab, where the crushed carton offers Link to
  RMA.
- **MC-1515** Choose Shipments, then refresh: still on Shipments, and the
  address ends ?tab=shipments. Go to INV-000001 from there and press Back:
  Shipments again. Press Back once more: the page before the order, not the
  Items tab. Type ?tab=nonsense on the address: Items opens and the address
  loses it.
- **MC-1516** A purchase (PO-DEMO-4) has no tab bar, only its items, and no
  money group. Below 900px the summary sits above the tabs.
- **MC-1517** On SO-DEMO-1's Items tab, quantities read without padding zeros
  (600, 400, 7, 200), and Credited shows 2 in amber, since 5 of the 7 returned
  are not settled. In Français, 1 234,5 reads with the French separators.
- **MC-1518** A line's corrections are in its ⋮ menu (Edit, Use list price,
  Close short; Reopen on a line closed short; Remove on a draft with more than
  one line), and each opens or does what its button did. On a purchase,
  Receive stays on the row. With a keyboard, Tab reaches ⋮, Enter opens it and
  the arrow keys move through it.
- **MC-1519** On the Shipments and Returns tabs, a lot's quantity reads "400
  each", and a lot within 90 days of expiry shows its days left beside the
  date (FOC-2609-01 is two years off, so the date alone).
- **MC-1520** On SO-DEMO-1, Ship is the one filled button, full width at the
  top of the summary, with Close order outlined under it and Edit and
  Duplicate side by side. On an order with nothing left to ship, Close order
  is the filled one.
- **MC-1521** The summary's Quantities read 600 each ordered, 400 shipped, 200
  still to ship in bold, and 7 returned with "does not add to still to ship"
  under it. Void a shipment on another order: "not counting 1 voided shipment"
  appears under its shipped figure. An order mixing units (a blend in kg with
  bottles) shows "Complete 0 of 2" instead.
- **MC-1522** The tabs carry counts: Shipments 2, Returns 2, Invoices and
  credits 2. That tab lists INV-000001 (Issued, 400, Shipment of its date,
  10,495.80) and CN-000001 (2, its reason, −52.48), net invoiced in bold under
  them, and the not yet invoiced amount below. Both numbers open their
  documents.
- **MC-1523** Credited reads −CA$52.48 in the summary, and "See invoices and
  credits" opens that tab. A member without invoices.view has neither the tab
  nor the link.
- **MC-1524** History is a tab, listing the order's changes with Load more and
  Open in audit log; a member without audit.view has no History tab. The
  History button no longer appears on the order.
- **MC-1525** On Orders, Open, Fulfilled, Cancelled and All are a row of
  buttons above the list, Open pressed. Pressing Cancelled shows SO-DEMO-4
  alone and presses only Cancelled; pressing it again keeps it.
- **MC-1526** Statuses are tinted by the one table: Draft grey, Confirmed
  quiet blue, Fulfilled green, Cancelled grey, in every language, with no CSS
  capitals. Fulfilled reads "400 / 600", right-aligned, without padding zeros.
- **MC-1527** In an organization with no open orders, the list shows the empty
  message, and Raise an order stays where it always is, in the page header;
  with Fulfilled pressed and none fulfilled, only "No orders match that
  filter."
- **MC-1528** Inventory's filters are one row: Search, Location, then Expiring
  soon with its count and Show emptied. Pressing Expiring soon shows only lots
  within 90 days, ELD-24A among them, and nothing untracked; the count is the
  number of rows it shows. With a search that matches none of them, the count
  drops to 0.
- **MC-1529** Expires shows days left within 90 days, amber, and within 30
  days red (ELD-24A: "20 days left"), the date beside each; a lot two years
  off shows only its date. Quantities read "400 each", and the Promised to
  customers table reads without padding zeros too.
- **MC-1530** Receive stock, Ship out or Correct the count on a lot within 90
  days: the list and the Expiring soon count both update without a reload.
  With Expiring soon pressed and none due, the list says no lot here expires
  within 90 days.
- **MC-1531** Invoices has a page title with its one-line explanation under
  it, then All, Drafts, Issued and Voided as a row of buttons where the tabs
  were, All pressed. Draft reads grey, Issued quiet blue, Voided red, on the
  list and on each invoice's header.
- **MC-1532** On INV-000001 the quantity reads 400, and Credit notes is a
  table: CN-000001 linked, its date, its reason wrapping when long, and
  −CA$52.48 right-aligned. Void an invoice: its full credit note shows a red
  "Voids invoice" chip beside its number.
- **MC-1533** CN-000001's lines read 2, not 2.0000. With Voided pressed and
  nothing voided, the list says only "Nothing here."
- **MC-1534** Returns has a page title with its explanation under it, then its
  statuses as a row of buttons where the tabs were, Open pressed. Open reads
  quiet blue, Closed and Cancelled grey, on the list and on RMA-000001's
  header.
- **MC-1535** On RMA-000001, Authorized, Received and Credited read 2, not
  2.0000. With a filter that matches nothing, the list says "Nothing here." in
  the shared empty state.
- **MC-1536** Production's statuses are a row of buttons (All, Planned, In
  progress, Finished, Cancelled) where the Show select was, All pressed.
  Planned reads grey, In progress quiet blue, Finished green, on the list and
  on a run's header; CALM-RUN-01 shows In progress.
- **MC-1537** Quantity and Produced read 1,000 and 980, not 1000.0000; on a
  run, Produced so far, each component's planned and consumed ("30 kg"), and
  the lots used ("EARLY-LOT: 20") read the same way. With a status that has no
  runs, the list shows the empty message in its panel.
- **MC-1538** Dark mode, through the account menu: on Inventory, Orders, an
  order (each tab), Invoices, Returns and Production, every status chip,
  expiry chip and quick filter is readable, no panel shows a white edge, and
  the rail and top bar stay distinct from the page. accessibility.spec checks
  contrast in both modes; this is for what it cannot see.
- **MC-1539** Dark mode, then Print INV-000001: the PDF is black on white,
  as in light mode; the app's theme never reaches a document.
- **MC-1540** At 375px wide (a phone, or the browser's device toolbar): ☰
  opens the navigation, and choosing a page closes it. Inventory's filter row
  wraps onto two lines without scrolling sideways; its table scrolls inside
  its panel.
- **MC-1541** At 375px, an order: the summary sits above the tabs, Ship is
  full width, and the tabs scroll sideways when they do not fit, the open one
  still visible. A line's ⋮ menu opens fully on screen.
- **MC-1542** On a touch screen (or with touch emulation), buttons, filters
  and table actions are at least 44px tall; with a mouse, 36px.
- **MC-1543** With the keyboard alone, on an order: Tab reaches the tabs, the
  arrow keys move between them and Enter opens one; the address changes and
  Back leaves the page. Focus is always visible.
- **MC-1544** In the summary, Ship, then Close order, each full width, then
  Edit and Duplicate as two equal halves; nothing reaches past the panel's
  edge, at 1440px and at 375px. A member who may edit but not duplicate sees
  Edit full width.
- **MC-1545** In English and French at 1440px, SO-DEMO-1's ⋮ is visible at the
  right of its row without scrolling; scroll the table sideways and it stays
  put, the columns passing under it. A tab with nothing in it (SO-DEMO-QC's
  Returns) shows no 0, and Returned 0 carries no note.
- **MC-1546** Products has a page header (Licences, Refresh, Add product),
  then Search and a Discontinued quick filter with its count. Typing part of a
  name narrows the list as you type; pressing Discontinued shows only those
  (ZINC-60's product). Discontinued reads as a grey chip; a search that
  matches nothing says so, and Add product stays in the header only.
- **MC-1547** Partners has Search and a Retired quick filter with its count.
  The search finds a partner by part of its name, its code or its tax ID.
  Pressing Retired shows only Old Mill Herbs. Retired reads as a grey chip.
- **MC-1548** On Locations, Holds stock is a quiet blue chip rather than a
  filled accent one, and Not available amber; an organization with no
  locations shows the empty message in the shared empty state.
- **MC-1549** On SO-DEMO-1, the summary reads Ship, then Edit and Duplicate,
  then Close order. INV-000001 is linked under Invoiced and CN-000001 under
  Credited; the subtitle's Northside Pharmacy opens the partner. The Invoices
  and credits tab ends with "1 return not yet settled" and its note, as the
  summary does. On SO-DEMO-2, with nothing invoiced or returned, no links and
  no warning appear.
- **MC-1550** On Sign in, Register, Reset password, Account's Change password
  and the invitation page (ADR-077), each password field has an eye button
  at its end. It starts hidden; pressing it shows the text and the button's
  name becomes "Hide password" (显示密码 / 隐藏密码 in Chinese); pressing again hides
  it. On Change password, showing the new password leaves the current one
  hidden. Leave the page and come back: hidden again. A password manager still
  fills the sign-in fields.
- **MC-1551** On Sign in, show the password, then sign in with a wrong one:
  the error appears and the password is dots again. The same on Change
  password when the current password is wrong: every field shown goes back to
  dots.
- **MC-1552** Inventory's quick filters read Expiring soon, Needs a cost and
  Show emptied, each with its count. Pressing Needs a cost shows THE-0915's
  L-theanine, received with no price (PO-DEMO-5), and the count matches the
  rows; set its cost on Stock value, come back, and it is gone and the count
  is one lower. Stock value has a page header with its explanation under it,
  Provisional is an amber chip, and quantities read without padding zeros.
- **MC-1553** A quantity with its unit takes the unit's form for that quantity
  in each language: in English 1 box and 600 boxes, 2 cases, 1 litre and 3
  litres, while each, kg, g and ml stay as they are; in Français 1 unité, 600
  unités, 1,5 litre (singular below two); in 中文 one form, 600 个. Check
  SO-DEMO-1's summary (600 unités in French) and a shipment's lot table.
- **MC-1554** Organization, Tax codes, Exchange rates and Price lists open
  with the same page header as every list: the title, its explanation under
  it, and the page's action at the right (History on Organization). An empty
  list shows the shared empty state rather than a blue notice. Tax codes read
  In use in quiet blue and Retired in grey; a retired price list is grey.
- **MC-1555** On SO-DEMO-2 in 中文 at 1440px, the 未完成 column reads 500 with 短缺
  162 in amber under it, not beside it; the Total column is in view without
  scrolling sideways, and the pinned ⋮ covers nothing. Hovering the chip still
  says how much is held.
- **MC-1556** From any page, `/` or ⌘K focuses the top bar's search. Typing
  `2609` lists BF-2609 and FOC-2609-01 under Lots, each with its SKU and
  expiry chip; arrow keys move, Enter opens the lot's trace, Escape closes.
  `fokus` shows Focus 60ct marked close match; `mdyf` or 明德 finds 明德药房; `INV-`
  puts Invoices first. In 中文 and Français the headings and messages are
  translated. At 375px the search is a button that opens it full screen.
- **MC-1557** Orders, Invoices, Returns and Production each have a Search box
  in their filter row: part of a number or reference, or a partner's name
  (without accents, or a Chinese name by pinyin), narrows the list as you
  type, with the status buttons still applying. "Show all in Orders" from the
  top bar opens Orders already narrowed, as do the Items, Lots and Partners
  links.
- **MC-1558** Invoices → Period → Last month → Export: the file opens in Excel
  and in Numbers with every invoice of that month, totals as numbers that sum,
  dates as dates. Switch to 中文 and export again: the headers are Chinese and
  the Chinese names read correctly, not as garbled characters. Sort Invoices
  by Total, then export: the file is in the same order. Inventory sorted by
  Expires lists the soonest first; Movements, Production and Returns narrow by
  their date range; Products, Partners, a price list, Stock value and the
  Audit log each export, and the Audit log shows the export as an entry.
  Orders' Created, Movements' When and the Audit log's When read like
  `2026-10-15 18:54:11`, in UTC, and open as dates.
- **MC-1559** Sign in as the demo owner: Home opens, greeting by the time of
  day, the sentence's counts matching the cards, red only on late or expired.
  Each card's See all opens its list showing the same number of rows. Switch
  to 中文 and to a phone (or a narrow window): the counts sit two by two, cards
  stack, nothing scrolls sideways, and the wording reads naturally. Register a
  new organization: Getting started leads with seven steps; add a location and
  see its step ticked on Refresh. The last step reads Invite your team: its
  Invite someone opens Members with the Invite dialog, and closing it takes
  `?invite` off the address, so Back and a reload leave it shut (ADR-077).
  Skip the team step; Dismiss the card (focus moves to the greeting at the
  top of Home) and bring it back with Show Getting started. Sign in as a viewer: no Skip or Dismiss, the team step with no
  button, and only the cards that role may see.

## 16. Files (ADR-059)

Once after `FILE_STORAGE=s3` first reaches production, and after any change
to the storage drivers. Until a screen uploads, the upload is made from the
browser's console while signed in as an owner:

```js
const api = '/api'; // the API's address as the Network tab shows the app calling it
const canvas = Object.assign(document.createElement('canvas'), { width: 1600, height: 1200 });
canvas.getContext('2d').fillRect(0, 0, 800, 600);
const form = new FormData();
form.append('file', await new Promise((r) => canvas.toBlob(r, 'image/png')), 'test.png');
await fetch(`${api}/v1/files/product-image`, {
  method: 'POST', body: form, credentials: 'include',
  headers: { 'X-Requested-With': 'fetch' },
}).then((r) => r.json());
```

- **MC-1601** The upload answers 201 with three sizes. In Cloudflare, R2 →
  `waf-files` → Objects holds `<organization id>/<file id>/thumb`, `display`
  and `full`, and the bucket has no public URL. Opening
  `<api>/v1/files/<file id>?size=thumb` in the same browser shows the image;
  in a private window, signed in to another organization, the same address
  is a 404.
- **MC-1602** The next morning, after the nightly backup, `waf-backups` →
  Objects → `files/` holds the same three objects. The day after the upload,
  the file (never attached) is released; 30 days later its three objects are
  gone from `waf-files`.

## 17. Organization settings (ADR-061)

- **MC-1701** Settings → Organization opens on Profile; Money, Documents and
  Stock each change the address (`?tab=money` and so on), and pasting that
  address in a new tab opens the same tab. Type in Profile's tax number, open
  Stock and come back: the typing is still there. On a phone the tabs scroll
  sideways. Rename the organization: the side rail and the top bar show the
  new name after Save, the History button lists the change, and an invoice
  issued before still prints the old name. In 中文 the tabs read 概况, 财务,
  单据 and 库存.

- **MC-1702** Branding (ADR-060). As an owner, Settings → Organization →
  Branding: upload a PNG logo and an SVG one in turn; each previews on both
  sidebar shades, and after Save the logo replaces the name in the top bar
  (on a white plate in dark mode). Choose Teal and Save: buttons, links and
  the selected tab turn teal at once, in light and dark mode. Choose your
  own colour `#5BB8F0`: the tab says `#127EB3` will be saved; `#D93A2B`
  warns it is close to the error red. On Stock set expiry to 180 and 60:
  a lot 150 days out shows amber in Inventory and on Home. Print an invoice
  and a packing slip: the logo at the top left; turn "Print the logo" off on
  Documents and print again: no logo. A viewer sees no Branding tab. In 中文
  the tab reads 品牌.

- **MC-1703** The refusal to issue links to Profile. Register a new
  organization (it has no registered address; the demo's has one), ship a
  sale and issue its invoice: the refusal says to set the address and,
  under it, "Set it on Organization → Profile" opens Profile. Set the
  address, go Back and issue: it goes through. In 中文 the link reads
  前往“组织 → 概况”设置. The customer's billing address does the same
  (MC-702).

## 18. Product images (ADR-062)

- **MC-1801** On a product with no images, the drop area invites one. Add
  three photos at once from a computer: each shows its progress, then
  "Making sizes…", then joins the gallery; add a PDF with them and only it
  is refused, with the reason. Paste a screenshot (⌘V): it is added. Add
  the same photo again: "already on this product". Open an image: Esc
  closes, ← → move, double-click zooms; on a phone, swipe and double-tap.
  Use a thumbnail's menu to Make cover and Move left; drag one to the end.
  Remove one and press Undo: it is back; remove one and wait: after a
  reload it is gone. The Products list and Inventory show each cover; a
  product without one shows the plain tile. At eight, Add images is
  disabled with the reason. A viewer sees the gallery without the menus.
  In 中文 on a phone, the buttons and the hint read naturally.

## 19. People (ADR-063)

- **MC-1901** On Account, add a photo (a phone's camera works too): the
  circle shows it cropped square, and so does the top bar at once; hover
  it for your name and email. Replace it, then Remove it: your initials
  come back on your colour. Fill in your details at work and save. On
  People, your card shows your title and extension; another member's
  card, with nothing filled in, shows only initials, name and role.
  Search finds a person by title. Open a colleague's page: only what they
  filled in, "Active today" or similar; as an owner, the exact time and
  their recent work, with "See all" opening the audit log filtered to
  them. Your own page lists no work; "See all your work" on Account opens
  Your activity, whose export holds only your actions. Members and a
  record's History show faces. Leave a tab open and hidden for a few
  minutes, then look at People from another account: you are not shown
  as active then. In 中文 on a phone, People reads 同事 and the cards fit.
- **MC-1902** Without a photo, rename yourself on Account to 周振中: your
  circle shows 振中, inside the circle in the top bar, History, People and
  your page; as 王芳 it shows 王芳, as 张伟 David it shows DA, as Élodie
  Dupré ÉD, and as محمد علي only م. With VoiceOver on and the app in
  English, read your card on People: 振中 is read in a Chinese voice. Tab
  to your circle in the top bar: its label follows the page's language,
  English here, as ADR-063's amendment says. Put your own name back.
- **MC-1903** *(seed:demo)* Members lists ten people, each with a face and a
  role, Sarah Chen an Admin, and the audit log filtered to Changed a
  member's role has one entry, by the Owner. On People, Fatima Haddad's card
  shows only her name and role. Open each colleague's page: as the Owner,
  last active is today for Daniel Okafor, 李静, Marc-André Gagnon, 王建国 and
  Sarah Chen, three days ago for Anika Sharma, twelve for Tom Becker and
  forty for Chloé Tremblay, and Fatima has never signed in. SO-DEMO-7's
  History reads Sarah creating and confirming it, 王建国 shipping it and
  Sarah closing it; its invoice's History reads 李静 drafting it and the
  Owner issuing it. Any record the Owner made, such as Focus 60ct, has its
  creation in History. Sign in as 王建国: the top bar's circle shows 建国.
  Sign in as Fatima: a colleague's page gives only Active today, this week
  for Anika, this month for Tom, and over a month ago for Chloé.

## 20. Licence reminders (ADR-064)

- **MC-2001** Give a licence an expiry 60 days from today and restart the
  server (it checks at start, then hourly): the owner and anyone who
  releases production get one notice in the bell, in their language,
  opening Licences; a viewer gets none. Restart again: no second notice.
  Change the date to 5 days from today: the 7-day notice arrives, alone.
  Change it to today: "expires today". Renew it a year out: nothing more
  until 60 days before the new date. In 中文 the notice reads naturally.

## 21. Staying signed in (ADR-065)

- **MC-2101** Sign in with Keep me signed in unticked: close the browser
  entirely and reopen it: signed out. Sign in again on that browser: the
  box starts unticked. On a personal laptop it stays ticked. As an owner,
  Organization → Security: 15 minutes, for sign-ins without Keep me
  signed in. On the unticked computer, leave the app alone 14 minutes:
  the warning shows with a countdown, also in the tab's title; Enter keeps
  you in. Start editing an order and leave it: the warning adds that
  unsaved changes will be lost. Let it run out: the sign-in page says
  why, and signing in returns you to the page. With two tabs open, use
  one and the other does not warn; sign out from the warning in one and
  the other signs out too. A ticked laptop is not signed out. Set
  Everyone: it is. In 中文 the sign-in page reads 保持登录.

## 22. Covers in the lookup (ADR-066)

- **MC-2201** Press / and type part of a product's name: its items show
  the product's cover beside the title; a product with no photo shows the
  plain tile, and the rows line up. Lots, orders and partners look as
  before. On a phone the cover fits the row.

## 23. Leaving and deleting (ADR-069)

- **MC-2301** As a Viewer in an organization with an Owner, Account → Your
  data and your account → Leave: the dialog says what happens; Leave signs
  you out of the organization and Home shows no organization, and you can
  still sign in. As the Owner, Audit lists "Left the organization". As
  the only Owner of an organization with other members, Leave is refused
  with a Go to Members link; on your own in a new organization, Leave is
  refused as its only member, with the same link.
- **MC-2302** As that Viewer, Download your data: a JSON file with your
  profile, memberships, devices and account history, and nothing of the
  organization's records. Delete my account: a wrong password is refused;
  the right one closes the dialog, the banner names the day 30 days
  ahead on every page, your other browser is signed out, and an email
  (Mailpit) says the account will be deleted after that same day. With
  the computer's time zone set to Vancouver, asked for after 17:00, the
  banner and the email still name the same day. With the server stopped,
  Keep my account says it could not reach the server and the banner
  stays; with it running, the banner goes, and a second email says so.
  In 中文 the dialog, the banner and the emails are in Chinese.
- **MC-2303** Request deletion again, then set its day two days back in
  the database (`update users set deletion_scheduled_at = current_date - 2`)
  and restart the server, which runs the deletions at startup: the
  account is gone, signing in fails, Audit shows Deleted User against
  its old entries and "Account deleted", and the email can register a
  new account.

## 24. Closing an organization (ADR-070)

- **MC-2401** As an Owner, Organization → Profile ends with Download
  everything and Close this organization; as an Admin or a Viewer, the tab
  ends at the registered address. Download everything saves
  `<organization>-export-<day>.zip` straight to disk. Opened: a README in
  the language the app shows; `organization.csv`, `members.csv`,
  `role_permissions.csv` and a CSV per kind of record, each opening in
  Excel or Numbers with Chinese and French names readable; invoices and
  credit notes with their lines and tax; `files/` with the logo and
  product images. Back on the page, the section says "Last downloaded …
  by you", and History shows "Everything exported". Have a colleague with
  your name download it too: the section names them, not "you". In 中文,
  with the browser left in English, the README reads in Chinese.
- **MC-2402** Close this organization…: Close organization is off, and
  the line under it says what is still needed. It stays off until the
  export is fresh or "I don't need a copy" is ticked, the name is
  typed exactly, and the password is typed. With the last export moved
  two days back (`update audit_log set created_at = now() - interval
  '2 days' where action = 'organization.exported'`), the dialog names it
  and asks to download again. A wrong password is refused. Confirmed: the
  banner names the day 30 days ahead "(in 30 days)" on every page, with
  Download everything and Cancel deletion; Mailpit has an email for every
  member in their own language, the Owners' telling them to download
  again, everyone else's that their account stays.
- **MC-2403** As a member, the banner says an Owner asked, with nothing
  to press but ×. × hides it until tomorrow in this browser only: a reload
  keeps it hidden, another browser shows it. With the day 7 days ahead
  (`update organizations set deletion_scheduled_at = current_date + 7`),
  the banner has no ×, and after a server restart Mailpit has "Reminder:
  … will be deleted after" for every member, once. As a second Owner,
  Cancel deletion: the banner goes for everyone, and every member is
  emailed that it will not be deleted.
- **MC-2404** Schedule it again, then move the day two days back
  (`update organizations set deletion_scheduled_at = current_date - 2`):
  the banner turns red, says it is being deleted, and offers nothing;
  Profile says it can no longer be cancelled. Restart the server, which
  completes deletions at startup: the organization is gone, its folder
  under `server/storage/` is gone, every member got "has been deleted",
  and a member who belonged to it alone is still signed in, to no
  organization, and can download their own data.
- **MC-2405** Register a new organization. Account → Delete my account
  opens "Delete your account and … ?", ending in Delete both. Confirmed:
  one banner says both will go, with Keep both, and your other browser is
  signed out. Keep both, from the banner or from the Account page, keeps
  both. Delete both again, add a colleague as Owner, and have them cancel:
  you are emailed that your account will not be deleted either. Delete
  both once more, move both days two days back (`update organizations set
  deletion_scheduled_at = current_date - 2` and the same on `users`), and
  restart: the organization goes, then your account; signing in fails,
  and the email can register again. Then the unlinking: Delete both, add a
  colleague as Owner, and leave the organization (or have them remove
  you, or make you a Viewer and then press Keep my account). Your
  account's own deletion stands on its day, the organization's deletion
  stands too, and nobody else's cancel touches your account.
- **MC-2406** In 中文, on a phone: the Profile sections, the dialog with
  its three steps, the banner and every email read in Chinese, and the
  dialog fits the screen with its buttons reachable. Show it to someone
  who reads only Chinese, and ask them to find how to cancel.

## 25. Documents as PDF (ADR-071)

- **MC-2501** Open an issued invoice and press Print: a new tab opens the
  PDF in the browser's own viewer, and printing it from there gives the
  same page on Chrome, Safari and Firefox. Back on the invoice, Download
  PDF saves `INV-000001.pdf`. A credit note does the same, saving
  `CN-000001.pdf`. On an order, a shipment's Packing slip opens its PDF in
  a new tab, and Download PDF beside it saves
  `packing-slip-<the day it shipped>-<id>.pdf`. A draft invoice's PDF says
  DRAFT across every page, and its file is named `DRAFT …`. A line priced
  at 0.0125 prints its unit price as $0.0125, not $0.01, on the invoice,
  the credit note, the pro forma and the purchase order alike.
- **MC-2502** *(#118)* With an invoice issued, another voided, a credit
  note and a draft, use Download everything (Settings → Organization →
  Profile). The ZIP has `documents/invoices/` with both issued invoices
  and `documents/credit-notes/` with the credit note, each named by its
  number and the same as Download PDF gives it; the draft is not there.
  README.txt ends with a glossary, a line per column, in the language
  the app shows, even on an English browser: switch the app to 简体中文 and
  download again, and the README is Chinese. Open
  `organization.csv` in Excel or Numbers: `created_at` reads like
  `2026-10-16 03:31:59` and is taken as a date.
- **MC-2503** *(ADR-071)* On a database that already had orders, after
  `npm run migrate:all`: every order has a number, SO- for sales and PO-
  for purchases, counting up from 000001 in the order they were made. A
  new order takes the next one, a draft included, and a duplicated
  order, or an RMA's replacement, takes its own. Type an order's number
  in the lookup: it is found, titled by it. Home's recent records name an
  order by its number, and the orders CSV starts with a Number column.
  Orders lists the number first, as the link; an order's page is headed
  by it, with the partner, linked, and their reference beneath.
- **MC-2505** *(ADR-071)* Every place that names an order names it by its
  number: Home's To ship and To receive, titled SO-… and PO-…, the
  partner and their reference beneath; Invoices to issue, by the order's
  number; an invoice's and an RMA's link to its order; a lot's trace,
  where it came in and where it went; the audit log's entries for an
  order, as `SO-000001 · Northside Pharmacy`; and the invoices CSV, whose
  Order column holds the number, the reference beside it. A packing
  slip's PDF says `Order SO-…` and, when they gave one, `Your order …`.
- **MC-2506** *(ADR-071)* Locations: a site has an Address button, a zone
  or a bin has none. Give the site an address: it shows on one line under
  the site's name, and the audit log has the change. Open it again, clear
  the city and save: the city is gone, as the dialog says it is sent
  whole. Remove the address: the line goes. In 中文 the dialog reads
  naturally.
- **MC-2507** *(ADR-071)* Deliver to. With one site, raise a purchase:
  Deliver to shows that site, with its address underneath, and the order's
  summary says it. Raise another with Not chosen picked: its summary says
  Registered address, not the site. Add a second site and raise another: Deliver to starts
  at Not chosen and the summary says Registered address; choose a site and
  its address shows, or that it has none and the document prints the
  registered address. Edit order changes it on a draft or a confirmed
  purchase, and the order's history shows the change; once the purchase
  is received or cancelled, Edit order no longer offers it. A sale has
  no Deliver to.
- **MC-2508** *(ADR-071)* Send back to. Ship a sale from a bin inside a
  site, then Authorize a return: Send back to starts at Where the goods
  shipped from, and the new RMA says that site. Change it on the RMA:
  the page and its history show the new site; choose Not chosen and it
  says Registered address. Raise one with The customer is sending the
  goods back unticked: there is no Send back to, on the dialog or the RMA.
  Once the RMA is closed, Change is gone. In 中文 both read naturally.
- **MC-2509** *(ADR-071)* The purchase order. On a purchase with one line
  priced and one not, press Print: the PDF shows its number, Date, Deliver
  by and Your reference, then From, To and Deliver to with the site's
  address (or the registered address when the site has none). The unpriced
  line is blank, a line asks for its price, and Total of priced lines says
  Before tax. The box asks the supplier to quote the PO number, and Raised
  by shows your name, job title and work phone, never your email; for a
  supplier whose documents are in 中文, it reads 经办人：your name，job
  title · phone, punctuated in Chinese. Download PDF saves `PO-….pdf`.
  Cancel the order and print again: CANCELLED heads it.
- **MC-2510** *(ADR-071)* The pro forma. On a priced sale, press Pro forma
  invoice and choose a tax code: the PDF says Not a tax invoice where a
  number would be, the order's number and Made today, its lines and tax as
  the invoice would charge them, and the boxed note that nothing is owed.
  The order's History shows Pro forma invoice made, with its total. Add a
  line without a price: the dialog says which item to price and offers no
  Print. As someone who cannot see tax codes, open it: it says so, rather
  than quietly offering only No tax. A sample and a cancelled sale have no
  Pro forma invoice button.
  For a customer whose documents are in 中文 and English, every label and
  item name is in both.
- **MC-2511** *(ADR-071)* The RMA. Print an open RMA whose goods are
  coming back: the box says to write its number on every box, the lines
  say what happens to each with the key beneath, Raised by is there, and
  the dashed label at the end shows Return to, the site and its address,
  the number large, and From the customer. Print one where the customer
  keeps the goods: the box says nothing needs to be sent back, and there
  is no label. Close or cancel one whose goods were coming back and print
  it again: no box points to a label, and there is none.
- **MC-2512** *(ADR-071)* Every page's foot. On each of the six documents,
  the foot of every page says what it is and its number, as Purchase
  order · PO-000045, and Page 1 of 2. Add lines to an order until its
  purchase order runs to a second page: both pages say so.
- **MC-2504** *(ADR-071)* Settings → Organization → Documents has Paper
  size, set to Automatic. With a Canadian registered address, an invoice's
  PDF is Letter. Choose A4 and save: the invoice, a credit note, a packing
  slip and the export's PDFs are all A4, an invoice issued before the
  change included. Back to Automatic: Letter again. The audit log shows
  each change. A member without organizations.update sees it read only.

## 26. Each organization's time zone (ADR-072)

Set the computer's own zone in System Settings → General → Date & Time, or
in Chrome with DevTools → More tools → Sensors → Location → Timezone
override, then reload.

- **MC-2601** *(ADR-072)* Register a new organization with the computer
  in Shanghai. Settings → Organization → Profile → Time zone shows China
  Standard Time (Shanghai), UTC+8 now · Asia/Shanghai, and what time it is
  there.
- **MC-2602** *(ADR-072)* An organization from before ADR-072 is on UTC:
  Time zone shows an amber note, Still on UTC. With the computer in
  Vancouver, press Use this computer's: Pacific Time (Vancouver): the box
  fills, the line below says what time it is in Vancouver, and Save time
  zone saves it, saying Time zone saved. The audit log's entry reads Time
  zone: Coordinated Universal Time (UTC) → Pacific Time (Vancouver). Save
  again unchanged: Save is greyed out, and no entry is added.
- **MC-2603** *(ADR-072)* Finding a zone: type pacific t, then +8: each
  finds its zones, each named with its city, its offset and its standard
  name, and This computer's zone comes first. After 5 pm in
  Vancouver, with the organization in Vancouver, choose Shanghai: The
  organization's today becomes Saturday … appears above Save; choose
  Vancouver again and it goes. Do not save.
- **MC-2604** *(ADR-072)* As an Admin or a Viewer, Time zone is read only,
  with the time there and An Owner can change it; no amber note, no Save.
- **MC-2605** *(ADR-072)* The organization's day, after 5 pm in Vancouver
  with the organization in Vancouver: Home's date is today, not tomorrow; a
  licence whose last day is today reads Expires today, and a run releases
  under it without an override; a packing slip made now prints today's
  date, and its file name carries it; a receipt in USD takes today's rate
  when tomorrow's is also entered; This month on a list's date range is
  this month; a CSV export's file name carries today's date. Void an
  issued invoice now: its page and its PDF say Voided with today's date,
  and the order's Documents tab names its shipment by today's. Issue,
  Void and Credit open on today's date, and a new exchange rate on today.
- **MC-2606** *(ADR-072)* Another clock: with the organization in
  Vancouver and the computer set to Shanghai, Home shows Vancouver's date
  and, under it, Dates follow the organization's time zone: Pacific Time
  (Vancouver). Times on screens, a stock movement's say, are Shanghai's.
  At 9 am on the 1st in Shanghai, still the last evening of the month in
  Vancouver, Stock movements with This month holds the movements made
  this afternoon in Vancouver, though their times read the 1st. Set the
  computer back to Vancouver: the note goes.
- **MC-2607** *(ADR-072)* In 简体中文 on a phone: 概况 → 时区 reads as
  the canvas does; typing 中国 finds 中国标准时间（Shanghai）; the time
  there, the note before saving and Home's note read in Chinese.
- **MC-2608** *(ADR-072)* With VoiceOver on, choose a zone: it reads It is
  … there once. Leave the page open three minutes: nothing more is read,
  though the time on screen moves on.
- **MC-2609** *(ADR-072)* Zone names: in Safari, with the computer in
  Kolkata, register a new organization. Profile → Time zone shows India
  Standard Time (Kolkata) in the box, and Save time zone is greyed out.
  Open the same organization in Chrome, which lists the zone as Calcutta:
  the box shows India Standard Time (Kolkata) too, typing kolkata finds
  it, and Save stays greyed out. Safari's list has no Etc/GMT zones.
- **MC-2610** *(ADR-072)* A computer on a zone the server does not take:
  in Chrome, override the timezone to Etc/GMT-3 (DevTools → Sensors) and
  register. The account is created, and Profile's Time zone is
  Coordinated Universal Time (UTC), with no This computer group in the
  list and no Use this computer's button.

## 27. Each organization's numbering (ADR-073)

Settings → Organization → Documents, as an Owner, in an organization with a
few invoices and orders.

- **MC-2701** *(ADR-073)* The Numbering section lists Invoices, Credit
  notes, Return authorizations, Sale orders and Purchase orders, each with
  its prefix, digits, Starts again, next number and Prints as. An
  organization from before ADR-073 shows INV-, CN-, RMA-, SO- and PO-, six
  digits, Never, the next number its documents reached, and Last: under it.
  Save numbering is greyed out until something changes.
- **MC-2702** *(ADR-073)* Click into the invoice prefix: Start from a
  common format offers INV-000001, INV-2026-0001, each year, and
  INV20261017-001, each day, with today's date; none uses /. Pick the
  yearly one: the prefix reads INV-{YYYY}-, 4 digits, Each year, Prints as
  INV-2026-0001, and From Jan 1, 2027: INV-2027-0001 beneath it. The date
  buttons put {YYYY}, {YY}, {MM} or {DD} where the cursor is.
- **MC-2703** *(ADR-073)* Type inv- in a prefix: it turns to INV- as
  typed. Set Starts again to Each year on INV-: Starting again each year
  needs the year in the prefix shows in red and Save stays greyed out; Add
  the date makes it INV-{YYYY}-. A prefix ending in a digit, or in the date,
  is refused the same way. Digits of 12, or a next number left empty, say
  why under the row, and a screen reader reads it on the field.
- **MC-2704** *(ADR-073)* Give purchase orders the prefix SO-: Sale orders
  and purchase orders would print the same numbers shows, both prefixes in
  red, and Save stays greyed out.
- **MC-2705** *(ADR-073)* Change a prefix and Save numbering: Change the
  numbering? lists each changed series with its next number and the last
  given, which stays. Cancel changes nothing; Change numbering saves, says
  Numbering saved, and the next document made prints the new prefix.
  Turning Keep invoices and credit notes in date order on or off alone
  saves with no dialog.
- **MC-2706** *(ADR-073)* Set the invoices' next number below the last
  given and save: the dialog shows the refusal, naming the invoice that
  carries that number, with Use and the lowest number accepted. Use puts it
  in the next number, and saving again goes through. Moving to a new prefix
  no document carries, such as F-, may start again at 1.
- **MC-2707** *(ADR-073)* With invoices on INV-{YYYY}-, Each year, open
  a draft's Issue dialog and date it 31 December last year: Dated in
  2025, so it takes 2025's next number, not 2026's shows under the date,
  and goes when the date is this year's. Issue it: the toast says Invoice
  issued as INV-2025-…, the next number of last year's series. The Credit
  and Void dialogs show the same line for a credit note's date.
- **MC-2708** *(ADR-073)* Turn on Keep invoices and credit notes in date
  order, issue an invoice dated today, then try to issue another dated
  yesterday: refused, naming the first and its date, with Change it on
  Organization → Documents, which opens the Documents tab; the Void and
  Credit dialogs offer the same for a credit note. An Admin sees the
  refusal without the link. Issued for today, it takes the next number,
  with no gap.
- **MC-2709** *(ADR-073)* As an Admin or a Viewer, Numbering is a table of
  each document, Starts again and Next to be given, says whether invoices
  and credit notes are kept in date order, and An Owner can change it, with
  no fields and no Save.
- **MC-2710** *(ADR-073)* On a phone (DevTools device toolbar, 390 px),
  each document is a row with its next number; tapping one opens its
  formats, date buttons and fields. In Chinese, the section reads 编号, with
  常用格式, 重新编号 and 打印为.
- **MC-2711** *(ADR-073)* Set purchase orders to PO/{YYYY}/ and make one:
  it is PO/2026/0001, and its PDF downloads as PO_2026_0001.pdf.
- **MC-2712** *(ADR-073)* History on the Organization page shows Numbering
  changed, with each changed series as it was and as it is.
- **MC-2713** *(ADR-073)* The lookup follows the organization's prefixes:
  set the invoices' prefix to QX-, issue one (QX-000001), and give an order
  the reference QX-000001. Typing QX-000001 in the top bar lists Invoices
  before Orders. With today's prefixes, typing SO- or PO- lists Orders
  first.

## 28. Text size (ADR-075)

Any page, signed in, in a browser at its default font size.

- **MC-2801** *(ADR-075)* Open the avatar menu: Text size sits under the
  colour mode and the language, reading Standard text. Open it: Standard
  text, Large text and Larger text, each drawn at the size it gives.
- **MC-2802** *(ADR-075)* Choose Larger text: every word on the page grows
  at once, the rail and the summary panel widen with it, and nothing else
  moves. Reload: it opens at Larger, with no flash of the smaller size.
  Open a second tab of the app: it is at Larger too, and changing it there
  changes the first tab.
- **MC-2803** *(ADR-075)* At Larger, walk Home, Inventory, SO-DEMO-1 and
  INV-000001 at 1280px wide: no label in the rail is cut sooner than at
  Standard, no page scrolls sideways (a table may, inside its own box),
  and quantities fit in the ship and receive dialogs' fields. A person's
  page keeps its labels on one line, and a record's History drawer and the
  People search widen with the text. In 简体中文 the captions under
  figures read comfortably.
- **MC-2804** *(ADR-075)* Set the browser's own font size to Large (Chrome:
  Settings → Appearance), then choose Large text: the text is larger than
  either alone, since the choice multiplies the browser's. Back to
  Standard text, the browser's size alone stands. Set the browser back.
- **MC-2805** *(ADR-075)* Sign out: the sign-in page shows the language,
  then Text size, above the card. Choose Large text: the page grows before
  signing in, and stays so after.
- **MC-2806** *(ADR-075)* With VoiceOver on (⌘ F5), open a product with a
  weight and Tab to its variant's chevron: it is read as Details of its
  SKU, collapsed; pressing it reads expanded.
- **MC-2807** *(ADR-075)* Turn on Reduce motion (macOS: System Settings →
  Accessibility → Display). The drawer below 1200px, menus and dialogs
  appear without sliding or fading, and the gallery's zoom jumps rather
  than eases. A loading spinner still turns.

## 29. The audit log in words (ADR-076)

Signed in as the demo Owner the seed prints.

- **MC-2901** *(ADR-076)* Records → Audit log, in English, then 中文 and
  Français: each entry's action, record type and details read in the
  language, with no id anywhere. An invoice drafted reads Tax code: GST
  and Shipment: SO-…, the shipment opening its order; an RMA, its lines
  by SKU, quantity and resolution, and its order and invoice by number;
  Sarah Chen's role change, Viewer → Admin, the role names in the
  language. The order's number opens the order, and the role opens
  Members.
- **MC-2902** *(ADR-076)* On Tax codes, rename GST to GST 5%. The audit
  log's earlier entries still say GST: a reference keeps the name it had
  when the entry was written.
- **MC-2903** *(ADR-076)* Sign in to an organization seeded before
  ADR-076. Its entries name no reference ("a tax code", "an order"), never
  showing an id, and each still opens its record where there is one.
- **MC-2904** *(ADR-076)* Export the audit log in 中文 and open the file:
  By holds the person's name then their email, Action and Record type are
  in Chinese, Record is the record's name, and Details is one line in
  words. There is no id column and no id anywhere in the file; a moment in
  the details reads like When, `2026-10-15 18:54:11`.
- **MC-2905** *(ADR-076, ADR-072)* Set the organization's time zone to
  China Standard Time (Shanghai). On the audit log, set From to 1 October
  and To to 7 October, and export: the export's entry reads From
  2026-10-01, To 2026-10-07, the days chosen, not the 8th that To is sent
  as. Export Your activity: its entry reads Person you. Signed in as Anika
  Sharma, the same entry reads Person one person.
- **MC-2906** *(ADR-076)* The audit log's Action filter names each action
  in the language, never by its code.

## 30. Invitations (ADR-077)

Signed in as the demo Owner the seed prints, on Settings → Members, with
Mailpit open.

- **MC-3001** *(ADR-077)* Invite: the dialog asks for Email, then the
  three roles as cards, each with its line saying what it lets a person
  do, Viewer chosen; Write to them in, starting at your own language; and
  A note from you, counting to 500. Invite `newcomer@example.com` as
  Admin, writing to them in 简体中文, with the note `<b>Dock 3</b>`, a line
  break, then `bring boots`, and Send invitation. A notice says it was
  sent, and Invited lists it: Admin, Invited by you, today, Emailed ·
  until the seventh day from now. Mailpit has one email, in Chinese,
  subject included. It opens 加入 and the organization's name, in words
  with no image. It names the demo Owner by name and by address, the
  role as 管理员 with its line saying what an Admin does, and the note
  under 来自 … 的留言 as typed (the tags shown as text, the line break
  kept). The link works until the end of its seventh day, named with the
  organization's time zone, and opens `/invitation?token=…` on the app's
  address, never the API's; the same address is written out for when the
  button does not open. It ends 由 … 代 … 发送, naming the app as
  MAIL_FROM does.
- **MC-3002** *(ADR-077)* With the account's language set to Français,
  open Invite: Write to them in starts at Français, and an invitation
  sent so is French, its role line too.
- **MC-3003** *(ADR-077)* Invite another address with Copy link instead:
  the dialog becomes Link copied, the link is on the clipboard and in a
  field with Copy again, it says the link works once until its last day
  and who joins by it, as what, and No email was sent. Mailpit has
  nothing for that address, and Invited reads Link copied · until ….
  Where the browser does not let the page copy (Safari, until you allow
  it), the dialog reads Your invitation link instead and asks you to copy
  the field, which is selected; it never says Link copied.
- **MC-3004** *(ADR-077)* On an emailed row, Resend: a notice, and a
  second email. Copy link on it: Link copied says the link in the email no
  longer works, and opening the first email's link says the invitation
  has ended. Copy link again: it says the link copied before no longer
  works. Revoke asks first, then the row goes with a notice; with
  nobody left, Invited is gone, heading and all.
- **MC-3005** *(ADR-077)* Invite your own address: Email says you are
  already a member here, as an Owner. Invite an address already on
  Invited: Email says when and by whom it was invited and until when its
  link works, with Resend instead; for one whose link has ended it says
  it ended, and Resend starts it again. With Members open in a second
  tab, invite an address there, then the same address here, with no
  reload: Email says it was already invited, with Resend instead.
- **MC-3006** *(ADR-077, ADR-076)* With Mailpit stopped, Send invitation:
  the dialog says Couldn't send the email, with Close, Try again and Copy
  link. Invited reads Email not sent, in the warning tone, and the audit
  log's Invitation sent entry reads Email not sent, in 中文 and Français
  too. Try again with Mailpit still stopped: it says it tried again, and
  at the next try how many more times.
- **MC-3007** *(ADR-077)* Sign in as Sarah Chen, an Admin: on Invite the
  Owner card is disabled and says only an Owner can invite an Owner, and
  an Owner's invitation on Invited has no Resend, Copy link or Revoke.
  Inviting that invitation's address says it was already invited, and
  that only an Owner can resend it, with no Resend instead. As Tom
  Becker, a Viewer, Members has no Invite and no Invited, and its line
  says an Owner or an Admin invites new members.
- **MC-3008** *(ADR-077)* Register a fresh organization and, without
  confirming its email, Send invitation from Members: the dialog asks you
  to confirm your own email first, naming it, with Resend confirmation,
  which sends it again.
- **MC-3009** *(ADR-077)* At 390 px wide in 中文: Invited's rows are cards,
  each with 重新发送, 复制链接 and 收回, its line ending 有效至 and the last
  day, and 邀请 opens the dialog full screen,
  a close button before its title and 发送邀请 and 复制链接，自己发送 at its foot.
  At Larger text (ADR-075), neither Members nor the dialog scrolls
  sideways.

The invitation page, in a private window unless a check says otherwise:

- **MC-3010** *(ADR-077)* Open MC-3001's link: the page is in 中文, the
  invitation's language, with the language and text size choices above
  it. It shows the organization's logo and name, 加入 …, who invited you,
  by name and by address as the email does, as 管理员 with what an Admin
  does, the note under 来自 … 的留言, and the address, read-only; at its
  foot, 此邀请的有效期到 … 结束, the same last day as the email's. The
  logo is sharp, and the Network tab shows no
  request to `/api/v1/files`. Type a name, then change the page's
  language: the name stays, and the page reads in the new one. Change it
  back and forth a dozen times inside a minute: once the reads are
  refused, the page stays in its language with the name kept, and says
  under the language choice that it couldn't change language just now.
  Give a name and a password, which its button shows as typed, and join:
  Home opens, as a member, in Chinese.
- **MC-3011** *(ADR-077)* Leave an organization from Account with a
  colleague's account, then invite its address: its link says you already
  have an account, with the address read-only, Password, Forgot your
  password?, Keep me signed in and Sign in and join, which signs in and
  joins.
- **MC-3012** *(ADR-077)* Signed in as someone else, open a link: This
  invitation is for … names it and you, with Sign out, after which the
  form shows. Signed in as the address, in no organization: You're signed
  in as …, with Not you? Sign out, and Join, in the account's own
  language, never switched to the invitation's.
- **MC-3013** *(ADR-077)* Signed in as a member of another organization,
  open a link to that address: You can't join with this account yet,
  saying why and until when, with Go to your account.
- **MC-3014** *(ADR-077, ADR-069)* With that account's deletion set on
  Account, open a link to it: Keep your account to join, naming the
  deletion day; Keep my account, and Join appears.
- **MC-3015** *(ADR-077, ADR-070)* A revoked or used link reads This
  invitation has ended, with Go to sign in. With the organization's
  deletion scheduled, a link reads … isn't taking new members, naming the
  day, and shows no form. With the API stopped, a link reads This
  invitation could not be opened, with Try again, which opens it once the
  API is back.
- **MC-3016** *(ADR-077, ADR-075)* At 320 px and Larger text, the page
  wraps without scrolling sideways.
- **MC-3017** *(ADR-077)* Signed in as Sarah Chen, an Admin, invite
  `gone@example.com` with a note, then leave the organization from
  Account. As the demo Owner, Resend it from Invited: the new email says
  the organization invited you, in its subject and its first line, with
  no name or address of Sarah's, and the note comes from the
  organization. Its link's page says the same.

## 31. Registration by invitation (ADR-078)

Locally, with the API restarted after each change to the root `.env`.

- **MC-3101** *(ADR-078)* With `REGISTRATION=open`, open `/register`
  and fill in the form; set `REGISTRATION=invitation`, restart the API,
  and press Create account: the page turns into Accounts here start from
  an invitation, with Joining where you work and Starting a new
  organization, and a screen reader reads that heading out; no account is
  made (signing in with that address is refused). An address that already has an account is refused the same
  way, never told it is taken. Set `REGISTRATION=open` again and register:
  it works as before. With the line removed and `NODE_ENV=development`, it
  is open.

The command, in `server/`, against the local database, with Mailpit open.
Neither `CLIENT_URL` nor `DATABASE_URL` is set in the shell: it never reads
`.env`, so it asks for both.

- **MC-3102** *(ADR-078)* `npm run org:invite`: it asks for the email of
  the person who sets it up, the organization name, the language (1, 2
  or 3, English when left empty), the app address (`http://localhost:5173`)
  and the database (your local `DATABASE_URL`, not shown as you type or
  paste it). A wrong answer, a mistyped database address too, is said and
  asked again. Ctrl-D or Ctrl-C at any question ends it: Cancelled.
  Nothing was written. It shows the
  database's host and name, the app, the address, the name and the
  language, and asks before writing: N writes nothing. Y prints
  Invitation made, the last day (seven days on), Nothing was emailed, the
  link, and a message to send in the language chosen (in 简体中文 for 3),
  with the link under it. Mailpit has nothing new.
- **MC-3103** *(ADR-078)* Run it again for the same address on one line:
  `CLIENT_URL=http://localhost:5173 npm run org:invite -- --email … --name
  "… Ltd."`. It asks for the database only, shows the language as
  English, then says the address already has an invitation until its last
  day and asks to replace it. Y prints Invitation replaced, with a new
  link and the message in English.
- **MC-3104** *(ADR-078)* For the demo Owner's address it refuses, saying
  the address already belongs to an organization, and writes nothing. A
  misspelt flag (`--emial`) is refused, pointing at `--help`, which prints
  each way to run it.
- **MC-3105** *(ADR-078)* `npm run org:invite -- --list` shows MC-3103's
  invitation under Waiting with its last day, and Ended, not accepted and
  Accepted as none. `npm run org:invite -- --revoke --email …` shows the
  invitation and asks; Y prints Revoked, and `--list` no longer shows it.

The pages, in a private window unless a check says otherwise.

- **MC-3106** *(ADR-078)* Open a link from MC-3102 signed out: the page is
  in the invitation's language, headed Set up …, with a dashed tile of the
  organization's initials (HH for Harbour Herbs, 海港 for 海港草本有限公司)
  and A new organization; You'll be its Owner,
  with what that lets them do; You can change the name later; the address
  read-only, with the line about a confirmation email and Not your
  address?. Give a name and a password and Set up: Home opens in the new
  organization with its welcome, whose first week starts with Confirm
  your email address (ADR-079), and Getting started at 0 of 7. Mailpit
  has the confirmation email; Settings → Organization → Profile shows
  this computer's time zone. Members → Invite asks you to confirm your
  own email first (MC-3008).
- **MC-3107** *(ADR-078)* With `OPERATOR_EMAIL=you@example.com` in `.env`
  and the API restarted, accept another organization invitation: Mailpit
  has "… was set up" to that address, naming who set it up, by name and
  address, and that their address isn't confirmed yet. With the line
  empty, no such email.
- **MC-3108** *(ADR-078)* With a colleague's demo account, Account →
  Leave, so it belongs to no organization. Issue an organization
  invitation to its address and open the link signed out: You already have
  an account…, with Sign in and set it up, which signs in and lands on the
  new organization's Home as its Owner; Account's recent activity lists
  Left an organization and Started an organization, in words. Signed in as
  the invited address while it belongs to an organization, the link reads
  You can't start an organization with this account yet, with Go to your
  account; signed in as another address, This invitation is for …, with
  Sign out. A revoked or replaced link reads This invitation has ended.
- **MC-3109** *(ADR-078)* As an account with no organization (MC-3108's,
  before accepting), Home shows Join an organization and Start an
  organization side by side, and Go to your account: no error. With
  `REGISTRATION=open`, the Start an organization card asks for the name;
  its Start an organization button lands on the new organization's Home
  with Getting started. With `REGISTRATION=invitation`, it says new
  organizations start from an invitation, with no form; set that while
  the form is open, and Start an organization turns the card into that
  sentence, a screen reader reading the card's heading out. With Home
  open in two tabs, schedule the account's deletion in one; in the other,
  Start an organization is refused and the deletion banner, with Keep my
  account, appears.
- **MC-3110** *(ADR-078)* With `REGISTRATION=invitation`, sign-in has no
  Create an account: New here? Accounts start from an invitation, with
  How to get one, which opens Accounts here start from an invitation, with
  Joining where you work, Starting a new organization and Sign in.
  `/register` typed in the address bar shows the same page; on a slow
  connection (DevTools, Slow 4G) it shows the language and text size at
  once, and a spinner until the page is known. In 中文 at 390 px wide and
  at Larger text (ADR-075), the organization kind of the invitation page,
  Accounts here start from an invitation and Home with no organization
  wrap without scrolling sideways, as on the canvas.

## 32. A newcomer's first sign-in (ADR-079)

- **MC-3201** *(ADR-079)* As the demo Owner, invite an address from
  Members → Invite, and accept it from Mailpit in a private window. Back as
  the Owner, within a minute the bell has … joined, reading … accepted your
  invitation and joined Demo … as a Viewer; Mailpit has no email about it.
  With Account's language set to 中文, the same entry reads …加入了 and
  …接受了您的邀请，以查看者身份加入 Demo …。 Choosing the entry opens
  the newcomer's page on People. As an Admin of the demo team, such as
  Daniel Okafor, invite another address, then leave the organization
  before it is accepted, and accept it: neither the Admin's bell, signed
  in with no organization now, nor the Owner's says so. (Whoever leaves
  is gone from this demo: walk MC-1903 first, or seed again.)
- **MC-3202** *(ADR-079)* Help on a computer, about 1280 to 1440 px wide:
  the top bar has Help, its icon and the word, between Search and the
  bell. On Orders, press it: Help slides in over the right of the page,
  under the bar, with nothing dimmed, and the button shows pressed. The
  page beneath still scrolls and its controls work. The guide is Orders,
  its title and sections, steps numbered and the permission notes set
  apart. At its foot, All guides lists Work, Records, Settings and You,
  only the pages you can open (as a Viewer: no Stock value, Audit log,
  Exchange rates or Price lists), then What you can do here is on Your
  account. Choose Inventory in the rail: Help now shows Inventory's guide.
  Choose Home in All guides: Home's guide shows and the page stays on
  Inventory. Follow See also in a guide: that page opens, with its own
  guide. Esc inside Help, or Close, shuts it, and focus is back on Help. A
  guide downloads only when Help shows it (DevTools, Network: the guide's
  file, `orders.md` locally, arrives as Help opens, and none before). With
  Help open on Locations, open Add location (Tab to it, as Help covers
  it at this width): the dialog sits in the room beside Help, the page
  behind it dimmed and Help not; Help scrolls under the mouse or a finger,
  pressing its links or Close does nothing, and Tab stays in the dialog.
  With VoiceOver on, Help is not read while the dialog is open. Cancel:
  Help works again. In a window narrower than about 1085 px, Help dims
  with the page and the dialog stays centred.
- **MC-3203** *(ADR-079)* Help on a wide screen, about 1900 px with the
  rail open or 1700 px folded: opening Help moves the page to the left,
  at its full width, and Help sits beside it without covering anything;
  closing Help puts the page back. Just below that width, Help is over
  the page again, as in MC-3202.
- **MC-3204** *(ADR-079)* Help on a phone, about 390 px: the bar shows
  Help as its icon alone. It opens full screen, headed Help · Orders, with
  Close, which returns to the page. On a real phone at 320 px wide (or
  DevTools) with Larger text (ADR-075), the organization shows its logo,
  or its initials, alone (VoiceOver reads the initials, then the name),
  and nothing scrolls sideways. At Standard and at Larger, on the phone
  and on a computer, every control in the bar,
  the organization and the search box among them, is a full fingertip
  wide and tall (44 px, DevTools' box model).
- **MC-3205** *(ADR-079)* Learn more: on a new organization's Home, each
  Getting started step's hint ends with Learn more, which opens Help at
  that step's section, scrolled to it and marked for a moment; with the
  system's Reduce motion on, it jumps there and the mark comes and goes
  without fading. An empty list, such as Production with no runs, has
  Learn more beside its words. Organization's Numbering (Documents) and
  Licences at release (Stock) have it beside their headings, Sign out
  after inactivity (Security) at the end of After's help, and Exchange
  rates, Stock value and Price lists at the end of their introductions.
  Closing Help puts focus back on the Learn more that opened it; in
  Safari, which focuses nothing pressed by mouse, on Help.
- **MC-3206** *(ADR-079)* Reading a guide in 中文: with Account's language
  set to 中文, open 帮助 on 订单, on a computer and on a phone (帮助 · 订单).
  The guide reads in Chinese, 创建订单 and the other sections, bold and
  links in place, with no space added between Chinese words; All guides
  reads 所有指南, grouped 工作, 资料, 设置 and 我. Learn more reads 了解更多,
  right after the words it follows, with no space before it.
- **MC-3207** *(ADR-079)* The welcome as a Viewer, on a computer: as the
  demo Owner, invite an address as a Viewer with a note of two lines, and
  accept it from Mailpit in a private window. Home leads with Welcome to
  Demo …, your name, above the counts: You joined today as a Viewer, and
  the card stays for your first two weeks, until the day fourteen days on.
  On the left, the note as typed, its line break kept, under the Owner's
  photo or initials, their name opening their page on People; then What
  you can do here, a line per area, ending To do more, ask … with each
  name opening People. On the right, Your first week, 0 of 3 done: Say
  who you are, Look up a product or a lot and Open an order, each with
  its button. The foot says Help is at the top, beside the bell. Open a
  product and come back: Look up is ticked and reads You opened … as a
  link to it. Dismiss: the card goes, focus moves to the greeting at the
  top of Home, and a message says What you can do here stays on Your
  account, with Undo; Undo brings the card back, focus on its title (Tab
  moves on from there), and a reload keeps it. Dismiss
  again and reload: Home as usual. As an Admin of the demo team, invite
  an address with a note and leave the organization before it is
  accepted; once accepted, the card's note reads From Demo … with no
  name. (Whoever leaves is gone from this demo, as in MC-3201.)
- **MC-3208** *(ADR-079)* The welcome as an Admin joined by a copied
  link: invite as an Admin with Copy link, and open the link in a private
  window. The first week starts with Confirm your email address: We sent
  a link to … Inviting colleagues waits until you confirm, with Resend the
  link, which then reads Sent, with focus on it (with the server stopped,
  it says Could not reach the server. and stays). What you can do here
  says each thing once with all its verbs, a semicolon between phrases:
  Orders reads See purchase and sales orders; raise, change, confirm and
  cancel orders; …, and Invoices and returns … change and delete drafts;
  authorize, cancel and close returns. With VoiceOver, each phrase is
  heard apart. It has no To do more, ask … line. The yellow banner asking to
  confirm is not on Home, not even for a moment as Home opens, and is on
  Orders and every other page. Confirm from Mailpit: Home ticks
  Confirmed, and the banner is gone everywhere. Add a photo on Your
  account: Say who
  you are reads Photo added, opening Account. Receive stock or raise an
  order: it is ticked, naming what you did as a link to it.
- **MC-3209** *(ADR-079)* The welcome for a founder: set up an
  organization from `npm run org:invite`'s link. Home's card reads You
  started this organization today, then in one line You may do everything
  here, including settings and closing the organization, and Setting up
  the organization is in Getting started, below. The card sits above
  Getting started, and its first week has only Confirm your email address
  and Say who you are.
  Dismiss Getting started, as its Owner, and reload: the first week grows
  to the founder's work, Look up, Receive stock and Raise an order.
- **MC-3210** *(ADR-079)* The welcome in 中文 on a phone, about 390 px,
  with Account's language set to 中文: as MC-3207's Viewer, the card reads
  欢迎来到 Demo …，your name, and 您今天以查看者身份加入。这张卡片在首页显示两周，到
  the day. One column: the note, then 您的第一周 with 已完成 0/3, then one
  row, 您在这里可以做什么 with how many areas and 点开查看, which opens the
  areas on a tap and closes them on another; then the foot about 帮助.
  The card is about a screen long, and nothing scrolls sideways at Larger
  text either. 隐藏 shows 欢迎卡片已隐藏… with 撤销. As MC-3209's founder,
  您在这里可以做所有事情 comes first, above 您的第一周, and no row folds.
- **MC-3211** *(ADR-079)* The demo's newcomer, and People's New. On a
  freshly seeded demo, the Owner's Home has no welcome, nor has any of the
  team's but Fatima Haddad's: she joined three days ago by the Owner's
  invitation. Sign in as her (after MC-1903, which counts on her never
  having signed in): her Home leads with the welcome, You joined on the
  day as a Viewer, the Owner's note about Chloé under the Owner's
  initials, and her first week at 0 of 3. As the demo Owner, People marks
  Fatima alone New · joined and her day, and the line under the title
  adds 1 joined in the last two weeks; after MC-3207, the newcomer too,
  New · joined today, and 2 joined; the faces in a row stay level. In
  中文, 新加入 · 今天; in Français, Nouveau · depuis aujourd’hui.
- **MC-3212** *(ADR-079)* Your access on Account: as MC-3207's Viewer,
  Account has Your access at Demo …, below your details: Viewer, the line
  Looks at orders, stock and invoices, and changes nothing, then What you
  can do here as on the card, with To do more, ask … opening People. It is
  there with the card dismissed. As the demo Owner, it reads Owner, its
  line, and You may do everything here, in one line.

## Regressions

Bugs a person could have noticed, checked again on every walkthrough. Newest
first.

- **MC-R22** *(#144)* Locally, with `REGISTRATION=open`, sign in as one
  of the demo's team who is not the last Owner, such as Tom Becker (who
  is then gone from this demo: walk MC-1903 first), in two
  browsers side by side, A and B (or a normal and a private window), both
  on Home. In A: Account → Leave … (the button names the organization):
  A's Home offers Join an organization and Start an organization. Click
  into B: with no reload, it shows the same Home with no organization. In
  A: Start an organization, named Reid Supply Co.: A lands on its Home
  with Getting started. Click into B: with no reload, it shows Reid Supply
  Co.'s Home, as A does, and Start an organization is gone; a reload
  still shows Reid Supply Co.'s Home. The same when A accepts an
  invitation, or an
  organization invitation from `npm run org:invite`, instead of starting
  one.
- **MC-R21** *(links in an audit entry)* On Records → Audit log, an
  entry whose detail names something you may open, such as Invitation
  sent's role: the name is underlined as well as in the accent, before any
  hover, so it is told from the words beside it without its colour. It
  opens its page, Members for a role.
- **MC-R20** *(dialogs on a phone)* In Français, at 320 px with Larger
  text, open Emplacements → Ajouter un emplacement: Ajouter un emplacement
  sits under Annuler at the right, inside the dialog, and the dialog does
  not scroll sideways. In English, Cancel and Add location fit side by
  side. At 1280 px they sit side by side in both.
- **MC-R19** *(Home on a phone)* In an organization whose Getting started
  is done or dismissed, open Home at 320 px: To ship, To receive and
  Expiring soon each fill the width, one under another, and the page does
  not scroll sideways. At 1280 px they sit side by side as before.
- **MC-R18** *(buttons on a phone)* At 320 px with Larger text, open
  Inventory, Orders and Account. Inventory's Export, Trace a lot and Refresh
  wrap onto a second line at the right; Account's Change password and Your
  devices wrap; on Organization → Profile, Download everything (ZIP) breaks
  onto two lines inside its button. On Orders, Invoices and Movements the
  two dates and Period wrap under the search. No page scrolls sideways. At 1280 px, at
  Standard, every button reads on one line as before.
- **MC-R17** *(audit log on a phone)* On a phone (DevTools, 390 px), open
  Records → Audit log with a few Numbering changed entries: the action, from
  and to filters wrap onto lines of their own, the page does not scroll
  sideways, and each entry reads as sentences in a column wide enough for
  them, the table scrolling inside its box to show By, When and From. Your
  activity on Account the same.
- **MC-R16** *(banner on a phone)* As an Owner, schedule the organization's
  deletion, then view any page at 390 px and at 320 px: the banner's words
  sit beside its icon, and Download everything, Cancel deletion and × move
  under them, wrapping if they must; nothing runs off the screen. On a
  desktop they stay to the right of the words. Cancel the deletion.
- **MC-R15** *(organization page)* At 1280 px, Settings → Organization →
  Profile does not scroll sideways. Change the time zone with VoiceOver on:
  the new zone is still announced.
- **MC-R14** *(audit dates)* In Records → Audit log, change something,
  then set both dates to today: the change is listed. Before, To left out
  its own day. Do the same on Your activity, and export each: the file
  holds the same entries.
- **MC-R13** *(address log)* On Organization → Profile, change the
  registered address's first line and save. The audit log's entry shows
  the line it had before and the new one, not only the new one. Save again
  without changing anything: no new entry appears. Then empty the second
  line alone and save: an entry shows it going, Suite 200 → —.
- **MC-R12** *(error page)* Make a page crash while you are on it (for
  a developer: throw in a page's render), so it shows Something went
  wrong. Press Go back: the page before shows. Crash it again, then choose
  another page from the menu: that page shows, not the message. Go home
  the same. Reload on the broken page still shows the message.
- **MC-R11** *(#120)* On Account, Change password with a wrong current
  password: the refusal says to check it and try again, and the Current
  password field turns red; with VoiceOver, Tab back to it: it reads as
  invalid, followed by the refusal. Under it, Forgotten it? Email me a reset
  link: press it, and it says a link is on its way to your address, and you
  are still signed in; the email arrives (Mailpit), and finishing the reset
  signs you out everywhere. The same in Delete my account and in closing an
  organization, in 简体中文 too (密码不正确。请检查后重试。, then
  忘记了？给我发送重置链接). Signed out, a wrong password marks both Email
  and Password, never just one.
- **MC-R10** *(#122)* As the only member of an organization, on Account,
  choose Delete my account: the dialog closes the organization too.
  Download everything, then cancel: "Your recent work" lists Everything
  downloaded at once. Open it again and confirm: Organization deletion
  scheduled is listed too, with no reload.
- **MC-R09** *(#119)* As a member whose account has no language chosen
  (`update users set locale = null`), with the browser in 简体中文, open
  Account: Language reads 未选择, with a line saying emails follow it once
  chosen, though the screens are Chinese. Choose 简体中文: the line goes,
  and a reload still shows it. As the Owner, schedule the organization's
  closing and cancel it (MC-2401): this member's two emails are Chinese.
  A language chosen from the account menu instead shows on Account at
  once.
- **MC-R08** *(#121)* On any signed-in page, press Tab once: "Skip to
  content" appears at the top left. Press Enter: the next Tab reaches the
  page's own first control, not the rail or the bar. A screen reader's
  landmarks list a main region.
- **MC-R07** *(axe-core 4.14)* With VoiceOver on, Tab to your circle at the
  right of the top bar: it reads your initials first, then "signed in as"
  and your email, in English, French and Chinese. With Voice Control on,
  saying "Click" and the initials the circle shows opens the menu. With a
  photo instead of initials, it reads the same.
- **MC-R05** *(found building ADR-052)* Duplicating an order keeps the
  reference and expected date typed in its dialog; they were silently
  dropped. See MC-403.
- **MC-R04** *(#20)* With the computer's time zone set west of UTC
  (America/Vancouver), in the evening: receive a lot expiring 10 Oct, set an
  order's expected date, and give a licence an issue and an expiry date.
  Each shows as the day typed on every screen and in its edit dialog, and
  the audit log shows days, not timestamps — including entries recorded
  before migration 0038. On a dev database that had dates before 0038, the
  dates read the same after `npm run migrate:all` as before (ADR-052).

- **MC-R01** *(seed:volume)* Issuing an invoice to a customer created
  without a billing address is refused with the reason, not a server error.
  See MC-702.
- **MC-R02** *(v0.5 round 2)* On a variant's Recipe panel, switching variant
  right after an action keeps the right recipe on screen: a reload that
  answers late never shows the previous variant's recipe.
- **MC-R03** *(v0.5 round 2)* The credit calculation was moved into
  `credit-amounts.ts`: MC-709 and MC-710 are its check.
- **MC-R06** *(ADR-055)* Signed in with an unconfirmed email, Print an
  invoice: the "Confirm your email address" banner is on screen and not in
  the PDF, which the server draws from the invoice alone (ADR-071). The
  demo's own accounts start confirmed, so register one, leave it
  unconfirmed, and give its address to `npm run seed:demo -- <email>`,
  which fills it and leaves its address as it is.

---

## Changes to this list

- 2026-10-01: first version, covering v0.4 (money) and ADR-051 (performance).
- 2026-10-02: ADR-051 part 2: MC-301 rewritten for the paged list, MC-308
  and MC-309 added, MC-802 and MC-1201 extended.
- 2026-10-01: the v0.5 round-2 walkthrough folded in: MC-109, MC-306,
  MC-307, MC-507, MC-611 to MC-613, MC-709, MC-710, MC-R02, MC-R03; MC-204
  and MC-610 made explicit.
- 2026-10-02: ADR-050, the check at release: MC-508 and MC-509 added.
- 2026-10-02: ADR-050 screens: MC-506, MC-508 and MC-509 rewritten for the
  release dialog and the run page; MC-510 and MC-511 added.
- 2026-10-02: ADR-052 (#20), calendar days as `date`: MC-307, MC-402 and
  MC-511 extended; MC-R04 added.
- 2026-10-03: ADR-053, backups: section 13, MC-1301 to MC-1304.
- 2026-10-02: the Duplicate order fix: MC-403 rewritten, MC-R05 added.
- 2026-10-04: ADR-054, client foundations: section 14, MC-1401 to MC-1404.
- 2026-10-04: ADR-054, the signed-out pages: MC-1405 and MC-1406.
- 2026-10-04: ADR-054, the frame: MC-1406 extended.
- 2026-10-04: ADR-054, the shared components: MC-1406 extended.
- 2026-10-04: ADR-054, the account: MC-1406 extended.
- 2026-10-04: ADR-054, products: MC-1406 extended.
- 2026-10-04: ADR-054, product names in other languages: MC-1407, MC-1408.
- 2026-10-04: ADR-054, partners: MC-1406 extended.
- 2026-10-04: ADR-054, a partner's document languages: MC-1409.
- 2026-10-05: ADR-054, locations: MC-1406 extended.
- 2026-10-05: ADR-054, inventory: MC-1406 extended, MC-1410.
- 2026-10-05: ADR-054, orders and their lines: MC-1406, MC-1410 extended.
- 2026-10-05: ADR-054, receiving, shipping and returns: MC-1406, MC-1410 extended.
- 2026-10-05: ADR-054, invoices and credit notes: MC-1406, MC-1410 extended.
- 2026-10-05: ADR-054, returns (RMAs): MC-1406, MC-1410 extended.
- 2026-10-05: ADR-054, production: MC-1406, MC-1410 extended.
- 2026-10-05: ADR-054, recipes: MC-1406, MC-1410 extended.
- 2026-10-05: ADR-054, costs: MC-1406, MC-1410 extended.
- 2026-10-05: ADR-054, licences: MC-1406 extended.
- 2026-10-05: ADR-054, price lists: MC-1406, MC-1410 extended.
- 2026-10-05: ADR-054, settings: MC-1406, MC-1410 extended.
- 2026-10-05: ADR-054, the organization's languages: MC-1411, MC-1408 reworded.
- 2026-10-06: ADR-054, members: MC-1406 extended.
- 2026-10-06: ADR-054, audit: MC-1406 extended; step 3 complete.
- 2026-10-06: ADR-054, printed documents: MC-1412; step 5 complete.
- 2026-10-06: ADR-054 step 6 begins: the server answers in the request's
  language, sign-in and account first: MC-1413.
- 2026-10-06: ADR-054, emails and notifications in the recipient's
  language: MC-1414.
- 2026-10-06: ADR-054, MC-1405 (the fluent review) skipped for now,
  recorded as such.
- 2026-10-06: ADR-054, `e2e/languages.spec.ts` covers a bilingual printed
  invoice and a French screen with a French refusal; MC-1412 and MC-1413
  remain for what a browser test cannot judge (glyphs, layout on paper).
- 2026-10-06: ADR-054, `seed:demo` sets up a French-and-English and a
  Chinese customer with an issued invoice each, so MC-1407 to MC-1412
  start from a fresh database.
- 2026-10-06: `seed:demo` adds a range around the first product for the
  screens (`seed-demo-variety.ts`); the figures listed under *Before you
  start* are unchanged.
- 2026-10-07: ADR-055 step 1 begins: printed documents on their own
  theme, section 15, MC-1501.
- 2026-10-07: ADR-055 step 1, the tokens and the theme built from them:
  MC-1502 to MC-1506. Covers dark mode and narrow screens, which the
  list lacked.
- 2026-10-07: the email banner no longer prints: MC-R06.
- 2026-10-07: ADR-055 step 2, the rail, the drawer and the slim top bar:
  MC-1507 to MC-1511.
- 2026-10-07: ADR-055 step 5, the order page: tabs, the summary and its
  money: MC-1512 to MC-1516.
- 2026-10-07: ADR-055 step 5, the order page's items and lots: quantities
  to read, Credited, the line menu, expiry: MC-1517 to MC-1519.
- 2026-10-07: ADR-055 step 5, orders part 3: Ship in the summary, its
  quantities, the Invoices and credits and History tabs: MC-1520 to MC-1524.
- 2026-10-07: ADR-055 step 5, the orders list: MC-1525 to MC-1527.
- 2026-10-07: ADR-055 step 5, inventory: MC-1528 to MC-1530.
- 2026-10-07: ADR-055 step 5, invoices: MC-1531 to MC-1533.
- 2026-10-07: ADR-055 step 5, returns and RMAs: MC-1534 and MC-1535.
- 2026-10-07: ADR-055 step 5, production: MC-1536 and MC-1537.
- 2026-10-07: ADR-055 step 6, dark mode, narrow screens, touch and keyboard:
  MC-1538 to MC-1543. Contrast and names are checked by accessibility.spec.
- 2026-10-07: ADR-055 step 5, orders polish from the first screenshots:
  MC-1544 and MC-1545.
- 2026-10-07: ADR-055 step 5, products: MC-1546.
- 2026-10-07: ADR-055 step 5, partners: MC-1547.
- 2026-10-07: ADR-055 step 5, locations: MC-1548.
- 2026-10-07: ADR-055 step 5, the order closer to the mockup: MC-1549.
- 2026-10-07: show and hide on password fields: MC-1550.
- 2026-10-07: a password shown hides again on submit: MC-1551.
- 2026-10-07: ADR-055 step 5, needs a cost and Stock value: MC-1552.
- 2026-10-07: units take their plural in every language: MC-1553.
- 2026-10-07: ADR-055 step 5, the settings pages: MC-1554.
- 2026-10-07: the short chip under the outstanding figure: MC-1555.
- 2026-10-07: ADR-056 step 6, the lookup in the top bar: MC-1556.
- 2026-10-07: ADR-056 step 6, search on the lists: MC-1557.
- 2026-10-07: ADR-057 step 6, dates, sorting and exports on every list: MC-1558.
- 2026-10-08: ADR-058, Home, what needs attention first: MC-1559.
- 2026-10-08: ADR-059, files on R2, served through the app: MC-1601, MC-1602.
- 2026-10-09: ADR-061, the Organization page in tabs and its name: MC-1701.
- 2026-10-09: ADR-060, branding and the organization's expiry days: MC-1702.
- 2026-10-09: ADR-062, product images: MC-1801.
- 2026-10-09: ADR-063, people: MC-1901.
- 2026-10-09: ADR-064, licence expiry reminders: MC-2001.
- 2026-10-09: ADR-065, staying signed in: MC-2101.
- 2026-10-12: ADR-066, covers in the lookup: MC-2201.
- 2026-10-12: ADR-061's links from the invoice refusals, to Profile and to
  the customer: MC-1703 added, MC-702 rewritten.
- 2026-10-13: ADR-046 amended, a taxed invoice needs the tax number: MC-711.
- 2026-10-14: ADR-069, leaving an organization and deleting your account:
  section 23, MC-2301 to MC-2303.
- 2026-10-14: ADR-054, the password change and the deletion emails in the
  language of the request for an account with none chosen: MC-1414
  extended.
- 2026-10-15: ADR-070, closing an organization: section 24, MC-2401 to
  MC-2406.
- 2026-10-15: MC-2401 says "by you" and checks the README's language;
  MC-2405 adds an only member who leaves, is removed or is demoted.
- 2026-10-15: section 24 reads "I don't need a copy", after the
  walkthrough in Chinese.
- 2026-10-15: the top bar's account button is named from the initials it
  shows (WCAG 2.5.3): MC-R07.
- 2026-10-15: a skip link and a main landmark on signed-in pages (#121):
  MC-R08.
- 2026-10-15: the Account page shows and saves the account's own language
  (#119): MC-R09.
- 2026-10-15: the Account page's recent work reads again after its
  dialogs close (#122): MC-R10.
- 2026-10-15: the password refusals say what to do next (#120): MC-1413
  updated.
- 2026-10-15: a refused password is marked on its field (#120): MC-R11.
- 2026-10-15: the password refusals leave the way on to the screen
  (#120): MC-1413 updated.
- 2026-10-15: the way on from a refused password is on the screen, beside
  the refusal (#120): MC-R11 rewritten.
- 2026-10-15: Reset your password beside a refused password, one press
  to the reset page (#120): MC-R11 rewritten.
- 2026-10-15: Email me a reset link replaces the sign-out and reset page
  beside a refused password (#120): MC-R11 rewritten.
- 2026-10-16: section 25, documents as PDF: Print and Download PDF
  (ADR-071): MC-2501.
- 2026-10-16: the export's documents, glossary and plainer times (#118,
  ADR-071): MC-2502.
- 2026-10-16: the export's README follows the app's language (#118):
  MC-2502 extended.
- 2026-10-16: orders numbered SO- and PO- (ADR-071, amended): MC-2503.
- 2026-10-16: the order's number heads its page and leads the list
  (ADR-071): MC-2503 extended.
- 2026-10-16: each organization's paper size (ADR-071): MC-2504.
- 2026-10-16: every CSV writes its times as a spreadsheet opens them
  (ADR-057, amended): MC-1558 extended.
- 2026-10-16: an order named by its number wherever it appears (ADR-071):
  MC-2505.
- 2026-10-16: a site's address, for deliveries and returns (ADR-071):
  MC-2506.
- 2026-10-16: a purchase order's Deliver to and an RMA's Send back to,
  each a site (ADR-071): MC-2507, MC-2508.
- 2026-10-16: the purchase order, pro forma and RMA as PDFs, and a foot
  on every document's pages (ADR-071): MC-2509 to MC-2512.
- 2026-10-16: the print pages retire, so printing is always the PDF
  (ADR-071): MC-703, MC-1412, MC-1501, MC-1539 and MC-R06 rewritten.
- 2026-10-16: a broken page can be left by the menu, Back or Go home,
  and its message offers Go back: MC-R12.
- 2026-10-16: after ADR-071's review: MC-2501, MC-2507, MC-2509, MC-2510
  and MC-2511 extended; MC-2401, MC-1406 and MC-R08 rewritten, and MC-R12
  moved to its place, newest first.
- 2026-10-16: a registered address change keeps what it replaced in the
  audit log: MC-R13.
- 2026-10-17: section 26, each organization's time zone (ADR-072):
  MC-2601 to MC-2608.
- 2026-10-17: zone names under the database's current spelling, and a
  computer's zone the server does not take: MC-2609 and MC-2610.
- 2026-10-17: the days still read in UTC or the computer's zone, a void
  date, a shipment's, the dialogs' and a list's date range: MC-2605 and
  MC-2606 extended.
- 2026-10-17: the audit log's To keeps its last day: MC-R14.
- 2026-10-17: Chrome's picker names zones as the server stores them:
  MC-2609 rewritten.
- 2026-10-17: a registered address line cleared on its own is logged:
  MC-R13 extended.
- 2026-10-18: ADR-073, each organization's numbering: section 27, MC-2701
  to MC-2712.
- 2026-10-18: a date-order refusal links to Organization → Documents:
  MC-2708 extended.
- 2026-10-18: a bad digits or next number says why: MC-2703 extended.
- 2026-10-18: ADR-073, the lookup by the organization's prefixes: MC-2713.
- 2026-10-18: ADR-075, the text size: section 28, MC-2801 to MC-2805.
- 2026-10-18: a variant's chevron is named: MC-2806.
- 2026-10-18: ADR-075, less motion when asked: MC-2807.
- 2026-10-18: the time zone's announcer widened the page: MC-R15.
- 2026-10-18: a banner's buttons on a phone: MC-R16.
- 2026-10-18: the audit log on a phone: MC-R17.
- 2026-10-18: rows of buttons and long labels on a phone: MC-R18.
- 2026-10-18: the date range on a phone: MC-R18 extended.
- 2026-10-18: Home's cards on a phone: MC-R19.
- 2026-10-18: widths that hold text on a person's page, in History and on
  People: MC-2803 extended.
- 2026-10-18: a dialog's buttons on a phone: MC-R20.
- 2026-10-18: initials by the name's script: MC-1902.
- 2026-10-18: the top bar's label follows the page's language: MC-1902
  extended.
- 2026-10-18: a mixed name takes its Latin words wherever they sit:
  MC-1902 extended.
- 2026-10-18: the demo's team and their work: Before you start, MC-1903.
- 2026-10-18: the audit log in words (ADR-076): section 29, and section
  14's audit item.
- 2026-10-19: invitations (ADR-077), the email: section 30.
- 2026-10-19: a link in an audit entry is underlined: MC-R21.
- 2026-10-19: the demo's own accounts start confirmed: MC-R06 rewritten.
- 2026-10-19: invitations (ADR-077), Members: section 30 rewritten for
  Invite and Invited.
- 2026-10-19: invitations (ADR-077), the invitation page: MC-3004 extended,
  MC-3010 to MC-3016.
- 2026-10-19: Add member gone (ADR-077): MC-1550 names the invitation
  page instead.
- 2026-10-19: Getting started's Invite your team (ADR-077): MC-1559
  extended.
- 2026-10-20: ADR-078, the server: section 31, MC-3101.
- 2026-10-20: ADR-078, the command: MC-3102 to MC-3105.
- 2026-10-20: ADR-078, the client: MC-3101 rewritten for the By invitation
  page; MC-3106 to MC-3110 added.
- 2026-10-20: another device's session finds its organization again
  (#144, ADR-079): MC-R22.
- 2026-10-20: ADR-079, the server: section 32, MC-3201.
- 2026-10-20: Inventory's row actions for whoever may see stock: MC-310.
- 2026-10-20: ADR-079, Help: MC-3202 to MC-3206.
- 2026-10-20: a dialog opened with Help open sits beside it, Help above
  its dimming: MC-3202 extended.
- 2026-10-20: every target in the top bar is 44 px at any text size:
  MC-3204 extended.
- 2026-10-20: ADR-079, the welcome, your access, the bell and People:
  MC-3201 extended, MC-3207 to MC-3212.
- 2026-10-20: the first week's Resend the link keeps focus and says why it
  failed: MC-3208 extended.
- 2026-10-20: Undo puts focus on the welcome it brings back: MC-3207
  extended.
- 2026-10-20: closing Help in Safari puts focus on Help: MC-3205 extended.
- 2026-10-20: the banner never shows for a moment on Home: MC-3208
  extended.
- 2026-10-20: the organization's initials are read with its name: MC-3204
  extended.
- 2026-10-20: section 32 read as walked: MC-3201, MC-3207 to MC-3209 and
  MC-R22 reworded, and MC-3106 names the welcome.
- 2026-10-20: the demo's team joined months ago, Fatima Haddad three days
  ago by an invitation with a note: MC-3211 rewritten.
- 2026-10-20: dismissing the welcome or Getting started puts focus on
  Home's greeting: MC-1559 and MC-3207 extended.
- 2026-10-20: what you can do here says a thing once with its verbs:
  MC-3208 extended.
- 2026-10-20: what you can do here sets its phrases apart by semicolons:
  MC-3208 extended.
- 2026-10-20: the Chinese invitation and Invited say a link works through
  its last day: MC-3009 and MC-3010 extended.
