---
status: accepted
date: 2026-09-30
areas: [product-licences, production-orders]
amends: [ADR-040]
---

# ADR-050 — Licence status at release (amends ADR-040)

## Context

ADR-040 made a licence's status derived — in force from a later
day, current, expiring, expired, withdrawn — and the client uses it to keep
unusable licences out of pickers. Nothing on the server reads it. Release
copies whatever licence the recipe carries, so a run can be released under a
licence that expired last month or was withdrawn last week, and nothing on
the run says so. The status is shown only on the Licences page: the recipe,
the release dialog, the run and the lot trace show the number alone.

What should happen is not the same for everyone. An NPN does not expire; an
export certificate or a registration does, and whether work may continue
while a renewal is pending depends on the regime. A business making nothing
regulated has no licence at all. Any one fixed rule is wrong for somebody.

ADR-032 says a real event is recorded, never blocked. Release is not one: it
is the decision to commit material, taken before anything happens, which is
where a check belongs.

## Decision — the server derives the status, by the client's rules

One
function on the server, agreeing with `licence-status.ts`: withdrawn when
`is_active` is false; not yet in force when `issued_at` is after today;
expired when `expires_at` is before today; otherwise current. Days compare in
UTC, as ADR-040 requires. "Expires in N days" stays a display state; to the
server it is current.

## Decision — a policy per organization, with three outcomes

For each
state the organization chooses *block* (409), *override* (409 unless an
authorised person confirms with a reason) or *allow*:

- **Withdrawn** — always block, not configurable. Withdrawal is a decision
  somebody made, and an override would undo it without saying so.
- **Not yet in force** — block by default.
- **Expired** — override by default.
- **No licence on the recipe** — allowed, unless the organization turns on
  *licence required*. Off by default, so a business making nothing
  regulated never sees any of this.

Two policy columns and one boolean on `organizations`, changed under
`organizations.update`.

## Decision — checked at release, with the licence row locked

Release
reads the licence `FOR SHARE` inside its own transaction, after the run
guards and before anything moves. A withdrawal saved at the same moment
either waits for the release or is seen by it, never half of each. The issue
plan returns the licence and its status, so the release dialog can show it
before Release is pressed.

## Decision — an override is a permission, a reason and a record

`production.override_licence`, Owner-only by default like every new
permission. The release body may carry `licenceOverride: { reason }`, and a
guard requires the permission only when it is present, as AdjustmentGuard
does for adjustments. Sent when no override is needed — the licence was
renewed between opening the dialog and pressing Release — it is ignored and
nothing is recorded. The run stores:

- `licence_status_at_release` — current, expired, not in force, or none;
- `licence_overridden_by` and `licence_override_reason`.

The reason stays on the run, not in the audit payload (ADR-018). The
release's audit row records that an override happened.

## Decision — the status is shown where it is acted on

- **Recipe panel**: a status chip beside the licence, so a lapse is seen
  before a run is planned.
- **Release dialog**: the licence and its status, with either the refusal or
  a reason field for whoever holds the override permission.
- **Run detail and lot trace**: the number as now, plus its status at
  release and any override — *Made under NPN 80012345 (Health Canada),
  expired at release, released by Bob: renewal filed 3 Sept*. The number
  links to the licence.
- **Licences page**: unchanged — the register.

## Consequences

- A migration: three columns on `organizations`, three on
  `production_orders`. Runs released before it have no recorded status, and
  read as *not recorded* rather than as current.
- One permission, with its description, in the server's and the client's
  lists in the same commit.
- Server first, with e2e tests for each state under each setting and for an
  override with and without the permission; then the client.
- The server function and `licence-status.ts` must agree. A test on each
  side pins the same dates either side of today.

## Deferred

- **A policy per licence type or authority** — an NPN that never expires
  beside an export certificate that does. Trigger: an organization holding
  both kinds.
- **Grace days after expiry.** Trigger: a regime that allows work during a
  renewal, confirmed by whoever owns compliance.
- **The same check at shipment**, for licences that govern sale or export
  rather than manufacture.
- The status enum of #16 and the sixty-day notification of #17.

## Amendment — settled while building

Four points the decision left
open:

- **A recipe with no licence, when one is required, is refused outright.**
  No override: the two policies cover a licence in a state, and a missing
  licence is not a lapse someone can sign off. An organization that wants
  leniency leaves *licence required* off.
- **The guard asks for the permission whenever `licenceOverride` is sent**,
  before the service knows whether one is needed. Someone without it is
  refused (403) even for a current licence. The client sends an override
  only when the issue plan asks for one and the person holds the
  permission, so "ignored when not needed" applies to those who do.
- **The issue plan's `licenceCheck`** is `{ licence, status, outcome }`: the
  licence or null, its state today (withdrawn included, though never
  stored), and what release would do — `allow`, `override` or `block`. One
  function computes it for the plan and, locked, for release.
- **The audit row** of an overridden release carries
  `{ licenceStatus, licenceOverridden: true }`; a release with no override
  carries nothing new.

Other kinds of licence stay out of this table: site licences (#18) gate
making at a site, wholesale and distribution licences gate shipment (the
check deferred above), and business licences gate nothing and only need a
reminder. One register with a type and what it applies to is the likely
shape when the first of them is built; the status function and the
block / override / allow policy here carry over unchanged.
