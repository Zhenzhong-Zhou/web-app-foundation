# Open decisions

Questions land here before they are promoted to an ADR. None of these block V1;
they exist so the reasoning is not rediscovered from scratch.

## Industry vocabulary and optional modules

The screens were written
for the first customers, who make supplements: "recipe" and "batch" are
their words, and the Licences screen exists for Health Canada's NPN. A
machine shop says "bill of materials", a cosmetics maker "formula", and
a business making nothing regulated never needs a licence. Two separate
answers when one is needed. Modules an industry does not use (licences,
perhaps production) switched off per organization, removing their
screens and fields rather than leaving them unused. And vocabulary
chosen per organization from a short list of variants (Recipe, Formula,
Bill of materials), laid over the standard catalogue in each language:
ADR-054 already takes every screen word from a catalogue, so the
mechanism is small and the work is deciding which terms vary and
writing each variant in every language. Licences are already optional
in effect — nothing requires one unless the organization says so — so
nothing is blocked today. Trigger: the first customer outside
supplements, whose words are then the evidence rather than a guess.

## Row-scoped permissions

ADR-004 handles global rules but not "this member
sees only rows related to them" (a manufacturer viewing only their own
inventory). Extend rather than replace: likely a scope on the membership,
applied in one place the way `organization_id` is. Not needed until an
application requires it. ADR-080 names the two places: a scope on a
member's role, a column on its row; and conditions on using a
permission, checked in the service with the record in hand.

## External parties: members or separate organizations?

Suppliers and
carriers as low-privilege members of the operating organization is simpler;
separate organizations with explicit sharing fails safer. Depends on the
application.

## Customers: `users` or their own table?

Order placement needs identity but
not necessarily an account. Downstream of V1.

## Registration reveals whether an address is registered

A duplicate email
returns 409, which is the enumeration hole login and `forgot-password` both
avoid. Closing it means registration always answering "check your email", and
sending the existing account a "someone tried to register with your address"
message instead — a third template and a different response shape. A UX
decision, not a patch. Wherever registration is by invitation (ADR-078),
the route refuses before it reads the address, so the hole is closed
there; it reopens with the setting.

## Breached-password rejection

Length is the only rule today (12 minimum, no
composition rules, per NIST). `Password123!` passes. The high-value addition is
Have I Been Pwned's range API — k-anonymity, no key, the plaintext never
leaves the server — rejecting server-side, failing open when the API is
unreachable. Client-side strength meters are advisory only; anything the
browser enforces is bypassed by `curl`.

## SMTP authentication

Mailpit needs none, every real provider does. Two env
vars, deliberately not guessed at before a provider is chosen.

## Audit log export and payload search

Filtering covers who, what, and when,
which is what people ask. Free-text search over the JSONB payload needs
different indexes and answers a question nobody has yet. CSV export is a real
compliance need eventually, and is a streaming endpoint rather than a bigger
page — deferred until someone asks.

## Departments

Deferred, and not a permissions mechanism: a role says what
someone can do, a department says where they sit, and the two vary
independently — a Warehouse Manager and a Sales Manager hold the same role in
different departments, while one department contains several roles. Building
permissions on departments rebuilds roles under a different name. As a label
(shown in a member list, filtered on, reported on) it is a column or a small
table whenever an application asks. If it ever *imposes* visibility rather
than filtering it, that is the row-scoped permissions entry above, not a
department feature. ADR-080 keeps it so.

## Separate packages, not npm workspaces

Server and client keep their own
`package.json` and `node_modules`. The workspace would give one TypeScript
version and a `shared/` package for the four validation constants currently
mirrored in `server/src/core/auth/dto/` and `client/src/lib/validation.ts`.
Rejected for now: it changes how Render builds, which is a production change
to solve a local annoyance. Revisit when `shared/` would hold response types
rather than four numbers — that is a real drift surface, four constants is
not. Until then the copies carry comments pointing at each other.

## Admin CRUD: Refine, provisionally

Headless (so no theme to fight), and
it bundles TanStack Query, which is the server-state layer step 9 needs
anyway. Not yet adopted, and not an ADR until two things are checked against
its data-provider interface: keyset pagination on a UUIDv7 cursor with no
`count(*)` (ADR-018), and 403s that carry meaning. If the provider assumes
offset pagination and a total, the adapter fights the framework.

