---
status: accepted
date: 2026-10-02
---

# ADR-053 — Backups: an encrypted nightly dump we own, at another provider, restored monthly

**Context.** Nothing in the repo says how the database is backed up or how
it is brought back. Production runs on Render, and a free Render database
may have no backups at all and expires 30 days after creation. Every
organization's data lives in one Postgres database, so one backup holds
all of them. Bob may move hosts later, so the plan cannot rest on one
host's features. No customer has asked for a country or a retention period
yet; the database is megabytes.

Three layers exist in production practice: the host's point-in-time
recovery (rewind to any minute), a logical dump the team owns (`pg_dump`,
stored elsewhere), and physical backups with WAL archiving (pgBackRest,
WAL-G) for self-hosted or very large databases. The rule over all of them
is 3-2-1-1-0: three copies, two kinds of storage, one off-site, one
immutable, zero errors when a restore is tested.

**Decision — targets first.** What the plan has to meet, stated as numbers
so a choice can be checked against them:

| Phase | When                    | RPO (data that may be lost) | RTO (time to be running again) |
|-------|-------------------------|-----------------------------|--------------------------------|
| 1     | This ADR's scripts      | 24 hours                    | 4 hours                        |
| 2     | Before paying customers | 15 minutes                  | 4 hours                        |

Phase 1 is met by the nightly dump alone. Phase 2 needs the host's
point-in-time recovery, which is a plan choice at the host, not code.

**Decision — our own nightly dump is the backup that counts.** `pg_dump`
in custom format (`-Fc`, zstd), once a night at 10:00 UTC (3am in
Vancouver, 6am in Toronto), the quietest hour. It reads a consistent
snapshot and does not block the app. It works against any Postgres, so it
survives a change of host, the host failing, and the account being locked;
and restoring it somewhere new is exactly how a move between hosts is done.

- Run by a scheduled GitHub Actions workflow, not by the host: if the host
  disappears, the job and its history do not. The same script runs in a
  container anywhere, for the day it moves.
- Logged in as a dedicated read-only role, `backup`, not the app's own
  login, so the backup job cannot change data.
- The `pg_dump` client's major version matches the server's (18). An older
  client refuses a newer server.

**Decision — encrypted before it leaves, with `age`.** Each dump is
encrypted on the runner with an `age` public key before upload. The public
key can only lock, so a stolen backup job cannot read any backup. The
private key never touches the job: one copy in Bob's password manager, one
offline (printed, kept safe). Losing both makes every backup unreadable,
which is why there are two.

Encryption is one step of the script with one input, the recipient key.
A KMS or hardware key, if a contract ever demands one, replaces that step
and nothing else.

The bucket's own encryption is on as well, as a second lock; it is not
relied on alone, because the provider holds that key.

**Decision — stored at a different provider, in Canada, immutable.**

- An S3-compatible bucket at a provider other than the database host.
  Every major object store speaks the S3 API (AWS S3, Backblaze B2,
  Cloudflare R2), so switching provider is changing the endpoint.
- In a Canadian region. Choosing a region costs nothing at creation and
  moving years of backups later does; Canadian customers in regulated
  industries ask where their data is kept, backups included.
- Versioning and object lock on, set when the bucket is created, because
  some providers only allow it then. Each backup is locked for 30 days:
  nobody can delete or overwrite it in that time, Bob included, which is
  what survives ransomware or a stolen password.
- The job's credentials can write but not delete. Expiry is the bucket's
  lifecycle rule, not the job's.
- Retention: 30 daily and 12 monthly (the first backup of each month is
  kept for a year). A setting, so a contract's seven years is one number.
- Each upload is named by environment and time,
  `production/2026/10/03/20261003T100000Z.dump.age`, with a SHA-256
  checksum beside it, so a restore can prove what it downloaded is what was
  written.

**Decision — every location is a setting.** Nothing about the host, the
bucket or the region is in code:

| Variable                                                  | Holds                                               |
|-----------------------------------------------------------|-----------------------------------------------------|
| `BACKUP_DATABASE_URL`                                     | The `backup` role's connection string, TLS required |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_BUCKET` | Where backups go                                    |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`  | Write-only credentials                              |
| `BACKUP_AGE_RECIPIENT`                                    | The public key backups are encrypted to             |
| `BACKUP_ENVIRONMENT`                                      | `production`, the first segment of every name       |

Held as GitHub Actions secrets. Moving region or provider: a new bucket,
new values, and the next night's backup lands there; the old bucket's
backups expire on their own or are copied if a contract says so.

**Decision — restores are rehearsed, timed and written down.** A backup
nobody has restored is a hope.

- A runbook, `docs/runbooks/restore.md`: the exact commands, in order, for
  a person under pressure.
- A monthly restore drill, a second scheduled workflow: download the
  latest backup, check its checksum, decrypt it, `pg_restore` into a
  throwaway Postgres 18 on the runner, then check that the tables exist,
  row counts are plausible, the newest audit row is less than a day old,
  and the migrations table matches the code. It records how long it took —
  the real RTO — and fails loudly if any step does. The drill needs the
  private key, so it runs from a separate secret only that workflow reads.
- Three kinds of restore, each in the runbook:
  - **The host is gone:** a new database anywhere, restore the latest
      dump, point `DATABASE_URL` at it, start the app.
  - **A bad deploy or a bad delete:** the host's point-in-time recovery to
      the minute before (phase 2).
  - **One organization's mistake:** restore into a scratch database and
      copy back that organization's rows only. Never the whole database:
      that would erase every other organization's work since the backup.
      Every table carries `organization_id`, which is what makes one
      tenant's rows selectable.

**Decision — a missing backup is noticed within a day.** A failed workflow
emails Bob. A daily check fails if the newest backup is more than 26 hours
old, which also covers GitHub pausing scheduled workflows after 60 days
without activity in the repository. A backup whose size moves more than
50% from the previous one is flagged: a bug or lost data shows up there
first.

**Decision — the host's own backups are a plan choice, recorded per
host.** Today's host is Render. Phase 0 is checking what its plan backs up
now; phase 2 requires a plan with point-in-time recovery. A different host
needs the same: point-in-time recovery for RPO in minutes, and nothing in
this ADR changes when it does.

**Consequences.**

- Built in this order, each its own commit:
    1. Phase 0, by hand this week: check Render's plan, create the bucket
       (Canada, versioning, object lock), create the `age` key pair and
       store the private key twice, take one manual encrypted dump.
    2. The `backup` role. Not a migration: a role belongs to the Postgres
       server rather than the database, and is created once per host, so
       the runbook gives the SQL.
    3. `scripts/backup.sh` and `scripts/restore.sh`, plain shell over
       `pg_dump`, `age` and an S3 client, so they run anywhere.
    4. `.github/workflows/backup.yml` (nightly, plus the 26-hour check) and
       `.github/workflows/restore-drill.yml` (monthly).
    5. `docs/runbooks/restore.md`, and a manual check that walks it.
- Backups hold personal data. Someone deleted from the app stays in
  backups until they expire, at most a year under the monthly rule. That is
  normal under PIPEDA when disclosed: the privacy policy states the
  retention.
- Cost at today's size: cents a month for storage. Egress matters only
  when restoring large databases; Cloudflare R2 charges none.
- The dump takes seconds today. Logical dumps stay practical to roughly
  50–100 GB; past that, Deferred below.

**Deferred — each with what brings it in.**

- **Regional deployments.** One database means one backup region. A
  customer who needs its data in another country gets a separate
  deployment there — the same code with its own database, backups and
  settings — and each organization belongs to one region. Moving an
  existing organization is an export and import of its rows, its own ADR.
  Trigger: the first customer whose contract names another country.
- **A KMS or hardware key** in place of `age`. Trigger: a contract or an
  audit (SOC 2) that requires key use to be logged.
