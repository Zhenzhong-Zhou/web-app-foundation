---
status: accepted
date: 2026-10-20
amends: [ADR-006, ADR-070, ADR-077]
amended-by: [ADR-079]
---

# ADR-078 — Registration: open, or by invitation (amends ADR-006, ADR-070 and ADR-077)

**Context.** ADR-006 made registration self-serve: anyone who finds the
sign-up page creates an account and an organization together, on the
production server. No agreement, billing or support stands behind such an
organization, and its data is still ours to hold and protect (ADR-070).
ADR-077 settled how a person joins an organization that exists; nothing
yet decides who may start one.

Two smaller gaps sit beside it. An account left with no organization,
having left one or seen it closed (ADR-069, ADR-070), cannot start
another: registering makes an account too, and its address already has
one. ADR-070 deferred that until invitations, which are now built. And such an account meets Home as
an error, "You do not belong to any organization", with nothing to do
next.

Production should take new organizations by invitation now, and selling
in public later should be a setting changed, not a rewrite. Render's free
services have no shell, so whatever the operator runs, runs on a laptop
against the production database's external address.

Checked before drafting, as the working agreements ask:

- **Fired.** ADR-070's deferred "Starting a new organization from an
  existing account", whose trigger was invitations, now built: taken
  here. ADR-072's watch list in the handoff, which asks for the client
  tests on the zone sent at registration and on Home's time-zone note
  when that code is next touched: this ADR touches both (Consequences).
- **Not fired, and kept in step.** "Registration reveals whether an
  address is registered", closed wherever registration is (below). "What
  unverified access should be limited to": the first Owner meets
  ADR-077's `email_unverified`. "Changing your own email address", which
  a mistyped address on a printed link would make the likeliest to fire
  next, so the command asks before it writes and the page asks the
  person whether the address is theirs. ADR-077's one person in two
  organizations and seat limits, and ADR-070's "closed by us" with plans
  and billing, all unchanged. A public demo and the operator's console,
  which this ADR's setting and command serve.
- **Open issues.** None is in this area. #142, a Content-Security-Policy
  for the client, is the whole app's: a single-page app loads one
  document, and its policy covers every screen. The invitation page is
  its one exception, `img-src data:` for ADR-077's logo, and the pages
  here add nothing a policy must allow, so #142 keeps its own PR and
  short ADR. #129, English left inside translated messages, is the
  reminder for what the command prints (below).

**Decision — one setting, `REGISTRATION`: open, or by invitation.** It
decides one thing: whether a person may create an organization
themselves. Open, they register as today, and an account with no
organization can start one from Home (below). By invitation, only an
organization invitation creates one. Inviting staff (ADR-077) and
organization invitations work under both.

- Declared in `env.ts` and read per request, as `CALENDAR_DAY_INPUT` is,
  so a spec can change it. Left unset, it is `invitation` when `NODE_ENV`
  is `production` and `open` otherwise: a production deployment that
  forgets it fails closed, and development, CI and both test suites need
  no change. Render sets it all the same, so its dashboard says what
  production does.
- A public demo (Open decisions) is the same code with `open`.

**Decision — closed is refused before anything is read.** By invitation,
a guard refuses `POST /v1/auth/register` with 403 and
`registration_closed` before the body is validated or the address looked
up, so a closed form cannot tell anyone whether an address has an
account. That closes "Registration reveals whether an address is
registered" (Open decisions) wherever registration is closed; the entry
stays for the day it opens.

- A public `GET /v1/auth/registration` says which, for the signed-out
  pages. The client has no setting of its own: a static site rebuilds to
  change one, and two settings drift.
- Sign-in drops "Create an account". `/register` stays, and says that new
  organizations join by invitation: to join a colleague's, ask them to
  invite you; to start one, open the link you were sent; then Sign in. A
  bookmark or an old link reaches an explanation, not a missing page.

**Decision — an organization invitation, and the organization is made
when it is accepted.** An organization invitation offers one address the
chance to start one named organization, as its Owner. It is a row of its
own in `organization_invitations`: the address, the organization's name,
the language, when its link ends, and, once accepted, when and which
organization it started.

- The table is the operator's, not a tenant's. It has no
  `organization_id`; the organization it started is
  `started_organization_id`, set at accepting, and the row is deleted
  with that organization.
- Its link is ADR-017's fourth token purpose, `organization_invitation`.
  `auth_tokens`' exclusive arc widens to three: exactly one of `user_id`,
  `invitation_id` and `organization_invitation_id`, each exactly when the
  purpose is its own.
