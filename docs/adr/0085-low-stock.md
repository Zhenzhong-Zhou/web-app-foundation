---
status: accepted
date: 2026-10-30
areas: [home, stock, notifications]
amends: [ADR-058]
---

# ADR-085 — Low stock: a reorder point per item, against usable stock and what is on its way (amends ADR-058)

## Context

Nothing warns when stock runs short. Open decisions, "Low stock", left
it to decide: a reorder point per item and perhaps a quantity to order;
what the point is compared with; where a shortage shows and who is told;
who may set it; per location or not; and the seeds. It is #288, the
order's item 5 (Bob, 27 October 2026), with #222 and #256 riding along.

What the code offers today:

- **Stock lives on variants** (ADR-023), one row per location and lot,
  as Inventory lists it. A shortage is about an item, not a shelf, so it
  cannot be a filter of those rows.
- **What can be promised** is computed, never stored (ADR-045): stock at
  locations marked available, less what confirmed sales hold, per item.
  Inventory shows it as the promised table, by SKU alone.
- **What is coming** is in the open orders and runs: a confirmed
  purchase's lines still to receive, and a released run's output still
  to come. A draft purchase or run commits nothing yet.
- **Items are bought or made:** an item with an active recipe (ADR-029)
  can be made by a run; a release issues its components to the run's
  location, often marked unavailable as work in progress (ADR-042), and
  consumes them at close (ADR-032).
- **Home** (ADR-058) answers every card in one request, each card's rows
  read through its list's own service.
- **A check that catches up** runs hourly for licences (ADR-064), with a
  claim on the row so that nobody is told twice.

The decisions follow what the production systems do: SAP's and
Business Central's reorder-point planning, NetSuite's and Odoo's
reordering rules, and the 库存预警 of Kingdee and Yonyou, whose words
the Chinese screens follow.

Checked before drafting, as the working agreements ask, with the open
issues in `area:stock`, `area:products`, `area:home`,
`area:notifications`, `area:orders`, `area:authorization`,
`area:database`, `area:ops`, `area:ui`, `area:i18n`, `area:docs`,
`area:help` and `area:mail` on 30 October 2026, and the full text of
each `when-touched` one on a screen or file this branch opens:

- **Fired, and taken here.** Open decisions, "Low stock": decided here.
  ADR-036's *Deferred*, the events that are absences: a shortage is
  found by looking, so its bell comes from an hourly check, as ADR-064's
  does; the two absences ADR-036 names stay deferred. #222 and #256, as
  #288 names them. #301, whose own text names this branch, since
  Inventory changes. #265 and #313, Inventory's Move stock and Receive
  dialogs, in the folder this branch opens. #309, stock answering 404
  where 400 is due for another organization's variant or location: the
  new write takes a variant under the same rule. #296's availability
  part: the promised table names an item by its SKU alone, which the new
  list must not. #276, `GET /home` over its budget (`fix-now`): the card
  adds to that request, so its plans come first. #253 (`when-touched`,
  ops): the riders open the review's workflow. The multer override
  (ADR-019's amendment), which goes once `@nestjs/platform-express`
  12.3.x is taken, with the updates ADR-084 left, old enough by 6
  November. ADR-051's watch on availability, 7.9× from small to large:
  the new read reads only the items that have a point, and is timed on
  the volume seed.
- **Not fired, and left.** In stock, #156 and #310 (`fix-now`) stay in
  the Fix-ups milestone, and #281 waits for its trigger. In products,
  #167, #305 and #306: the product page and the catalogue are not
  opened. In orders, #25, #125, #157, #160, #177 and #302: Raise a
  purchase order opens New order, which none of them names. #293, the
  permission lookups, names Inventory and New order among its five
  pages, but it reverses a working agreement and spans six dialogs: a
  pull request of its own (Bob, 30 October 2026). In database, #226 (a
  plan-check rule) and #314 (a test listing writes that take an id from
  their body): the new write has its own e2e case. In notifications,
  #169 (`fix-now`) and #285: the notice prints no quantity, so French's
  decimal point does not arise. In home, #300 (`later`). In ui, help,
  i18n, docs and mail: screens and shared pieces this branch does not
  open. ADR-058's *Deferred* thresholds per organization: expiry days,
  not this. ADR-045's *Deferred* holds for planned runs: a draft run's
  components are not counted. ADR-080's *Deferred* attributes, a role
  held to a site: per-location points wait too. Open decisions,
  "Purchase pack versus stock unit": quantities here are in the stock
  unit, as an order line's are. Stock has no rules file in
  `docs/rules/` yet; it is written with stock's fix-up (ADR-087).