## Forcing a password change after admin-created sign-in

It was made
unnecessary by ADR-077. Invitations replace Add member, so no route sets
another person's password and no account has one a second person knows.

## What unverified access should be limited to

Verification works and sets
`email_verified_at`, but nothing reads it — ADR-017 chose not to block login,
on the grounds that losing a registration to a dead SMTP connection is worse
than letting an unverified user in. The consequence is a flag with no
consequence, and password reset sends a link to an address nobody confirmed.
Candidates are actions the unverified user takes themselves: inviting a
member, which ADR-077 now refuses, and changing their own email address,
still open (its own entry, below). Capping their *role* is not a
candidate — an admin creating an Admin cannot control whether that
person verifies, and either rejecting the action or silently downgrading
it makes `memberships.role_id` disagree with the behaviour. Expiring the
token is fine; expiring the account is not. The rule for every feature
to come: any feature that sends email to an address a member typed (an
invitation today; an invoice emailed to a customer later) requires the
sender's own address to be confirmed, as ADR-077 does for invitations.

## Changing your own email address

Nobody can today: the address is
fixed from registration or the invitation. When it comes, the new
address is confirmed before it takes effect, by a link sent to it; the
old address is told it changed; the password is asked for first; one
account per address still holds, so an address another account has is
refused; and the change is recorded in the account's history
(ADR-022). Trigger: the first person who needs to change theirs, such
as someone who joined by a copied link with a mistyped address. It gets
its own ADR and PR, outside the onboarding chain.

## Registration: open, or by invitation

It was decided in ADR-078: a
setting, production by invitation, and organizations from the
operator's `npm run org:invite`.

## A newcomer's first sign-in

It was decided in ADR-079: a welcome card on
Home, the member's own for two weeks, with what they can do here from
their permissions, the inviter's note, and a first week ticked by what
they do; and Help on every page, its guides kept and checked with the
client. The permission descriptions it counted on were never translated,
so what a person can do has its own words.

## The operator: a console and support access

Platform staff are not
a role in any organization: a flag, a guard and routes of their own,
and a second factor. Read-mostly: organizations, plan, member count,
last active, storage, invitations, and the organization invitations
`npm run org:invite` makes (ADR-078), which the console lists, revokes
and sends by email; its Invite an organization asks what the command
asks and calls the same functions. An organization's data only when one of its Owners
grants access, for a time, with every action in its audit log as
support; never a silent sign-in as a customer, which customers ask
about in contracts and privacy law (PIPEDA, PIPL) cares about.
Monitoring the app itself is a different need: an error tracker and an
uptime check beside the logs. The error tracker is decided in
[ADR-084](0084-an-error-tracker.md); the uptime check is set up by hand
(`docs/runbooks/services.md`). A "Report a problem" link in Help
belongs here too, sending the version, build, page, language and
browser with the person's words. Trigger: more organizations than the
command line serves, or a support request that needs the customer's
screen.

## A public demo

A deployment of its own with its own database, filled
by `seed:demo` and reset nightly, `REGISTRATION=open` there (ADR-078),
mail captured rather than sent, and a banner saying it is a demo;
production stays by invitation. Not ADR-058's sample data, which is a
practice organization for one customer's staff. Trigger: the first
prospect who wants to try before talking to anyone.

## Plans and billing

A plan on the organization (trial end, status,
seats), set by billing: a provider's subscription for cards, or by hand
for a customer paying an invoice, with the operator able to extend a
trial. Not on the invitation, which only starts the trial; seat limits
are counted at inviting (ADR-077). ADR-070's "closed by us" waits on
it. Trigger: the first paying customer.

## Low stock

It was decided in ADR-085: a reorder point per item, bought or made,
with a rule for how much to order, set in Inventory's Reorder points;
low when usable stock, plus what is coming, less what confirmed sales
still need, falls below it; drafts shown so nothing is ordered twice; a
Home card; and a bell once each time an item falls below, grouped, for
those who can buy or make it.

## Feature flags and staged rollouts

