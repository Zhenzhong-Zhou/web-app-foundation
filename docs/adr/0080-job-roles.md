---
status: accepted
date: 2026-10-21
areas: [authorization, organizations]
amends: [ADR-004, ADR-016, ADR-035, ADR-070, ADR-071, ADR-077, ADR-079]
---

# ADR-080 — Job roles: roles an organization makes, several to a member (amends ADR-004, ADR-016, ADR-035, ADR-070, ADR-071, ADR-077 and ADR-079)

## Context

Three roles cannot say what a small firm's people do. A
receiver who manages nobody needs Admin, which also invites and removes
members and corrects counts. Someone who should see stock and orders gets
Viewer, which reads nearly everything: recipes, every customer and supplier
with their contacts, and the prices bought and sold at on orders and
invoices; only costs, price lists and the audit log are kept from it.
Whoever may see an order sees its prices too, what is paid to suppliers and
charged to customers, which the dock needs no more than a temp does. And the
permissions left Owner-only "until an organization widens it deliberately",
issuing invoices (ADR-046), costs (ADR-048), price lists (ADR-049) and the
licence override (ADR-050), have had no way to be widened short of making
someone an Owner.

In a small firm one person often does two jobs: the dock and the sales
calls, the books and the purchasing. What is built has to say that without a
role for every pair, and has to leave room for what may follow: a site or an
amount limit on a role, one record shared with a customer, one person in two
organizations.

Checked before drafting, as the working agreements ask:

- **Fired, and taken here.** ADR-016's "a role hierarchy arrives with role
  editing", and the escalation question `roles.controller.ts` left for this
  ADR: settled below, by giving only what you hold. The Owner-only
  permissions of ADR-046, ADR-048, ADR-049 and ADR-050: the editor is the
  deliberate widening they waited for. ADR-070's "No role editor exists, so
  Owner-only means any Owner": closing the organization stays the Owners'
  (below). "Job roles" in Open decisions, by both its triggers, with its
  three consequences: an invitation names its roles by id; a built-in role's
  line comes from the catalogues only, `roles.description` holding a made
  role's line; the export writes the built-in lines translated. The
  handoff's "a Accountant", with a corrected count. ADR-079's deferred "a
  first week per job": the first week already follows permissions, and its
  one gap is closed below. ADR-073's review, CLAUDE.md and conventions.md
  disagreeing on what a write returns: the role routes follow CLAUDE.md, and
  this ADR's docs make the two agree.
- **Not fired, and kept in step.** Row-scoped permissions (Open decisions,
  and ADR-004's known limit): a role still cannot say "only this site", and
  where that would go is named under Deferred. Departments stay a label
  (Open decisions). ADR-077's deferred items, seat limits, two organizations
  per person and sign-in without email, are unchanged: a member's roles
  belong to the membership, as their role did. ADR-079's "asking for help
  from the panel" waits for the operator's console. "When someone is away"
  is unchanged, though a member's role rows (below) are where a cover with
  an end date would go. ADR-077's watch list: this branch's tests add
  members by invitation too, so a tax-codes timeout that comes back is
  looked for in the fixture first.
- **Corrected.** The handoff counts five ADR-077 messages that choose "a"
  for any role but Owner and Admin. There are seven: three on the invitation
  page (`invitation.invitedYou`, `invitation.invitedYouOrganization`,
  `invitation.keep.body`), two in the Invite dialog
  (`members.invite.alreadyMember`, `members.invite.copied.works`) and the
  invitation email's two leads (`mail.invitation.lead`,
  `mail.invitation.leadOrganization`).

Discussed with Bob before drafting: whether Viewer is too broad (for some
people it is, which is what roles are for); whether the built-in roles
should be editable instead; one role to a member or several; inheritance,
departments and attributes; whether this is what the industry does; and,
after the design review, prices on orders. NIST's role model, which most of
the industry builds on, lets a user hold many roles. OWASP asks that every
request pass one access check, made by one routine, and prefers attributes
and relationships to roles where they fit. This ADR is the role model, with
room for both.

## Decision — roles an organization makes, from a template or a copy