- **Found while checking.** `GET /home` took 301 ms of its 300 on `main`
  (29 October 2026), a known miss until 30 November. Nothing keeps an
  expired lot from being shipped or issued: earliest expiry first takes
  it first, and ADR-045 counts it as free to promise; an issue of its
  own. Components issued to a released run still count as free in
  ADR-045's figure when the run's location is marked available. A
  matrix job skipped by its `if` never expands its name: it reports one
  check called `Client — Playwright ${{ matrix.shard }}/3`, so a
  required shard would wait for ever. A CI run whose jobs are all
  skipped ends in success, and Deploy follows CI's success on `main`,
  so a docs-only push must still start no run. A run
  started by adding a label other than `full-e2e` skips every job, which
  then reports as passed: whether that can cover an earlier failure is
  an issue of its own. Claude Code Review skips a pull request that
  changes its own workflow (#247): this branch gets no review from it,
  and neither rider is seen working before the next pull request. The
  planning skill's front matter was not valid YAML (`Project: for`,
  unquoted); claude.ai's upload quoted it, so each session's comparison
  with `main` found a difference.

## Decision — a reorder point per item, bought or made, with a rule for how much

- **Each item may have a reorder point,** in its own unit, above zero,
  a decimal as every quantity (ADR-025). An item with no point is never
  low; removing the point is how it stops.
- **Bought or made,** on the point: made by default when the item has an
  active recipe, bought otherwise, and changeable. It decides what the
  list offers and who is told; what is coming counts both ways.
- **How much to order,** one of three: just enough to reach the point;
  a fixed quantity, ordered in whole multiples of it, as suppliers sell
  in cases and minimums; or up to a maximum, above the point.
- **Per item, across the locations marked available,** as ADR-045
  promises. Not per location: a sale has no location until it ships.
- **Kept in a table of stock's own,** one row per item, so the product
  page and the catalogue do not change. A discontinued item, or one of a
  discontinued product, keeps its point and is never low.

## Decision — low when usable stock and what is on its way fall below the point

An item's **position** is its usable stock, plus what is coming, less
what confirmed sales still need:

- **Usable:** stock at the locations marked available, less lots expired
  by the organization's today (ADR-072), and less what released runs
  were issued and have not consumed, where it sits at such a location.
  Stock nobody may sell or use cannot cover a shortage.
- **Coming:** confirmed purchases' lines still to receive (ordered less
  received, unless closed short), and released runs' output still to
  come (planned less produced, never below zero).
- **Still needed:** confirmed sales' lines still to ship, unless closed
  short, as ADR-045 counts them. So a backorder lowers the position.

It is **low** when its position is below its point, and **late**, red
on Home as an overdue order is, when the position is zero or less:
nothing usable and nothing coming.

**Drafts** do not change the position, since a draft may never be
sent, but they are shown: draft purchases' quantities of the item and
draft runs' planned output, as In draft, each linked. The **suggested
order** is what the item's rule asks to bring the position back to the
point, or to its maximum, less what is in draft, never below zero; a
low item whose suggestion is zero says it is drafted, so nobody orders
it twice.

This is the reorder point's usual comparison, the inventory position:
on hand and on order, less what is owed. Against on hand alone, a
purchase already raised would raise another.

## Decision — set and read in Inventory, counted on Home