A change that reaches some
organizations before all: a flag per feature, turned on per
organization by the operator, and a release that turns it on in stages,
for a change risky enough to try with one customer first. ADR-081 keeps
every open tab working across a deploy, but each deploy still reaches
everyone at once. Trigger: the first paying customers.

## Telling users what changed

What a change tells the people using
the app, decided by what it does to them (Bob, 26 October 2026):

- By email and in the app, in advance: terms, privacy and prices;
  anything that changes their records or their numbers (tax, rounding,
  numbering, retention, deletion); security rules they must act on;
  features removed.
- A "What's new" in Help and a one-time notice in the bell: when a
  workflow moves, or a feature they would want arrives. Permission
  changes go to Owners.
- Nothing: bug fixes, small visual changes, anything internal.

Trigger: the first user outside Bob, together with the terms and
privacy policy.

## A public or a private repository

The repository is public, so
anyone can read the code; nothing secret is in it, the secrets being in
GitHub's settings and Render's. Private would hide the code, but on
GitHub's Free plan a private repository loses three things this one
leans on: Actions' minutes become a monthly allowance, where CI runs
every browser on each push to `main`, nightly and on `full-e2e`, beside
the weekly flake hunt and Performance; rulesets stop being enforced, so
`main`'s required checks, "Commits — no placeholder identity" among
them, would stop without a warning; and CodeQL's code scanning (#113)
needs a paid security product. GitHub Pro keeps rulesets on a private
repository and adds minutes. To decide: stay public, or go private on a
paid plan sized from a month of Actions' usage. Trigger: before going
commercial (Bob, 25 October 2026).

## Job roles

It was decided in ADR-080: roles an organization makes, from a
template or a copy, several to a member and added together; the built-in
three fixed; a role given only by someone whose roles hold all it grants,
and made, changed and deleted by Owners alone.

## Audit filtering in the UI

`ListAuditDto` accepts action, actorId, from,
and to; the client sends none of them. Two years of retention (ADR-012)
makes "load more" a poor way to reach an old entry, but a filter UI designed
against four rows is guesswork. Build it when there is enough log to know
which filters people actually reach for.

## Catalogue attributes deferred with their modules

`products` and
`product_variants` carry only intrinsic facts today. Category and brand are
product-level foreign keys and arrive with the catalogue module. Tax class
and supplier are *variant*-level — tax bands can differ by size, and a
supplier quotes a specific pack — and arrive with selling and purchasing
respectively, supplier as a many-to-many with lead time and pack size.
Barcodes are their own table: one variant carries a UPC, an EAN, and a
supplier code. Images are their own table referencing both product and
variant, the latter nullable so a variant without its own image falls back to
the product's; they wait on file storage, which is deferred.

## Field-level change history

Audit rows record that something happened,
not what it changed from (ADR-018 kept payloads out deliberately). A SKU
rename is the first case where the previous value has obvious operational
worth — "which SKU was this last March" — but the same applies to role
changes and profile edits. If it is needed, it is a payload column on
`audit_log` with a rule about what may go in it, not a JSON history column on
each table that needs it.

## Product list pagination

`GET /v1/products` returns everything, unsorted
beyond name. Fine at ten products, wrong at two thousand. Keyset pagination
is the pattern (ADR-018), but products sort by name rather than by a unique
time-ordered id, so the cursor has to be `(name, id)` compared as a row —
`name >= last and id > lastId` silently skips rows sharing a name. Build it
with the filters, once the client shows which filters matter.

## Routing and operations

A BOM says what goes in, not what is done to it —
mix for twenty minutes, then encapsulate, then a QA hold. Real for a
manufacturer, meaningless for a brand that outsources, and the reason
`bom_lines` has no sequence column: ordering ingredients is not the same as
ordering steps, and a `line_no` used for the second would be the wrong
mechanism arriving quietly. Its own table when someone needs labour or machine
time.

## Scrap and yield loss

A recipe consumes 2.4 kg and loses 3% to the
equipment. Either a percentage on the line or a lower `output_quantity` — the
second is free today and a lie in a costing report, since it hides loss inside
the recipe. A column on `bom_lines` whenever costing or a variance report
needs to tell the two apart.

