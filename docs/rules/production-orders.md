# Production orders

What the app allows, refuses and works out for production runs, from
planning one to closing or cancelling it, with the licence checked at
release, as the code does it today. Each rule links the ADR that decided
it, the test that proves it, the Help section where a person meets it,
and the manual check that walks it by hand. Why a rule is so is in its
ADR; how to do a task is in the
[Help guide](../../client/src/help/guides/en/production.md). How this
file is kept is in the [README](README.md).

## Planning a run

- **A run makes one item, at one place, in a quantity above zero.** The
  item and Made at are required; components are issued to Made at and the
  output is received there. The quantity takes up to four decimal places.
  Nothing moves until the run is released.
  [ADR-030](../adr/0030-who-supplies-a-component-is-a-property-of-the-run.md#decision--the-manufacturers-facility-is-a-site-in-the-locations-tree-with-locationspartner_id-marking-it-as-theirs) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "creates a draft" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses what planning refuses, and another organization’s recipe" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/production.md#plan-a-run-plan) ·
  MC-502
- **The recipe must make the item the run makes.** A recipe for another
  item is refused. A run may be planned with no recipe, but it cannot be
  released until it has one.
  [ADR-029](../adr/0029-a-bill-of-materials-is-a-header-plus-lines-and-nesting-is-data.md#decision--a-header-table-and-versioning-by-snapshot-at-consumption) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses a BOM that makes a different variant" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses to release a run with no BOM" ·
  [Help](../../client/src/help/guides/en/production.md#if-something-is-refused-refused)
- **Plan a run offers the item's active recipe, selected, and its
  archived versions, never a draft; the run is planned with the recipe
  the select shows.** An archived version is for repeating an old batch.
  With no active or archived recipe, the dialog says the run can be
  planned but not released.
  [ADR-029](../adr/0029-a-bill-of-materials-is-a-header-plus-lines-and-nesting-is-data.md#decision--a-header-table-and-versioning-by-snapshot-at-consumption) ·
  [test](../../client/src/production/create-run-dialog.test.tsx) "plans with the recipe the select is showing" ·
  [test](../../client/e2e/production.spec.ts) "plans, releases by lot, records output and closes a run" ·
  [Help](../../client/src/help/guides/en/production.md#plan-a-run-plan)
- **Plan run waits for the item's recipes: it stays off until they have
  answered.** If they cannot be read, the dialog says "Could not load the
  item's recipes." with Try again beside it, which reads them again, and
  Plan run stays off, so a run is never planned without the recipe it
  would have had.
  [ADR-008, amended](../adr/0008-testing-scaffolding-lands-in-v1.md#decision--the-batchs-rules-files-production-orders-alone) ·
  [test](../../client/src/production/create-run-dialog.test.tsx) "waits for the item’s recipes before Plan run, then plans with the active one" ·
  [test](../../client/src/production/create-run-dialog.test.tsx) "says the item’s recipes could not be loaded, and plans nothing" ·
  [test](../../client/src/production/create-run-dialog.test.tsx) "reads the item’s recipes again on Try again, then plans with the active one" ·
  [test](../../client/e2e/production.spec.ts) "plans, releases by lot, records output and closes a run" ·
  MC-R82
- **Uses shows what the run will take of each component at the quantity
  typed, worked out as release will issue it,** to four decimal places. A
  component the maker supplies says so.
  [ADR-085, amended](../adr/0085-low-stock.md#amendment-november-2026--as-built-361) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "shows what release then issues, to the fourth place" ·
  [test](../../client/src/production/create-run-dialog.test.tsx) "opens filled in, and shows what the run would use for the quantity as it is" ·
  MC-4216
- **Plan a run from Reorder points opens filled in:** the item, the
  quantity that brings it back to its point, and a note saying so; Made at
  is left to choose.
  [ADR-085](../adr/0085-low-stock.md#decision--from-the-list-to-a-purchase-order-or-a-run) ·
  [test](../../client/src/production/create-run-dialog.test.tsx) "opens filled in, and shows what the run would use for the quantity as it is" ·
  MC-4216
- **A contract manufacturer is set only when we supply some of the
  components; none means we make it ourselves.** A maker who buys
  everything and delivers finished goods is a purchase order, not a run.
  Plan a run does not offer a retired partner. Whoever may not see
  customers and suppliers plans the run as made by us, and is told why.
  [ADR-030](../adr/0030-who-supplies-a-component-is-a-property-of-the-run.md#decision--partner_id-on-the-production-order-null-meaning-in-house) ·
  [ADR-080](../adr/0080-job-roles.md#decision--roles-an-organization-makes-from-a-template-or-a-copy) ·
  [test](../../client/src/production/create-run-dialog.test.tsx) "does not offer a retired partner as contract manufacturer" ·
  [test](../../client/src/production/create-run-dialog.test.tsx) "plans without asking for partners the reader may not see" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/production.md#plan-a-run-plan) ·
  MC-3319
- **A run has no number of its own.** Its reference, a batch number or
  the maker's works order, is optional, up to 100 characters and not
  unique; the run's page is titled by it, or else by the quantity planned.
  [ADR-074](../adr/0074-run-numbers-and-batch-codes-from-them.md#status) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "keeps the reference a run is planned with" ·
  [test](../../client/e2e/production.spec.ts) "plans, releases by lot, records output and closes a run"
- **Only a planned run changes:** its recipe, place, maker, quantity,
  reference and notes. Once released it is refused. The screen changes a
  planned run only by attaching a recipe at release.
  [ADR-032](../adr/0032-production-runs.md#decision--output-is-a-repeatable-event-closing-is-explicit) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses to edit a released run"

## Releasing a run

- **Releasing copies the recipe onto the run, scaled to the quantity
  planned, and moves the components to where the run is made. Nothing is
  consumed yet.** Each component takes the recipe's quantity times the
  run's share of the recipe's batch, to four places. From then on the run
  reads its own copy, so editing or archiving the recipe cannot change
  it.
  [ADR-029](../adr/0029-a-bill-of-materials-is-a-header-plus-lines-and-nesting-is-data.md#decision--a-header-table-and-versioning-by-snapshot-at-consumption) ·
  [ADR-032](../adr/0032-production-runs.md#decision--consumption-is-written-once-at-close-with-actual-quantities) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "scales the recipe, issues stocked lines, and consumes nothing" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "shows what release then issues, to the fourth place" ·
  [Help](../../client/src/help/guides/en/production.md#release-a-run-release) ·
  MC-502
- **Only a planned run is released, and only once.**
  [ADR-032](../adr/0032-production-runs.md#decision--output-is-a-repeatable-event-closing-is-explicit) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses to release twice" ·
  [test](../../client/src/production/production-order-detail-page.test.tsx) "offers only release while the run is planned" ·
  [test](../../client/src/production/production-order-detail-page.test.tsx) "offers output and close once released, and not release again"
- **Release needs a recipe with at least one line.** A run planned
  without one is given one in the release dialog, by whoever may plan
  runs; anyone else is told who can. A recipe with no lines is refused.
  The dialog reads the item's recipes as Plan a run does: nothing says
  there is none while they come, and a failed read says so, with Try
  again beside the words.
  [ADR-029](../adr/0029-a-bill-of-materials-is-a-header-plus-lines-and-nesting-is-data.md#decision--a-header-table-and-versioning-by-snapshot-at-consumption) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses to release a run with no BOM" ·
  [test](../../client/src/production/release-run-dialog.test.tsx) "tells someone who may not plan runs who attaches one, and asks for no recipes" ·
  [test](../../client/src/production/release-run-dialog.test.tsx) "says nothing of there being no recipe while the item’s recipes come" ·
  [test](../../client/src/production/release-run-dialog.test.tsx) "says the item’s recipes could not be loaded, and offers them again on Try again" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/production.md#if-something-is-refused-refused) ·
  MC-3319 · MC-R87
- **Components come from one place for the whole run, and any line can
  name its own.** A place marked not for use, such as retention or
  quarantine, is refused, and the dialog does not offer one.
  [ADR-032](../adr/0032-production-runs.md#decision--the-picking-source-is-on-the-line-not-the-run) ·
  [ADR-042](../adr/0042-samples-and-stock-that-is-not-for-sending.md#decision--unavailable-locations-hold-stock-that-is-not-for-sending) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "honours a per-line source override" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/production.md#release-a-run-release) ·
  MC-205
- **A component the maker supplies is recorded on the run but never
  moves, and is never consumed.** It has no source.
  [ADR-030](../adr/0030-who-supplies-a-component-is-a-property-of-the-run.md#decision--supply_type-on-the-line-defaulted-by-the-bom-actual-on-the-run) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "scales the recipe, issues stocked lines, and consumes nothing" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "writes no consumption movement for an external line"
- **Components already where the run is made do not move.** Nothing is
  issued for them, and close consumes them straight from that place.
  [ADR-032](../adr/0032-production-runs.md#decision--close-tops-up-from-source-when-wip-is-short) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "issues nothing when the source is the run location, and still consumes"
- **A lot-tracked component is taken earliest expiry first,** lots that
  never expire last, split across lots when one is not enough, each lot
  its own move. The dialog shows the pick before Release is pressed;
  release picks again against stock as it is then.
  [ADR-039](../adr/0039-component-lots.md#decision--the-default-is-earliest-expiry-first-fefo) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "issues earliest expiry first, splitting across lots" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "previews the same pick without moving anything" ·
  [test](../../client/e2e/production.spec.ts) "plans, releases by lot, records output and closes a run" ·
  [Help](../../client/src/help/guides/en/production.md#release-a-run-release) ·
  MC-502
- **Lots chosen by hand must add up to exactly what the line needs.**
  Lots chosen for a component the maker supplies, or for one that does not
  track lots, are refused.
  [ADR-039](../adr/0039-component-lots.md#decision--a-person-can-replace-the-pick-for-a-line) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "takes hand-picked lots instead of the default" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses hand-picked lots that do not add up" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/production.md#release-a-run-release)
- **A place short of a component cannot release the run, and nothing
  moves.** For a lot-tracked component the refusal names it and how
  short it is.
  [ADR-039](../adr/0039-component-lots.md#decision--the-default-is-earliest-expiry-first-fefo) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses a release the lots cannot cover, naming the component" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/production.md#if-something-is-refused-refused)
- **Release, and a top-up at close, take only stock no confirmed sale
  holds.**
  [ADR-045](../adr/0045-reservations.md#decision--enforced-where-stock-leaves-or-is-committed) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses a top-up of stock a confirmed sale holds" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/production.md#if-something-is-refused-refused)

## The licence at release

- **A licence's state is worked out on the organization's own day:**
  withdrawn first, then not yet in force, then expired, else current. A
  licence whose last day is today is current.
  [ADR-050](../adr/0050-licence-status-at-release.md#decision--the-server-derives-the-status-by-the-clients-rules) ·
  [ADR-072](../adr/0072-each-organizations-time-zone.md#decision--today-is-the-organizations) ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "treats a licence expiring today as current" ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "releases on the last day where the organization is, and not after" ·
  MC-511 · MC-2605
- **A withdrawn licence is always refused,** whatever the organization's
  policy, with no override.
  [ADR-050](../adr/0050-licence-status-at-release.md#decision--a-policy-per-organization-with-three-outcomes) ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "is refused whatever the policy, override or not" ·
  [test](../../client/src/production/release-run-dialog.test.tsx) "refuses a withdrawn licence with no way round it" ·
  [Help](../../client/src/help/guides/en/production.md#if-something-is-refused-refused) ·
  MC-509
- **A licence not yet in force is refused unless the organization says
  otherwise;** the refusal names the day it takes effect. The policy can
  ask for an override instead, or allow it.
  [ADR-050](../adr/0050-licence-status-at-release.md#decision--a-policy-per-organization-with-three-outcomes) ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "is refused by default, with the day it takes effect" ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "needs an override with a reason when the policy says so" ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "is released and recorded when the policy allows it"
- **An expired licence needs an override unless the organization says
  otherwise;** the refusal names who can give one. The policy can refuse
  it outright, even with an override, or allow it.
  [ADR-050](../adr/0050-licence-status-at-release.md#decision--a-policy-per-organization-with-three-outcomes) ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "needs an override by default, and says who can give one" ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "is refused outright when the policy blocks, even with an override" ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "is released when the policy allows, and an override sent anyway is ignored" ·
  [test](../../client/e2e/licence-at-release.spec.ts) "refuses the same licence once the policy says so" ·
  [Help](../../client/src/help/guides/en/production.md#if-something-is-refused-refused) ·
  MC-508 · MC-510
- **A recipe with no licence is released, unless the organization
  requires one; then it is refused outright,** with no override.
  [ADR-050, amended](../adr/0050-licence-status-at-release.md#amendment--settled-while-building) ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "releases and records none, by default" ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "refuses when the organization requires a licence, override or not" ·
  [test](../../client/src/production/release-run-dialog.test.tsx) "says nothing about licences for a recipe that needs none" ·
  MC-510
- **An override takes Release a run under an expired or not-yet-in-force
  licence, and a reason that is not blank, up to 500 characters.** The
  reason is kept on the run. Sending one without the permission is
  refused, even for a current licence; sent when none is needed, it is
  ignored and nothing is recorded.
  [ADR-050](../adr/0050-licence-status-at-release.md#decision--an-override-is-a-permission-a-reason-and-a-record) ·
  [ADR-050, amended](../adr/0050-licence-status-at-release.md#amendment--settled-while-building) ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "is refused to someone without production.override_licence" ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "is refused to them even when the licence is current" ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "needs a reason that is not blank" ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "ignores an override sent for a current licence" ·
  [test](../../client/src/production/release-run-dialog.test.tsx) "asks the person who may override for a reason, and sends it" ·
  [test](../../client/src/production/release-run-dialog.test.tsx) "does not offer Release to someone who cannot override" ·
  [test](../../client/src/production/release-run-dialog.test.tsx) "sends no override for a current licence" ·
  [test](../../client/e2e/licence-at-release.spec.ts) "releases under an expired licence with a reason, and the run says so" ·
  MC-508
- **The release dialog shows what release will do with the licence
  before Release is pressed,** worked out the same way release does.
  [ADR-050](../adr/0050-licence-status-at-release.md#decision--checked-at-release-with-the-licence-row-locked) ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "previews in the issue plan what release would do" ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "previews a recipe with no licence as none" ·
  MC-508
- **A run keeps the licence it was made under, as it read on the day,
  with its state then and any override: who and why.** Correcting the
  licence later does not change the run. A run released before the state
  was kept reads "not recorded", never current.
  [ADR-050](../adr/0050-licence-status-at-release.md#decision--the-status-is-shown-where-it-is-acted-on) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "snapshots the licence at release" ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "records the override: the state, who, and why" ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "shows the state and the override on the lot the run made" ·
  [test](../../client/src/production/production-order-detail-page.test.tsx) "says the licence was expired at release, and who overrode it and why" ·
  [test](../../client/src/production/production-order-detail-page.test.tsx) "says the state was not recorded for an older run" ·
  [test](../../client/src/production/production-order-detail-page.test.tsx) "links the licence for whoever can read the register" ·
  MC-506

## Recording output

- **Output is recorded while the run is in progress, as often as
  needed.** Each adds to what the run has produced, and the run stays in
  progress until someone closes it. A planned run takes none.
  [ADR-032](../adr/0032-production-runs.md#decision--output-is-a-repeatable-event-closing-is-explicit) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "accumulates across several output events and stays released" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses output against a draft" ·
  [Help](../../client/src/help/guides/en/production.md#record-output-and-close-close)
- **Output goes into a batch this run already made, its latest by
  default, or a new one.** Record output offers only this run's own
  batches, by their codes. A new batch's code is required, up to 64
  characters, with an optional expiry.
  [ADR-032](../adr/0032-production-runs.md#decision--output-joins-the-runs-open-lot-by-default) ·
  [ADR-030](../adr/0030-who-supplies-a-component-is-a-property-of-the-run.md#decision--a-runs-output-lots-are-read-from-the-ledger-not-stored-on-it) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "offers the run own lots so a second day can join the first" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "creates a second lot when the batch genuinely divides" ·
  [test](../../client/e2e/production.spec.ts) "plans, releases by lot, records output and closes a run" ·
  [Help](../../client/src/help/guides/en/production.md#record-output-and-close-close) ·
  MC-503
- **Output is never capped by the plan.** A run that makes more or less
  than planned is ordinary; only the flag at close says so.
  [ADR-032](../adr/0032-production-runs.md#decision--output-is-a-repeatable-event-closing-is-explicit) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "flags output that came out far off plan" ·
  partly tested

## Closing a run

- **Closing consumes what each component actually used, and finishes
  the run for good.** Only a run in progress closes. A line left as
  planned consumes what was planned; a line of another run is refused.
  [ADR-032](../adr/0032-production-runs.md#decision--consumption-is-written-once-at-close-with-actual-quantities) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "consumes what was planned when a line is left out" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses to close twice" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses a line belonging to another run" ·
  [Help](../../client/src/help/guides/en/production.md#record-output-and-close-close)
- **Each line's actual use must be above zero.** A component the run did
  not use at all cannot be recorded as zero.
  [ADR-032](../adr/0032-production-runs.md#decision--consumption-is-written-once-at-close-with-actual-quantities) ·
  no test
- **Using more than planned is fine: the extra is moved from where the
  line's components came from, then consumed.** It continues the lots
  release issued, then the next to expire.
  [ADR-032](../adr/0032-production-runs.md#decision--close-tops-up-from-source-when-wip-is-short) ·
  [ADR-039](../adr/0039-component-lots.md#decision--close-consumes-the-lots-the-run-was-given) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "tops up from the source when consumption runs over plan" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "tops up over plan from the next lot to expire" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "tops up first from the lots picked at release" ·
  [Help](../../client/src/help/guides/en/production.md#record-output-and-close-close) ·
  MC-504
- **Using less leaves the rest where the run is made,** for a person to
  put away by hand.
  [ADR-032](../adr/0032-production-runs.md#decision--close-tops-up-from-source-when-wip-is-short) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "leaves the remainder at the run location when consumption is under plan" ·
  [Help](../../client/src/help/guides/en/production.md#record-output-and-close-close)
- **A lot-tracked component is consumed from the lots this run was
  given,** not from whatever else shares the place, so the recall trail
  stays exact.
  [ADR-039](../adr/0039-component-lots.md#decision--close-consumes-the-lots-the-run-was-given) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "consumes the lots the run was given, and shows them"
- **A line, or the output, 10% or more off plan either way is flagged,
  never refused.** Close answers with each, the run's page shows them
  once, and whoever may finish runs is told in the bell, the output
  first.
  [ADR-032](../adr/0032-production-runs.md#decision--variance-warns-it-never-blocks) ·
  [ADR-036](../adr/0036-a-notification-belongs-to-a-person-not-a-tenant.md#decision--targeting-by-permission-for-organization-events) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "records the variance without refusing a large one" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "flags output that came out far off plan" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "tells everyone who can close a run about a variance" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "says nothing when everything went to plan" ·
  MC-504
- **Closing values the batch at what its run consumed:** the material
  cost of our own components, its unit cost per unit made, carried to
  what already left; a run that made nothing records the cost as a loss,
  with no unit cost. Whoever may see costs sees it on the finished run.
  [ADR-048](../adr/0048-cost.md#decision--a-batch-is-valued-at-close-from-what-its-run-consumed) ·
  [test](../../server/test/costs.e2e-spec.ts) "posts a batch its material cost at close" ·
  [test](../../server/test/costs.e2e-spec.ts) "splits the cost between what is left and what already went" ·
  [test](../../server/test/costs.e2e-spec.ts) "has a material cost and no unit cost when nothing was made" ·
  [test](../../client/e2e/costs.spec.ts) "shows what a batch cost, and clears a receipt waiting for one" ·
  MC-505

## Cancelling a run

- **A planned or in-progress run can be cancelled, with a reason; a
  finished or cancelled one cannot.** The reason is added to the run's
  notes and shown on its page.
  [ADR-032](../adr/0032-production-runs.md#decision--close-tops-up-from-source-when-wip-is-short) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "cancels a draft with nothing stranded" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses to cancel a completed run" ·
  partly tested
- **Cancelling carries nothing back.** What was issued stays where the
  run is made; the answer lists the components left there, and the dialog
  warns of it for a run in progress.
  [ADR-032](../adr/0032-production-runs.md#decision--close-tops-up-from-source-when-wip-is-short) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "leaves issued material where it is and says what is stranded" ·
  [test](../../client/src/production/production-order-detail-page.test.tsx) "warns that issued material stays put when cancelling a released run" ·
  [test](../../client/src/production/production-order-detail-page.test.tsx) "does not warn about material when cancelling a plan" ·
  [Help](../../client/src/help/guides/en/production.md#if-something-is-refused-refused)

## Finding a run, and what its page shows

- **A run is Planned, In progress, Finished or Cancelled:** before
  release, after it, once closed, or stopped.
  [ADR-032](../adr/0032-production-runs.md#decision--output-is-a-repeatable-event-closing-is-explicit) ·
  no test ·
  [Help](../../client/src/help/guides/en/production.md#words-youll-meet-words) ·
  MC-1536
- **Production lists runs newest first, 25 at a time, narrowed by status,
  by the day planned, and by part of the reference.**
  [ADR-057](../adr/0057-lists-by-date-range-sorted-where-it-helps-exported-as-csv.md#decision--a-date-range-on-the-lists-that-have-a-date-people-ask-by) ·
  [ADR-056](../adr/0056-search.md#decision--what-is-searched-by-what) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "pages with a cursor and stops when there is nothing left" ·
  partly tested ·
  MC-1536 · MC-1557
- **A run's page lists its components only once it is released,** each
  with what was planned and used, and the lots that went in. A component
  the maker supplied shows a dash for used.
  [ADR-039](../adr/0039-component-lots.md#consequences) ·
  [test](../../client/src/production/production-order-detail-page.test.tsx) "explains that components arrive at release, not before" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "consumes the lots the run was given, and shows them" ·
  [test](../../client/src/production/production-order-detail-page.test.tsx) "shows a dash rather than zero for a component we never held" ·
  MC-502 · MC-1537

## Who may do what, and what History keeps

- **Each step takes its own permission: See production runs; Plan a run,
  which also changes a planned one; Release a run, or cancel one; and
  Record output and consume components, which also closes.** Overriding a
  licence takes a fifth. The Owner holds all five; an Admin, and the
  Production template, the four without the override; a Viewer only sees;
  and anyone holds those their roles grant. A screen offers only the steps
  its reader may take. Another organization's runs are never found.
  [ADR-080](../adr/0080-job-roles.md#decision--roles-an-organization-makes-from-a-template-or-a-copy) ·
  [ADR-050](../adr/0050-licence-status-at-release.md#decision--an-override-is-a-permission-a-reason-and-a-record) ·
  [ADR-003](../adr/0003-multi-tenancy.md#decision) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "is planning’s to ask" ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "is refused to someone without production.override_licence" ·
  [test](../../client/src/production/production-order-detail-page.test.tsx) "hides every action from someone who can only look" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "does not find another organization run" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "does not act on another organization run" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/production.md#release-a-run-release)
- **An item, a place or a partner of another organization is refused as
  unknown,** on a new run, a change or a release's sources, and nothing is
  written; a recipe never reads another organization's items.
  [ADR-003](../adr/0003-multi-tenancy.md#decision) ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses another organization’s partner, location and variant on a new run, and writes nothing" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses another organization’s partner and location on a run’s change, and leaves it as it was" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses another organization’s location as a release’s source, its own or a line’s, and writes nothing" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "never reads or issues another organization’s item through a recipe’s line"
- **History keeps who planned, changed, released, recorded output for,
  closed and cancelled a run, and when, with no values; an overridden
  release records the licence's state and that it was overridden. Never a
  reason or a note,** which stay on the run.
  [ADR-018](../adr/0018-audit-log.md#decision--never-record-the-request-body) ·
  [ADR-050, amended](../adr/0050-licence-status-at-release.md#amendment--settled-while-building) ·
  [test](../../server/test/licence-at-release.e2e-spec.ts) "is in the audit log as a fact, without the reason" ·
  partly tested