- **Inventory gains Reorder points,** a list of every item with a point:
  its SKU and its name in the reader's language (ADR-056's rule),
  bought or made, the point and its rule, what is usable, coming, still
  needed and in draft, the position and the suggested order. Low items
  first, the furthest below their point as a share of it first; then
  the rest, by SKU. A Low filter, its search, and its CSV export
  (ADR-057).
- **A point is set** from that list, with Add reorder point and the
  item picker, and from an item's row on Inventory; changed and removed
  on its row. Audited, with its numbers, its rule and bought or made in
  the payload.
- **Home gains Low stock,** for those who hold `stock.view`, after To
  receive: its count, its late count, and the list's first five low
  rows; See all opens the list filtered to Low.

## Decision — from the list to a purchase order or a run

- **Raise a purchase order,** for the bought low items chosen, opens New
  order as a purchase with a line for each at its suggested quantity;
  the supplier is chosen there. Shown to those who hold `orders.create`.
- **Plan a run,** on a made low item's row, opens a new run of it at its
  suggested quantity, from its active recipe. Shown to those who hold
  `production.create`.
- Nothing is saved until the person creates it, as both already work;
  what they create shows as In draft at once.

## Decision — the bell, once each time an item falls below, grouped

- **Hourly, over every organization,** as ADR-064's check runs: each
  item that is low and has not been told since it last was not, is
  claimed on its row in one statement, then told; each item no longer
  low has its claim cleared, so the next fall is told again. A claim
  whose sending fails is not retried (ADR-036).
- **Told to who can act on it:** members holding `stock.view` and, for
  a bought item, `orders.create`, or, for a made one,
  `production.create`.
- **One notice per person per check,** in their language: the item's
  SKU and name when one fell below, how many when several, so points set
  on a hundred items at once do not fill the bell. It opens the list
  filtered to Low, and prints no quantity, which the list shows as it
  stands.
- **In the app only,** as ADR-036 decided. A free web service asleep
  misses its hours (`render.md`); the next check after it wakes tells
  what is low then.

## Decision — a permission of its own to set a point

`stock.reorder` sets, changes and removes a point. Like every new
permission, the Owner's alone until a made role gives it (ADR-080); the
list and the card need only `stock.view`. A reorder point is planning,
neither moving stock nor changing the catalogue, so neither
`stock.move` nor `products.update` says it.

## Decision — Home within its budget first (#276)

Before the card: the `home` probe's plans, and the fix they show, until
`GET /home` is back under 300 ms at small. Then the card's count joins
Home's one statement of counts, its rows read through the list's
service (ADR-058, as amended), both from the items with a point alone.
Its budget is measured on the volume seed with points on a share of
each organization's items.

## Decision — the riders: docs-only pull requests checked without a bypass

- **Claude Code Review skips a docs-only pull request,** by the paths
  rule CI's push uses: a change to prose alone gets no review run.
- **CI's first job, `changes`,** lists a pull request's files from its
  merge, as the Docs workflow does, and says whether any is code by
  that same rule: Markdown anywhere, and `docs/`, are not; Help's guides
  and `docs/tables/` are. Every other job runs only when one is, and is
  skipped by its condition otherwise. A last job needs them all and
  fails when any failed or was cancelled: the one required check, since
  a skipped matrix job reports no shard by its name. A pull request of
  docs alone then merges without the bypass.
- **A push to `main` keeps its paths:** a docs-only push starts no run,
  so it deploys nothing (ADR-081).
- **#253:** the review checks out the merge two commits deep and may run
  `git diff`, so a large pull request is read a path at a time.
- **The planning skill's description is quoted** in `main`'s copy, as
  the upload stores it, and the pack's check refuses a value with an
  unquoted colon and space, as a YAML reader would.

## Considered and not done

- **The point against what is on hand, or what is free, alone.** A
  purchase already raised would raise another.
- **Expired and issued stock counted as usable,** as ADR-045's figure
  does. A shelf of expired lots would hide a shortage until a shipment
  is refused or a recall.