## Substitute components

The same label from either of two suppliers. A
self-reference on `bom_lines` (`substitute_for_id`) or a small child table;
the real question is whether a substitution at release is a line edit or a
recorded event, which is a traceability question, not a schema one.

## By-products and co-products

One run yielding two outputs — a trim, a
grade B, a recovered solvent. `production_orders` has one
`output_variant_id` and would need output lines to carry more, which is a
shape change rather than a column. Deferred until a real second output exists;
guessing produces a table where every run has exactly one output row.

## Phantom assemblies

A blend that exists as a recipe but is never stocked:
the exploder should see through it to its components rather than expecting a
balance. One boolean on `boms`, and the reason to wait is that a blend that is
genuinely never held is indistinguishable from one nobody has counted yet.

## BOM cost rollup

What a finished unit should cost from its recipe,
priced at current component costs. ADR-048 records what each batch
actually cost; a rollup from the recipe is a standard cost, which ADR-048
rejects for now, and it is useful mainly for quoting a product before it
is first made. Outsourced runs complicate it further: their cost arrives
inside the manufacturer's invoice price rather than from a rollup
(ADR-030), so the two paths give different numbers for the same SKU.

## The manufacturing fee on an outsourced run

A co-packer charges for the
work, and that charge is neither a component nor part of the output's stock
value today. A purchase order line against them for a service variant is the
cheap version; doing it properly means landed cost, which is costing again.

## Production order numbering

It was decided in ADR-074, deferred until its
trigger. `id` is a UUIDv7 and nobody says one aloud.
Runs need a human reference the way lots do, and the same scheme question
applies — see the lot code entry above, and answer both at once or they
diverge.

## "How many can I make", and from where

The arithmetic is free —
`bom_lines` joined to `stock_levels`, on-hand over per-unit quantity, take the
smallest, external lines excluded. Two things are not decided. **Scope:** one
site or everywhere, since material at a co-packer counts toward a run there
and not toward one in our own building. **Explosion:** whether the count stops
at what is on hand, or walks down — "no blend, but enough of the blend's
inputs, so really 400". Both are legitimate and they give different numbers,
so the screen has to say which it means.

## Partner sites collide with our own on `locations_org_root_code_key`

A
partner site is a root, so it shares the `(organization_id, code)` scope with
our warehouses: our `MAIN` and a co-packer's `MAIN` cannot coexist. Safe to
leave, because loosening a unique index later is free — no data can have
violated it. The fix when it bites is splitting that index into two partials,
`(organization_id, code)` where `partner_id is null` and
`(organization_id, partner_id, code)` where it is not, giving each partner its
own namespace. Prefixing codes (`ACME-MAIN`) costs nothing meanwhile.

## Scrap and overage are the same arithmetic for different reasons

The scrap
entry above covers cutting waste, evaporation, and offcuts. Nutraceutical
overage — extra active dosed in so the product still meets label claim at end
of shelf life — is arithmetically identical and regulatorily distinct. One
column cannot report on them separately. Decide whether that reporting is ever
needed *before* naming the column, since `scrap_percent` leans one way and
`quantity_factor` covers both.

## Duplicating a partially received order

Rejected in ADR-031 because
duplicating the whole thing re-orders what already arrived. Copying only the
shortfall is a backorder: a different operation, probably its own action, and
it needs a rule for what happens to the original line. Downstream of the
partial-line cancellation entry.

## If apparel is ever a target, two deferrals move to the front

Matrix BOMs
(five sizes in four colours is twenty recipes differing by one number, since
consumption varies by size) and multi-output runs (one cutting run yields
several sizes from a single marker). Both are listed above as ordinary
deferrals; for cut-and-sew they are prerequisites, not refinements. Furniture
and machining hit neither.

## Purchase pack versus stock unit

A supplier sells a 25 kg drum, stock is
kept in grams, and receiving means multiplying. This is where unit conversion
will actually arrive — before recipes ever need it. The shape is worth
recording now even though the work is deferred: two suppliers of the same
extract sell different pack sizes, so the factor belongs to the pairing of
partner and variant, which is a table, not a column on `product_variants`.
That is the wrong guess most people make, this entry included until it was
checked.

