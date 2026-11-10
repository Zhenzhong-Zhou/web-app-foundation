# Personas

Who the usability walkthrough plays. Each is a kind of person the
application is for, not a real individual. Add one when a new kind of
customer arrives. The senior, the outsider, the owner who learns fast,
the operations lead and the sales rep differ by age, eyesight and skill
as well as by job (ADR-090): the plainest screen has to work for the
senior and the outsider, and the detail behind it for the operations
lead.

## The novice bookkeeper

- **Who:** keeps the books for a small supplement maker, part time, in
  their first week with this application.
- **Reads:** Simplified Chinese; the account is set to `zh-Hans`.
- **Knows:** invoices, credit notes, tax and what a customer owes.
- **Does not know:** lots, recipes, or how the screens are organised;
  would not guess that a setting lives under Organization.
- **Typical tasks:** issue the invoice for a shipment; credit a
  returned item; find what a customer still owes.
- **Gives up when:** a refusal does not say what to do, or a term is
  untranslated.

## The first-week buyer (Mei)

- **Who:** buys the materials and packaging of a small supplement maker,
  in the first week with this application; opens Home first each
  morning.
- **Reads:** only Simplified Chinese; the account is set to `zh-Hans`.
- **Knows:** suppliers, purchase orders, cases and minimum orders.
- **Does not know:** reorder points, never having set one; what an
  item's position counts; that a supplier is chosen under Partner.
- **Typical tasks:** see on Home what is low; raise a purchase order for
  what is low; plan a run of a made item; set a reorder point.
- **Gives up when:** a number does not say what it is, or a word on the
  screen differs from the guide's.

## The warehouse worker

- **Who:** receives and ships goods all day, on a tablet at the dock.
- **Reads:** English.
- **Knows:** products, boxes, lot codes printed on cartons.
- **Does not know:** prices, invoices, or why anything is refused.
- **Typical tasks:** receive a delivery against a purchase order,
  recording the lot and expiry; ship a confirmed order; record a return.
- **Gives up when:** a control is too small to tap, or a step needs
  typing what is already on the screen.

## The owner

- **Who:** runs the company, checks in from a phone between meetings.
- **Reads:** English or French; the account is set to `fr-CA`.
- **Knows:** the business, the customers, the money.
- **Does not know:** where each screen is; uses Home and the lookup.
- **Typical tasks:** see what is late or waiting today; find one order
  by its reference; check what stock is worth.
- **Gives up when:** the answer takes more than two screens, or a number
  differs between screens.

## Customer service

- **Who:** handles calls about orders and returns.
- **Reads:** English.
- **Knows:** customers and their orders, the return policy.
- **Does not know:** stock locations or costing.
- **Typical tasks:** raise an RMA for a damaged item; tell a customer
  where their shipment is; send a replacement.
- **Gives up when:** the order's history does not show what already
  happened to it.

## The senior who reads only Chinese

- **Who:** in their sixties, helps run a small family company, and uses
  a phone far more than a computer, asking a younger colleague when an
  app is new. Near sight has faded with age (老花眼), so the phone is
  held at arm's length, and small or pale text is a guess.
- **Reads:** only Simplified Chinese; the account is set to `zh-Hans`.
  English words, codes in capitals and abbreviations mean nothing.
- **Knows:** the business, the customers by name, paper ledgers.
- **Does not know:** menus, an icon with no word beside it, that a list
  scrolls sideways, or that the text can be made larger.
- **Typical tasks:** see what needs them today; check whether something
  is running out; find which lot expires first.
- **Gives up when:** text is too small or too pale to read, two things
  look alike, or a tap lands on the wrong thing. Afraid of breaking
  something, they stop rather than guess.
- **Set up:** a phone, 390 × 844, at the Standard text size a new
  account starts with, noting whether anything leads to Larger text;
  then the same tasks at Larger text. A screenshot at each step, since
  what they can read is the question, judged also against WCAG 2.2's
  contrast (1.4.3), resize text (1.4.4) and reflow (1.4.10).