An
Owner makes a role from three things: a name, an optional line saying what
it is for, and the permissions it grants. Making one starts from one of five
templates, Warehouse, Sales, Finance, Production and Stock look-up, the
narrowest, for someone who only needs to find things; or from a copy of any
role the organization has, a built-in one included, which every role's page
offers as Make a copy. A template only ticks boxes. It is defined once, in
`permissions.ts`, beside the permissions it names, and a test holds each to
what its permissions need and to nothing Owners keep. The role made is
stored as named, in whatever language its maker wrote, and is never
translated (ADR-054): a role named 仓库 reads 仓库 to an English reader too, and
the Roles guide says to name roles in the language the team reads.

## Decision — the built-in three stay as they are

Owner, Admin and Viewer
cannot be renamed, edited or deleted. Their names and lines are the app's
words, translated by key and shown on Invite, in the invitation email and on
Your access, and would go on saying what an edited role no longer does. The
seed adds any missing grant back to a built-in role on every deploy, which
is how a new permission reaches every Owner, and it cannot tell a grant
removed on purpose from one not yet given. And a new permission reaches
Admin or Viewer by one change in code, for every organization at once. To
vary a built-in role, copy it. Two things make the copy as quick as an edit:

- **Move everyone to…** on a role's page moves every member holding it to
  another role in one step, under the rule that only what you hold can be
  given. It is also how a role is emptied before it is deleted.
- **Invite starts with no role chosen** once the organization has made a
  role of its own, so nobody is given Viewer by default (amends ADR-077,
  where Invite starts on Viewer).

## Decision — prices on orders, a permission of their own

Seeing an order
has meant seeing its prices, so a role that receives and ships would show
the dock what the organization pays its suppliers. `orders.view_prices`, See
prices on orders, now holds them: an order's line prices, its totals and its
tax, in its page, in the orders list and wherever else an order's money
reaches a reader. Without it the server sends none of them, rather than the
screen hiding them, and refuses the purchase order's and the pro forma
invoice's PDFs; the packing slip never had prices (ADR-071). Raising,
changing, confirming and cancelling an order need it, since they set prices.
Owner, Admin and Viewer hold it, so nothing changes for them; each made role
chooses, and the Warehouse, Production and Stock look-up templates leave it
out. A new permission is Owner-only (ADR-004), but this one is split from
what Admin and Viewer already held, so it goes to them. Invoices are prices
by nature and keep `invoices.view`; costs keep `costs.view` (amends ADR-035
and ADR-071).

## Decision — several roles to a member, added together

A member holds one
or more roles, and may do whatever any of them allows. Wang works the dock
and takes sales calls: he holds Warehouse and Sales, and can do everything
in either. Take Sales away and he has Warehouse's alone; change Sales, and
everyone holding it changes on their next request. Owner stands alone: it
already holds everything, so an Owner holds no other role, and the
last-Owner rule is unchanged. An invitation may name several roles. Each
role a member holds is a row of its own, with its own id, so that a scope or
an end date can later be a column on it (Deferred). On the day this ships,
every member holds the one role they held (amends ADR-004, which put a
single role on the membership).

## Decision — Settings → Roles, beside Members

`/settings/roles` lists the
organization's roles, the built-in three first, each with its line and how
many members hold it. A role's page says what it can do, in the sentences of
Your access (ADR-079), and who holds it. Every member can read both, as
everyone can read People; making, changing and deleting are the Owners'
(below).

## Decision — the editor

The permissions sit in ADR-079's eight areas,
stock, products, orders, production, invoices, costs, partners and people,
each a checkbox with its own line.

- **What a permission needs is ticked with it.** Receiving against an order
  needs seeing orders; correcting a count needs moving stock. Ticking one
  ticks what it needs, and unticking a needed one unticks what depends on
  it. The needs are declared once, in `permissions.ts`, and the server
  refuses a role that lacks one with `permission_requires`, naming it.
- **Three are every role's,** shown ticked and locked: seeing who works here
  (`users.view`), the roles (`roles.view`) and the organization's settings
  (`organizations.view`). Every built-in role holds them, People and Members
  are for everyone (ADR-063), and the screens built so far read the
  organization's settings without asking.