- **Drafts counted as coming.** A draft may never be sent; shown and
  taken off the suggestion, it stops a second order without hiding the
  shortage.
- **Bought only,** planning runs later. A maker's shortages are half
  runs, and the run's screen already exists.
- **A fixed quantity only, or a maximum only.** Each fits some items:
  cases from a supplier, a shelf to fill.
- **A point per location now.** Nothing yet stocks a second warehouse on
  its own.
- **The point on the product page,** in Edit. The catalogue would change
  for a planning setting, and Inventory, where the numbers are, would
  not show it.
- **A notice per item, or every day while low.** A hundred alike, or
  the same one daily, are cleared unread, as ADR-064 found.
- **Checking on every stock change** instead of hourly. A dozen write
  paths change a position (receipts, shipments, runs, orders confirmed
  or closed); one check that reads the state misses none, and catches up
  after a sleep.
- **The card in its own request.** ADR-058 answers Home in one, and a
  second would not make the first faster.
- **Each required job skipped by its condition, with no last job.** The
  three browser shards would never report by name.
- **A paths-filter action from the marketplace.** `git diff` and a
  `case` do it, with nothing more to pin and trust.

## Deferred — each with what brings it in

- **A point per location,** and transfers between our own locations as
  a third way to replenish. Trigger: a second warehouse of our own,
  stocked on its own.
- **A lead time per item,** giving a purchase order its expected date,
  and then **suggested points** from lead time and use, with safety
  stock reviewed by how much each item matters. Trigger: enough history,
  and someone asking.
- **Importing points from a CSV.** Trigger: an organization setting
  points on more than a few dozen items.
- **Email,** a daily summary of what is low. Trigger: a shortage missed
  while nobody who would have acted opened the app, as ADR-064's email
  waits.
- **A preferred supplier per item,** and an order per supplier at once.
  Trigger: items from several suppliers raised together, often.
- **Quantities to order in purchase packs.** Trigger: Open decisions,
  "Purchase pack versus stock unit".

## Consequences

- Server: the reorder points' table, its migration, the organization's
  export and deletion (conventions, "A new table and the organization's
  export"); `stock.reorder` in the permissions and their descriptions,
  and in the client's list; the list with its drafts, its export, set
  and remove, each audited, with the API document and the client's
  types regenerated; the hourly check and a notification type,
  `stock.low`; Home's card, its count and its rows. #309's 400s; #296's
  availability names; #256's movements: the name beside the SKU and who
  by name.
- Client: Reorder points, its dialogs and Inventory's row action; Home's
  card; the bell's link; Raise a purchase order filling New order and
  Plan a run filling a new run; #256's Movements and movement history;
  #265, #301 and #313.
- Seeds: the demo gains points on bought and made items, with each rule:
  some low, one late, one kept above by a purchase on its way, one with
  a draft purchase raised, and one made by a run; an expired lot that
  leaves its item low; and #222's History. The volume seed, points on a
  share of each organization's items, with plan-check probes for the
  list and Home.
- Docs: Help's Inventory and Home guides in three languages; the manual
  checks; `.claude/rules/stock.md`'s paths; Open decisions and the
  handoff. Stock has no rules file to update. Two issues filed from the
  check: expired lots shipped and issued, and the label-started run.
- After the merge, by hand: `main`'s ruleset requires the last CI job
  alone, in place of the five; the next docs-only pull request merges
  without the bypass, and the next code one shows a review read path by
  path. No upload of the planning skill: `main`'s copy then matches it.
- Build order: this ADR, with the riders; dependencies; the pack's
  check; Home's plans (#276); the reorder points on the server; the
  hourly check; Home's card; #309, #296 and #256 on the server; the
  seeds and #222; Reorder points in the client, with #265, #301 and
  #313; Home's card, the bell, the purchase order and the run; #256's
  screens; the guides; dependencies again; the reviews; the as-built,
  by the chat. Built from `tmp/adr-085/brief.md`, a step per prompt, by
  `/build-from-brief`.