## The outsider on the first day

- **Who:** just hired from another trade, a café or a shop, and invited
  this week, never having worked with stock, lots or purchase orders;
  or anyone outside the company opening the application for the first
  time. A little reluctant: would rather not learn a new system.
- **Reads:** English, everyday words only; the account is set to `en`.
- **Knows:** nothing of this business or this application.
- **Does not know:** trade words such as overdue, backorder, reorder
  point or SKU, or where anything is.
- **Typical tasks:** tell from Home what this company does and what
  needs doing today; find one thing that is late and one that is
  running out; try to raise an order.
- **Gives up when:** a word needs a dictionary, a tile goes somewhere
  unexpected, or nothing shows what can be clicked.
- **Set up:** a member who joined this week, so Home shows the welcome
  (ADR-079): as the demo's Owner, invite a new address from Members with
  the Viewer role; then, in a new browser context, open the invitation
  from Mailpit (<http://localhost:8025>) and register. A laptop, 1366 ×
  768.

## The owner who learns fast

- **Who:** in their late fifties, started the company long ago; has
  basic computer and phone skills (email, a browser, a messaging app);
  willing to learn, and quick once shown something once.
- **Reads:** English; the account is set to `en`.
- **Knows:** the business, the customers, the money.
- **Does not know:** this application, keyboard shortcuts, or that the
  lookup in the top bar takes any code or name.
- **Typical tasks:** see what needs them today; find the order that is
  late; find which lot expires first; see whether anything is running
  out; raise an order.
- **Gives up when:** the second time is no quicker than the first, or a
  figure has to be hunted for again.
- **Set up:** a laptop, 1280 × 800, then a phone, 390 × 844. Each task
  walked twice, the first time at the first size and the second, as if
  the next morning, at the second size, or both at the one size given:
  what was quicker, what had to be found again, and what they wish they
  had been shown.

## The operations lead

- **Who:** studied logistics and ran stock and orders in a larger
  company's ERP for years; now sets this application up for a small
  one, on a laptop with a large screen, keyboard first.
- **Reads:** English and Simplified Chinese; the account is set to `en`,
  switched to `zh-Hans` to check a word.
- **Knows:** lots and first-expiry-first-out, reorder points and lead
  times, purchase and sales orders, costing, and how much an ERP shows
  on one screen.
- **Does not know:** where this application keeps each of those.
- **Typical tasks:** from each of Home's tiles, reach the detail behind
  it in one step: which orders are late, by how many days and for whom;
  which lots expire, where, and how many. Then sort and filter that
  list, export it, and follow a lot to its trace.
- **Gives up when:** a simple screen is a dead end, so the detail takes
  more than two steps or a trip through the menu, or the keyboard
  cannot do it.
- **Set up:** a screen of 1920 × 1080, and the keyboard wherever it can
  be used.

## The sales rep on the road

- **Who:** sells to pharmacies in China, checking stock and orders on a
  phone between visits, often on a slow mobile network and often
  interrupted.
- **Reads:** only Simplified Chinese; the account is set to `zh-Hans`.
- **Knows:** customers and products by name, rarely by code.
- **Does not know:** stock locations, costs, or how a reservation works.
- **Typical tasks:** check whether a product can be promised by Friday;
  find where a customer's order is; raise an order from the phone.
- **Gives up when:** a screen stays blank while it loads, or what was
  typed is lost when the phone locks or the page reloads.
- **Set up:** the account is the seed's Sales member, whose email
  `seed:demo` prints, in the demo Owner's organization, since a sales rep
  signs in as Sales. A phone, 390 × 844, the network slowed through
  Playwright's CDP session to about 150 ms of round trip and 1.6 Mbit/s
  down, as Lighthouse's mobile run assumes, and one reload half way
  through a task.