## Compliance is its own domain, and this is the line

`product_licences`
records which registration a formulation is made under, because that is
history and cannot be backfilled (ADR-029). Everything else — registrations per market,
amendment and submission history, renewal dates, label versions, certificates
of analysis, a co-packer's site licence, a licence held by someone else under
private label — is a table set, and designing it
without a real regulatory workflow in front of you produces something that
gets rewritten. The trigger to build it is a second licence for one product,
or a second market. Note also what the label is *not*: medicinal quantity per
dose is declared, while a BOM line is what goes into a batch, and the two are
related by lot potency. Nothing should derive one from the other.

## Propagating a cost correction through production

ADR-048 revalues what
remains and records a variance for what has gone; a batch that consumed
mis-priced stock keeps the cost it closed with. Propagating means
re-running each affected close and correcting its output lots, recursively,
which is Dynamics' "adjust cost" job and needs a rule for batches already
shipped. Trigger: a correction large enough that a batch's recorded cost
misleads a pricing decision.

## Period close

Nothing yet refuses a valuation dated into a month
already reported. A `closed_through` date on the organization, checked on
every posting, with corrections landing in the open period. Trigger: the
first month reported from these figures.

## Variance reporting is a query, not a table

The audit log answers "what
happened to this run"; it cannot answer "every run that ran over plan last
quarter". Both quantities sit on `production_order_lines`, so that report is
arithmetic over existing columns and needs no stored number. Worth building
when someone asks for it; worth not storing either way, because a maintained
total drifts and a computed one cannot.

## Notifications: two callers now, and still no domain

A run closed with a
variance past threshold (ADR-032) and an order line closed short (ADR-034)
both detect something worth telling somebody about, and both currently only
say it in the response and the audit entry — which reaches whoever happened
to click the button.

The shape is one table, one row per recipient, with read state: `user_id`,
`type`, `resource_type`, `resource_id`, `read_at`. Targeting by permission to
start — anyone holding `production.complete` gets the variance — because
targeting by involvement needs `created_by` to mean "owner", which it does
not, and targeting by subscription is its own feature.

Two other candidates are absences rather than events: an expected date passed
with the order still open, and a run that cannot be released for want of
material. Both need something looking on a schedule, which is a cron and a
rule about what happens when it does not run — considerably more than the
table, and worth separating from the two that are already detected.

A toast is not this. A toast confirms what you just did and needs no storage;
the bell holds what somebody else did. Conflating them is the usual mistake,
and the toast is buildable today with no schema at all.

## Micro-dose units are a data-entry convention nothing enforces

`numeric(18,4)` is exact only if the unit is right: 50 mg held in kilograms is
0.00005 and truncates, held in grams it is 50 and does not. Lines inherit the
component variant's `unit_of_measure`, so the decision is made once per
variant at creation and is invisible afterwards. No constraint can catch it —
the defence is seed data and review.

## Unit display preference

Storage is grams and millimetres, always
(ADR-023). Showing pounds and inches is formatting, not conversion, and
arrives as a function next to `relativeTime` plus a setting — but where the
setting lives is the real question: per user reads naturally until a
Canadian org quotes a US carrier and the two disagree about whose preference
the printed document should use. Distinct from unit-of-measure conversion
(cases to eaches), which is arithmetic on quantities rather than display.

## Pallets and license plating

"Pallet 3 in Bin 5" is two different things
depending on the operation. A pallet that sits in a bin and never moves as a
unit is a label; one that gets driven to another warehouse with everything on
it is a container, and a license plate — an identifier attached to a set of
stock rows — is what makes that one operation rather than forty. Both are
real, and which you need depends on how a given warehouse works. Additive
when it arrives: a `containers` table and a nullable `container_id` on
`stock`, which does not invalidate existing rows. Deliberately absent from
`LOCATION_TYPES` — a pallet moves, and a movable thing in a fixed tree is how
the tree stops meaning anything.

## Location capacity

A nullable `capacity` column on `locations` costs
nothing; enforcing it is the hard part. Capacity in units of what — eaches,
cases, pallet positions, cubic millimetres? Does a pallet holding 500 units
count as 1 or 500? And quarantined stock occupies space physically, so it
counts, which means the check cannot simply filter on `is_available`. Not
worth a column until there is an answer to what to do with it.

