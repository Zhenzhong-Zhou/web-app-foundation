---
status: accepted
date: 2026-10-15
amends: [ADR-012, ADR-059, ADR-069]
amended-by: [ADR-071, ADR-078, ADR-080]
---

# ADR-070 — Deleting an organization (amends ADR-012, ADR-059 and ADR-069)

## Context

ADR-069 let a person leave an organization and delete their
account, and deferred deleting the organization itself. Until that
exists, the only member of an organization cannot delete their account,
and that is everyone who registers: registering creates an account and
its organization together. The deferral's trigger, the first paying
customer, is near, and a customer who stops using the app needs a way to
close what they opened.

Three earlier decisions assumed an answer. ADR-012 deleted a sole
member's organization with them, and kept its audit rows for 24 months
through an anonymization pass of their own. ADR-059 released a deleted
organization's files to wait 30 days for the purge. ADR-069 refused the
sole member instead, so that a privacy request could not destroy a
business's books as a side effect. *Open decisions* listed what was left
to settle: what is exported first, who may delete, how long it can be
undone, and what the backups owe a customer who asked to be forgotten.

Business software usually answers in the shape ADR-069 already has: an
owner asks, confirms, and is offered an export of everything; a grace
period follows that an owner can cancel; then a point of no return, after
which the deletion runs and cannot be stopped. What varies is who keeps
the records afterwards.

## Decision — the business keeps its records, not us

Once the 30 days
have passed, the organization is deleted with every row it owns and every
file. The records survive in the business's hands, through the export.

- **The duty to keep them is the business's.** Tax law asks a business
  to keep its books (in Canada, generally six years from the end of the
  tax year they cover); it does not ask the business's software provider
  to. The app is the tool the business keeps them in: we hold its data on
  its behalf, a processor in GDPR's word, while under PIPEDA the business
  stays accountable for what it hands us (principle 4.1.3).
- **A processor gives the data back, then deletes it.** That is the
  standard when a customer leaves (GDPR article 28(3)(g)), and service
  agreements commonly allow 30 to 90 days for it. Ours is the export, then
  the 30 days.
- **Keeping it would be a problem of its own.** A closed company's
  invoices, with its customers' names and addresses, held for years with
  nobody left to answer for them. PIPEDA expects personal information kept
  only as long as its purpose needs (principle 4.5), and the purpose ended
  when the business asked to leave. It would also mean storage, access
  rules for records nobody can sign in to, and a second deletion at the
  end.

## Decision — an export first, or a decision not to take one

An Owner
can download a full export of the organization at any time, as one ZIP:

- **One CSV per record type:** every table the organization owns, every
  row and every column, ids included so rows can be joined (an invoice
  line to its invoice, a tax to its line), named for the table:
  `invoices.csv`, `invoice_lines.csv`, `invoice_line_taxes.csv`,
  `credit_notes.csv` and so on. Written as ADR-057 writes CSV: UTF-8 with
  a byte-order mark, formula injection neutralized.
- **`members.csv`:** each member's name, email, role and work details, in
  place of the bare membership rows.
- **The audit log,** which belongs to the organization (ADR-069).
- **`files/`:** every file the organization has in use (its logo, product
  images), at the largest size stored, named by its id and original name.
  A file already released is in `files.csv`, its bytes on their way to
  the purge (ADR-059).
- **`README.txt`,** in the Owner's language: what each file holds, and how
  they join.

Left out, because they belong to each member rather than to the
organization: notifications, records opened recently and sessions, which
are in each person's own export (ADR-069), and members' photos (ADR-063).