- **A standby database** (high availability). Backups bring data back in
  hours; a standby keeps the app running in seconds. Trigger: downtime
  costing more than the standby.
- **Physical backups** (pgBackRest or WAL-G), or dumping from a read
  replica. Trigger: the database past about 50 GB, or a self-hosted
  Postgres.
- **Longer retention.** Trigger: a regulation or contract (often seven
  years in finance and health).
- **Two people to restore or to use the key.** Trigger: a team larger than
  one, or an audit.

**Amendment — settled while building.**

- **A test destination before the bucket.** `BACKUP_DESTINATION` takes
  `artifact` as well as `s3`: the encrypted dump is kept as a GitHub Actions
  artifact for 30 days. It proves every step except object lock while the
  database is a Free test instance, at no cost and with no account. The
  repository is public, so anyone signed in to GitHub can download one;
  encrypted, it shows only its size and time. Real customers' data needs
  `s3`, which is the variable and its secrets, not a code change.
- **Freshness from the backup's name, not the audit log.** Production's
  audit log was empty at the first manual restore, so "the newest audit row
  is under a day old" would fail a quiet database. Every backup's name
  carries the moment it was taken (`production-20261003T100000Z`); the
  26-hour check and the drill read that. The drill checks instead that
  organizations came back and that the migrations table is not ahead
  of the code.
- **The Postgres 18 client, not a container.** The scripts call
  `pg_dump` and `pg_restore` directly and refuse an older major version.
  Actions installs the 18 client from the Postgres project's apt
  repository; a Mac uses Homebrew's `libpq`. The first manual backup used a
  container, which works, but a container reaching `localhost` differs
  between Linux and macOS.
- **The drill reads with its own login.** In `s3`, the backup job can write
  and list but not read; the drill can read and list but not write. A
  stolen backup login cannot download backups, and a stolen drill login
  cannot plant one.
- **Size against the previous backup** is compared in `local` and `s3`. As
  an artifact each run starts empty, so the comparison is skipped there.

**Amendment — the bucket is Cloudflare R2.** Bob chose R2 for backups, and
for the app's files when they come (in their own bucket, with their own
keys). R2 speaks the S3 API, so the scripts are unchanged: the endpoint is
`https://<account id>.r2.cloudflarestorage.com` and the region `auto`. It
has no egress fees, which matters most on the day a large restore is
needed. Where it differs from the decision above, and what stands in:

- **Not in a Canadian region.** R2 offers location hints, not Canada; the
  bucket is created with the hint *Eastern North America*. The backups are
  encrypted before upload (`age`), so the provider holds ciphertext.
  Trigger to move: a customer or regulation that requires Canadian
  residency for backups. Moving is the paragraph above: a bucket in AWS
  `ca-central-1`, new values, and the old bucket's backups expire.
- **No object versioning; a bucket lock instead.** A lock rule on the
  backups' prefix keeps every object for 30 days: it cannot be deleted or
  overwritten in that time, which is what versioning and object lock were
  for. Uploads never reuse a name, so there is nothing to version.
- **No write-only key.** R2's narrowest key that can write can also read
  and list. The backup job's key is *Object Read & Write* on the backups
  bucket alone; what it can read is ciphertext, and what it could delete
  the lock keeps. The drill's key is *Object Read only*, so a stolen drill
  login still cannot plant a backup.
- **Retention is two lifecycle rules:** `production/daily/` deleted after
  31 days, `production/monthly/` after 366, each after the lock lets go.
- **An alarm outside GitHub.** GitHub stops running a repository's
  scheduled workflows after 60 days without activity in it, and the
  26-hour check and the monthly drill are scheduled workflows, so they stop
  with the backup and nothing fails. After each backup the job calls
  `BACKUP_HEALTHCHECK_URL`, a check at a monitor outside GitHub
  (healthchecks.io's free plan) that emails when a day passes without a
  call. Unset, the step is skipped.