## Barcodes

One variant carries several — a UPC on the bottle, an EAN for
Europe, a supplier's own code, an inner-case GTIN — so a column forces one
and the workaround is a comma-separated string. Its own table,
`(variant_id, code, type)`, unique on `(organization_id, code)` because
scanning must resolve to exactly one variant. Build it when something scans,
which is receiving or picking, so it arrives with stock movements.

## Category and brand

Tables, not text columns: "Supplements" typed twelve
ways is twelve categories and nothing filters. Categories nest — Supplements
→ Vitamins → Vitamin D — which is the same self-referencing shape as
`locations`. Both nullable foreign keys on `products`. Build it when a list
is long enough that scrolling is annoying, which is also when the categories
will be known rather than guessed. "Series" is deliberately not on this list:
it means a product line, a collection, or a numbering scheme depending on who
says it, and a field that vague gets used for all three.

## Bulk create and CSV import

Single-row creation is enough while catalogues
are typed in by hand. The hard part is not the insert but partial failure:
twenty rows and one duplicate SKU — reject all, or land nineteen and report
the one? Both are defensible, they need different response shapes, and
choosing without a real import to test against is a guess that gets baked
into an endpoint. The forcing function is a supplier catalogue arriving as a
file, which brings its own UX anyway — column mapping, a preview step, an
error report someone can act on — so the semantics will be obvious by the
time there is something to build them against. Seeding in tests loops over
the single-row endpoint and is not the same problem.

## Whole-unit enforcement

`numeric(18, 4)` lets 0.5 of a paperclip be
stored (ADR-025). Refusing that needs a per-variant rule keyed on
`unit_of_measure` — "each" is discrete, "kg" is not — which is the same
mapping unit-of-measure conversion will need in order to buy cases and stock
eaches. Building half of it now means guessing at the half that matters, so
both wait for the module that forces them.

## A dashboard at `/`

The placeholder Home screen was removed and `/` now
redirects to `/products`, because a page whose only content was "you are
signed in" was not earning a route. What belongs there — low stock, recent
movements, pending receipts — is all downstream of the stock layer, so the
redirect stands until there is something worth showing.

## Search and the lookup in the top bar

It was settled by ADR-056; sorting on
the lists by ADR-057. One box that takes a lot code, an
order or invoice number or a SKU, and search and sorting on the lists:
Products and Partners have neither, so finding one of a few hundred means
Load more. Needs search parameters on each list endpoint that fit keyset
paging, a choice between `ILIKE`, trigram indexes and full-text search, and
ADR-051 budgets for them. Search is on the README's deliberately deferred
list, so this reopens it. ADR-055 leaves the slot beside the logo empty
until then. Trigger: Products or Partners past a few hundred rows, or the
recall drill missing its two minutes.

## Generated lot codes for production runs

It was decided in ADR-074, deferred
until its trigger. ADR-023 argues against generating
SKUs because the organization already has one for every item. A lot code is
different: it does not pre-exist, it comes into being at the moment of a run,
and most manufacturing systems issue it from a scheme — date plus line plus
shift, or a sequence. Typed by hand for every run is how two runs end up
sharing a number. Receiving from a supplier stays typed, because that code is
printed on the box and is not ours to invent. The forcing function is a
production module; until one exists there is no run to hang a sequence off.

## Performance budgets

No bundle-size gate and no timing assertions. ADR-021
already accepted MUI's weight on the grounds that this sits behind a login
wall where first paint is not a conversion metric, and a threshold nobody
chose against a bundle nobody has complained about is a gate that gets
disabled the first time CI is slow. Chrome DevTools and the React profiler
are the tools when something feels slow; the likely first trigger is the
stock table at a few thousand rows, where the answer is pagination rather
than a smaller bundle.

## What a site is for

`type` says where a location sits in the tree, not
what happens there — an office, a shop, and a 3PL are all `site`. Recording
purpose will matter for rules like "do not ship to customers from the office"
and for per-site addresses, and both arrive with the modules that force them.
It stays a nullable label when it comes, never a branch: the moment a query
filters on it or a second table appears for one kind of site, a cheap column
becomes an expensive shape.

