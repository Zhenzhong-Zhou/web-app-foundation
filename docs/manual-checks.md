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
lot **ELD-24A** expiring in 20 days, **THE-0915** waiting for a cost
(PO-DEMO-5), **PO-DEMO-4** partly received, run **CALM-RUN-01** released
and **CALM-RUN-02** planned, **SO-DEMO-3** a draft, **SO-DEMO-4**
cancelled, **SO-DEMO-5** shipped with its invoice in draft, a discontinued
product and a retired partner.

Keep a second browser profile, or a private window, for a second user and a
second organization.

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
- **MC-109** Add an Admin and sign in as them. They can manage members, but
  changing or removing the Owner is refused.
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
  says to add one.
- **MC-703** The printed invoice: amounts rounded to the currency, tax per
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
  hours (ADR-053's RTO).
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
- **MC-1412** Printed documents follow the customer, not the reader.
  With the screens in English, a partner set to Français then English:
  ship, print the packing slip — every heading reads "French / English"
  at the same size, figures once with a decimal comma, the unit named in
  both. Invoice it: the draft's printout is already French and English,
  with no item names in French yet; issue it with a French name on one
  product, and the printed line shows the French name and the English
  under it at the same weight, the other product's name once. Credit it,
  change the partner to 简体中文 alone, and print the credit note: still
  French and English, as its invoice was. A partner in 简体中文 alone
  prints Chinese only, glyphs Chinese rather than Japanese forms. Paper
  shows no Back link or Print button, in any language.
- **MC-1413** Signed out, in 简体中文, sign in with a wrong password: the
  banner reads 邮箱或密码错误, not English; in Français, Courriel ou mot de
  passe invalide. Signed in, in Français, try to remove yourself from
  Members: the refusal is French. In 简体中文, ship more than an order
  has outstanding, cancel an order goods have moved against, and release
  a run under an expired licence: each refusal is Chinese, the statuses
  in it too (已确认, not "confirmed"). A request with a field the server
  refuses, such as a quantity of -1 sent with curl and
  `Accept-Language: fr-CA`, names the field as the API does
  (lines.0.quantity) in a French sentence. The same requests with no
  Accept-Language answer in English word for word.
- **MC-1414** With the account's language set to Français, request a
  password reset: the email (Mailpit) is French, subject included. Sign
  out, switch the page to 简体中文, and request one for an account with
  no language chosen: Chinese. Sign in from a new browser: the security
  email and the bell's notification are in the account's language. Close
  an order line short: a member set to English reads "will not be
  delivered in full" while a member set to Français reads it in French.
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
      password form and its devices-signed-out message, Active sessions
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
      packing slip stays English until printed documents (step 5);
    - invoices: the list with its status tabs, an invoice with its lines,
      totals, parties and credit notes, the draft's details and tax code,
      the line, issue, void, credit and delete dialogs, and a credit note's
      page. The printed invoice and credit note stay English until step 5;
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
    - members: the list, changing a role and adding a member, with the
      built-in roles (Owner, Admin, Viewer) named in the language and a
      role the organization named itself shown as named;
    - audit: the audit log with its filters and the History panel on a
      record, timestamps and action names in the language ("Commande
      expédiée", not "Order shipped"); field names stay as the API names
      them.

  A refusal from the server (a wrong password, a rule broken) stays in
  English until the server translates (ADR-054, step 6), and so do
  notifications written before that.

## 15. The look (ADR-055)

The screens are being redesigned in steps; these check what is in place.
Paper is checked first because it must not change at all.

- **MC-1501** Open the demo's INV-000001 and choose Print, in light mode
  and again in dark. On screen the document is a white sheet, padded, with
  the app around it; the print preview is black on white with nothing of
  the app, and reads exactly as it did before ADR-055. The packing slip
  and the credit note the same.
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
  message with Raise an order under it; with Fulfilled pressed and none
  fulfilled, only "No orders match that filter."

## Regressions

Bugs a person could have noticed, checked again on every walkthrough. Newest
first.

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
- **MC-R06** *(ADR-055)* Signed in with an unconfirmed email, print
  an invoice: the "Confirm your email address" banner is on screen and not
  on the paper or in the print preview.

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
