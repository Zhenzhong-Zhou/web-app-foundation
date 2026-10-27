---
status: accepted
date: 2026-10-16
amends: [ADR-052, ADR-071]
---

# ADR-072 — Each organization's time zone (amends ADR-052 and ADR-071)

**Context.** Every calendar day the server decides is the UTC day
(`todayUtc`, ADR-052), and the documents that date themselves by a
moment read it in UTC (ADR-071, amended). From 4 pm in Vancouver in
winter, 5 pm in summer, the server is already in tomorrow: a receipt is
costed at tomorrow's rate if one was entered early, a licence that
expires today blocks a release this afternoon, and a packing slip prints
tomorrow's date. ADR-052 deferred an organization's time zone until a
day was decided wrongly near midnight (#41). ADR-073 needs it too: the
year in a document's number is a calendar fact, and an order made on the
evening of 31 December in Vancouver is already 1 January in UTC.

**Decision — the zone is the organization's, stored by name.**

- `organizations.time_zone`, an IANA name such as `America/Vancouver` or
  `Asia/Shanghai`, never an offset: a name carries daylight saving and
  any change a government makes, where an offset is wrong half the year.
  Checked against the zones the server knows, and stored under its
  canonical name.
- One per organization, not per member: whether a licence has expired,
  which rate a receipt takes and which year a number belongs to must be
  one answer for everyone in it.
- A new organization takes the registering person's browser zone, which
  is almost always where the business is. Existing ones get `UTC` from
  migration 0066, the zone they use today, so nothing changes until an
  Owner sets theirs.
- Changed on Settings → Organization → Profile, beside the registered
  address, under `organizations.update`, and audited as
  `organization.updated` with the old and new zone. A change applies
  from then on: nothing already dated or printed moves.

**Decision — moments stay UTC; the zone answers calendar questions.**
Every `timestamptz` is stored as it is now. The zone is read only to say
which day a moment falls on, and what today is: `(moment AT TIME ZONE
zone)::date` in SQL, `Intl.DateTimeFormat` with the zone in TypeScript.
Both read the IANA tz database.

**Decision — today is the organization's.** `todayUtc()` becomes
`todayIn(zone)`, still the one place, called with the organization's
zone by:

- licence status at release (ADR-050), and licence reminders (ADR-064),
  each organization's on its own day;
- the rate a receipt is costed at (ADR-048);
- Inventory's expiring-within filter, which read the database session's
  `current_date`, the last place that did;
- Home's cards (ADR-058), and the export's file name.

The session carries the zone, so the client counts days left, Home's
today and the date-range presets in the organization's day rather than
the browser's: a member travelling sees the warehouse's day.

**Decision — a moment's day is the organization's.** What dates itself
by a moment prints that day in the organization's zone: the packing slip
and its file name, the purchase order, the RMA and the pro forma, and
the arrival day a cost correction looks its rate up on (ADR-048).
Invoices and credit notes are unchanged: their dates are calendar days
already (ADR-046, ADR-052).

**Unchanged, on purpose.**

- Screens show a moment's time in the viewer's own zone, as now: the
  clock a person reads is the one on their wall.
- CSV exports keep times in UTC and say so (ADR-057, amended): a file is
  read by other systems.
- Deletion days still end "in every time zone" (ADR-069, ADR-070): a
  cutoff that must hold for every member, wherever they are.

**Considered and not done.**

- Guessing the zone from the registered address: the province is typed
  by hand, and Canada alone has six zones. The browser at registration
  reports its computer's zone, which is right far more often, and an
  Owner corrects it once.
- Each member's own zone deciding the business's day: at 5 pm in
  Vancouver it is already the next morning in Shanghai, so one member
  would see a licence as valid and another as expired, at the same
  moment.

**Consequences.**

- Migration 0066. The session's and the organization profile's responses
  gain `timeZone` (`npm run api`).
- Tests pin the clock either side of midnight in Vancouver and in
  Shanghai, and across a daylight-saving change.
- Manual checks: a receipt, a release and a packing slip made after 5 pm
  in Vancouver carry today's date.

**Deferred.**

- A setting on the Account page for a member to see times in a zone
  other than their device's, such as someone in China reading the
  Vancouver warehouse's times. Trigger: the first member who asks.
- A time zone per site, for warehouses in different zones. Trigger: the
  first organization with sites in two zones, likely together with
  ADR-073's series per site.

**Amendment (October 2026) — settled while building, and in review.**

- **Days are decided in TypeScript only.** Node and Postgres each carry
  their own copy of the zone rules, so the server asks only Node:
  `todayIn` and `dayIn`, one pair on each side, and a query that needs a
  day is given it, never `AT TIME ZONE`.
- **The zone travels with the request.** It is read with the membership on
  every request, at no extra query; a timer or an export's later stream
  reads the row (`timeZoneOf`). A stored zone the server can no longer
  read counts as UTC, with a warning, so one organization cannot stop the
  hourly reminder run.
- **Current names, and only names.** Node's data still spells about
  twenty zones the old way (`Asia/Calcutta`, `Europe/Kiev`), which Safari
  no longer lists, so the server stores the current name (`Asia/Kolkata`)
  and the client names zones the same way in every browser. Only `UTC` or
  an Area/City name is taken: `Etc/GMT+8`, `EST` and `MST` are fixed
  offsets under other names, refused like `+05:00`. The picker leaves
  them out, and offers this computer's zone only when the server would
  take it. Registration never fails over the zone: one the server does
  not know starts the organization on UTC.
- **What the zone decides, in full.** Besides the list above: every CSV
  export's file name; an invoice's void date, on screen and in its PDF,
  and a shipment's date on the order; the dates the issue, void and
  credit dialogs and the exchange-rate dialog start from; date ranges on
  lists of moments (ADR-057, amended); and Home, which no longer takes
  `?today=` (ADR-058, amended).
- **What it does not.** A deletion countdown counts from each reader's own
  day, as before: a deletion day ends everywhere, so each person counts to
  it by their own calendar. A banner hidden "for today" is the reader's
  day too.
- **Before an Owner sets it.** "Nothing changes until an Owner sets
  theirs" holds for the server, not for the screens. For an organization
  still on UTC, Home, days left and the date presets follow UTC rather
  than the computer, so from 4 pm in the Americas they show tomorrow.
  Profile says so, with one button for this computer's zone: set it right
  after deploying.
- **British Columbia stopped changing its clocks** after 8 March 2026:
  Vancouver is UTC−7 all year, so its day turns at 07:00 UTC, from 5 pm
  the day before. Only time-zone data 2026b (April 2026) and later knows,
  so the server's Node must carry it, or Vancouver's days begin an hour
  late from 1 November 2026. Postgres's copy no longer matters, since it
  is never asked. Tests about a clock change use one that has happened.
- **Accepted.** Another member's open screen keeps the old zone until its
  session is read again. A reminder that a licence "expires today" is not
  sent again if the zone later moves back a day.
- **Deferred: a receipt's day after a change of zone.** A receipt takes
  the rate for the organization's today as it arrives; a cost correction
  reads the arrival day in the zone as it is now. After a change of zone
  the two can look up neighbouring days' rates. Storing each receipt's
  rate day settles it. Trigger: the first organization that changes its
  zone after receiving stock in another currency.