*Amended (#180):* since ADR-080 a member may hold several roles.
`members.csv` keeps them in its `role` column, their names joined with
commas, for reading; a made role's name may hold a comma itself, so
`membership_roles.csv` holds who has which role as ids: every column as
stored, but the member given by the `user_id` that `members.csv` carries
rather than a `membership_id` no file does. The README's glossary says to
count and join by it.

The export reads everything in one repeatable-read transaction, so its
files agree with each other, and streams to the browser as it reads.
Nothing is held in memory, and ADR-057's limit of 50,000 rows, set for a
filtered list, does not apply. A test fails when a table the organization
owns is neither exported nor listed as left out with a reason, as the
audit coverage test does for routes.

Each export is audited (`organization.exported`), the entry written
before the last byte is sent. Scheduling the deletion needs such an entry
from the last 24 hours, by any Owner, or an explicit decline: "I don't
need a copy" (first worded "I don't want the export"). The decline is recorded in the scheduling's audit
entry. The 24 hours keep the export close to what is deleted. The
organization keeps working during the 30 days, so an Owner can download
again near the end, and the emails say to. The last export is the Owners'
to take: once the organization is gone, nothing can make one.

## Decision — any Owner deletes, confirmed with their password

Not only
the Owner who registered it: Owners share the organization, and any of
them can cancel too. The action reads "Close this organization". Two new
permissions, Owner-only as every new one is (ADR-004):
`organizations.export` and `organizations.delete`. No role editor exists,
so Owner-only means any Owner. The export has a permission
of its own because it is useful without deleting anything: an
accountant's year end, a move to other software. The password check is
rate limited as ADR-069's is.

## Decision — 30 days, then a point of no return

- **Scheduling** sets the deletion day 30 days ahead: a calendar day,
  shown as it is (ADR-052), as ADR-069's is. Asking again while one is
  pending changes nothing.
- **Every member** sees a banner on every page naming the day, with
  Cancel for an Owner. Every member is emailed in their own language
  (ADR-054) when the deletion is scheduled (by whom, the day, and that any
  Owner can cancel), when it is cancelled (by whom), and when it is done.
  The Owners' emails also say to download the export again before the
  day.
- **The 30 days.** The organization works as usual: members sign in,
  record and export. Nothing is frozen, because a business winding down
  still ships its last orders and issues its last invoices, and wants
  them in its last export.
- **Cancelling.** Any Owner, until the deletion day has ended in every
  time zone: at noon UTC the day after, the moment ADR-069's completion
  also waits for. The email says "deleted after 14 November", and until
  that day is over everywhere, the decision can be undone.
- **The point of no return.** After that, a cancel is refused with
  `organization_deletion_under_way`, and the banner says the organization
  is being deleted. The next run of the timer completes it: within the
  hour, or on Render's free plan when the server next wakes, since the
  timer also runs at startup (ADR-059, amended).

A cutoff, rather than cancelling until the run completes, because
completing is not one step. Files are erased from storage, which no
database transaction can roll back, before the rows go. A cancel that
arrived between the two would leave an organization whose files were
gone. With the cutoff, a run that fails halfway is finished by the next:
nothing can have changed the decision in between.

## Decision — completing

`OrganizationDeletionTimer`, at startup and
hourly as the other three run (`HourlyTimer`), takes each organization
whose day has ended everywhere, one at a time. One that fails is logged
and left for the next run, without holding up the rest.

1. Erase the bytes of every file the organization owns. Erasing what is
   already gone succeeds, so a repeated run repeats this safely.
2. In one transaction:
    - lock the organization, which also holds back any upload until the
      end, since a new file's row must wait for the lock, and erase any
      file uploaded since step 1;
    - move every session working in it to that person's next
      organization, or to none: sessions cascade from the organization
      they work in, and would otherwise sign every member out;
    - delete its audit log;
    - delete the organization, and every table it owns follows by
      cascade (ADR-012).
3. After the commit, email every former member, then complete any account
   deletion that was waiting for it (below).

The audit log is deleted on purpose, by this one path, never by cascade.
Its foreign key stays `RESTRICT`, ADR-012's tripwire, so nothing else can
delete it. No audit entry records the completion, since the log goes with
it; the server logs the organization's id and the time, and nothing more.

## Decision — members keep their accounts

Each member loses that
membership and nothing else: their account, their other organizations,
their own history. A member with no other organization is signed in to
none, as after leaving one (ADR-069): they can export their own data,
change their details, or delete their account.

## Decision — the only member deletes both in one action

When the
Owner is the organization's only member, one step does both: "Delete my
account and my organization". One password and one request schedule both
for the same day; every other device is signed out, as ADR-069 does; one
email says both will go. Their banner says both, with Keep both. On the
day the organization goes first and the account straight after, in the
same run, so there is never an organization with no one in it.

Scheduled together, they are cancelled together: cancelling either, the
organization's from the banner or the account's from the Account page,
keeps both. One step in, one step out; a person who wants only the
organization gone cancels, then closes it alone.

ADR-069's blocks change in one place. An organization already scheduled
for deletion does not stop a person asking to delete their account; at
completion, an account whose only block is such an organization waits
for it, rather than being cancelled. If that organization's deletion is
cancelled meanwhile, the block applies again, and ADR-069's completion
cancels the account's deletion and says why. The `only_member` refusal
now names the way past: delete the organization, alone or with the
account.

## Decision — backups keep what was deleted until they age out, and never bring it back

A deleted organization stays in the encrypted database
backups until they expire, 30 daily and 12 monthly (ADR-053), and its
files in the backup copy for 31 days (ADR-059). Backups are kept whole:
taking one organization out of a dump would mean decrypting, editing and
re-encrypting every dump, and a backup edited after the fact is no
longer one to trust. No backup is restored to bring a deleted
organization back, whoever asks.

A restore after a disaster needs no step of its own. An organization
whose deletion completed after the dump was taken is still in it,
scheduled, with its day now past, so the timer deletes it again when the
restored server starts; its former members get the last email a second
time. Deleted accounts behave the same (ADR-069, amended). The privacy
policy states the retention, as ADR-053 requires.

## What is deleted, and what stays

| What | When the deletion completes |
| --- | --- |
| Every record the organization owns, with its audit log | Deleted |
| Its files | Erased from storage, then their rows deleted |
| Memberships, roles, and notifications about the organization | Deleted |
| Members' accounts and their other organizations | Kept; sessions working in it move to another organization, or to none |
| The only member's account, when deleted with it | Deleted right after, as ADR-069 deletes an account |
| Encrypted backups | Kept until they age out; never restored to bring it back |

## Rejected

- **Keeping a closed organization's records for the retention period.**
  The obligation is the business's, and the export meets it. Holding them
  ourselves is storage, access rules and a second deletion, for records
  nobody can sign in to.
- **Anonymizing the audit log and keeping it (ADR-012).** It records the
  organization's own work, which is gone; kept, it would describe records
  that no longer exist to readers who no longer can. It is in the export.
- **Cancelling until the run completes.** A cancel between erasing the
  files and deleting the rows would leave records without their files.
- **Deleting at once.** A mistake could not be undone, and the 30 days
  cost one timer.
- **A read-only period after closing.** Some accounting products keep
  read-only access for a while after a subscription ends. That serves a
  customer relationship that continues, not an explicit request to
  delete. Here the 30 days are that period, with everything still
  working.
- **Hiding the organization rather than deleting it.** The point is that
  it is gone.
- **Building the export from ADR-057's list exports.** Those are filtered
  views with translated headers, capped at 50,000 rows and without ids. A
  full export needs every row of every table, joinable.
- **Only the Owner who scheduled it may cancel.** Owners share the
  decision.
- **Freezing the organization during the 30 days.** A business winding
  down still has orders to ship, and wants them in its last export.

## The ZIP library

Node writes deflate streams (`zlib`), but not ZIP
archives, and the export is many files in one download. The format looks
simple and is not: a central directory, a CRC-32 for each entry, and
ZIP64 once an archive passes 4 GB, which an organization holding its
1 GB of files (ADR-059) plus its records can approach. Written by hand,
that is code easy to get subtly wrong and tedious to test.

`yazl` (MIT) does only this. One dependency of its own, `buffer-crc32`,
which has none; no install script; it streams with backpressure, so the
archive is never held in memory; ZIP64, and UTF-8 file names, which
Chinese names need. Its author also wrote `yauzl`, the widely used ZIP
reader, and it changes rarely, which suits a format that does not.
`@types/yazl` gives its types, as a dev dependency. Considered:
`archiver`, nine dependencies for ZIP and tar alike, more than a ZIP
needs; `fflate`, with no dependencies, but its streaming interface pushes
chunks out by callback, so backpressure on a Node stream would be ours to
write.

## Deferred

- **Starting a new organization from an existing account.** Decided in
  [ADR-078](0078-registration.md), once invitations
  were built: by an organization invitation to the account's address, and
  from Home where registration is open.
- **An organization closed by us,** for non-payment or a breach of terms.
  Nothing bills yet. Trigger: billing.
- **The export in other formats,** such as JSON or an accounting
  package's import. Trigger: a customer who asks.

## Consequences

- Migration 0057: `organizations.deletion_scheduled_at`, a `date`.
- Routes under `/v1/organization`: `GET export`, the ZIP; `POST deletion`,
  with the password, `declineExport` unless an export was taken in the
  last 24 hours, and `deleteAccount` for the only member; `DELETE
  deletion`, to cancel. `/auth/me`'s organization gains
  `deletionScheduledAt`, for the banner.
- Refusal codes `organization_export_required` and
  `organization_deletion_under_way`.
- Audit actions `organization.exported`, `organization.deletion_scheduled`
  (with the export taken or declined) and
  `organization.deletion_cancelled`.
- Three emails and the README, in the three languages (ADR-054).
- `OrganizationDeletionTimer` joins main.ts's list, ahead of account
  deletion. Its service lives in `core/auth`, beside account deletion,
  which it shares the day, the emails and the only member's account with;
  eslint already allows the global connection there, which completing
  needs, since it reads every organization. The export, which reads one,
  goes through `TenantDb` in `core/organizations`.
- `yazl` as a dependency, `@types/yazl` as a dev dependency.
- Where the export and the deletion sit in Settings, and the banner, are
  designed on the canvas before the client is built.
- Build order: the server (the migration, the export, scheduling and
  cancelling, completion, the emails, e2e tests); then the client, after
  the design; then the docs (manual checks, the handoff).

## Amendment (October 2026) — settled with the design

Five points the
canvas settled before the client was built:

- **The export downloads as a file, and the server says when it was
  last taken.** The browser saves the ZIP straight to disk, rather than
  the page fetching it first, as the account's JSON export does: an
  organization's ZIP can approach 1 GB with its files, too much to hold
  in a tab, and a page cannot tell when a native download has finished.
  So the organization's read carries the last full export, when and by
  whom, from the audit entry each export writes. The Profile section
  shows it ("Last downloaded 3 days ago by Mei Lin"), and the dialog
  reads it again when the window regains focus, to know the 24 hours are
  met.
- **The name typed to confirm.** Besides the password, the dialog asks
  for the organization's name, typed as it is, and the request carries
  it; the server refuses one that does not match. The password says who
  is asking, the name what they are about to delete, which matters most
  to an Owner of more than one organization.
- **Days left beside the day, and why Close is off.** The day reads
  "after 14 November 2026 (in 30 days)", as expiry reads in days left
  (ADR-055). While the export is neither taken nor declined, or the name
  or the password is missing, a line under the buttons says what is
  still needed: a disabled button alone does not.
- **A reminder 7 days before.** Every member is emailed once, in their
  language, when the deletion day is 7 days away, and Owners are told to
  download everything again. The hourly timer sends it, and
  `organizations.deletion_reminded_at` records that it went, so a run
  repeated or two instances send it once; cancelling clears it.
  Migration 0058.
- **The banner can be hidden for today, not longer.** Its × hides it on
  that device until the next day, when it comes back; kept in the
  browser, since hiding it is the reader's own convenience and changes
  nothing for anyone else. From 7 days before the day, the moment the
  reminder goes out, it has no ×, so nobody misses the final week; nor
  once the deletion is under way, when nothing can be done.

## Amendment (October 2026) — settled while building

Three more, from
the reviews of the build:

- **"Deleted together" is recorded on the account, not guessed.** The
  first build read it from matching days, which a member deleting their
  own account the same day matched too, and then from a column on the
  organization, which outlived an only member who left. It is now
  `users.deletion_with_organization_id` (migrations 0059 to 0061, none
  released): set with the account's day when the only member deletes
  both, and cleared in the same statement as that day by every cancel and
  by completion. The database holds the rest: a check refuses the link on
  an account with no deletion day, a trigger on memberships clears it
  whenever the membership ends, by leaving, by an Owner's removal or any
  later path, and its foreign key clears it when the organization is
  deleted. Cancelling the organization's deletion clears the linked
  account's day in the same transaction, so both stay or neither does.
  The session carries it on the account, the organization's id and name,
  so the account's own banner can say both wherever the person is
  working.
- **One deletion stage, decided by the server.** The session says where a
  pending deletion stands: `scheduled`, `lastWeek` or `underWay`, from one
  function, on the server's UTC day, so the banner's ×, the reminder and
  the cancel's cutoff draw the same lines, and no browser near midnight
  disagrees. Likewise the last export says whether it is fresh, and who
  took it by id, so "by you" never matches two people of one name.
- **The emails do not hold the answer.** Those sent when a deletion is
  scheduled or cancelled start without being awaited, once the change has
  committed, each failure logged; the reminder and the done email, sent
  by the timer, are awaited. The export's coverage test also follows the
  cascading foreign keys out from the organization, so a table it owns
  through a parent, as `role_permissions` is, cannot be left out
  unnoticed.

## Amendment (October 2026) — completing marks its start first (#117)

Completing as written above left two windows, each about a second wide.
A cancel committing in the second of the cutoff, after a run had erased
the files but before it took the lock, kept an organization whose files
were gone: the cancel and the timer each read the clock for themselves.
And an upload whose row committed before the run's lock, but whose bytes
landed after its erase, left bytes that no purge finds, since the purge
works from rows.

Completing now marks its start before it touches storage, in
`organizations.deletion_started_at` (migration 0062):

1. In one transaction: lock the organization, check that it is due, and
   set the mark. A cancel either commits before this, and the run finds
   nothing due, or waits for it and is refused, as is every later cancel,
   whatever either clock says. The stage the session reports reads the
   mark too, so no screen offers a cancel the server would refuse.
2. Erase the bytes of every file, as before.
3. In one transaction: lock the organization, which now needs the mark
   rather than the day, erase any file since step 2, and delete it, as
   before.

An upload takes its file's id first and writes its bytes under it, and
only then opens a short transaction: the organization's upload lock
(ADR-059), the mark, read under a key-share lock on the organization, the
quota, and the row. It is refused once the mark is set, or once the
organization is gone. Refused, or with a write that failed, it deletes
every one of its keys once every write has settled, since no row would
lead a purge to them, and a delete that ran ahead of a write still in
flight would be undone by it. So the
run misses nothing: a row saved before the mark already has its bytes,
and an upload after it is refused and cleans up. A server that dies
between the write and the row leaves bytes behind, as a failed write
could before.

Writing inside the transaction would have closed the window too, and was
the first build. The review of it found the cost: a database connection,
and the upload lock, held for as long as the bucket took, so a gallery's
worth of photos at once could hold most of the pool. The storage client
now also gives up after 5 seconds connecting and 30 waiting, the second
set to throw rather than only warn, so a stalled bucket fails an upload
rather than holding it.

The mark is never cleared: a run that fails after it leaves it, and the
next run finishes the deletion.

## Amendment (October 2026) — closing stays the Owners' (ADR-080)

With
roles an organization makes, `organizations.delete` is never offered in the
role editor, so closing the organization stays the Owners' alone.
