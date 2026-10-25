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
Admins, Sarah promoted from Viewer; **Chloé Tremblay** is a Viewer; **Tom
Becker** holds **Warehouse** and **Fatima Haddad** **Sales**, two roles the
Owner made from templates (ADR-080), and Fatima has never signed in. Each record
above has its creation in History, by the Owner, and what the team did is in
History as theirs: the **Richmond warehouse**, with zones, an aisle,
shelves, a fridge and a **Quarantine**; **MAGCAP** in three sizes;
**PO-DEMO-7** bought in euros, and **PO-DEMO-9** three days late, priced
from **Lakeshore Packaging 2026**; **PO-DEMO-11** confirmed and waiting to
be received, melatonin in lots; lot **VC-0301** expired and quarantined;
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
- **MC-1409** On a partner, Document languages: left alone, the first
  reads The organization's default and the second Nothing else, never a
  blank box. The first offers the
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
  in as the demo Owner, in Français, Move everyone to… on Owner's page,
  to Admin: the refusal, that ownership is transferred first, is French. In 简体中文, ship more than an order has outstanding, cancel an
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
  then `npm run i18n:check` in client/ and server/, and one commit. A
  later round reads only what changed: `node scripts/i18n-review.mjs
  export --since <commit>`, the commit the last round was exported at,
  writes `review/fr-CA.since-<commit>.xlsx` and its Chinese pair beside
  the full export, not over it. Its rows are the messages new since, or
  whose English or translation changed, the last column saying which;
  English changed only in its apostrophes or quotation marks is left out,
  and the count printed. A commit git cannot find is refused. Import reads
  either file, and names a corrected row whose message was removed since,
  writing nothing until that row's Correction is cleared.
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
  "Voids invoice" chip beside its number. CN-000001's own page reads
  "Credits invoice" there, « Crédite la facture » in Français and 冲减发票
  in 中文, never the Credit button's 开具贷项.
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
  new organization: Getting started leads with seven steps, straight after
  the welcome, its first open step's button the only filled one on Home,
  and the quick actions after it, outlined; add a location and
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
  sideways. Rename the organization: the rail's top, and below 1200 px the
  top bar, show the new name after Save, the History button lists the
  change, and an invoice issued before still prints the old name. In 中文
  the tabs read 概况, 财务, 单据 and 库存.

- **MC-1702** Branding (ADR-060). As an owner, Settings → Organization →
  Branding: upload a PNG logo and an SVG one in turn; each previews on both
  sidebar shades, and after Save the logo replaces the name at the rail's
  top, and below 1200 px in the top bar (on a white plate on the dark rail,
  and in dark mode). Choose Teal and Save: buttons, links and
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
  Remove one by its menu: focus is on Undo, and the message stays while
  focus or the pointer is on it, well past five seconds, and still once
  the pointer has passed over it and gone; Enter: it is back. Remove one, Tab away and wait: after a reload it is gone. The Products list and Inventory show each cover; a
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
  role, Sarah Chen an Admin, Tom Becker Warehouse and Fatima Haddad Sales,
  and the audit log filtered to Member’s roles changed has one entry, by the
  Owner, Sarah from Viewer to Admin; filtered to Role made, two, Warehouse
  and Sales, each with what it grants in words. On People, Fatima Haddad's
  card shows only her name and role. Open each colleague's page: as the Owner,
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
  (Mailpit) says the account will be deleted after that same day, and
  that Keep my account, in the banner at the top of every page, keeps it. With
  the computer's time zone set to Vancouver, asked for after 17:00, the
  banner and the email still name the same day. With the server stopped,
  Keep my account says it could not reach the server and the banner
  stays; with it running, the banner gives way to "Your account will not
  be deleted.", which a screen reader reads, and a second email says so.
  Delete it again from Account without reloading: the banner is back, with
  its Keep my account, in place of that line.
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
  the line under it says what is still needed, the download with its
  alternative in brackets, then the name and the password; in 中文
  还需要：下载全部数据（或勾选“我不需要下载全部数据”）、组织名称和您的密码。 It stays off until the
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
- **MC-2404** Schedule it again, without reloading after MC-2403's
  cancel: the banner is back, with Cancel deletion, in place of "… will
  not be deleted.". Then move the day two days back
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
  Time zone shows an amber note, Still on UTC. In Français it ends « le
  soir, dans les Amériques, il est déjà demain en UTC. » With the computer in
  Vancouver, press Use this device's: Pacific Time (Vancouver): the box
  fills, the line below says what time it is in Vancouver, and Save time
  zone saves it, saying Time zone saved. The audit log's entry reads Time
  zone: Coordinated Universal Time (UTC) → Pacific Time (Vancouver). Save
  again unchanged: Save is greyed out, and no entry is added.
- **MC-2603** *(ADR-072)* Finding a zone: type pacific t, then +8: each
  finds its zones, each named with its city, its offset and its standard
  name, and This device's zone comes first; on a phone in 中文 the group
  reads 本设备. After 5 pm in Vancouver, with the organization in
  Vancouver, choose Shanghai: The organization's today becomes Saturday …
  appears above Save; choose Vancouver again and it goes. Do not save.
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
  and the order's Documents tab names its shipment by today's, as its
  Shipments tab heads it and its Void dialog says Recorded. Issue,
  Void and Credit open on today's date, and a new exchange rate on today.
- **MC-2606** *(ADR-072)* Another clock: with the organization in
  Vancouver and the computer set to Shanghai, Home shows Vancouver's date
  and, under it, Dates follow the organization's time zone: Pacific Time
  (Vancouver), then, for an Owner, Change the time zone, which opens
  Organization → Profile; an Admin or a Viewer has no link. Times on
  screens, a stock movement's say, are Shanghai's.
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
  Coordinated Universal Time (UTC), with no This device group in the
  list and no Use this device's button.

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
  formats, date buttons and fields, each labelled on its box: Prefix,
  Digits, Starts again and Next number. In Chinese, the section reads
  编号, with 常用格式, 重新编号 and 打印为.
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
  Français: the intro says a field with an arrow changed from the first
  value to the second, as Help does, and each entry's action, record type
  and details read in the language, with no id anywhere. An invoice drafted reads Tax code: GST
  and Shipment: SO-…, the shipment opening its order; an RMA, its lines
  by SKU, quantity and resolution, and its order and invoice by number;
  Sarah Chen's role change, Viewer → Admin, the role names in the
  language; a price set on a price list, its unit price and then the item
  by SKU, as FOCUS-60CT, and the same when an item is taken off a list. The order's number opens the order, and the role opens
  Members. The last column, where a change came from, is headed 来源 in
  中文 and Provenance in Français, words of its own rather than the date
  filter's 起始 and Depuis.
- **MC-2902** *(ADR-076)* On Tax codes, rename GST to GST 5%. The audit
  log's earlier entries still say GST: a reference keeps the name it had
  when the entry was written.
- **MC-2903** *(ADR-076)* Sign in to an organization seeded before
  ADR-076. Its entries name no reference ("a tax code", "an order"), never
  showing an id, and each still opens its record where there is one.