- Accepting runs registration's transaction: `provisionOrganization`, the
  Owner membership, and the account when the address has none, so an
  organization still never exists without its Owner (ADR-004). The
  organization's time zone is the browser's, sent when accepting, as at
  registration (ADR-072); its slug comes from its name, as at
  registration; the account takes the page's language (ADR-077).

**Decision — issued from the command line.** `npm run org:invite` in
`server/`. Run with nothing after it, it asks each question in turn: the
address, the organization's name, the language from the three, then
`CLIENT_URL` and the database's address when they are not set, so the one
thing to remember is the command itself. `--email`, `--name` and
`--language` (English when left out) give the same answers on one line,
`--help` prints an example, and the Render runbook has a section to copy
from. It prints the link and its last day for the operator to send as
they like, as Copy link hands one back (ADR-077), and under them a short
message in the invitation's language, naming the organization and the
last day, to paste whole into a chat or an email. The command sends no
mail, so the laptop needs only the database's address and `CLIENT_URL`,
never the mail key, and Mailpit plays no part. Whoever holds the
production database's credentials is the operator; nothing else
authorizes the command.

- It reads only its own process's environment, never `.env`, so a
  setting left off fails rather than quietly writing to the development
  database, the trap `drizzle.config.ts` records. `CLIENT_URL` is given
  on the command line, and the database's address may be too. When
  `DATABASE_URL` is unset, the command asks for it without echoing it, so
  the password does not stay in the shell's history (the Render
  runbook: never paste a database URL where it stays). It is the
  External URL with `?sslmode=no-verify`, as the backup secret's is.
- Before writing, it prints the database's host and name, `CLIENT_URL`,
  the address and the organization's name, and asks to go on. A mistyped
  address would make an Owner who can never confirm it (below), and
  changing an address is not built yet (Open decisions).
- It refuses an address whose account belongs to an organization: a
  person belongs to one until ADR-077's one person in two organizations.
  The operator, who can read the database anyway, is told why.
- Run again for an address whose invitation is not yet accepted, it
  replaces it: the old link is spent, a new one starts its seven days,
  and the name and language become the new ones. `--revoke` ends one.
  `--list` shows those waiting; those whose link ended unaccepted, with
  "run again to send a new link" beside each, so a customer who missed
  the seven days is not forgotten; and those accepted. Ended and accepted
  ones are listed for 30 days, as long as the sweep keeps an unaccepted
  one.
- It prints in English, on purpose: only the operator reads it. The
  page, the emails and every refusal a person sees are in all three
  languages (ADR-054), `registration_closed` included.
- It boots no Nest application, so no timer starts and no other setting
  is needed. It opens its own connection and calls plain functions,
  which the console's Invite an organization will call too (Open
  decisions): the command is the console's first form.

**Decision — the same page, and seven days that end everywhere.** The
link is `/invitation?token=…`, as ADR-077's, so a person receives one
kind of link and the server alone tells the two apart.

- Reading returns the organization invitation beside the member one,
  one of the two set: the address, read-only; the organization's name;
  the Owner's role line (ADR-077); the link's last day; whether the
  address has an account; and the language the page starts in. No
  inviter and no note: the operator's own message carries both.
- The page keeps ADR-077's states and their refusals, headed "Set up
  {organization}", with a button to match: a new account; signing in to
  start, for an account with no organization; another address; another
  organization; keep your account first; and ended. The name is fixed on
  the page and changed on Profile afterwards (ADR-061).
- Under the address: not yours? Don't set it up here; ask whoever sent
  the link for one to your own address. A mistyped address is caught by
  the person it was meant for before it becomes an Owner's, since
  changing an address is not built yet (Open decisions).
- With no organization yet there is no zone to end a day in, so a link's
  last day is the seventh after today in UTC, and it works until that day
  has ended everywhere, at noon UTC the day after, as ADR-070's cancel
  cutoff does. "Until 26 October" then holds wherever the person is, and
  the page and the command name the day without a zone.

**Decision — the operator hears when one is accepted.** An optional
setting, `OPERATOR_EMAIL`. When it is set, production emails it as an
organization invitation is accepted: which organization, set up by whom,
by name and address, and when. In English, from `MAIL_FROM`, as the
command speaks English: only the operator reads it. When it is unset,
nothing is sent, and `--list` is how to find out. A send that fails is
logged and changes nothing: the organization exists, and the email is a
courtesy to the operator, not a record. The address is a setting, not one
a member typed, so the rule on mail to a typed address (Open decisions,
"What unverified access should be limited to") does not apply.