- **What the role can do** stands beside the boxes, in the words its holder
  will read on Your access, and follows each tick.
- **Tick all and Clear** on each area, and leaving with changes not saved
  asks first.
- **Who is told.** Three notifications go to whoever holds a permission: a
  licence expiring, to whoever may change licences or release production; an
  order line closed short, to whoever may change orders; a production
  variance, to whoever may complete production. Made roles change who that
  is, so those permissions' lines say it: "Also told when a line closes
  short."

## Decision — a permission's words, on the server, translated

`PERMISSION_DESCRIPTIONS` were written for a role editor and never
translated (ADR-079). They become messages in the three languages, one line
each, sent with the editor's catalogue and used by the audit log, the export
and the refusal below, so the four say the same thing. ADR-079's sentences
stay the client's, for Your access and the editor's summary.

## Decision — you can give only what you hold

To give a role, by changing
a member's roles, by inviting or by Move everyone, your own roles must
together hold every permission it grants. To change or remove a member, they
must also hold every permission the member's roles grant together. Resending
or revoking an invitation follows the same rule for the roles it names. This
is ADR-016's role hierarchy, and it covers ADR-016's and ADR-077's Owner
rules, which keep their words: "Only an Owner can invite an Owner." For a
made role: "Your roles don't include everything Warehouse lead can do, so
you can't give it." `GET /v1/roles` says which roles the reader may give, so
Members and Invite disable the rest with that reason, as Invite's Owner card
does today (amends ADR-016 and ADR-077).

## Decision — what stays the Owners'

Making, changing and deleting roles,
by three new permissions, `roles.create`, `roles.update` and `roles.delete`,
Owner-only as every new permission is, and closing the organization
(`organizations.delete`, ADR-070) are never offered in the editor. Only
Owners edit roles and an Owner holds everything, so editing a role cannot be
used to climb, and a role changed after an invitation naming it went out
cannot grant more than its inviter held. Everything else can go into a role,
inviting and changing roles included (amends ADR-070).

## Decision — names and lines

A made role's name is unique in the
organization, ignoring case, and none may read as a built-in role in any of
the app's languages, so a message choosing its words by Owner, Admin or
Viewer never meets a made role of that name. Names run to 50 characters,
lines to 200; a line is optional.

## Decision — deleting a role

Only a role nobody holds and no live
invitation names. An invitation that has ended or been revoked drops the
role from its list, as the sweep would within 30 days (ADR-077); the audit
log keeps what it granted. The refusal says how many hold the role, and
offers Move everyone.

## Decision — Members, and removing a member (#147)

Each member's roles
show side by side. Change roles is a dialog of checkboxes, and under them
what the member could do with the roles ticked, in Your access's sentences,
following each tick: with roles added together, the clearest way to see what
someone will be able to do. Each row's menu gains Remove from the
organization, `DELETE /v1/users/:id`, which has had no screen. Its dialog
says the account stays theirs, their work keeps their name, and their access
ends on their next click. Both follow the rule that only what you hold can
be given.

## Decision — held when two act at once

The last Owner is counted under a
lock, so two Owners demoting or removing each other at the same moment
cannot leave none, as counting without one could (`users.service.ts`). A
role saved after someone else changed it is refused with `role_changed`,
naming who, rather than overwriting what they did. A member keeps at least
one role. Move everyone writes one audit entry for each member it moves, so
each person's history says what happened to them.

## Decision — words and records

- **The audit log** records a role made, changed (its name, its line, and
  the permissions added and removed, in words) and deleted, each opening the
  role's page, and a member's roles changed. Their keys are declared with
  their names in each language (ADR-076). An old "role changed" entry still
  reads as it did.
- **The seven messages** choose their article by which built-in role they
  name, and a made role goes without one, "invited you to join as Warehouse
  lead", as the welcome card and the inviter's bell already do. Several
  roles read as a list, in each language's way: "Warehouse and Sales",
  "Entrepôt et Ventes", "仓库和销售".