## Counting a shelf

The movement endpoint takes a delta — "remove 3" — but
a cycle count is a total: "I counted 45." Converting one to the other in the
client means reading the balance and subtracting, and if anything moves in
between the correction lands on a number nobody counted. The fix is an
optional `expectedQuantity` on an adjustment, compared inside the transaction
after the row lock and answered with a 409 on mismatch — an ETag by another
name. Deferred because the response shape is a guess until a counting screen
exists to receive it. The trigger is the first stocktake.

## Reopening a closed order

Received and cancelled are terminal
(ADR-027), so a mistake means retyping. Real systems answer this with
"copy to new order" rather than un-cancelling — the history stays honest
and nobody retypes. Build it when cancelling by accident actually stings;
until then the workaround is raising a new order by hand.

## A run with no BOM can be planned but not released

`production_orders.bom_id`
is nullable because a rework, a trial batch, and a sample are real runs with no
recipe behind them — and those are the runs that later become recipes. But
release copies lines from a BOM, so a run without one has nothing to issue and
nothing to consume, and it currently dead-ends: plan it, cancel it, nothing
else. The fix is letting release take explicit lines in its payload, which is
a shape nobody has asked for. Worth doing the first time somebody needs to
record a rework against stock rather than adjusting it by hand.

## Reservation, and whether the window it protects actually exists

ADR-023
left `available = on_hand − reserved` open. Production makes it look urgent
and then partly answers it: release *transfers* components to the run's
location (ADR-032), so from that moment they are physically out of the pick
face and no shipment can take them. Reservation therefore only protects the
window between planning and releasing, which for same-day work barely exists.
Watch the screen in use before building anything.

If it is needed, the shape is settled. Rows in their own table — item,
location, demand document, quantity — never a `reserved` column on
`stock_levels`, which is the maintained running total ADR-023 rejected for
quantity itself; rows also answer "who reserved this", which is what someone
asks when a pick fails. Reserve at release, not at plan: a draft is a wish.
Warn rather than block, for the variance reason — the physical pick already
happened.

Reserving at plan time is the variant worth taking if planning is days ahead,
and only with an `expires_at` set at plan time. Reservations otherwise
accumulate: six runs planned, two released, four holding material forever
because nobody cancels a plan they abandoned. Expiry belongs in the
availability query (`expires_at > now()`), not a scheduled sweep — a cron
that flips rows to expired is a second source of truth that can lag, and if
it fails silently the material stays fenced off with no sign why. A sweep is
housekeeping, never the mechanism.

Two things to answer first. What sets the window: the honest anchor is the
run's planned date, which `production_orders` does not have, so it needs a
`planned_for` column. And what a lapsed reservation means for a run still in
draft — the plan does not cancel itself, so the UI has to stop showing it as
ready.

The warning half needs no notifications domain: expiry shown on the run in
the production list, and a release-time message when it has already lapsed,
which is the moment it matters.

## Shortfall warning at release

Cheaper than reservation and catches the
actual failure: "this run needs 1200 g, 800 is at the shelf." A read query
against existing data, no schema. Probably the first thing to build if
shortfalls turn out to be the real problem rather than contention.

## A price cannot be removed from a line, only changed

A blank field on
edit means unchanged, not cleared: omitting the field is the only thing the
route can express, and inventing "empty means clear" would make the two
indistinguishable. Zero is not a substitute — it means free, which is a real
and different claim, and it would keep the line counted in the order's
totals and in totalsComplete. JSON can carry an explicit null if this ever
needs fixing, so it is a small change rather than a shape one. The trigger
is somebody entering a price on the wrong line and wanting it gone rather
than corrected.

## The audit log records that something changed, never what

The
interceptor captures no request body, deliberately — POST /v1/users carries a
password, and pino's reason for redacting it applies twice as hard to a row
kept for 24 months (ADR-012). `payload` is opt-in per route, so
"order.updated" was the whole entry: the actor, the resource, the time.