**Decision — the first Owner starts unconfirmed.** Nothing was emailed,
so accepting confirms nothing, and the verification email goes out from
production, as after registration. Until they confirm, inviting is
refused (ADR-077, `email_unverified`), so confirming is the first thing
they do. Getting started (ADR-058) is unchanged; a newcomer's first
sign-in, next in the chain, can add a step for it.

**Decision — an account with no organization can start one.** ADR-070's
deferred item.

- By invitation: through an organization invitation to its address. It
  signs in on the page and becomes the new organization's Owner.
- Open, also from Home. An account with no organization sees what it can
  do instead of an error: Start an organization asks for a name, sends
  the browser's zone, and makes the organization and the Owner membership
  in one transaction, moving the session into it.
- By invitation, the same Home says how to join an organization and how
  to start one, and offers no form.
- An account whose deletion is scheduled is refused with
  `account_deletion_scheduled`, as at accepting (ADR-077), and the
  banner's Keep my account is the way on. An account that belongs to an
  organization is offered neither.

**Decision — what is kept, and what is recorded.**

- Organization invitations nobody accepted are deleted 30 days after
  their link ended or they were revoked, by the hourly timer that sweeps
  ADR-077's: an address nobody accepted for is not ours to keep. An
  accepted one stays with the organization it started, so "did they
  accept?" has an answer, and goes with it.
- The account's history (ADR-022) records `account.registered` for an
  account made by accepting, as registering does, and the new
  `account.organization_started` for an existing account that starts
  one, either way. The organization's audit log starts empty, as after
  registration: there was no organization to record into. The operator's
  own actions have no log until the console.

**Considered and not done.**

- **Making the organization at issue, empty, with an ordinary invitation
  to it as Owner.** It reuses more of ADR-077. But the organization is
  nobody's from the moment it is issued until someone accepts, if anyone
  does: those never accepted need a second way to delete an
  organization, outside ADR-070's; its time zone is guessed without the
  person's browser; and the name belongs to the offer, not to an
  organization that does not exist yet.
- **A setting on the client as well.** A static site rebuilds to change
  it, and the two drift.
- **Removing `/register` when closed.** A bookmark or an old link would
  reach a page that does not exist.
- **Emailing an organization invitation from the laptop.** It needs the
  mail key there. Production sends the verification email anyway, and
  the console can send invitations through production's mail.
- **Open sign-up waiting for the operator's approval, and payment before
  the organization exists** (Open decisions). Each needs more built
  first: an approval queue in a console, and billing.

**Deferred — each with what brings it in.**

- **A way to ask for an invitation,** a form or an address on the By
  invitation page and on Home. Trigger: the public demo, or the first
  prospect who reaches the page.
- **An organization invitation by email,** sent by production. Trigger:
  the console.
- **A log of the operator's actions.** Trigger: the console, or a second
  operator.
- **Home showing the invitations waiting for an account's address,**
  member and organization ones alike, to accept without the link. It
  looks across organizations by address, which nothing else does, and is
  safe only for a confirmed address, so it needs its own decision.
  Trigger: the first person who loses a link.
- **The command as a screen,** the console's Invite an organization
  (Open decisions). Nothing of the command is thrown away: it is a thin
  shell around plain functions that issue, replace, revoke and list. The
  console's form asks what the command asks (the address, the name, the
  language) and calls the same function to issue; its list is `--list`,
  its Revoke is `--revoke`. What the console adds is a flag that marks an
  account as platform staff, two-factor sign-in for it, and routes and
  pages of their own, apart from any organization. Trigger: that entry's,
  or typing the command becoming a chore.

**Consequences.**

- Migration 0069: `organization_invitations`, with one waiting invitation
  per address (a partial unique index on the address where neither
  accepted nor revoked); `organization_invitation` added to
  `auth_tokens`' purposes, with `organization_invitation_id`, deleted with
  its invitation, in the arc's check; `account.organization_started`
  added to `account_events`' actions, with the schema test's vocabulary
  check.
- `REGISTRATION` and the optional `OPERATOR_EMAIL` in `env.ts` and
  `.env.example`; Render's web service sets `invitation`, and
  `OPERATOR_EMAIL` when the operator wants the emails. The code
  `registration_closed` in `error-codes.ts`. One email, to the operator,
  in English, with an e2e test that it goes when set and not when unset,
  and that a failed send leaves the acceptance standing.
- Server, in `core/auth`, `core/invitations` and `core/organizations`:
  the guard on registration; `GET /v1/auth/registration`;
  `POST /v1/invitations/read` returning `organizationInvitation` beside
  `invitation`, and `POST /v1/invitations/accept` taking the browser's
  `timeZone` for the organization kind, both additions;
  `POST /v1/organization`, Start an organization, `@AllowNoOrganization`
  and listed in `NOT_AUDITED` as registration is. `organization_invitations`
  goes in `OWNED_THROUGH_PARENT`, not exported: the operator's record of
  the offer, not the organization's. `npm run api` after the routes
  change.