- **A built-in role's line comes from the catalogues only.** Migration 0073
  clears the English stored in their `roles.description`, which ends the
  backfills 0068 and 0072 needed; the column holds made roles' lines.
  `roles.csv` writes the built-in lines in the export's language.
- **The Owner is found by `is_system` and name together,** in one helper,
  never by name alone.

## Decision — the first week, for any role

The first week's Receive item
shows for whoever may receive against an order, not only for whoever may
move stock; for someone who may not move stock, its button opens the
confirmed purchases. Everything else in the first week already follows
permissions (amends ADR-079).

## Decision — one place decides

Three rules keep the model open to what
may follow (Deferred) without touching what reads it:

- **One place answers both questions:** what may this member do, and who may
  do this. Today three read the grants: the guard's lookup in
  `permissions.service.ts`, `member-access.service.ts` and the
  notifications' recipients. All three move into one service in
  `core/authorization`, and a lint rule, like `UNSAFE_GLOBAL_DB`'s, refuses
  the role tables anywhere else.
- **No access is decided by a role's name,** except whether a member is an
  Owner, in the helper above.
- **The client asks `useCan`,** never a role's name.

The answer is still worked out on every request (ADR-016): one indexed query
from the membership through its roles to their permissions. Sixty-one
permissions and a few roles each take well under a millisecond, and a change
to a role reaches its holders on their next click.

## Decision — what rides along

- **#155, first.** A dialog gives focus back to whatever opened it.
  `openDialog` blurs the button that opens a dialog, so MUI has nothing to
  return focus to, and this ADR's new dialogs would ship with the same
  fault.
