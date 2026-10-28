---
status: accepted
date: 2026-10-14
areas: [organizations, users, mail]
amends: [ADR-012]
amended-by: [ADR-070, ADR-077, ADR-079]
---

# ADR-069 — Deleting your account, and leaving an organization (amends ADR-012)

> **Amended by [ADR-070](0070-deleting-an-organization.md).**
> Backups: a deleted account stays in the encrypted backups until they age out, 30 daily and 12 monthly (ADR-053), and its photo in the files copy for 31 days (ADR-059); no backup is restored to bring it back. After a restore from a dump taken before the deletion completed, the account is still scheduled there with its day past, and the timer deletes it again at startup. The only member now has a way past `only_member`: deleting the organization, alone or with the account in one action. An organization already scheduled for deletion does not block asking, and at completion the account waits for it.

## Context

ADR-012 set the policy for account deletion before most of
what a person now leaves behind existed: a 30-day window, the person
anonymized rather than removed, audit rows kept, and the sole Owner of an
organization with other members blocked until ownership moves. Since
then a person has gained work details on each membership (ADR-063), a
photo (ADR-063), an account history with IP addresses (ADR-022),
notifications (ADR-036), records they opened recently (ADR-058), a
language (ADR-054), and memberships in more than one organization. None
of it has a way out, and no route lets a person leave an organization
either: only an Owner can remove a member. The open decision on member
removal versus account deletion is answered here.

The industry's answer is consistent. An account belongs to a person; an
organization's records belong to the organization. GitHub will not delete
a personal account while it is the only owner of an organization, and
Slack's primary owner hands over before leaving. Deleting a person
anonymizes one human; deleting an organization destroys a business's
books, which tax law generally expects kept for years. One must never
happen as a side effect of the other.

## Decision — only the person deletes their account

An Owner removes a
member, which ends that membership and nothing else, as today. An Owner
cannot delete the account behind it: the person may belong to other
organizations, and their login and personal history are not the
organization's to erase. Accounts an organization owns outright, through
single sign-on, are a different model, deferred below.

## Decision — a person can leave an organization

From the Account page,
for the organization they are working in. Leaving ends the membership,
with its work details; the account stays, signed in to another
organization they belong to, or to none. Their work in the organization
stays attributed to them by name, and the organization's audit log
records that they left.

## Decision — two blocks, the same for leaving and deleting

Each is a
refusal with a code, and each says what to do next:

- `last_owner_with_members`: the only Owner of an organization with other
  members makes another member Owner first (ADR-012).
- `only_member`: the only member of an organization cannot leave it, and
  cannot delete their account, while it exists. An organization with no
  members is records nobody can reach. Deleting the organization is a
  decision of its own, deferred below; until it exists, the refusal says
  to add another member and make them Owner.

## Decision — deleting is requested, then completed 30 days later

- **Requesting.** On the Account page, confirmed with the password. The
  deletion day is set 30 days ahead; every other device is signed out; an
  email in the person's language names the day and says how to cancel.
  The blocks are checked first.
- **The deletion day** is a calendar day (ADR-052), shown as it is in the
  email and on every page, never converted to a time zone. The server
  knows no one's time zone, so a moment would name a different day in
  Vancouver than in UTC, and an email could promise a day the deletion
  came before. The deletion completes only once that day has ended in
  every time zone, at noon UTC the day after, so whoever reads the day
  has all of it.
- **The 30 days.** The person can still sign in and work, and export their
  data. Every page shows the day with a way to cancel. Cancelling clears
  the schedule and is confirmed by email.
- **Completing.** A timer, at startup and hourly as the licence reminders
  run (ADR-064), completes each deletion whose day has ended everywhere,
  each in its own transaction: one that fails is logged and left for the
  next run, without holding up the rest. It checks
  the blocks again: a membership can change in 30 days. If one now
  applies, the deletion is cancelled rather than left waiting, the
  account history records the cancellation, and the person is emailed
  what changed and how to ask again: nothing has to remember that the
  email went, and nothing is lost by asking twice.

## Decision — what completing removes, and what it keeps

| What | On completion |
| --- | --- |
| Name and email | `Deleted User` and `deleted-<id>@invalid`, so the address is free to register again |
| Password, photo, language | Cleared; the photo's file is purged with the rest (ADR-059) |
| Sessions and reset tokens | Deleted |
| Account history, notifications, records opened recently | Deleted |
| Memberships, with their work details | Deleted |
| Audit log | Kept, the person shown as Deleted User (ADR-012); IP addresses age out at 24 months as ADR-012 sets |
| Business records the person created | Kept, attributed to Deleted User (ADR-012) |

The `users` row stays, as ADR-012 decided: every foreign key that names
the person keeps pointing at a row, which now says nothing about them.
Each organization they belonged to records the deletion in its audit log.

## Decision — the person can export their own data first

A JSON file of
what is theirs: profile, memberships with roles and work details,
devices, account history, notifications, and records opened recently.
Not an organization's business records or its audit log, which belong to
the organization. Available any time, and named on the deletion page.

## Rejected

Deleting a sole member's organization with them, as ADR-012
first wrote: a personal privacy request should not destroy a business's
books, and the decision deserves its own warnings and export. Locking an
organization with no members: records nobody can reach or close. An
Owner deleting a member's account: the account is not the
organization's. Deleting immediately: a mistake could not be undone, and
the window costs one timer.

## Deferred

- **Deleting an organization.** Decided in [ADR-070](0070-deleting-an-organization.md): any Owner,
  after an export or a decision not to take one, 30 days to cancel, and
  the only member's account in the same action.
- **Accounts an organization owns.** Single sign-on, where the employer
  owns the login and may delete it. Trigger: the first customer who
  signs in through their own identity provider.
- **A block in another organization.** A deletion is refused for a block
  in any organization the person belongs to, and its way past is that
  organization's Members page. Today a person belongs to one: adding a
  member refuses an email that already has an account, and invitations
  are deferred (ADR-006). Once a person can belong to two, the refusal
  must name the blocking organization, as data beside its code, and
  offer a switch to it, which nothing offers yet. Trigger: building
  invitations.

## Consequences

`users.delete` keeps its meaning, removing a member;
deleting an account needs no permission, being the person's own act.
`users.deletion_scheduled_at` holds the deletion day, a `date` (ADR-052).
`account_events` gains the request, the cancellation and leaving;
`audit_log` gains leaving and a completed deletion. Three emails, in the
three languages (ADR-054). After completion nothing can bring an account
back, which is what the 30 days are for.

## Amendment (October 2026) — invitations (ADR-077)

An account that
belongs to no organization can be invited back, signing in to accept. An
account in another organization still cannot, so a person still belongs
to one, and "A block in another organization" stays deferred: its trigger
is now one person in two organizations ([ADR-077, *Deferred*](0077-invitations.md#deferred--each-with-what-brings-it-in)).

## Amendment (October 2026) — a session finds its organization again (ADR-079, #144)

Leaving moved only the session that left; every other
session of the account kept pointing at the organization it had left, and
kept doing so after the account joined or started another. The session
middleware now repairs a session whose organization is none, or is no
longer one of the account's memberships, picking one as sign-in does, and
stores it. A session whose organization is still valid is never moved.