- `server/src/cli/org-invite.ts` and `npm run org:invite`, with unit
  tests for its questions and its arguments, the message it prints in
  each language, and its refusing to run without its settings.
  The e2e specs issue organization invitations through the same
  functions, and run registration under each setting.
- Client: the invitation page's organization kind; sign-in without Create
  an account, and the By invitation page, when closed; Home for an
  account with no organization; each designed on the canvas first. The
  client tests ADR-072's watch list asks for once this code is touched:
  the zone sent at registration and Home's time-zone note; with them, the
  zone sent when accepting an organization invitation and when starting
  an organization. A dropped zone would leave a new organization on UTC,
  its today hours off, unnoticed until a date came out wrong. The rest of
  that watch list is in files this ADR does not touch, and stays there.
- Docs: manual checks section 31; the Render runbook's `REGISTRATION`
  and a section on inviting an organization; the glossary's organization
  invitation; the handoff.
- Build order: the server (the migration, the setting and its guard, the
  organization invitation and its acceptance, Start an organization, the
  command, the sweep, e2e tests); then the client, after the design; then
  the docs.

**Amendment (October 2026) — as built.** What building it, and its
reviews, settled:

- **Erasure.** Erasing an account (ADR-069) rewrites the address on any
  organization invitation it accepted to the same placeholder as
  `users.email`, in the erasure transaction. The row still says the
  organization began from an invitation, and when, but no longer whose
  address it was.
- **The command and acceptance take turns.** Acceptance takes the
  command's lock on the address before it holds the row, and replacing or
  revoking changes only an invitation not yet accepted. A replace that
  finds it accepted meanwhile is refused and says so, so it never prints
  a link that already reads as ended; a revoke that finds nothing waiting
  says so, rather than Revoked, and exits 1. A test holds the lock to
  prove acceptance waits.
- **English when left out.** `--language` is English whenever `--email`
  or `--name` is on the command line; only a bare run asks. `CLIENT_URL`
  and the database's address are asked for whenever the shell does not
  set them, on one line too: the command never refuses to run for want of
  a setting, so its unit tests cover its arguments and answers, not such
  a refusal.
- **The command's input.** One reader serves the whole run, so piped
  answers queue rather than get lost; a piped answer is never echoed, and
  the database's address is hidden at a terminal. A wrong answer is asked
  again, the database's address included. Ctrl-D, Ctrl-C and the end of
  piped input end the run with "Cancelled. Nothing was written." and exit
  130. Addresses are checked as registration checks them, with
  class-validator's `isEmail`.
- **The test setups.** `REGISTRATION` is pinned to open in the e2e
  suite's Vitest config and in the Playwright API server's environment,
  so a value left in `.env` for MC-3101 cannot break either.
- **One way to make an organization.** Registration makes its
  organization through `startOrganization`, as accepting an organization
  invitation and Start an organization do. The organization name's limit
  is one constant on each side, in `account-rules.ts` and
  `lib/validation.ts`, used by the server's three DTOs and the command,
  and by the sign-up and Start forms; Settings' Profile still has its own
  100. Starting one when the account already belongs to an organization
  is refused with the next step: leave it first.
- **The page.** The organization's initials follow a rule of their own,
  not a person's: the first two Han characters of a Chinese name
  (海港草本有限公司, 海港), otherwise the first letters of its first two
  words (Reid Supply Co., RS). Both kinds of invitation share their four
  accept forms, in `invitation-parts.tsx`, each passing its words and how
  it accepts, so a fix to one reaches both. Keeping an account clears a
  refusal carried past Keep my account, on both kinds. When the sign-up
  form or Start turns into the explanation, focus moves to its heading,
  so a screen reader says what changed (ADR-055). `/register` shows the
  signed-out frame at once while the setting loads, and a spinner after
  250 ms. Start refused with a 409 reads the session again, so the
  deletion banner or the new organization's Home appears.
- **Recent activity** names every account event, ADR-069's and ADR-077's
  among them, with a test that leaving, deletion and starting read in
  words, never as codes.
- **Found, not this ADR's:** another device's session keeps pointing at
  an organization the account has left, since a session's organization
  changes only on its own device. Left to an issue of its own, in
  ADR-069's area.

**Amendment (October 2026) — the first Owner's first step (ADR-079).**
Getting started is still unchanged. The newcomer's welcome on Home lists
Confirm your email address first for the first Owner, with Resend, and
says that inviting waits for it, until they confirm.