- **#148, in part.** "Missing permission: costs.view", from the guard, the
  recent records and the files, says in the reader's words what their roles
  do not include, and who may change them (ADR-079's names to ask). Made
  roles will meet it more often than three roles did.
- **#169, in part.** Members and Roles leave the menu while there is no
  organization.
- **#151.** The account menu's preferences open from the keyboard.
- **The demo** gains two roles made from templates, each held by one of its
  team.

## Considered and not done

- **Editable built-in roles.** Their translated lines would say what an
  edited role no longer does, the seed would put back what an Owner removed,
  and a new permission for Admin or Viewer would have to skip the edited
  ones. A copy and Move everyone give the same result.
- **Hiding prices on the screen alone.** The response would still carry
  them, and anyone opening the browser's tools could read them.
- **More built-in roles in every organization** (Warehouse, Sales, Finance).
  Each needs a translated name and line and a backfill into every
  organization, and an organization still could not say "sales, who also
  receive".
- **One role to a member,** with a role made for each combination. Simpler
  to read, and how many small-business tools work; but in a small firm the
  combinations multiply ("Warehouse and sales", "Warehouse and finance"),
  and the forty-odd server files that read one role id would change later
  rather than now. A start from several templates at once was the halfway
  step; several roles make it unnecessary.
- **Inheritance,** a role that includes another. It saves a few ticks, turns
  "what can she do?" into a chain to follow, and lets a change to one role
  reach roles nobody looked at. A copy stands alone.
- **Departments giving access.** A department says where someone sits, a
  role what they do, and the two vary independently (Open decisions).
  Visibility by department is row scoping, under Deferred.
- **Deny permissions.** With roles added together, "everything Sales may,
  except costs" makes the answer depend on which rule wins. Access stays
  allow-only; the answer is a smaller role.
- **A policy engine now** (AWS Cedar, Open Policy Agent). It wins where many
  services share rules, or rules change without a deploy; here one server
  keeps them in code.

## Deferred — each with what brings it in

- **Attributes.** A scope on a member's role, "Warehouse, at Burnaby only",
  as a column on its row, applied in one place the way `organization_id` is;
  and conditions on using a permission, "issue invoices up to $5,000",
  "change the orders they raised", checked in the service with the record in
  hand, after the guard, by one helper (CASL, as ADR-004 named). Trigger:
  the first customer whose staff must be held to a site, a team or an
  amount.
- **Sharing one record,** a customer or a supplier seeing their own orders:
  relationships, as Zanzibar-style systems (OpenFGA, SpiceDB) keep them.
  Trigger: a customer or supplier portal.
- **Non-Owners editing roles,** under the same rule extended to editing: a
  role changed only by someone who holds everything it grants, before and
  after. Trigger: an Owner who wants to hand role editing to someone else.
- **A bell when your roles change.** Trigger: someone surprised by a change
  in what they can do.
- **A made role's name in more than one language.** Trigger: a team reading
  two languages that asks for it.
- **Caching what a member may do,** cleared whenever a role or a member's
  roles change. Trigger: the per-request query measured as slow.

## Consequences

- Migration **0073**. `membership_roles` (`id`, `organization_id`,
  `membership_id`, `role_id`, `created_at`), its membership and its role
  each held to the row's organization by a composite foreign key, so a role
  from another organization cannot be given; unique on membership and role;
  indexed by organization, by membership and by role. A role cannot be
  deleted while a member holds it, and removing a member removes their rows.
  Backfilled from `memberships.role_id`, which is then dropped.
  `invitation_roles` the same way, from `invitations.role_id`. `roles` gains
  a unique index on its organization and its lowercased name, in place of
  `roles_org_name_key`, and the built-in roles' `description` is cleared.
  One migration does it at today's sizes; on large live tables the procedure
  would be expand and contract (ADR-052).
- Permissions: `roles.create`, `roles.update` and `roles.delete`,
  Owner-only; `orders.view_prices`, held by the three built-in roles; 61 in
  all. Each permission's line in three languages, what it needs, and the
  notification it brings; the five templates, each written out in the build
  brief for Bob to review.
- Server: `GET /v1/roles` gains each role's line, whether it is built in,
  its permissions, how many hold it and whether the reader may give it; `GET
  /v1/roles/catalogue`, each permission's line, what it needs and whether it
  is offered or locked, and the templates named in the reader's language;
  `GET /v1/roles/:id` with its holders; `POST /v1/roles`, `PATCH
  /v1/roles/:id`, `DELETE /v1/roles/:id` and `POST /v1/roles/:id/move`.
  `PATCH /v1/users/:id` and `POST /v1/invitations` take `roleIds`. Order
  responses without prices for whoever lacks `orders.view_prices`, and their
  PDFs refused. The request context carries the membership, not a role. One
  authorization service and its lint rule; the rule that only what you hold
  can be given, wherever a role is given or a member changed; the audit
  actions and their declared keys; members' roles and the built-in lines in
  the export, with the README's glossary of its columns; the seven messages;
  the refusal in words. `npm run api` after the routes change. E2e tests for
  each refusal, roles added together, Move everyone, deleting, a made role's
  holder refused in each language, an order read without its prices, and two
  Owners demoting each other at once. The access query timed on
  `seed:volume` within ADR-051's budget.
- Client: Settings → Roles, a role's page and the editor; Members' roles and
  Remove; Invite with several roles and none chosen; the first week's
  Receive; `openDialog` giving focus back; the account menu from the
  keyboard; the menu with no organization. Designed on the canvas first:
  Roles, a role's page and a built-in one's, the editor on a computer and a
  phone in English and 中文, Move everyone, deleting, Members with several
  roles and the Remove dialog, Invite's cards with a made role and one that
  cannot be given, and an order without its prices. Order pages and lists
  without prices. Unit tests for the editor's needs and the role list;
  Playwright for making a role from a template, giving it, and its holder's
  Home; for each template, its holder opening every page in the menu without
  a raw refusal; the new pages in `accessibility.spec`.
- The guides: Roles, new, and Members, changed, in three languages, a commit
  of their own; the glossary's permission, made role, Move everyone to… and
  Remove from the organization.
- Docs: manual checks section 33; this ADR's as-built amendment and the
  amendments at the end of ADR-004, ADR-016, ADR-070, ADR-077 and ADR-079;
  CLAUDE.md and conventions.md agreeing on what a write returns; the
  handoff.
- `npm run migrate:all` once 0073 lands.
- Build order: this ADR; #155; the schema and permissions; the server; the
  client after the design; the guides; the docs last, after the reviews.
  Built by Claude Code, a prompt per commit ([engineering.md, *How code is
  delivered*](../engineering.md#how-code-is-delivered)).

## Amendment (October 2026) — as built (#176)

What building settled:

- **58 permissions, not 61.** There were 54 before it, not 57, so the four
  new ones make 58; the "Sixty-one" above reads 58.
- **One place.** `PermissionsService` answers what a member may do
  (`memberPermissions`) and who holds a permission (`holdersOf`); the route
  guard, the adjustment and licence-override guards, member access and the
  notifications' recipients all ask it. `isOwnerRole` and `holdsOwner` find
  the Owner by built-in flag and name together, and `giving.ts` holds the
  one rule for giving. A lint rule refuses `membership_roles`,
  `invitation_roles` and `role_permissions` outside `core/authorization`,
  except the schema, the seed, provisioning and the export, each named with
  its reason. The request context carries the membership, and `/auth/me` no
  longer sends roles nobody read.
- **Migrations.** 0073 as above. 0074 adds `roles.updated_by`, so a stale
  save (`role_changed`) names who saved last; the editor sends back the
  `updatedAt` it read.
- **Refusals.** Codes `role_changed`, `role_held`, `permission_requires` and
  `role_name_unavailable`. 400 for a permission never offered, a missing
  need, an Owner not alone, no roles, or another organization's role (a body
  id, as engineering.md's rule says, where it had been 404); 404 for no such
  role; 409 for a name taken or reading as built in, a built-in role changed
  or deleted, a stale save, a held role, a role a live invitation names, and
  the last Owner; 403 for giving. The three locked permissions are added
  when a request leaves them out.
- **Needs.** `PERMISSION_NEEDS` lists only direct needs: every create,
  update, delete and act needs its view, and a route's reads across areas
  add the rest (moving stock needs products and locations; raising an order,
  partners and products; drafting an invoice, orders; the others in
  `permissions.ts`). Raising a replacement for a return needs
  `orders.create` at its route rather than as a need, so a role that closes
  returns does not gain raising orders.
- **Prices.** Withheld field by field from an order, the orders list and the
  export's columns, and a test pins the exact fields a reader without
  `orders.view_prices` receives, so a new field fails it until it is
  classified (#177 asks for one optional object). An order's invoice money
  follows `invoices.view`, and its amount not yet invoiced needs prices.
  Reading the audit log needs `orders.view_prices`, since the log keeps
  orders' prices: the one view with a need.
- **Whom to ask.** Every refusal, Home and Your access name up to three
  members who hold `roles.assign`, the missing permission and everything the
  reader's roles grant, Owners first, never the reader. A refusal quotes the
  permission's line, never its key (#148, in part).
- **The Owners' lock.** Demoting, removing, Move everyone, leaving and
  completing an account's deletion take one advisory lock on the
  organization's Owners, after the organization row's lock where both are
  taken.
- **Receiving.** An order line carries whether its item tracks lots and its
  unit, so receiving needs `orders.receive` alone; lot trace and an order's
  partner show as text where the reader may not open them.
- **Audit.** `role.created`, `role.updated` (its line from and to, the
  Owner's configuration rather than a note), `role.deleted` and
  `member.roles_changed`; `user.role_changed` has no writer and still reads.
- **Words and marks.** English lists in British style, without the Oxford
  comma; French gives a role with « attribuer ». A made role's chip has
  square corners and a built-in one's round, so the two differ by more than
  colour (WCAG 1.4.1). Roles lists the built-in three first.
- **Left for issues.** #177 (prices in one object), #178 (one link that
  leads only where the reader may go, and lookups that check their own
  permission), #179 (what Move everyone gains and loses; a role deleted
  while being given), #180 (`membership_roles.csv`), #181 (the audit log
  shows costs to readers without them), #182 (permissions read twice on some
  requests), #183 (a flaky phone sign-in), #184 (straight apostrophes).
  #148, #155 and #169 have parts left, each said in #176.