That answers "who changed this order" and not "what did they change it
from". The second question arrives with a dispute — a reference edited after
receipt, a quantity amended on a confirmed order — which is exactly when the
answer is wanted and gone.

Recording before and after is not free. It roughly doubles the log, and half
of what would be captured is field values that have no business sitting in a
two-year table: a note, a contact's phone number, eventually a price somebody
considers confidential. A per-route allow-list of fields is the shape that
works — `@Audited({ fields: ['reference', 'expectedAt'] })` — since it keeps
the decision at the route, where somebody can see what they are committing to
retaining.
**Now partly answered.** The service records what a field was, through
async-local storage the interceptor reads, so the four annotated routes carry
`{ from, to }` where a previous value was recorded and a bare value where it
was not. Deliberately not normalised: a route reporting no previous value
should not be indistinguishable from one whose previous value was null. It is
per-route and forgettable — a second thing the coverage test does not check —
but it covers the fields where the old value is otherwise unrecoverable.

**Worth correcting an earlier claim here.** ADR-024 and ADR-025 rejected
*business rules* in SQL — a cycle check, a quantity calculation — because
logic in the database is invisible to a TypeScript test suite. An audit
trigger decides nothing; it copies OLD and NEW into a row, and that objection
does not reach it. Triggers are open on their merits rather than excluded.

**The ceiling, if it is ever needed.** Trigger-based row history on the four
or five tables that matter, sitting beside `audit_log` rather than replacing
it — one says who did something, the other says what the row was. The reasons
to wait are ordinary: a trigger per table, regenerated on every schema
change, and no question yet that the current shape cannot answer. The forcing
function would be one it cannot: "what did this row look like on 3 March", a
regulator, or a dispute with money attached. Note that movements already are
that history for quantities, and the SKU, ship-to and recipe snapshots are
point-in-time history for the documents that needed it, decided case by case.

**And searching is still not built, deliberately.** GIN on a column that is
null in most rows costs write time to serve a query nobody runs weekly, and
the keys here are fixed by the allow-list rather than unpredictable — so when
a question does arrive, a partial expression index on that one key
(`((payload->>'sku')) where payload ? 'sku'`) is smaller and cheaper than
GIN. Volume is answered by monthly range partitioning, not a cleverer index.

## Quantity breaks on price lists

ADR-049 snapshots a list price onto a
line when it is added, so a break — a lower price from 12 up — would need
re-resolving when the quantity changes, which is the re-pricing ADR-049
rejects. Options: resolve at confirm instead of at add, or an explicit
"Use list price" after changing a quantity. Trigger: a customer on case
pricing.

## Dated prices

A price change prepared in December to take effect in
January. ADR-049 applies a change when it is saved and leaves the old
price to the audit log. A `valid_from` on list items, with the latest
on or before the order's date winning, is the likely shape. Trigger: the
first price change that must be entered ahead of time.

## Which margin to show first

Estimated margin on sale order lines (price
against current pool cost, while pricing) or actual margin per invoice
(revenue against the shipped lots' valuation rows, after the fact). Both
are derivable from existing data (ADR-049 amendment); neither needs a
migration. Trigger: the first pricing decision or margin question someone
actually asks, which says which of the two.

## A security review before real customers

What is built covers the
application: hashed tokens, rate limits, tenant isolation tested per
lookup, an audit log, TLS from the host; dependency scanning on every
pull request comes with ADR-084 (#268). What is not decided: two-factor
sign-in (at least for Owners), how secrets are rotated, and what the
host encrypts at rest. Trigger: the same as backups.

## Reports

Which questions the business asks every week or month — stock
value by location, what expires in 90 days, purchases by supplier, sales
by customer, run variances — and where they are answered: SQL behind a
report page, an export to a spreadsheet, or both. The data for most exists
already. Trigger: the first question somebody asks twice. *A dashboard
at `/`*, above, would show the answers that need watching daily.

## When someone is away

Approvals and notifications go to one person
today. Out of office means either a delegate who acts for them for a
period, or work routed to a role instead of a person. Staff leave as a
record (holiday balances) is an HR system's job, not this one's.
A cover for a period would be a member's role with an end date
(ADR-080). Trigger: the first approval that waits on someone on holiday.