- **MC-2904** *(ADR-076)* Export the audit log in 中文 and open the file:
  By holds the person's name then their email, Action and Record type are
  in Chinese, in the screens' words (合作伙伴, 库存变动, 生产订单, and
  电子邮箱 heading the email), Record is the record's name, and Details is
  one line in words. There is no id column and no id anywhere in the file; a moment in
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
  roles as cards to tick, each with its line saying what it lets a person
  do (the Admin's ends Can invite and remove members), none ticked, since
  the demo has made roles of its own (MC-3316); Write to them in, starting
  at your own language; and A note from you, counting to 500. Invite
  `newcomer@example.com` with Admin ticked alone, writing to them in 简体中文, with the note `<b>Dock 3</b>`, a line
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
  button does not open, under 接受邀请 with no colon (the plain text, in
  Mailpit's Text tab). It ends 由 … 代 … 发送, naming the app as
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
  Becker, who holds Warehouse, Members has no Invite and no Invited, and
  its line says a member can hold several roles, with Roles linked.
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
  and A new organization; You'll be its Owner: everything, …, in lower
  case after the colon (in Français, Vous en serez Propriétaire : tout,
  …); You can change the name later; the address
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
- **MC-3202** *(ADR-079)* Help on a computer, about 1280 to 1440 px wide,
  the rail open: the top bar has Help, its icon and the word, between
  Search and the bell. On Orders, press it: the rail folds to its icons,
  Help comes in at the right, under the bar, with nothing dimmed, and the
  page takes the width left beside it; the button shows pressed. Nothing
  of the page is under Help: Raise an order, at the top right, is in view,
  nothing scrolls sideways, and Tab through the page reaches every
  control in view, none of them under Help. The guide is Orders, its
  title and sections, steps numbered and the permission notes set apart.
  At its foot, All guides lists Work, Records, Settings and You, only the
  pages you can open (as a Viewer: no Stock value, Audit log, Exchange
  rates or Price lists), then What you can do here is on Your account.
  Choose Inventory in the rail: Help now shows Inventory's guide. Choose
  Home in All guides: Home's guide shows and the page stays on Inventory.
  Follow See also in a guide: that page opens, with its own guide. Esc
  inside Help, or Close, shuts it, focus is back on Help, and the rail
  opens again with the page at its width. With the rail folded before
  Help opened, it stays folded after; unfolded while Help is open, it
  stays as you left it. A guide downloads only when Help shows it
  (DevTools, Network: the guide's file, `orders.md` locally, arrives as
  Help opens, and none before). With Help open on Locations, press Add
  location: the dialog sits in the room beside Help, the page behind it
  dimmed and Help not; Help scrolls under the mouse or a finger, pressing
  its links or Close does nothing, and Tab stays in the dialog. With
  VoiceOver on, Help is not read while the dialog is open. Cancel: Help
  works again.
- **MC-3203** *(ADR-079)* Help on a wide screen, about 1900 px: opening
  Help folds the rail as on a laptop, the page keeps its full width beside
  Help, and closing Help opens the rail again. In a window about 1100 px
  wide, or below about 1265 px at Large text and 1330 px at Larger, where
  the page would keep less than about 720 px beside Help, Help slides over
  the right of the page instead, with nothing dimmed, and the page beneath still scrolls
  and works. Narrower than about 1085 px, a dialog the page opens there
  stays centred, and Help dims with the page.
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
  set to 中文, open 订单, whose list heads its columns 编号 and 参考号, two
  words for two things, then 帮助, on a computer and on a phone (帮助 ·
  订单).
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
  its button. The foot says Help is at the top, beside the bell, its
  Help a link with the ? icon before it: pressing the word or the icon
  opens Help on Home's guide, as the bar's Help does, and the bar's
  button shows pressed; pressed again, Help stays open on Home's guide;
  Esc puts focus back on it. VoiceOver reads it as one button, Help.
  Open a product and come back: Look up is ticked and reads You opened … as a
  link to it. Dismiss: the card goes, focus moves to the greeting at the
  top of Home, and a message says What you can do here stays on Your
  account, with Undo. Tab once: Undo has focus, and the message stays
  while it does, or while the pointer is on it, well past its eight
  seconds, and still once the pointer has passed over it and gone. Undo brings the card back, focus on its title (Tab moves on
  from there), and a reload keeps it. Dismiss
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
  the organization is in Getting started, below. Getting started comes
  straight after the card, before the quick actions, and the card's first
  week has only Confirm your email address
  and Say who you are, 0 of 2 done, its bar empty on a grey track, as
  Getting started's is at 0 of 7.
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
  day as Sales, with no article, the Owner's note about Chloé under the
  Owner's initials, and her first week at 0 of 4: say who you are, look
  something up, raise an order and draft an invoice. As the demo Owner, People marks
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

## 33. Job roles (ADR-080)

- **MC-3301** *(ADR-080)* Every member keeps the role they held. On a
  database seeded before migration 0073, note each member's role on
  Members, then run `npm run migrate:all`: Members shows the same roles,
  Invited the same, and each member can still do what their role allows (a
  Viewer opens Orders and has no Raise an order; an Admin invites). As the
  demo Owner, Download everything: `members.csv` names each member's role
  as Members does; `invitations.csv` has no `role_id`, and
  `invitation_roles.csv` names each invitation's role by `invitation_id`
  and `role_id`, and `membership_roles.csv` each member's by `user_id` and
  `role_id`, as the README's glossary says, in English, Français and
  中文.
- **MC-3302** *(ADR-080)* Prices on orders, a permission of their own now,
  change nothing for the built-in roles. Run `npm run seed` in `server/`,
  which gives them to every Admin and Viewer. Signed in as a Viewer of the
  demo team, Account → Your access reads, under Orders, See purchase and
  sales orders and their prices; as an Admin, … and their prices; raise,
  change, confirm and cancel orders; …; in Français … et leurs prix, in
  中文 …和订单价格. Both still see every price on an order and in the
  orders list. As the demo Owner, Download everything with the app in
  Français: `roles.csv` gives Owner, Admin and Viewer the lines Invite
  shows them in French, and the README's glossary says so;
  `role_permissions.csv` lists `orders.view_prices` under all three, and
  `roles.create`, `roles.update` and `roles.delete` under Owner alone.
- **MC-3303** *(ADR-080)* Giving only what you hold. On a freshly seeded
  demo, sign in as Daniel Okafor, an Admin, and on Members change Chloé
  Tremblay's role to Sales: refused, Your roles don’t include everything
  Sales can do, so you can’t give it (Sales sees price lists, which Admin
  does not), and Chloé stays a Viewer. Change Fatima Haddad's to Viewer:
  Your roles don’t include everything Fatima Haddad’s roles can do, so you
  can’t change their roles. Change Tom Becker's to Owner: Only an Owner can
  assign the Owner role, as before. In Français, Vos rôles n’incluent pas
  toutes les permissions de Sales; vous ne pouvez donc pas l’attribuer.,
  attribuer as the screens and the Roles guide say it; in 中文,
  您的角色不包含Sales的全部权限，….
  As the demo Owner the same changes are made, each one entry under
  Member’s roles changed, from and to.
- **MC-3304** *(ADR-080, #148)* A refusal says, in your words, what your
  roles don't include and who could give it. Signed in as Tom Becker
  (Warehouse), with the Network tab open, go to `/costs`: the page says
  you don't have access, and the refused request's message reads Your
  role, Warehouse, doesn’t include “See what stock, lots and batches cost,
  and exchange rates”. Demo Owner and Anika Sharma can change your roles.,
  never Missing permission: costs.view. Up to three are named, the Owners
  first, then whoever may change roles and holds both what you lack and
  everything your roles do, those who joined first first; no Admin here,
  since Admin lacks costs. As Daniel Okafor (Admin), who may change roles
  but not give costs, the same address names the same two. With the app
  in Français, « … », … peut / peuvent modifier vos rôles; in 中文,
  您的角色（Warehouse）不包含“…”。… 可以更改您的角色。 Correcting a count
  is refused the same way: as Daniel,
  open Correct the count on an Inventory row and fill it in, then, as the
  demo Owner in another browser, change Daniel's role to Warehouse on
  Members. Save correction is refused with Your role, Warehouse, doesn’t
  include “Correct a count when the system is wrong”. Demo Owner, Anika
  Sharma and 李静 can change your roles. (an Admin holds all Warehouse
  does, and the reader is never named), never Correcting a count needs
  stock.adjust. Change Daniel back to Admin. A release sent with a
  licence override by a role without it is refused in the same words. As
  the demo Owner, open Release on a planned run whose recipe's licence is
  current and pick a source, then, in another tab, set that licence's
  Valid until to yesterday, and press Release: refused, … without an
  override — someone whose roles include “Release a run under an expired
  or not-yet-in-force licence, with a reason” can release it, never
  production.override_licence.
- **MC-3305** *(ADR-080)* Prices on orders stay with whoever may see
  them. Signed in as Tom Becker (Warehouse), with the Network tab open,
  open SO-DEMO-1: its order response has no `unitPrice`, `lineTotal`,
  `totals`, `money` or `documents`, and the page leaves the prices out
  (MC-3318). Its pro forma is refused, and PO-DEMO-1's Print and Download
  PDF are refused, while a shipment's packing slip still prints. As
  Fatima Haddad (Sales), SO-DEMO-1 shows its prices, totals and its
  invoices and credits, as it does for a Viewer.
- **MC-3306** *(ADR-080)* A made role reads without an article. As the
  demo Owner, Invite someone at an address you can read with the Warehouse
  card: the email says … invited you to join as Warehouse., with
  Warehouse's line beneath, and the invitation's page … invited you as
  Warehouse.; in Français … en tant que Warehouse. Join, and the Owner's
  bell reads … joined … as Warehouse. An Admin or a Viewer invitation still
  reads as an Admin, as a Viewer. On a database where someone joined before
  this branch, that Owner's bell entry still opens in Français and 中文, the
  bell's list loading rather than failing.
- **MC-3307** *(ADR-080, #169)* Settings → Roles. On a freshly seeded
  demo, as the demo Owner, the menu's Settings has Roles beside Members.
  Roles lists Built in first, Owner, Admin and Viewer, each with its line
  and how many hold it (Nobody where none does), then Made here, Warehouse
  and Sales, each with its line and 1 member; Make a role is at the top.
  At 390 px each role is a card whose name opens it. As Tom Becker
  (Warehouse) the same lists show, with no Make a role. In Français the
  built-in three read Propriétaire, Administrateur and Lecteur, while
  Warehouse and Sales read as named; in 中文 所有者, 管理员 and 查看者. An
  account with no organization (Leave on Account) has neither Members nor
  Roles in the menu.
- **MC-3308** *(ADR-080)* A role's page. As the demo Owner open
  Warehouse: What Warehouse can do in Your access's sentences, Also told
  with nothing from this role, and Held by with Tom Becker, the email and
  every role held side by side, the name opening the page on People; History,
  Edit, Make a copy, Move everyone to… and Delete above. Open Viewer: Built
  in beside its name, its line beneath, the note that a built-in role
  stays as it is and is varied by a copy, and only History, Make a copy
  and Move everyone to…. As Tom Becker, Warehouse's page has none of
  these buttons: Warehouse changes no role and reads no audit log. In
  the audit log, a role named in Member's roles changed opens its page.
- **MC-3309** *(ADR-080)* Making a role. As the demo Owner, Make a role:
  Start from offers Warehouse, Sales, Finance, Production and Stock look-up,
  each with its few words, then A copy of a role and Nothing ticked; nothing
  is ticked but the three every role holds. Choose Warehouse: its boxes
  tick, Name reads Warehouse, and What Warehouse can do beside the boxes
  says what they allow; at 390 px it is below them. Open Orders and tick
  Raise an order: See prices on orders and See customers and suppliers tick
  with it (Warehouse already sees the catalogue), and the line above the
  areas says so; untick See purchase and sales orders and everything that
  needs it unticks, said the same way. See prices on orders says what
  leaving it out does; Edit, confirm or cancel an order says it is also told
  when a line closes short. Tick Read the audit log under People and the
  organization: See prices on orders and See purchase and sales orders tick
  with it, since the log keeps what orders were priced at. People and the
  organization shows its first three ticked and greyed, with why, and no
  Make a role or Close the organization. Tick all and Clear on Stock and
  locations each change that area's boxes, and anything elsewhere that needs
  them. Name it sales: refused under Name, There’s already a role called
  sales.; admin: Admin is a built-in role. Choose another name. Name it Dock
  crew, Save role: Dock crew's page, Nobody holds Dock crew. Give it to
  someone on Members., Members a link to Members; in Français Attribuez-le à
  quelqu’un dans Membres., in 中文 可以在成员页面把它授予某人。 As Tom Becker, who changes
  no roles, the page says Nobody holds … alone. Make a copy on Viewer's
  page: Start from is A copy of a role, Viewer, its boxes Viewer's, Name
  Viewer (copy). In Français and 中文 the boxes read in that language, and the
  summary as Your access would. A role named toString, given to someone,
  reads toString on Roles, Members, Invite and People, and every one of
  those pages opens.
- **MC-3310** *(ADR-080)* Changing a role, and two at once. Edit Dock
  crew, tick Correct a count, then go to Roles in the menu: Leave without
  saving? asks first; Stay keeps the change. In another browser, as a
  second Owner, edit Dock crew and save. Back in the first, Save role:
  Dock crew was changed, naming who saved it, with Keep editing and
  Reload; Reload shows theirs, with yours gone. As Tom Becker, the
  editor's address (`/settings/roles/new`) says Only Owners make and
  change roles, with Go home.
- **MC-3311** *(ADR-080)* Move everyone and Delete. On Dock crew's page
  after giving it to Chloé Tremblay on Members, Delete says Chloé Tremblay
  holds Dock crew. Move them to another role first., with Close and Move
  everyone to…; that opens Move everyone from Dock crew, naming Chloé, with
  only the roles you may give. Move to Viewer: 1 member moved to
  Viewer, Held by is empty, and focus is on the page's heading, since
  Move everyone has gone with its dialog. Delete, then Delete role: Roles
  again, Dock crew gone, and focus on its heading. As Daniel Okafor
  (Admin), Move everyone on Viewer offers no Owner and no Sales, saying
  roles that can do more than yours aren’t offered; Sales's own page has no
  Move everyone to…, since Admin cannot give Sales. As the demo Owner, open
  a made role nobody holds, give it to someone in another tab, then press
  Delete and Delete role: the dialog names who holds it, with Move
  everyone to…, and the page behind lists them.
- **MC-3312** *(ADR-080)* Members with several roles. As the demo Owner,
  Settings → Members: its line says a member can hold several roles, and
  Roles opens Settings → Roles. Each member's roles stand side by side, a
  built-in one a plain pill and one made here on the accent's tint with
  square corners (Tom Becker: Warehouse; Fatima Haddad: Sales), told apart
  by their shape with the colours off too (the system's greyscale or colour
  filters). Each row has More for … with Change roles, and Remove from the
  organization on every row but your own. As Chloé Tremblay (Viewer), no row
  has a menu. At 390 px in 中文 each member is a card, with the face, the
  name, the address, the roles and 「… 的更多操作」, and nothing scrolls sideways
  at Larger text.
- **MC-3313** *(ADR-080)* Change roles. As Daniel Okafor (Admin), More for
  Chloé Tremblay, then Change roles: the dialog lists every role with its
  line; Owner is off with Only an Owner can make someone an Owner., and
  Sales off with Your roles don’t include everything Sales can do, so you
  can’t give it. An Owner can.; in Français … Un propriétaire le peut.,
  in 中文 …所有者可以。 Tick Warehouse: With these roles, Chloé Tremblay can
  gains, under Orders, … receive what was ordered; ship what was sold, and
  untick Viewer: it loses what Viewer alone gave. Untick everything: Choose
  at least one role., and Save roles is off. Tick Viewer and Warehouse and
  Save roles: Chloé Tremblay’s roles changed, the row shows both, and focus
  is back on More for Chloé Tremblay. As the demo Owner, tick Owner for
  anyone: every other box clears, and the summary reads Everything,
  including settings and closing the organization.; tick another and
  Owner clears. In Français and 中文 the same, names of made roles as
  written.
- **MC-3314** *(ADR-080)* What you cannot change, said before anything is
  sent. As Daniel Okafor, More for Fatima Haddad (Sales), then Change roles
  or Remove from the organization: a dialog says You can’t change Fatima
  Haddad’s roles (or You can’t remove Fatima Haddad), Your roles don’t
  include everything Fatima Haddad’s roles can do, so you can’t change
  their roles or remove them. An Owner can., with Close only; Close gives
  focus back to More for Fatima Haddad. For Anika Sharma: Anika Sharma is
  an Owner. Only an Owner can change or remove an Owner.
- **MC-3315** *(ADR-080, #147)* Remove from the organization. As the demo
  Owner, More for Sarah Chen, then Remove from the organization: Remove
  Sarah Chen from … ? says the account stays theirs, their work here keeps
  their name, they lose access on their next click, and coming back needs a
  new invitation. Cancel gives focus back to More for Sarah Chen. Remove: a
  notice says Sarah Chen was removed, the row goes, and focus is on the
  page's heading, Members, as Home's after a card is dismissed. Signed in
  as Sarah Chen in another browser, the next click finds no organization.
  The audit log has Member removed. In Français, Retirer … de …?; in 中文,
  将 … 从 … 移除？.
- **MC-3316** *(ADR-080)* Invite with several roles. On the demo, whose
  Owner has made Warehouse and Sales, Invite starts with no role ticked;
  Send invitation with none says Choose at least one role. on Roles and
  sends nothing. Tick Warehouse and Sales and send: Invited reads Warehouse
  and Sales, and the email … as Warehouse and Sales. Tick Owner: the
  others clear. On a fresh organization with no role of its own, Invite
  starts on Viewer as before. As Daniel Okafor, Owner's card is off with
  Only an Owner can invite an Owner., and Sales's with Your roles don’t
  include everything Sales can do, so you can’t give it. An Owner can.
- **MC-3317** *(ADR-080)* An invitation's buttons follow the rule too. As
  the demo Owner, invite an address as Sales; as Daniel Okafor, its row on
  Invited has no Resend, Copy link or Revoke, and inviting the same address
  again says Your roles don’t include everything Sales can do, so you
  can’t resend this invitation. An Owner can., with no Resend instead. An
  Owner's invitation still says only an Owner can resend it.
- **MC-3318** *(ADR-080)* Orders show no prices to whoever may not see
  them. Signed in as Tom Becker (Warehouse), open PO-DEMO-1: its Items
  have no Unit price or Total column and no totals beneath them, nothing
  reads —, and its summary has no Print or Download PDF. Open SO-DEMO-1:
  no Pro forma invoice, and Invoices and credits is not among its tabs. As
  Fatima Haddad (Sales), SO-DEMO-1 shows its prices, totals, Pro forma
  invoice and its invoices and credits, as for a Viewer. At 390 px the
  same, the Items table no wider than its columns. As Tom Becker, Help on
  PO-DEMO-1: the Orders guide's note under its first lines says an order
  shows no prices, totals or PDFs to someone whose roles don’t include See
  prices on orders, and whom to ask; in Français, Voir les prix des
  commandes; in 中文, 查看订单价格.
- **MC-3319** *(ADR-080)* A screen asks only for what its reader may
  read, and says why where a field cannot be filled. With the Network tab
  open, as Fatima Haddad (Sales): Inventory and Movements open without a
  refused request and with no Location filter; PO-DEMO-1 opens, and its
  Edit's Deliver to keeps its site, greyed, with You can’t see the
  organization’s locations, so you can’t choose one here.; Authorize a
  return on SO-DEMO-2 says the same under Send back to, with where the
  goods go instead; Pro forma invoice on SO-DEMO-1 offers No tax alone,
  with You can’t see tax codes, so this pro forma can only be made without
  tax., and its Print still opens. As Tom Becker, Send sample from an
  Inventory row's menu: Given to is greyed, with You can’t see customers
  and suppliers, so the sample is recorded without whom it went to. As the
  demo Owner, make a role from the Finance template and give it to a
  member: as them, on an open RMA, Change under Send back to says it
  cannot be chosen and Save is greyed, and Raise replacement is not
  offered (it raises a sale, which Finance may not). Make one from
  Production and give it: as them, Plan a run lists the items and the
  places, and Contract manufacturer reads We make it ourselves, greyed,
  with You can’t see customers and suppliers, so a contract manufacturer
  can’t be chosen here. Make a role with Release a run but not Plan a run
  (Production, Plan a run unticked), plan a run with no recipe as the
  Owner, and as its holder press Release: … attaching one is for whoever
  may plan runs, which your roles don’t include …, no recipe offered and
  Release greyed. In Français and 中文 each line reads in that language.
- **MC-3320** *(ADR-080, #148)* A page you may not open says why in the
  server's words. As Tom Becker, open a sale's invoice by its address
  (`/invoices/<id>`, copied as the demo Owner): You don’t have access to
  this, then Your role, Warehouse, doesn’t include “See invoices and
  credit notes”. … can change your roles., never Your role does not
  include this. In Français and 中文 the same, in that language.
- **MC-3321** *(ADR-080)* The first week's Receive for whoever receives
  only against orders. As the demo Owner, make a role from the Warehouse
  template with Receive, ship or transfer stock unticked, and invite
  someone at an address you can read with it alone. As them, on Home's
  welcome, Receive stock reads Record goods as they arrive, against the
  purchase order they came on., and its button, Orders, opens the
  confirmed purchases (Buying, Confirmed). As Tom Becker, who may move
  stock, it opens Inventory as before.
- **MC-3322** *(ADR-080)* Receiving a lot-tracked line without the
  catalogue. As the demo Owner, edit Warehouse on Settings → Roles: untick
  See the product catalogue, which unticks Receive, ship or transfer stock
  with it, and save. As Tom Becker, with the Network tab open, press
  Receive on PO-DEMO-11's MELATONIN line: Lot number and Expires are asked
  for, Up to 5.0000 kg still outstanding. names the unit, nothing says the
  dialog cannot tell whether a lot is needed, and no request is refused.
  Receive 5 with a lot number: it is recorded, and Trace a lot finds the
  lot. As the demo Owner, tick both again on Warehouse.
- **MC-3323** *(ADR-080)* The trace and an order lead only where their
  reader may go. As Tom Becker (Warehouse), trace BF-2609: its receipt's
  order and each customer's order are links, while the run under Went into
  and each customer under Who received it read as text: nothing links to a
  page that would refuse the reader. Open PO-DEMO-1: the supplier under its
  number reads as text too. As the demo Owner, every one is a link.
- **MC-3324** *(ADR-080)* The Roles and Members guides. As the demo Owner,
  open Settings → Roles and press Help: the guide is Roles, from What a
  role is to If something is refused, and Make a role, a role's page and
  its Edit open the same guide. All guides lists Members and Roles apart
  under Settings. Members' guide has Invite someone, Change roles and
  Remove someone, and Words you’ll meet names Made role and Permission;
  its links open Roles and Your account. Your account's guide says Your
  access shows your roles, each with its line. In Français, Rôles reads
  Partir de, Entrepôt and Ventes, a no-break space before each colon; in
  中文, 角色 reads 从哪里开始, 仓库 and 销售, with Warehouse as a name that
  stays as written.
- **MC-3325** *(ADR-080)* Whom to ask names only who could help. On a
  freshly seeded demo, as Chloé Tremblay (Viewer), Account → Your access
  ends To do more, ask Demo Owner, Anika Sharma or Daniel Okafor. As the
  demo Owner, give Tom Becker Sales as well as Warehouse; as Tom, Your
  access asks Demo Owner or Anika Sharma alone, with no Admin, since
  Admin cannot change Sales (it lacks price lists), and a refused page
  (MC-3320) names the same two. Home's welcome card says the same to a
  newcomer.
- **MC-3326** *(ADR-080)* A member's roles are plural wherever they are
  named. As Daniel Okafor (Admin), with the app in Français, Account →
  Your access reads … changer les rôles des membres. Invite an address
  already a member: … change their roles instead.; in Français … changez
  plutôt ses rôles. As Tom Becker, open the audit log by its address
  (`/audit`): Your roles don’t include the audit log.; in Français Vos
  rôles ne donnent pas accès au journal d’audit. On a new organization,
  Getting started's Invite your team says each with their roles.
- **MC-3327** *(ADR-080)* People shows roles as Members does. As the demo
  Owner, give Tom Becker Sales as well as Warehouse, then open People: his
  card has Warehouse and Sales side by side, square-cornered on the accent's
  tint as made roles are on Members, and Chloé Tremblay's Viewer a plain
  pill; at 390 px they wrap under his name rather than widen the card. Tom's
  own page shows the same two, a little apart.

## 34. Old tabs after a deploy (ADR-081)

A deploy, by hand, is either a real one with a tab left open across it, or
DevTools → Sources → Overrides on `/version.json`, saved with another
`build` than the tab's (`dev` on the dev server, which never counts as
newer): the same `apiRevision` for a new version, one higher for one whose
saves would be refused. Then switch to another tab and back, which reads
the file, or wait ten minutes.

- **MC-3401** *(ADR-081)* A new version on a computer. Signed in, on
  Orders, deploy: New version appears just before Help, a pill in the
  info tone, and the top bar keeps its height, so nothing on the page
  moves. A screen reader says once, politely, A new version is ready. It
  loads by itself when you open another page.; with a dialog open, such as
  Receive on a purchase order, it says so in the dialog, and nothing more
  once the dialog closes. New version opens that note
  with Reload now, which loads the page. On an order, switching from Items
  to History, or on Orders a filter, loads nothing; Inventory in the rail
  loads in full (the Network tab shows the document again). Deploy once
  more with another `build`, since a tab loads in full once per new
  version (MC-3411): on New order with a line added, Inventory asks Leave
  without saving? first: Stay keeps everything; Leave loads Inventory in
  full, with no browser Leave site? after the app's.
- **MC-3402** *(ADR-081)* A new version on a phone. At 390 px, and at 320
  px with Larger text, deploy: no new button, a dot on the account button,
  whose name a screen reader reads as …, signed in as …, a new version is
  ready, and the bar still fits its six targets. The account menu's first
  item reads A new version is ready · Reload now, It also loads by itself
  when you open another page., and loads the page. In 中文, 新版本已就绪 ·
  立即重新加载, 您打开其他页面时也会自动加载。
- **MC-3403** *(ADR-081)* Signed out. On sign-in, register, forgot
  password and an invitation's link, deploy: under the language and text
  size, an info banner says A new version is ready. It loads when you open
  another page., with Reload and no close. In Français, Une nouvelle
  version est prête. Elle se charge quand vous ouvrez une autre page.; in
  中文, 新版本已就绪。打开其他页面时即会加载。
- **MC-3404** *(ADR-081)* Amber, once saves would be refused. Signed in,
  deploy with `apiRevision` one higher: an amber banner tops the page,
  above any other, A new version is ready, and this tab can no longer save
  changes. Copy anything you’ve typed, then reload., its first sentence in
  bold, with Reload; New version and the phone's dot are gone. A screen
  reader says those words once, politely, in a dialog if one is open, and
  says them again when a tab that had the info note turns amber. Receive on
  a purchase order opens with the same line at its very top, above its
  title; a dialog already open gains it as the file is read; on a phone in
  中文 Invite, full screen, shows 新版本已就绪，此标签页已无法保存更改。 at
  its top. A product's image opened at full size, Help, and the lookup on
  a phone show no line. The signed-out pages' banner turns amber too.
- **MC-3405** *(ADR-081)* Help names the version the tab runs. Open Help
  and scroll to its foot: under a thin line, in small grey text, Version
  0.7.0 · build 983c1d8 · 22 Oct 2026, the release, the build's first
  seven characters and the day it was built, in the reader's own date
  format (Oct 22, 2026 in a US browser). In 中文 版本 0.7.0 · 构建 983c1d8
  · 2026年10月22日; in Français Version 0.7.0 · compilation 983c1d8 · 22
  oct. 2026. On the dev server it reads build dev. After a deploy, the
  build is the commit `/api/health` names, and an old tab's Help still
  names its own.
- **MC-3406** *(ADR-081)* The version file. `npm run build` in `client/`
  writes `dist/version.json` with `build` (the commit checked out),
  `builtAt`, `version` (as `client/package.json` says) and `apiRevision`;
  `npm run dev` answers `/version.json` with the build `dev`, and
  `/version.json?123` the same.

A page that won't load is made by hand in DevTools → Network: Offline for
a dropped connection, or Network request blocking with a pattern for one
chunk (`*inventory-page*` for Inventory's on the dev server). Each way
waits a second and tries once more before it says anything.

- **MC-3407** *(ADR-081)* Offline. Signed in, on Orders, go Offline and
  open Inventory from the rail: in its place, with the rail still there,
  Can’t reach the server, the line about the connection, in smaller grey
  text under it This page tries again by itself when your connection
  comes back., and Try again. Go back
  online (No throttling): Inventory loads by itself, in full. Reload on
  Orders, block `*inventory-page*` and `*version.json*`, and open
  Inventory: the same page; unblock both, and Try again loads Inventory.
  In 中文 无法连接服务器 and
  网络恢复后，此页面会自动重试。
- **MC-3408** *(ADR-081)* After a deploy. On Orders, deploy without
  switching tabs, so the tab has not read the file yet, and block
  Inventory's chunk. Inventory from the rail loads in full by itself (the
  Network tab shows the document again); with the chunk still blocked, it
  then says A new version is ready, A new version came out while this tab
  was open. Reload to use it; nothing is lost., with Reload, and loads
  nothing more by itself. Unblock it and Reload: Inventory.
- **MC-3409** *(ADR-081)* This build, broken. Nothing deployed, block
  Inventory's chunk alone: Something went wrong, with Reload, Go back, Go
  home and a reference, never a new version.
- **MC-3410** *(ADR-081)* Help's guide. Deploy, block `*guides*`, and open
  Help on a page whose guide this tab has not shown yet: This guide has a
  new version. Reload to read it., with Reload, and the page beside it
  stays as it is. In 中文 这份指南有新版本。请重新加载后阅读。 Offline instead,
  This guide could not be opened. Check your connection, then try again.,
  with Try again.
- **MC-3411** *(ADR-081)* Once per new version. On the dev server the
  load in full comes back on the same build, as a tab does while Render's
  edge still serves the old `index.html`. Deploy, open Inventory: it loads
  in full once. Then Orders, Movements and Inventory again load nothing
  more (no new document in the Network tab), and New version stays beside
  Help, or the amber banner on the page with `apiRevision` one higher,
  each still reloading when pressed. Deploy again with another `build`:
  the next page loads in full once more.

An outdated tab is made by hand on the server: raise `API_REVISION` by one
in `server/src/common/api-revision.ts` alone and restart it, without `npm
run api`, so the client still sends the revision before. On the dev
server the version file names `dev`, the tab's own build, so the new
version is still on its way, as when the API deploys first; an override
of `/version.json` with another `build` stands for it being out. Put the
revision back afterwards: `git status` shows nothing changed.

- **MC-3412** *(ADR-081)* Outdated, the new version on its way. Signed in
  on a purchase order, then raise the revision. In Receive, fill the
  fields and press Receive: under them, A new version is being installed.
  Try again in a minute; nothing was saved., with no Reload, and
  everything typed stays. In 中文 新版本正在安装。请一分钟后再试；没有保存任何内容。
  Close it and open Products from the rail: in its place, with the rail
  still there, A new version is being installed, This page tries again by
  itself in a minute., and no button; the Network tab shows Products read
  again each minute, and `version.json` every 30 seconds. Switch to another
  tab for a few minutes and back: nothing was asked meanwhile, and
  Products and `version.json` are read again at once. Orders → New
  order says the same in the form's place, never Could not load partners
  and products. In a private window, Sign in says A new version is being
  installed. Try again in a minute; nothing was saved.; so do Forgot your
  password there, and a photo added on a product, in its row. Nothing signs
  out, and no page says Could not reach the server. The bell asks
  `unread-count` once more, is refused, and then asks nothing; put the
  revision back and reload, and it asks again each minute. Open the bell:
  it asks for the list once, and says A new version is being installed.
  Try again in a minute; nothing was saved., with no button, never
  Nothing yet. Signed in
  without Keep me signed in, typing on a page asks `auth/me` nothing more
  either.
- **MC-3413** *(ADR-081)* Then the new version is out. Still outdated, add
  the override of `/version.json`: within 30 seconds Products becomes A
  new version is ready, A new version came out while this tab was open.
  Reload to use it; nothing is lost., with Reload, under the amber banner.
  Open Receive again and press Receive: the amber line tops the dialog,
  and the refusal reads This tab is running an older version of the app,
  so nothing was saved. Copy anything you typed, then reload., with Reload
  beside it; what was typed stays. A dialog already showing the 503's
  words gains the same, and its Reload, as the file is read, and so does
  the private window's Sign in, its line now This tab is running an older
  version of the app…, without pressing anything, and so does the
  photo's row. Adding another photo says the same refusal in its row.
  The bell's menu, opened, says the same refusal, with Reload.
- **MC-3414** *(ADR-081)* Opening an outdated tab. Outdated, with no
  override, reload the page: no app, and on its own A new version is being
  installed, which tries again by itself in a minute; with the override,
  A new version is ready, with Reload. Never Could not reach the server.
- **MC-3415** *(ADR-081)* Sign-out still works. Outdated, switch to
  another tab and back, which reads the session: the page stays as it
  was. Sign out from the account menu: the sign-in page, and the session
  ended (its row gone from another device's Sessions); the Network tab
  goes on reading `version.json` every 30 seconds there, since the tab is
  still outdated. The same for Not you? Sign out on an invitation's link
  opened signed in.
- **MC-3416** *(ADR-081)* The API not yet deployed. Revision put back, set
  `API_REVISION` in `client/src/api/revision.gen.ts` to one higher instead,
  which the dev server picks up: a save in a dialog says A new version is
  being installed. Try again in a minute; nothing was saved., with no
  Reload and nothing amber; a page opened says it is being installed and
  tries again by itself. Put it back: within a minute the page loads by
  itself.
- **MC-3417** *(ADR-081)* A record that won't load, offline. Open an order,
  then go back to Orders, go Offline (DevTools → Network) and open another
  order: Can’t reach the server, the line about the connection, This page
  tries again by itself when your connection comes back., and Try again.
  Back online, the order loads by itself, without a load in full (no new
  document in the Network tab), as a page that won't load does (MC-3407).

A language that won't load is made by hand in DevTools → Network request
blocking with `*compiled/zh-Hans*`, the Chinese catalogue on the dev
server (`*assets/zh-Hans-*` in a build), which leaves Help's Chinese
guides alone. Each try waits a second and tries once more first.

- **MC-3418** *(ADR-081)* Switching. Signed in, in English, block the
  catalogue and choose 简体中文 in the account menu: the screens stay in
  English, and at the foot of the screen, in the language chosen,
  无法加载简体中文。请检查网络连接，然后重试。, with 重试 and 关闭; a minute
  later it is still there. Save something meanwhile, a partner's name:
  its confirmation shows above the message, never over it, and goes; the
  message stays. Reload: still English, and Your account's Language still
  reads what it did, since nothing was saved. Choose 简体中文 again,
  unblock, and press 重试 in the message: the app is in 中文, and a reload
  and Your account keep it. From Français the same, in Chinese. Block
  `*compiled/fr-CA*` and choose Français: Impossible de charger Français
  (Canada). Vérifiez votre connexion et réessayez., with Réessayer and
  Fermer;
  Fermer puts it away and changes nothing. On the sign-in page the same.
- **MC-3419** *(ADR-081)* At start. In 中文, signed in, block the
  catalogue and reload: the app in English rather than a blank page, an
  amber banner topping the page, in Chinese,
  无法加载简体中文，应用暂时以英文显示。, with 重试 and no close, and no message
  at the foot of the screen. A screen reader reads the banner in Chinese.
  Signed out, the same banner under the language and text size. Press 重试
  still blocked: 正在重新加载简体中文… for a second or two, 重试 greyed, then
  the banner as it was, a screen reader saying each. Unblock and 重试: the app in 中文, the banner gone.
  Blocked and reloaded again, Your
  account's Language reads 简体中文; choosing English there puts the banner
  away, and the next reload starts in English.
- **MC-3420** *(ADR-081)* After a deploy. In English, deploy without
  switching tabs, block the catalogue and choose 简体中文: the page loads in
  full by itself (a new document in the Network tab), still in English,
  since nothing was saved. Choose 简体中文 again within a minute, still
  blocked: at the foot of the screen
  无法加载简体中文，因为此标签页打开期间推出了新版本。重新加载即可使用，不会丢失任何内容。,
  with 重新加载 and 关闭, never
  the connection's words, and nothing loads by itself; 重新加载 loads the
  page.

The status tones are looked at in both colour modes, chosen in the account
menu's Colour mode.

- **MC-3421** *(ADR-081)* The status pages' discs and Home's empty line.
  An unknown address (`/no-such-page`): the search icon dark blue on a
  pale blue disc. MC-3409's Something went wrong: the warning sign dark
  red on a pale red disc. MC-3407's Can’t reach the server: the cloud dark
  grey on a pale grey disc. In dark mode each the other way round, a light
  icon on a dark tint, and each icon stands clear of its disc. Then, in an
  organization of your own (registered locally, `REGISTRATION=open`) with
  Getting started dismissed, Home shows every card with nothing in it:
  each says so in green, such as No runs in progress., dark green on the
  light card and light green on the dark one, as easy to read as the
  words around it.

A reference (a document's number, a SKU, a lot code) is kept whole where
words sit beside it; one alone, or first in its line, needs nothing.

- **MC-3422** *(ADR-081)* References kept whole. At 390 px, then at 320
  px with Larger text, in English and in 中文: Home's To receive reads
  PO-000009 Lakeshore Packaging · PO-DEMO-9, a space between the number
  and the partner, and wraps only between words, never inside PO-DEMO-9
  (no PO- at a line's end with DEMO-9 below); To ship the same for
  SO-DEMO-1. On SO-DEMO-1's order, the line under its number moves their
  reference's SO-DEMO-1 to the next line whole when it must. Copy
  SO-DEMO-1 from Home and paste it into the lookup: it finds the order.
  With VoiceOver, a Home row reads as one line, SO-DEMO-1 among its words,
  never split off on its own (MC-R38). A refusal the same: edit Harbour
  Health, give it the code COOP-BSL and Save: Code COOP-BSL is already
  used by another partner, wrapping between words, never inside COOP-BSL;
  Cancel, and its code is still HARBOUR. Inventory → a row's Ship out, for
  more than can be taken while some is held for an order, the same: never
  inside the SKU or the order's number.

Home's tiles take as few rows as the page's width needs, shared evenly
across them. The demo Owner has eight tiles; Daniel Okafor, an Admin,
seven (no Costs waiting).

- **MC-3423** *(ADR-081)* Home's tiles in even rows. As the Owner, at
  1440 px and at 768 px: two rows of four, never seven and one alone; at
  390 px, four rows of two. As Daniel, at 1440 px all seven in one row; at
  1280 px four, then three as wide as the four above them, the end of the
  second row left empty. Then Larger text (account menu → Text size) at
  1440 px: the Owner's two rows of four, Daniel's four and three; at 390
  px a tile no longer fits twice across, and each has the row to itself.
  At no width does the page scroll sideways (MC-R39).

A real deploy is a push to `main` that passes CI, with Render's settings
as `docs/runbooks/render.md`, "Deploys", has them.

- **MC-3424** *(ADR-081)* A tab kept open across a real deploy. Before the
  push, sign in on the live app and leave one tab on Orders and one in a
  purchase order's Receive with a quantity typed. Actions → Deploy, for
  that commit, deploys the API, waits until The API names it, and only
  then deploys the static site; Check the live site ends naming that
  commit, the database up and `/favicon.svg` as `image/svg+xml`, and
  `/api/health`'s `commit` and `/version.json`'s `build` name the same
  commit. Back in the tabs, Receive saves and Orders still works. A tab
  opened before ADR-081 went live stops there: its build has no version
  check and sends no revision, which the API serves as today. From the
  next deploy on, coming back to the Orders tab shows New version beside
  Help (MC-3401), Inventory from the rail loads in full, and Help's foot
  names the commit `/api/health` names (MC-3405).
- **MC-3425** *(ADR-081)* Deploy by hand. Once merged, since GitHub offers
  Run workflow only for a workflow on the default branch: Actions → Deploy
  → Run workflow, on `main`. Its first step names the commit already live
  and the CI run that passed it; the API deploys, the wait ends at once,
  saying The API names that commit, and the static site deploys. Check
  the live site passes at its first look, the commit being live already.
  `/api/health`'s `commit` and `/version.json`'s `build` still name it.
  The run shows the `production` environment. Run workflow again, Use
  workflow from: any other branch: the job is skipped and nothing
  deploys. Once `render.md`'s step 6 is done, GitHub → Settings →
  Environments → `production` lists `main` alone under Deployment
  branches, and holds both hooks; the first run by hand passes as above.

## 35. The product's name and icon

The name is a setting, `VITE_APP_NAME=Panivo`: in the repository's `.env`
locally (restart `npm run dev` after changing it), and in the static
site's environment on Render, read when it builds. ADR-082's three beside
it, `VITE_APP_NAME_ZH_HANS=品桥`, `VITE_COPYRIGHT_HOLDER` and
`VITE_SITE_URL`, are read the same way (`.env.example`). The icon's masters are
in `docs/brand/`, and `scripts/brand-assets.mjs` makes the files browsers
load from them. Browsers keep an icon long after it changes, so check in a
private window.

- **MC-3501** The icon. On a computer, open the app in Chrome, Edge,
  Firefox and Safari: the tab shows the P on a small rounded navy plate, a
  white stem and a purple bowl, sharp at the tab's size. It never switches:
  with a light tab strip and a dark one (the browser's theme), and the
  system in light mode and in dark, reload each time; the plate is the
  same, and clear on every strip, a light Chrome theme with the system
  dark included. On Windows in dark mode, pin the app to the taskbar: the
  plate, not a navy P on the dark bar. Bookmark the page: the bookmark
  shows the same plate. On an iPhone, from Inventory, Safari → Share → Add
  to Home Screen: the P on navy filling the iPhone's rounded square, not a
  picture of the page, and the name it offers is Panivo, not Inventory ·
  Panivo. On Android, from Inventory, Chrome → ⋮ → Add to home screen: the
  P on navy filling the shape the phone cuts, the P whole and well inside
  it, named Panivo, not a letter Chrome made up. Opened from either home
  screen, the app still shows the browser's bar and its back button.
- **MC-3502** The name in the tab. The sign-in page's tab reads Panivo,
  and so does Home's. Inventory's reads Inventory · Panivo, and every other
  page in the rail ends the same way, Settings → Organization too; an order,
  SO-DEMO-1 · Orders. From Inventory, go Home: its tab is Panivo again.
  Bookmark Inventory: the bookmark says Inventory · Panivo. With
  `VITE_APP_NAME_ZH_HANS=品桥` in `.env` and `npm run dev` restarted, in
  中文 the page's name is Chinese and every tab ends 品桥: 库存 · 品桥, Home
  and the sign-in page 品桥 alone, and an order SO-DEMO-1 · 订单. On the
  sign-in page, switch between English and 中文: the tab turns Panivo and
  品桥 with the page. Reload in 中文: for a moment while it loads the tab
  may read Panivo, index.html's one name, then 品桥. Empty
  `VITE_APP_NAME_ZH_HANS` and restart: in 中文 every tab ends Panivo, as
  in English. Empty `VITE_APP_NAME` too and restart: every tab ends
  web-app-foundation, none Foundation.
- **MC-3503** The product's emails. In the repository's `.env`, set
  `MAIL_FROM="Panivo <no-reply@localhost>"`, as `.env.example` has it.
  Start `npm run dev` in `client/`, which serves the mark, then restart
  the API: it asks for the mark as it starts, and its log says The mail
  mark answers. With Mailpit open, ask for a reset on Forgot your
  password: the email opens with the P on its small navy plate and
  Panivo in bold beside it, a thin line under both, then Hi and the name,
  every sentence as before. In Mailpit's Text tab, Panivo is the first
  line, with a blank line under it. The same header opens the
  confirm-your-email email (MC-101), the new sign-in email (sign in from a
  private window), the deletion emails (MC-2302, MC-2402) and the
  operator's (MC-3107). An invitation (MC-3001) has none: it still opens
  with Join and the organization's name, and names Panivo only in its last
  line. Stop the client and restart the API: the log says the mark does
  not answer, and the next reset email opens with Panivo alone, no image
  and no empty box beside it. Start the client again: within ten minutes
  the log says the mark answers, and the next email shows it. On the live
  site, with a phone's mail app in dark mode if one is to hand, ask for a
  reset for your own address: the plate stands clear on the dark
  background and Panivo reads light, not navy; with the mail app blocking
  images, an empty box stands where the mark was and Panivo still heads
  the email.
- **MC-3504** A link pasted into a chat. On the live site, once Render
  has `VITE_SITE_URL` (`render.md`), paste the site's address into a chat
  that shows previews (Slack, Teams, Discord, iMessage; WeChat makes its
  own): a card reads Panivo and Inventory, orders, production and
  invoices., with the picture of the P on navy beside Panivo and 品桥,
  sharp, the names not boxes or a fallback font. Paste an invitation link:
  the same card, never the organization's name. Locally, with
  `VITE_SITE_URL` empty, View Source on any page shows og:title and no
  og:image.
- **MC-3505** A phone's bar in each mode. On an Android phone in Chrome
  (or an iPhone's Safari, where it tints its bar): with the phone in light
  mode, the bar above the sign-in page is the page's pale grey, not white;
  in dark mode, the page's near-black, not white over a dark page. Sign
  in, and in the account menu choose Dark with the phone light: the bar
  turns dark with the page, and stays dark on a reload, from its first
  moment. Light with the phone dark: the bar light. System: it follows
  the phone again.
- **MC-3506** The loading mark, in Dark, on a slow connection. In Chrome
  on a computer with the system light, choose Dark in the account menu,
  then sign out. DevTools → Network: Disable cache, Slow 4G; reload: the
  page is dark from the first moment, never a white flash; after a moment
  the P appears in the middle, a white stem and a lighter purple bowl,
  still, not spinning or fading, and a moment later a thin purple bar
  under it, a short stripe sliding left to right along it, with no
  words. The P never shifts as the bar comes. They stay, with no spinner
  beside or after them, until the sign-in page takes their place, still
  dark. With VoiceOver on, the mark reads Panivo, image, and the bar is
  not read. In 中文 too they stay while 中文's words load, then the page.
  Sign in and reload, still on Slow 4G: the mark covers the whole window
  until Home has drawn, and the rail and Home appear together, never the
  rail beside an empty page or a grey block. Choose Light with the system
  dark: the same, light, the bar purple on a pale track. Turn on Reduce
  motion (macOS: System Settings → Accessibility → Display) and reload:
  the bar shows with its stripe standing still in the middle. Stop the API
  and reload: Could not reach the server with Try again, and no mark or
  bar left over it. DevTools → Network, right-click the app's own script
  (`main.tsx` locally, `index-….js` under `/assets/` on the live site) →
  Block request URL, and reload: the mark and bar give way to one line,
  The app could not load. Check the connection, then reload., with Reload
  under it, focused, in the system's font, and VoiceOver reads the line;
  in 中文, 应用未能加载。请检查网络连接，然后重新加载。 with 重新加载.
  Unblock it and press Reload: the page. Turn throttling off and reload: the page's colour,
  then the page, the mark seldom and the bar more seldom still. On the
  live site, after the API has slept (15 minutes with no visit), the first
  visit shows the mark and its sliding bar for up to a minute, never
  still as if frozen, with no spinner, then the page.
- **MC-3507** The pages before sign-in. With `VITE_COPYRIGHT_HOLDER` set
  in `.env` and `npm run dev` restarted, open Sign in, Create an account
  (where registration is open), Forgot your password, a reset link, a
  confirm-email link while signed out, and a page that does not exist,
  signed out. Each has the P and Panivo above it, centred, Panivo bold
  text that a double-click selects, and © 2026 and the holder at the foot,
  in small grey text; every sentence is as before. Stop the API and
  reload: Could not reach the server with Try again, the same name above
  and line below. In Dark (the account menu, then sign out) the P is the
  white stem and lighter bowl, clear on the dark page. VoiceOver reads
  Panivo once, with no image before it, and the footer as the page's
  footer. Empty `VITE_COPYRIGHT_HOLDER` and restart: no line, and no empty
  space where it was. At 125% text the P grows with the name.
- **MC-3508** The same in 中文, on a phone. With `VITE_APP_NAME_ZH_HANS=品桥`
  in `.env` and restarted, open Sign in on a phone (or DevTools at 390 px)
  and choose 简体中文: 品桥 above the form, the © line at the foot still
  in its holder's words; switch to English and back: Panivo, then 品桥.
  Empty the setting: in 中文 the name above is Panivo.
- **MC-3509** The invitation page's footer. Open an invitation link signed
  out (MC-3001): the organization's logo or name and Join … head it as
  before, with no Panivo above; at the foot, a small P, Panivo and the ©
  line, in grey. The same footer on an ended link, a malformed one, an
  organization invitation and Already in this organization. While the
  link is read, only the spinner, with no name or footer.
- **MC-3510** The rail's top. On a computer at 1200 px or wider: the
  organization's logo at the top of the rail, on a white plate on the
  dark rail, or its name in white where it has none, with « beside it on
  one row; the top bar holds search, Help, the bell and you, with no logo.
  Narrow the window below 1200 px: the logo or name is back in the top
  bar, and the menu drawer opens as before. Press «: the rail folds to one
  44 px plate at its top. With no logo, the organization's initials on its
  accent, white on it in Light and dark on the lighter accent in Dark:
  WIDE Naturals Inc. reads WN, and 清禾药业有限公司 reads 清禾. With a
  square logo (Settings → Organization → Branding), the logo on a white
  plate; with a wide wordmark, the initials. Hover the plate, or Tab to
  it: » takes its place and a tooltip says Expand navigation; VoiceOver
  reads WN, Expand navigation (WIDE Naturals Inc.), or with a logo
  Expand navigation and the name. Click or tap it: the rail opens.
- **MC-3511** The rail's foot. At the bottom of the rail, pinned: a
  line, then Powered by, the P and Panivo, small, Panivo brighter than the
  words. At 1280 × 800 it is in view without scrolling, open and folded;
  make the window shorter, to about 500 px: the links scroll on their own
  above the line, cut at it, and the foot stays put. On the dark rail the P
  is white-stemmed in Light and Dark alike; choose the light rail
  (Branding): in Light the navy P, in Dark the white one, clear on each.
  Folded: the P alone; hover it, or Tab to it, and a tooltip says Powered
  by Panivo, which VoiceOver reads. Below 1200 px, the menu drawer ends
  the same way, its foot pinned too: on a phone it is in view as the
  drawer opens, with the links scrolling above it. In Français, Propulsé par; in 中文 with its setting, 由, the
  P, 品桥, 提供支持, on one line.
- **MC-3512** Help's foot. Open Help and scroll to its end: Panivo ·
  Version 0.7.0 · build … · the day, and under it the © line, small and
  grey. In 中文 with its setting, 品桥 · 版本 … ; with no holder set, the
  version line alone.

## Regressions

Bugs a person could have noticed, checked again on every walkthrough. Newest
first.

- **MC-R64** *(a role deleted while it is being given, refused in words,
  #179)* Giving a role and deleting it at the same moment is too narrow to
  aim for by hand; the server's e2e tests hold it open, and the delete
  waits, then says who holds the role or that an invitation names it. By
  hand, the invitation such a race used to leave: as the demo Owner,
  invite an address as Warehouse with Copy link, then take its roles away
  in the database (`delete from invitation_roles where invitation_id =
  (select id from invitations where email = '…')`). Open the link in a
  private window, give a name and a password and join: the page reads
  This invitation has ended, never Internal server error, and the address
  has no account. On Invited, Resend says the roles it named have been
  deleted. Found by `/code-review` on #176.
- **MC-R63** *(no English inside a French or Chinese message, #129)* In
  Français, then in 简体中文: with 简体中文 checked under Product names
  required on invoices and a customer set to Chinese, issue an invoice for
  a product with no Chinese name. The refusal names the language 简体中文,
  as the product page lists it, never Simplified Chinese, and says to add
  its 简体中文 name on its product's page. On a sale to a customer with a
  default price list, add a line for an item not on the list: why it is
  unpriced reads in the app's language, the list's name and the SKU as
  typed. Inventory → a row's Ship out, for more than can be taken while
  some is held: the refusal ends in the app's language, des commandes
  confirmées or 已确认的订单, and shipping an order more than it holds
  ends with d’autres commandes or 其他订单. Found reading the source.

- **MC-R62** *(the credit note's sentence a note, a shipment's header an
  h3, #171)* With VoiceOver on, open CN-000001: the sentence that says
  what it credits, Credits against INV-000001, is not announced as the
  page arrives, and is read where it stands, as a note. In Chrome's
  DevTools, Accessibility, its role is note, not alert. On SO-DEMO-1's
  Shipments tab, each shipment's header, its day, carrier and tracking
  number, is a heading level 3 under Shipments, level 2; VoiceOver's
  rotor lists them so under Headings. Both look as before. Found by the
  walkthroughs on `walkthroughs-older`.

- **MC-R60** *(a return and an RMA by the organization's day, #174)* With
  the organization in Vancouver and the computer set to Shanghai, as
  MC-2606 does, after 5 pm in Vancouver: take a return on a shipped sale.
  The order's Returns tab heads it with Vancouver's today, the same day
  as the Shipments tab heads a shipment made now, and its Link to an RMA
  dialog says Received with that day. Raise an RMA on the same order: its
  page says raised today, the Returns list's date is today, and its Link
  a return dialog lists the return by today. Not tomorrow, Shanghai's
  day, in any of them. Found by the reviews of #172.

- **MC-R61** *(Close order filled only once nothing is left, #158)* As
  the demo Owner, PO-DEMO-4, with cartons still due: Close order in the
  summary is outlined, not filled. A purchase received in full but not
  yet closed shows Close order filled. On SO-DEMO-1, part shipped, Ship
  is the filled button and Close order outlined under it; on SO-DEMO-QC,
  shipped in full, there is no Ship and Close order is filled. Found by
  the walkthroughs on `walkthroughs-older`.

- **MC-R59** *(To ship and To receive, only what is still to come, #163)*
  As the demo Owner, on Home: To ship leaves out SO-DEMO-QC and
  SO-DEMO-ZH, shipped in full though still confirmed until closed, and
  its count is as many as its rows. See all opens Orders with Sales only,
  Confirmed and Still to ship, listing the same orders; clear Still to
  ship and the two are back. To receive the same for purchases: one
  received in full leaves it, one received in part stays, and its See all
  reads Still to receive. In Français the filter reads Reste à expédier;
  in 中文, 待发货. Found by the walkthroughs on `walkthroughs-older`.

- **MC-R58** *(Link a return waits for the returns, #126)* On SO-DEMO-7's
  open RMA, in DevTools, Network, Slow 4G, press Link a return: while the
  order's returns load there is no empty Return field, and then the dialog
  says every return on this order already counts against an RMA. The
  console shows no MUI warning about `children`. Found by the e2e test
  "links a return that arrived before the RMA".

- **MC-R57** *(Recently opened's kinds in sentence case, #223)* Open
  SO-DEMO-1 and a product, then Home: in Recently opened, each tile's kind
  reads Order and Product, not ORDER and PRODUCT, quieter than the
  record's name under it. In Français, Commande and Produit. Found by
  `/simplify` on #196.

- **MC-R55** *(quantities read without padding zeros, #213)* Products →
  Calm 90ct → Recipe: Makes 1,000 per batch, not 1000.0000. On SO-DEMO-7,
  Take a return: MAGCAP-60 reads 48 shipped, 0 already back, and its lot
  MC60-0815 reads 48 under Shipped and 0 under Already back. Against RMA,
  its open RMA: authorizes 2, 0 back against it so far. In Français the
  batch reads 1 000. Found by #196's comparison.

- **MC-R54** *(the bell's Mark all read reached by the keyboard, #196)*
  Tab to the bell and press Enter: the first entry takes the focus once
  the list has loaded. Shift+Tab reaches Mark all read, and Tab from it
  goes back to the entries; Escape closes the bell's menu and puts the
  focus back on the bell. With the list failed to load, as MC-R43 does it,
  Tab reaches Try again. It looks as before. Found by #196's axe pass.
  With something unread, Shift+Tab to Mark all read and press Enter: the
  entries turn read, Mark all read goes, and the first entry has the
  focus, not the panel around it. In DevTools, Network, Slow 4G: open the
  bell and, while it says Loading…, Shift+Tab to Mark all read; when the
  entries arrive the focus stays on it. In Chrome's DevTools,
  Accessibility, the bell has a popup, dialog, and is not expanded; open
  it: expanded, and the panel is a dialog named Notifications, holding
  Mark all read and the menu. VoiceOver on Mark all read says it is in
  Notifications. All found by `/code-review` on #196.

- **MC-R53** *(options under a heading, a group of their list, #196)* In
  the search box type DEMO; in Chrome's DevTools, Accessibility, the list
  holds a group named Orders with its results in it as options, and one
  group for each other heading. Settings → Organization's time zone list
  holds This device and All time zones the same way. Both look as before.
  Found by #196's axe pass.

- **MC-R52** *(money too long for a JavaScript number, #130)* On draft
  SO-DEMO-3, Add item: any item, quantity 1, priced 98765432109876.5432
  CAD, the most digits a price holds. The line's price and total, and the
  order's total, each read $98,765,432,109,876.54, never .55: the amount
  is written from its digits, not through a JavaScript number (ADR-025).

- **MC-R51** *(a contact with neither an email nor a phone, #138)* On a
  partner, add a contact with a name and nothing in Email or Phone, and
  save: the dialog stays open and says Give an email or a phone, so the
  contact can be reached, never Something went wrong. The same with Primary
  ticked. In Français Indiquez un courriel ou un téléphone, pour que le
  contact puisse être joint; in 中文 请填写电子邮箱或电话，以便联系到对方.
  Fill in either and save: the contact is added. Found while running the
  full suite for ADR-075.

- **MC-R50** *(each member's roles in the export, #180)* As the demo
  Owner, make a role named Sales, North in Settings → Roles, give it to a
  member beside the role they hold, then Download everything:
  `members.csv` names both in that member's `role` column, and
  `membership_roles.csv` has a row for each, by `user_id` and `role_id`,
  one of them the id `roles.csv` names Sales, North: two roles, where the
  column alone could as well be three. The README's glossary says to count
  and join by `membership_roles.csv`, in English, Français and 中文. Found
  by `/code-review` on #176.

- **MC-R49** *(colours given as a path, #196)* In light and in dark:
  Home's detail lines, SO-DEMO-1's notes under its figures (not counting 1
  voided shipment) and the bell's times are grey, not the main text
  colour, and the order's crumb, SO-DEMO-1, is darker than Orders before
  it. Take a return's Not on … line, Close this organization's download
  again line, for an export more than a day old, and a draft invoice's
  None yet under Tax are amber. In the search box, type DEMO and press ↓:
  the highlighted result's grey line turns the main text colour, and back
  to grey once the highlight moves on; Settings → Organization's time
  zone list does the same, and its chosen zone keeps the main text
  colour. Open the bell's menu and press ↓: the entry the keyboard is on
  has its time in the main text colour, the others' stay grey. Found
  while building ADR-081. On Home, as the demo Owner, Expiring soon's
  Change the days is grey and underlined, on a phone too, where nothing
  hovers (found by #196's usability walkthrough).

- **MC-R48** *(typographic apostrophes in English, #184)* In English, as
  Tom Becker open a sale's invoice by its address, as MC-3320 does: You
  don’t have access to this. Open
  `/orders/00000000-0000-7000-8000-000000000000`: This order doesn’t
  exist. Offline, open Inventory: Can’t reach the server. Your account's
  Email field says Changing your email address isn’t available yet., and
  SO-DEMO-1, with its RMA, says Returns don’t reopen an item. Each with ’,
  never a straight apostrophe. Found by the usability walkthrough on #176.

- **MC-R47** *(`npm run api` beside the dev server, #194)* With
  `npm run start:dev` running in `server/`, change any file in `src/`
  and run `npm run api` in another terminal: it writes `openapi.json` and
  the client's types on its first run, and the dev server restarts and
  keeps answering, `curl localhost:3000/health` 200, with no Cannot find
  module in its log. Run it twice more, changing a file each time: the
  same. `dist/` is left as the dev server built it; the document's build
  is in `dist-openapi/`. Found while building ADR-081.

- **MC-R46** *(a list that failed to load, #195)* With the API stopped,
  or `/api/v1/orders` blocked in the browser's Network tab, open Orders:
  the red line, with Try again, and nothing under it, never Nothing open.
  nor an empty table. Unblock it and press Try again: the orders. The same
  on Inventory, Movements, Invoices, Credit notes, Returns, Production,
  the audit log, a record's History, and an inventory row's History
  dialog. A Load more that fails keeps the rows, with the red line above
  them and no Try again. In Français Réessayer, in 中文 重试. Found while
  building ADR-081.

- **MC-R45** *(a request's fields on its own log line only, #193)* With
  `npm run start:dev` in `server/`, ask
  `curl -H 'X-Api-Revision: 2' -H 'X-Request-Id: mc-r45' 'localhost:3000/v1/orders?search=Wang'`:
  the server's log has two lines with `reqId` `mc-r45`. Refused a client
  newer than the API carries no `req`, and neither `Wang` nor the
  headers; request completed carries `req`, its URL with
  `?search=Wang` and its headers. On Render, searching the log for a
  request id a person quotes finds both. Found while building ADR-081.

- **MC-R44** *(Resend on the confirm-your-email banner, #190)* Signed in
  unconfirmed, on any page but Home, block
  `/api/v1/auth/verify-email/resend` in the browser's Network tab and
  press Resend on the banner: under its line, Could not reach the server.,
  and Resend still there, never Sent nor nothing at all. Unblock it, then
  press Resend and reload three times over: the fourth within five
  minutes says the server's own words about too many requests, in the
  same place. Found by ADR-081's inventory.

- **MC-R43** *(the bell's list that failed to load, #189)* With the API
  stopped, or `/api/v1/notifications` blocked in the browser's Network
  tab, open the bell: it says Could not load notifications., with Try
  again, never Nothing yet. Unblock it and press Try again: the list, or
  Nothing yet. if there is none. In Français Impossible de charger les
  notifications., in 中文 无法加载通知。. Found by ADR-081's inventory.

- **MC-R42** *(a language that won't load, in its own words)* In 中文,
  with the Chinese catalogue blocked, the banner the app starts with, and
  the message when switching to it, are in Chinese, never in English alone
  (MC-3418, MC-3419). Found by ADR-081's walkthrough, the novice
  bookkeeper starting the app in 中文.

- **MC-R41** *(a new version, read aloud)* With VoiceOver and a dialog
  open, a new version coming out is said in the dialog, never lost behind
  it; once saves would be refused, what is said is that this tab can no
  longer save, never only that it loads at the next page (MC-3401,
  MC-3404). Found by the walkthroughs of ADR-081, the warehouse worker
  receiving on a phone and the novice bookkeeper drafting an invoice.

- **MC-R40** *(a page waiting in the background)* A page saying A new
  version is being installed, in a tab left behind another, asks nothing
  until it is looked at again: no read each minute in the Network tab, and
  a person's page never loads in full by itself while hidden (MC-3412).

- **MC-R39** *(Home's tiles)* On a computer, the Owner's eight tiles on
  Home read as two rows of four, never seven and one alone (MC-3423).

- **MC-R38** *(Home's rows, read aloud)* With VoiceOver, a row on Home
  reads its number and its partner as two words, PO-000009 Lakeshore
  Packaging, never run together as PO-000009Lakeshore (MC-3422).

- **MC-R37** *(the status tones, #172's review)* In dark mode and in
  light, Something went wrong's warning sign stands out from its disc,
  never a faint red on red, and Home's line for a card with nothing in it
  is green and easy to read on the dark card, never plain white (MC-3421).

- **MC-R36** *(a language that won't load)* In 中文, block
  `*compiled/zh-Hans*` (DevTools → Network request blocking) and reload:
  the app in English with a banner saying why, never a blank page. In
  English, choosing 简体中文 while it is blocked says so at the foot of the
  screen, and a reload is still in English.
- **MC-R35** *(Home's failure line)* Offline (DevTools → Network), open
  Home: it says Could not reach the server., as every other page does,
  never the browser's Failed to fetch; in 中文 无法连接服务器。
- **MC-R34** *(the menu on a phone)* At 390 px with VoiceOver, Open
  navigation: the menu is read as a dialog named Navigation (导航 in
  中文), and Close navigation closes it.
- **MC-R33** *(a step done, to a screen reader)* With VoiceOver, on Home,
  a ticked step in Getting started or Your first week reads its title,
  then done, as two words: Say who you are (done), never you are(done); in
  Français … (fait).
- **MC-R32** *(Home's date line)* In English, Home's line under the
  greeting reads Thursday, October 22 · Demo …, a space either side of the
  dot, as it does in Français and 中文.
- **MC-R31** *(your own row on Members)* With VoiceOver, on Members at
  1280 px and at 390 px, your own row reads your name, then you, as two
  words (Anika Sharma you, in Français Anika Sharma vous, in 中文 李静 您,
  addressing you as every Chinese screen does), never run together; the
  mark sits a little apart from the name, as before.
- **MC-R30** *(lists in British English)* With the browser's language set
  to English (United States) and the app in English, a list of three reads
  with no comma before its "and", while dates keep the American order. As
  the demo Owner, Organization → Profile, Close this organization…: Still
  needed: the download (or “I don’t need a copy”), the name and your
  password. MC-3304's correction refused to Daniel Okafor names Demo Owner,
  Anika Sharma and 李静. In Français … et …, in 中文 …、…和…, as before.
- **MC-R29** *(the account menu from the keyboard, #151)* With the keyboard
  alone, open the account menu and arrow down to Colour mode: Enter opens
  its choices, the arrow keys move through them and Enter chooses; the
  menu stays open and focus is back on the row, which a screen reader reads
  with its new choice. Space on Text size opens it, Escape closes it back
  to the row, and the arrow keys go on to the next row. Language the same.
  The console has no :focus-visible warning.
- **MC-R28** *(an order's summary first on a phone, #155)* At 390 px, open
  SO-DEMO-2, choose Skip to content and Tab on: Ship and the order's own
  actions come before the Items tab and the lines' actions, in the order
  they are seen. At 1280 px the tabs and lines come first and the summary
  at the right after them, as before.
- **MC-R27** *(focus back from a dialog, #155)* With the keyboard alone, at
  1280 px and at 390 px: on Products, Add product, then Escape; on
  SO-DEMO-2, Ship, then Cancel; on PO-DEMO-9, a line's Receive, then
  Escape; on Account, Delete my account, then Cancel; on a product, History,
  then Escape; on a role made here, Delete, then Cancel, and Move everyone
  to…, then Escape. Each time focus is back on the button that opened it,
  with its ring, and Enter opens it again; a screen reader names that
  button, not the page from the top.
- **MC-R26** *(French guillemets)* In Français on a phone (390 px), read
  the note under Numbering, « Imprimé ainsi », and Security's « Rester
  connecté »: a « never ends a line with its words on the next. Profile's
  Utiliser celui de cet appareil : … never starts a line with its colon.
- **MC-R25** *(shipping on a phone)* At 320 px and 390 px with Larger
  text, open Ship on SO-DEMO-2, choose the location that holds its lot,
  and Choose lots: the line's Ship field sits under its words at the
  right, showing 500.0000 whole; the lot reads FOC-2609-01 on one line,
  and its own Ship field is wide enough for 500.0000, the table scrolling
  inside its box to reach it; Carrier and Tracking number sit one under
  the other, each label whole. At 1280 px each pair sits side by side as
  before.
- **MC-R24** *(late on Home)* With something late, such as PO-DEMO-9, Home's
  To receive (and To ship, Expiring soon or Licences, whichever has a late
  one) is tinted the pale red of a red chip, its title, count and "1
  overdue" in dark red, easy to read; in dark mode a dark tint with light
  red words. A tile with nothing late is plain.
- **MC-R23** *(links under a page's title)* Open an order with an expected
  day, such as PO-DEMO-9, a duplicated order, INV-000001 and an RMA: under
  the number, every link (the partner's name, "duplicated from a previous
  order", Order SO-…, the invoice's number) is underlined before any hover,
  so each is told from the words beside it without its colour. Learn more
  under Exchange rates, Stock value and Price lists keeps its icon and
  underlines only on hover, as Learn more does everywhere.
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
  one. Then on a phone signed in as B, with the app's tab in the
  background while A changes organization: bring the tab back, and it
  catches up without a reload, as a clicked window does.
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
  two dates and Period wrap under the search. On a sale that has shipped,
  such as SO-DEMO-1, Authorize a return and Take a return drop under Items
  at the right. No page scrolls sideways. At 1280 px, at Standard, every
  button reads on one line as before.
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
- 2026-10-20: an order's reference reads 参考号 in Chinese: MC-3206 extended.
- 2026-10-20: the invitation email's link sits under its action with no
  colon: MC-3001 extended.
- 2026-10-20: while Getting started shows, the quick actions are outlined:
  MC-1559 extended.
- 2026-10-20: the welcome's foot opens Help from its word and icon:
  MC-3207 extended.
- 2026-10-20: Help beside the page on a computer, the rail folded while it
  is open: MC-3202 and MC-3203 rewritten.
- 2026-10-20: progress bars read empty with nothing done: MC-3209 extended.
- 2026-10-20: Undo stays while focus or the pointer is on it, the welcome's
  and the gallery's: MC-1801 and MC-3207 extended.
- 2026-10-20: the Admin's line says invite, not add: MC-3001 extended.
- 2026-10-20: the Owner's line goes on in lower case after its colon:
  MC-3106 extended.
- 2026-10-20: while Getting started shows it follows the welcome, before the
  quick actions: MC-1559 and MC-3209 extended.
- 2026-10-20: #144 on a phone, a tab brought back from the background:
  MC-R22 extended.
- 2026-10-20: Undo stays while it has focus once the pointer has passed
  over it and gone: MC-1801 and MC-3207 extended.
- 2026-10-20: where Help slides over at Large text: MC-3203 extended.
- 2026-10-20: an order's links under its number are underlined: MC-R23.
- 2026-10-20: Home's late tiles in the critical tone, readable: MC-R24.
- 2026-10-20: the Shipments tab heads a shipment with the organization's
  day: MC-2605 extended.
- 2026-10-20: a partner's document languages show the default and Nothing
  else when left alone: MC-1409 extended.
- 2026-10-20: the numbering's fields labelled on a phone: MC-2710 extended.
- 2026-10-20: the Ship dialog's fields on a phone: MC-R25.
- 2026-10-20: an order's Items actions wrap on a phone: MC-R18 extended.
- 2026-10-20: Keep my account says the account is kept: MC-2302 extended.
- 2026-10-20: the audit log's From column has its own word in 中文 and
  Français: MC-2901 extended.
- 2026-10-20: the audit log's intro says what an arrow means: MC-2901
  extended.
- 2026-10-20: a credit note's chip says what it does, as Voids invoice
  does: MC-1532 extended.
- 2026-10-20: Home's time-zone note leads an Owner to the setting: MC-2606
  extended.
- 2026-10-20: the zone picker says this device, as Account does: MC-2602,
  MC-2603 and MC-2610 reworded.
- 2026-10-20: French guillemets hold their words: MC-R26.
- 2026-10-20: the French Still on UTC note reads plainly: MC-2602 extended.
- 2026-10-20: a price list's price names its item in the audit log:
  MC-2901 extended.
- 2026-10-20: the Chinese audit log and exports in the glossary's words:
  MC-2904 extended.
- 2026-10-20: the deletion email names Keep my account and where it is:
  MC-2302 extended.
- 2026-10-20: what closing still needs reads the download's alternative as
  one item: MC-2402 extended.
- 2026-10-20: every link in a page's subtitle is underlined, on an invoice
  and an RMA too: MC-R23 rewritten.
- 2026-10-20: a deletion asked for again shows its banner over the kept line:
  MC-2302 extended.
- 2026-10-20: a closing asked for again shows its banner over the kept line:
  MC-2404 extended.
- 2026-10-21: Learn more under a page's title keeps its own look: MC-R23
  extended.
- 2026-10-21: a shipment's Void dialog names the organization's day:
  MC-2605 extended.
- 2026-10-21: a dialog gives focus back to the button that opened it, and
  an order's summary comes first in a phone's Tab order (#155): MC-R27 and
  MC-R28.
- 2026-10-21: ADR-080, each member's and invitation's roles in rows of their
  own: section 33, MC-3301.
- 2026-10-21: ADR-080, the permissions and their words, prices on orders
  for the built-in roles and their lines in the export: MC-3302.
- 2026-10-21: ADR-080, the server: the demo's Tom Becker and Fatima Haddad
  hold the made roles Warehouse and Sales, giving only what you hold, the
  refusal in words, prices on orders, and a made role without an article:
  MC-1903, MC-3007 and MC-3211 changed, MC-3303 to MC-3306.
- 2026-10-21: ADR-080, correcting a count and a licence override refused
  in words: MC-3304 extended.
- 2026-10-21: ADR-080, a refusal names who could give what is missing, the
  Owners first, and a release that needs an override names the permission
  in words: MC-3304 rewritten.
- 2026-10-21: ADR-080, the client: Settings → Roles, a role's page and the
  editor; Members with several roles, Change roles and Remove (#147);
  Invite with several roles; orders without their prices; each screen
  reading only what its reader may; the refusal's own words on the 403
  page; the first week's Receive for receiving alone; Members and Roles
  out of the menu with no organization (#169): MC-3307 to MC-3321, and
  MC-1413, MC-3001, MC-3305 and MC-3007 changed. The account menu's
  preferences from the keyboard (#151): MC-R29.
- 2026-10-21: ADR-080, a lot-tracked line received without seeing products,
  and a trace's partners, orders and runs as text where its reader may not
  open them: MC-3322 and MC-3323.
- 2026-10-21: ADR-080, an order's partner as text where its reader may not
  open it: MC-3323 extended.
- 2026-10-21: ADR-080, the demo's PO-DEMO-11 waiting to be received, so
  receiving a lot-tracked line without the catalogue is walked as Tom
  Becker: MC-3322 rewritten.
- 2026-10-21: ADR-080, the guides: Roles, new, and Members and Your
  account changed, in three languages; the glossary's permission, made
  role, Move everyone to… and Remove from the organization: MC-3324.
- 2026-10-21: English lists are British, with no comma before the "and",
  on the server and the client: MC-R30, and MC-3304 changed.
- 2026-10-21: French gives a role with attribuer everywhere, the server's
  refusal and the Roles guide as the screens: MC-3303 changed.
- 2026-10-21: the Orders guide says why an order may show no prices:
  MC-3318 extended.
- 2026-10-21: whom to ask, on Home and Your access, names only who could
  change the reader's roles, as a refusal does: MC-3325.
- 2026-10-21: a role you cannot give says an Owner can: MC-3313 and
  MC-3316 changed.
- 2026-10-21: a role nobody holds says where to give it: MC-3309
  extended.
- 2026-10-21: the words that still gave a member one role: MC-3326.
- 2026-10-21: your own row on Members reads your name and you apart:
  MC-R31.
- 2026-10-21: Members marks your row 您 in Chinese: MC-R31 extended.
- 2026-10-21: Home's date line keeps its space before the organization in
  English: MC-R32.
- 2026-10-21: a step done reads after a space, in English too: MC-R33.
- 2026-10-21: the time zone's French colon held to its words: MC-R26
  extended.
- 2026-10-21: the menu on a phone is a dialog with a name: MC-R34.
- 2026-10-21: People's roles drawn as Members' are: MC-3327.
- 2026-10-21: a joined notification stored before several roles still
  reads in every language: MC-3306 extended.
- 2026-10-21: the audit log needs prices on orders: MC-3309 extended.
- 2026-10-21: focus comes back from a dialog keyed by whether it is open,
  as Ship's and Receive's are: MC-R27 extended.
- 2026-10-21: a role named like an object's own key reads as named:
  MC-3309 extended.
- 2026-10-21: Move everyone only on a role the reader may give, and Delete
  reading the role again once someone holds it: MC-3311 extended.
- 2026-10-21: MC-3309's Raise an order ticks what the editor says it does.
- 2026-10-21: an invitation you cannot resend, and a role with nowhere to
  move its holders, say an Owner can: MC-3317 changed.
- 2026-10-21: a made role's chip told from a built-in one by its shape,
  not by colour alone (WCAG 1.4.1): MC-3312 and MC-3327 changed.
- 2026-10-22: ADR-081, a new version noticed: section 34, MC-3401 to
  MC-3406.
- 2026-10-22: ADR-081, a page that won't load says why: MC-3407 to
  MC-3410, and MC-R35 for Home's failure line.
- 2026-10-22: ADR-081, the reload at the next page once per new version:
  MC-3411 added, MC-3401 changed.
- 2026-10-22: ADR-081, the API revision sent, and an outdated tab's
  refusals on screen: MC-3412 to MC-3417.
- 2026-10-22: ADR-081, the bell rests in an outdated tab: MC-3412
  extended.
- 2026-10-22: ADR-081, a language that won't load says so: MC-3418 to
  MC-3420, and MC-R36.
- 2026-10-22: ADR-081, the status tones' contrast: MC-3421, and MC-R37
  for #172's review.
- 2026-10-22: ADR-081, references kept whole: MC-3422, and MC-R38 for
  Home's rows read aloud.
- 2026-10-22: ADR-081, references kept whole in refusals: MC-3422
  extended.
- 2026-10-22: ADR-081, Home's tiles in even rows: MC-3423, and MC-R39.
- 2026-10-22: ADR-081, the client deployed after the API: MC-3424.
- 2026-10-23: ADR-081's reviews, reads only while the tab is in front
  (S8, S9): MC-3412 extended, and MC-R40.
- 2026-10-23: ADR-081's reviews, one place for an outdated refusal (S1,
  S2, S5): MC-3412 and MC-3413 extended.
- 2026-10-23: ADR-081's reviews, the image upload refused as api() refuses
  (S3): MC-3412 and MC-3413 extended.
- 2026-10-23: ADR-081's reviews, refusals in words on Forgot your password
  and in Move stock (R3, R5): MC-3412 and MC-3422 extended.
- 2026-10-23: ADR-081's reviews, an outdated tab through sign-out and
  idle pings (R4, R8): MC-3412 and MC-3415 extended.
- 2026-10-23: ADR-081's walkthroughs, the new version read aloud in a
  dialog and urgent when urgent (W1, W2): MC-3401 and MC-3404 extended,
  and MC-R41.
- 2026-10-23: ADR-081's walkthroughs and review, a language that won't
  load says so in its own words (W4, W5, U1, U2): MC-3418 to MC-3420
  rewritten, and MC-R42.
- 2026-10-23: ADR-081's review, secondary text drawn grey where this
  branch added it (R6): MC-3407 extended; MC-3405 now holds.
- 2026-10-23: the product's icon in the tab, and its masters in
  `docs/brand/`: section 35, MC-3501.
- 2026-10-23: a list page's tab ends with the product's name, the
  setting index.html's title reads: MC-3502.
- 2026-10-23: #189, the bell's list that failed to load says so:
  MC-3412 and MC-3413 extended, and MC-R43.
- 2026-10-23: #190, Resend on the confirm-your-email banner says why it
  failed: MC-R44.
- 2026-10-23: #193, a request's URL and headers on its own log line only:
  MC-R45.
- 2026-10-23: #195, a list that failed to load shows only the failure,
  with Try again: MC-R46.
- 2026-10-23: #194, `npm run api` builds apart from the dev server:
  MC-R47.
- 2026-10-23: #184, typographic apostrophes in English, and the
  catalogues' check holding them: MC-R48.
- 2026-10-23: #138, a contact with neither an email nor a phone is
  refused in words, not a 500: MC-R51.
- 2026-10-23: #130, money on screen written from its digits, never a
  JavaScript number: MC-R52.
- 2026-10-23: #180, each member's roles in `membership_roles.csv`:
  MC-3301 extended, and MC-R50.
- 2026-10-23: #196, colours given as a path drawn again, grey and amber:
  MC-R49.
- 2026-10-23: #196's comparison, options under a heading as a group of
  their list: MC-R53.
- 2026-10-23: #196's comparison, the bell's Mark all read and Try again
  reached by the keyboard: MC-R54.
- 2026-10-23: #196's ride-along, Deploy run by hand: MC-3425.
- 2026-10-23: the live site checked after each deploy: MC-3424 and
  MC-3425 extended.
- 2026-10-23: #196's ride-along, the review export of only what changed
  since a commit: MC-1405 extended.
- 2026-10-23: #196's review, Deploy by hand only from `main`, in the
  `production` environment: MC-3425 extended.
- 2026-10-23: #196's review, the bell's focus after Mark all read and
  while its list loads: MC-R54 extended.
- 2026-10-23: #196's review, the bell's panel a dialog named
  Notifications, the bell saying it opens one: MC-R54 extended.
- 2026-10-23: #196's review, Home's Change the days always underlined:
  MC-R49 extended.
- 2026-10-24: #213, the recipe's batch size and Take a return's
  quantities read without padding zeros: MC-R55.
- 2026-10-24: #223, Recently opened's kinds in sentence case: MC-R57.
- 2026-10-24: ADR-082, one icon on a navy plate for the tab, the ICO,
  the taskbar and an iPhone's home screen, made by
  `scripts/brand-assets.mjs`: MC-3501 rewritten.
- 2026-10-24: ADR-082, the product's emails open with its mark and
  name, an invitation's still with the organization's: MC-3503.
- 2026-10-24: ADR-082, the emails' mark shown only once the static site
  serves it, the name alone until then: MC-3503 extended.
- 2026-10-24: ADR-082, the names and the © holder as settings, and
  index.html's manifest, theme-color, card and loading mark: MC-3501 and
  MC-3502 extended (the home screens' name, the tab in 中文 by its
  setting); MC-3504 to MC-3506.
- 2026-10-24: ADR-082, the loading mark kept until the first screen is
  on view, with no spinner under it: MC-3506 rewritten.
- 2026-10-24: ADR-082, a thin bar under the loading mark once it has
  been up a moment, still under reduced motion: MC-3506 extended.
- 2026-10-24: ADR-082, Panivo on every page before sign-in and in an
  invitation's footer, the organization at the rail's top and Panivo at
  its foot, Help's foot naming the product: MC-3507 to MC-3512; MC-1102's
  rename and MC-1702's logo now at the rail's top.
- 2026-10-25: ADR-082, the rail's foot and the drawer's pinned, in view at
  any window height: MC-3511 extended.
- 2026-10-25: ADR-082's review, the app's own files not loading: one line
  and Reload in the loading mark's place, in the reader's language:
  MC-3506 extended.
- 2026-10-25: #126, Link a return's select drawn once the returns arrive:
  MC-R58.
- 2026-10-25: #163, To ship and To receive count only orders with something
  still to ship or to come, as the Orders list they open: MC-R59.
- 2026-10-25: #158, Close order outlined while goods are due, filled once
  nothing is left: MC-R61.
- 2026-10-25: #174, a return and an RMA dated by the organization's day, as a
  shipment is: MC-R60.
- 2026-10-25: #171, the credit note's sentence a note, not an alert, and a
  shipment's header an h3 under the Shipments tab's h2: MC-R62.
- 2026-10-25: #179's second half, a role deleted while it is being given
  refused in words, and an invitation left naming no role ended when
  accepted: MC-R64.
- 2026-10-25: #129, the missing-name refusal, a line's price notice and the
  held-stock refusal wholly in the reader's language: MC-R63.
