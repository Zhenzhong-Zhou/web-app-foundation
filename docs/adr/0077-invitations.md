---
status: accepted
date: 2026-10-19
areas: [invitations]
amends: [ADR-006, ADR-069]
amended-by: [ADR-078, ADR-079, ADR-080, ADR-083]
---

# ADR-077 — Invitations: how a person joins an organization (amends ADR-006 and ADR-069)

## Context

ADR-006 shipped self-serve registration and left adding
people to an Owner or an Admin, who types the newcomer's name, email, role
and a password on Members and passes the password on by hand. The first
organization with staff meets everything that follows from that. The
person adding them knows the password, so two people can sign in as the
account until it is changed, and nothing makes it change (Open decisions).
The password travels by chat or text. Nobody proves the address: a typo
makes an account whose password reset mails a stranger, and
`email_verified_at` stays empty. An address that already has an account
is refused, so someone who left an organization (ADR-069), or whose
organization was closed (ADR-070), can never be added to one again. And
the newcomer arrives with a password and nothing else: nothing says who
added them, as what, or what is expected of them.

## Decision — Invite replaces Add member

On Members, Invite asks for an
email, a role, the language to write to them in, and an optional note
from the inviter, up to 500 characters of plain text ("You'll receive
deliveries at the North site"). The app sends a link. The person opens
it, sees who invited them, to which organization, as what, and the note,
then gives their name and chooses their own password. The membership
exists from that moment, never before, and nobody but the person ever
knows the password.

- `POST /v1/users` goes, and with it the only route that sets another
  person's password. `seed:demo` keeps creating its colleagues with known
  passwords, without a route, since a demo's accounts are meant to be
  signed into.
- Inviting needs `users.create`, as adding did, and the role follows the
  rule a role change follows (ADR-016): an Admin cannot invite an Owner.
  As with demoting an Owner, Admins do not act on an Owner's invitation
  at all: they neither resend it, copy its link nor revoke it, and
  Invited hides all three for them on such a row.
- The role starts at Viewer, the least access, and the inviter raises it
  on purpose.
- The person names themselves. The note is a message from the inviter,
  not a job title: ADR-063 keeps work details the person's own.

## Decision — one invitation, by email or by a copied link

Email is the
default. Copy link puts the link on the clipboard instead, for an inbox
that does not work yet, or a newcomer reached by text or WeChat. Either
way it is one invitation with one live link: copying issues a new link
and spends the emailed one, as a resent verification does (ADR-017), and
the invitation records which way its live link went. The Invite dialog's
own Copy link makes the invitation with `delivery: "link"`: no email at
all, the link handed back, and the event recorded as the link copied.

- Accepting an emailed link verifies the address, since only its inbox
  could have read it. Accepting a copied link does not, and the usual
  verification email follows, as at registration.
- A copied link can be forwarded, so it keeps the same terms as an emailed
  one: one use, the same expiry, the role and the address fixed.
- Either way the link is built on the server from `CLIENT_URL`, as
  verification's and reset's are (ADR-017), never from the request's
  host, which a caller can set to a site of their own. Copy link receives
  it from the server, the only side that knows the token.

## Decision — seven days, then resend

A link lasts seven days, long
enough for a start date next week. It works to the end of its seventh
day in the organization's time zone, so "until 26 October" on Invited,
on the page and in the email holds all that day. Resend and Copy link issue a fresh
link and restart the seven days; Revoke ends it. Members lists
invitations under a heading of their own, Invited, with the address, the
role, who invited and when, and its link: emailed or copied, with its
last day, or ended and not accepted. People, Home and the lookup never
count an invitation as a member.

- Revoke takes the invitation off Invited at once, and its address can be
  invited again straight away. "Ended and not accepted" is an expired
  link, with Resend.
- Expired and revoked invitations are deleted 30 days later by the hourly
  timer: an address nobody accepted is not the organization's to keep.
  That is the invitation's row only. The audit log keeps who invited
  which address, which is what it is for, under ADR-012's retention. A
  revoked invitation leaves Invited at once, and its row stays until
  then.
- An accepted invitation stays with its membership, so its note can be
  read again, and goes when the membership ends.

## Decision — the token is ADR-017's third purpose

`auth_tokens` gains
the purpose `invitation`: stored as SHA-256, consumed in one statement,
swept like the others. The link opens a page in the app,
`/invitation?token=…`. The page reads the invitation with a POST that
spends nothing and accepts with a second POST that spends the token, so a
mail scanner's fetch neither accepts nor burns it.

- Everything else (organization, role, note, language, inviter, expiry,
  how the link went) is a row in a new `invitations` table. ADR-006's
  "without touching the schema" did not hold: a token cannot carry a role.
- Reading tells the page what it shows and nothing more: the address it
  is for, which the page shows read-only; the organization's name and
  logo, and its deletion day while it is being deleted, so the page says
  at once that it takes nobody new; the inviter's name and email, which
  the page shows as the email does, while the inviter is still a member
  (below); the role with its description; the note; the link's last
  day; whether the address has an account, which decides between
  creating one and signing in to join; and the language the page starts
  in. A used, expired or revoked link reads as ended, all three alike,
  so an old or guessed link says nothing more. Accepting one is refused
  with `invitation_ended`, so the page tells an ended link from a field
  it refused.
- The logo comes inline, as a PNG `data:` URL about 64 px tall, sharp at
  the page's 32: a signed-out page cannot read the file route. Nothing in
  the repository sets a Content-Security-Policy for the static site, and
  helmet's covers only the API's own responses, so it loads; a policy
  added later must allow `img-src data:`.
- Accepting writes the account, the membership and the invitation's
  acceptance in one transaction, so no account exists without a
  membership (ADR-004), and signs the person in, as registration does,
  following Keep me signed in as sign-in does (ADR-065): they have just
  chosen the password. A new account accepts with its name, its
  password, the page's language and Keep me signed in.

## Decision — who may accept

- **An address with no account:** the person creates one by accepting.
- **An address whose account belongs to no organization,** having left
  one or seen it closed: the person signs in on the invitation page and
  accepts, and the membership joins the account they have. This is the
  way back in that ADR-069 and ADR-070 left without one. Signing in goes
  through `POST /v1/auth/login`, so its rate limit, timing protection, new
  sign-in email, account events and Keep me signed in stay in one place;
  accepting then takes that session and the token alone, and is refused
  unless the session's address is the invitation's.
- **An account whose deletion is scheduled** (ADR-069): refused at
  accepting with `account_deletion_scheduled` and the deletion day. The
  page offers Keep my account right there, the banner's action, then
  Join; the link stays live meanwhile.
- **An address whose account belongs to another organization:** refused
  at accepting, with the reason, to the person who owns the address. The
  inviter is not told why, which would say that the address has an
  account somewhere. One person in two organizations is deferred, below.
- **Signed in as another address than the invitation's:** refused; the
  page offers to sign out.
- **An address already a member, or already invited, here:** refused at
  inviting (`already_a_member`, `already_invited`, the latter offering
  Resend). Members already shows both, so this tells the inviter nothing
  new. An expired invitation is still one: `already_invited` then says
  its link has ended, never giving a last day, and Resend starts it
  again.
- **While the organization is being deleted** (ADR-070), nobody is invited
  and no invitation is accepted: a person would join to watch it close.

## Decision — inviting needs a verified address, and has a daily limit

An invitation is mail from our domain to an address someone typed, the
reason security emails escape names. An inviter whose own address is
unverified is refused (`email_unverified`), with a link to resend their
verification. An organization issues at most 50 links in any 24 hours,
emailed or copied, resends included (`invitations_daily_limit`). The
refusal says when the next link can be made: the moment the oldest of
the 50 turns 24 hours old, shown in the reader's time zone ("You can
invite again from 14:20"), never "tomorrow". The refusal carries that
moment for the screen to show; its message names the time in the
organization's zone. This settles one half of "What unverified access
should be limited to" (Open decisions).

## Decision — in the language the inviter chooses

The newcomer has no
account, so no language of their own. The invitation carries one, the
inviter's by default and changeable in the dialog. The email uses it, and
the invitation page starts in it, with the signed-out pages' language
choice beside; the account takes the language the page was in when they
accepted, whether the inviter's choice or one they picked there. They
read the page and accepted in it: following the browser could switch
them to a language they never saw. The email says who invited them, by name and by address so
it can be told from a forgery, to which organization, the role in words,
the note, and the last day of the link in the organization's time zone
(ADR-072). Names and the note are escaped. It names the organization in
words only: mail apps block a `data:` image, so it carries no logo. It
is signed "Sent for Northside Naturals by" the name `MAIL_FROM` gives its
address, or "Sent for Northside Naturals." when it gives none, never an
address.

## Decision — a role described by what it lets a person do

The dialog,
the invitation page and the email describe each role in a line a
newcomer understands:

- **Owner:** everything, including costs, issuing invoices, settings and
  closing the organization.
- **Admin:** day-to-day work: stock, orders, production and drafting
  invoices. Can add and remove members.
- **Viewer:** looks at orders, stock and invoices, and changes nothing.

They replace `SYSTEM_ROLE_DESCRIPTIONS`, whose Admin line, "Manage
members and roles", undersells it, and are translated by key as the role
names are (ADR-054). When the roles change, these lines change with them.
The page and the email say "Mei Lin (mei.lin@…) invited you as a
Viewer.", then the role's line as the dialog has it: one voice, with no
second version to keep in step.
`roles.description` keeps the English line, so the export's `roles.csv`
says the same: new organizations store it, and the migration rewrites a
system role's description only where it still holds the old default.

## Decision — an invitation is the organization's

While its inviter is
still a member, the email and the page name them, by name and by address.
Once they have left the organization or deleted their account (ADR-069),
the email and the page name only the organization ("Northside Naturals
invited you as a Viewer.", the note "From Northside Naturals"), never a
departed or deleted member: the name would send the newcomer to someone
who is gone, and a deleted account's is "Deleted User". The read carries
no inviter then, and a resend's email is written the same way. Invited
keeps who sent each invitation, as the organization's own record, and
whoever may act on it resends it.

## Decision — a send that fails is said, not hidden

As for a reset
(ADR-017), not as for verification: an invitation reported sent that
never left leaves someone waiting for nothing. The invitation is kept,
and the dialog says the email did not go and offers Copy link. Its link,
which nobody received, is spent, and Invited shows "Email not sent" in
the warning tone, with Resend and Copy link: never "ended and not
accepted", which reads as if the person ignored it. Its audit row stays,
since the invitation exists, and its payload says the email did not go:
the audit log reads it in words as "Email not sent", the key declared as
ADR-076 asks.

## Decision — recorded on both sides

The organization's audit log gains
`invitation.sent`, `invitation.resent`, `invitation.link_copied` and
`invitation.revoked`, each with the address and the role, and
`invitation.accepted` with the new member as its actor; every payload key
is declared in each language (ADR-076). The account's own history
(ADR-022) gains `account.invitation_accepted`.

## Considered and not done

- **Keeping Add member with a password, changed at first sign-in** (the
  `must_change_password` of Open decisions). It narrows the window in
  which two people know a password without closing it, and the person who
  set it could sign in first and choose the next one. A copied link serves
  the same newcomer with nobody else knowing anything.
- **An open link anyone may join by,** as chat workspaces offer. A role
  here grants access to stock and money, so each invitation names one
  address.
- **Inviting by phone number:** it needs sign-in by phone, deferred below.
- **A tour on first sign-in:** the newcomer's welcome is its own ADR, next
  but one (Open decisions, "A newcomer's first sign-in").

## Deferred — each with what brings it in

- **One person in two organizations:** accepting into a second, switching
  between them, and ADR-069's block naming the organization it comes
  from. Trigger: the first person who needs two, or a practice
  organization for staff (ADR-058's sample data).
- **Signing in without an email,** by a username or a phone number, for
  floor staff who have none, and inviting by phone. Trigger: the first
  customer whose staff have no email.
- **A QR code for the link,** to scan with a phone at the dock. Trigger:
  the first invitation handed over in person.
- **Seat limits,** counted at inviting. Trigger: plans and billing (Open
  decisions).
- **An organization's own link lifetime.** Trigger: a customer who asks.
- **Several addresses at once,** as Google Workspace and Slack allow: one
  dialog, many people. Each may need their own role and note, and one at
  a time is simpler to build and to check. Trigger: a customer adding
  many people together, seasonal staff for one.

## Consequences

- One migration: `invitations`, scoped to the organization through
  `TenantDb`, with a partial unique index allowing one pending invitation
  per address per organization; `invitation` added to `auth_tokens`'
  purposes and `account.invitation_accepted` to `account_events`'
  actions, with the schema test's vocabulary check where one applies.
  Someone invited may have no account, so `auth_tokens` gains
  `invitation_id`, deleted with its invitation, and `user_id` becomes
  nullable: an exclusive arc, as ADR-028's, checked with `num_nonnulls`
  as exactly one of the two, the invitation's exactly when that is the
  purpose. Verification and reset narrow `user_id` once, where their
  token is consumed.
- The organization's export writes `invitations.csv`, its own record of
  whom it invited, and the README's glossary names its columns in all
  three languages (ADR-071).
- Server, in `core/invitations`: invite, list, resend, copy link and
  revoke behind `users.create`; reading and accepting are public, rate
  limited as the other public auth routes are. Refusals carry codes
  (`error-codes.ts`). The e2e fixture `addMember` invites and accepts, so
  every spec that adds a member goes through invitations, and
  `POST /v1/users`'s specs become invitation specs. The route itself goes
  in the client step, in the commit that replaces Add member, so every
  commit builds.
- Client: Members' Invite dialog and Invited list, the invitation page
  among the signed-out pages, and the email in three languages, designed
  on the canvas first. The invitation page's password fields can be shown
  as typed. Getting started's seventh step (ADR-058) reads
  "Invite your team"; it is still done by a second member, not by an
  invitation.
- The open decision on forcing a password change is resolved: no route
  sets another person's password.

## Amendment (October 2026) — organization invitations (ADR-078)

The
invitation page also opens an organization invitation, from the same link
shape: reading returns one of the two, and accepting goes by the token's
purpose. Both kinds keep this ADR's states and refusals. An organization
invitation names no inviter and carries no note, and its link ends when
its last day has ended everywhere, there being no organization's zone
yet.

## Amendment (October 2026) — the inviter hears (ADR-079)

When an
invitation is accepted, its inviter, if still a member, is told in the
bell, in their own language, and the notification opens the newcomer's
page on People. The audit log records it as before. The note stays with
the membership, and the newcomer's welcome shows it again.

## Amendment (October 2026) — invitations with several roles (ADR-080)

An
invitation names one or more roles (`invitation_roles`), and Invite starts
with no role chosen once the organization has made one. Inviting to a role,
resending and revoking follow the rule that only what you hold can be given;
"Only an Owner can invite an Owner" keeps its words. The messages choose an
article only for a built-in role, and a made role goes without one.

## Amendment (October 2026) — the invitation's email, and replies to its inviter (ADR-083)

The invitation's email takes the layout every
email shares: Join {organization} still opens it, with no product
header; Accept the invitation is a button, with its address under it
for a mail app that will not open one; and its last line is small
print. While its inviter is still a member, its `Reply-To` is their
address, which the email already shows.
