# Backups and restores (ADR-053)

How production is backed up, how to set it up once, and how to bring it back.
Commands are run from the repository root unless a step says otherwise.

**Never paste a database URL, a password or the private key into a chat, an
issue or a commit.** If one leaks, change it (sections 1 and 6).

## What runs by itself

| What            | When                                                                                       | Where to look                                  |
|-----------------|--------------------------------------------------------------------------------------------|------------------------------------------------|
| Backup          | 10:00 UTC daily (3am Vancouver): the database, then the files                              | Actions → **Backup**                           |
| Freshness check | 16:30 UTC daily: fails if the newest backup is over 26 hours old                           | Actions → **Backup**                           |
| Restore drill   | 11:00 UTC on the 1st: restores the newest backup, times it, checks every file has its copy | Actions → **Restore drill**, the run's summary |

A failed scheduled run emails the person who last changed the workflow file.
GitHub pauses scheduled workflows after 60 days with no activity in the
repository; the freshness check then stops too, so after a long quiet spell,
open Actions and re-enable them.

Where backups go is the repository variable `BACKUP_DESTINATION`:

- **unset or `artifact`**: kept as Actions artifacts for 30 days. For
  testing. The repository is public, so anyone signed in to GitHub can
  download them; they are encrypted, so they can read only the size and time.
- **`s3`**: an S3-compatible bucket at another provider, in Canada, with
  object lock. Required before real customers' data.

## 1. One-time setup

### The key pair

On your Mac:

```bash
brew install age
age-keygen -o ~/foundation-backup-key.txt
```

- Copy the whole file into your password manager as a secure note, and
  print one copy. Losing both means every backup is unreadable.
- The line `# public key: age1…` is the public key. It can only lock.

### GitHub secrets

Repository → Settings → Secrets and variables → Actions → New repository
secret:

| Secret                 | Value                                                 |
|------------------------|-------------------------------------------------------|
| `BACKUP_DATABASE_URL`  | The database's **External** URL from the host         |
| `BACKUP_AGE_RECIPIENT` | The public key, `age1…`                               |
| `BACKUP_AGE_IDENTITY`  | The private key: the line starting `AGE-SECRET-KEY-1` |

For `s3`, also `BACKUP_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ENDPOINT`
(empty for AWS), the write-only login `BACKUP_S3_ACCESS_KEY_ID` and
`BACKUP_S3_SECRET_ACCESS_KEY`, and the read-only login the drill uses,
`BACKUP_S3_READ_ACCESS_KEY_ID` and `BACKUP_S3_READ_SECRET_ACCESS_KEY`. Then
Settings → Variables: `BACKUP_DESTINATION` = `s3`.

For files (ADR-059), the files bucket's read-only token `waf-files-backup-read`
as `BACKUP_FILES_S3_ACCESS_KEY_ID` and `BACKUP_FILES_S3_SECRET_ACCESS_KEY`. The
variable `BACKUP_FILES_BUCKET` names the bucket, `waf-files` when unset.

### The bucket (for `s3`)

At creation, because some settings cannot be added later: a Canadian region,
block all public access, versioning on, object lock on. Then default
retention: Compliance mode, 30 days. Lifecycle rules: expire
`production/daily/` after 31 days and `production/monthly/` after 366 days.
Two logins: one that can only `PutObject` and `ListBucket`, one that can only
`GetObject` and `ListBucket`.

For files (ADR-059), on the same bucket: a bucket lock on `files/` for 30
days, and a lifecycle rule deleting `files/` objects 31 days after upload,
one day after the lock ends. The nightly copy writes again whatever is
still live.

## 2. Take a backup now

Actions → **Backup** → Run workflow. Green, and with `artifact`, the run
lists `backup-production-<time>`.

From a Mac instead (needs `brew install libpq && brew link --force libpq`
for the version 18 tools):

```bash
read -s "BACKUP_DATABASE_URL?Paste the External URL once, then Enter: "; echo
export BACKUP_DATABASE_URL
export BACKUP_AGE_RECIPIENT=$(age-keygen -y ~/foundation-backup-key.txt)
BACKUP_DIR=~/foundation-backups scripts/backup.sh
```

## 3. Practise a restore on your Mac

Into the local Docker database, never production:

```bash
docker compose up -d postgres
docker compose exec postgres createdb -U app foundation_restore

BACKUP_DIR=~/foundation-backups scripts/backup-latest.sh --download /tmp/drill
BACKUP_AGE_IDENTITY_FILE=~/foundation-backup-key.txt \
  scripts/restore.sh /tmp/drill/<name>.dump.age \
  "postgresql://app:<local password>@localhost:5432/foundation_restore"

docker compose exec postgres dropdb -U app foundation_restore
```

To practise with a backup kept as an artifact, download it from the
Backup run's page and unzip it; the `.sha256` comes with it.

`restore.sh` checks the file's checksum, refuses a database that already has
tables, stops on the first error, then checks that organizations came back
and that the migrations match the code.

## 4. The three kinds of restore

### The host is gone

1. Create an empty Postgres 18 database anywhere.
2. Fetch the newest backup: `scripts/backup-latest.sh --download /tmp/restore`
   (or download the artifact).
3. Restore. The target is not on this machine, so type its name:

   ```bash
   RESTORE_CONFIRM=<database name> BACKUP_AGE_IDENTITY_FILE=~/foundation-backup-key.txt \
     scripts/restore.sh /tmp/restore/<name>.dump.age "<new database URL>"
   ```

4. Point the server's `DATABASE_URL` at the new database and redeploy. The
   deploy runs any migrations newer than the backup.
5. Change `BACKUP_DATABASE_URL` to the new database.

Data written after the backup is lost: up to 24 hours (ADR-053's target).
Files are not on the host, so they are untouched; a file uploaded after the
backup was taken has no row in the restored database and is purged in time
as never attached.

### The files are gone

The `waf-files` bucket deleted or emptied (ADR-059). The copies in
`waf-backups/files/` are at most a day old.

1. Create a new bucket as ADR-059 describes, or empty the old one, and a new
   read-and-write token for it.
2. Copy the files back: read with the backup's read-only key, write with the
   new token.

   ```bash
   AWS_ACCESS_KEY_ID=<backup read key id> AWS_SECRET_ACCESS_KEY=<its secret> \
     aws --endpoint-url "<endpoint>" s3 sync s3://waf-backups/files/ /tmp/files
   AWS_ACCESS_KEY_ID=<new files key id> AWS_SECRET_ACCESS_KEY=<its secret> \
     aws --endpoint-url "<endpoint>" s3 sync /tmp/files s3://<new bucket>/
   ```

3. Check that the new bucket holds every file the database knows of, with
   the new token and no prefix:

   ```bash
   BACKUP_BUCKET=<new bucket> BACKUP_FILES_PREFIX= BACKUP_S3_REGION=auto \
     BACKUP_S3_ENDPOINT="<endpoint>" BACKUP_S3_ACCESS_KEY_ID=<new files key id> \
     BACKUP_S3_SECRET_ACCESS_KEY=<its secret> \
     scripts/check-files-backup.sh "<production database URL>"
   ```

4. Put the new bucket and token in the server's `FILES_*` settings and
   redeploy.

Files uploaded since the last nightly copy are lost: up to 24 hours, as for
the database.

### A bad deploy or a bad delete

The host's point-in-time recovery to the minute before, which needs a paid
plan (ADR-053, phase 2). Without it, this is "the host is gone" with the last
nightly backup.

### One organization's mistake

Never restore the whole database: that erases every other organization's
work since the backup.

1. Restore into a **scratch** database (section 3).
2. Find the organization's id there, and copy back only the rows it needs,
   table by table, with `organization_id` in every `where`.
3. Write down what was copied and why: the audit log does not see it.

## 5. Moving to another host or bucket

- **Database host:** a restore (section 4, "the host is gone") is the move.
  Rehearse it in the drill first.
- **Bucket or region:** a new bucket set up as in section 1, new secrets, and
  the next night's backup goes there. The old bucket's backups expire on
  their own, or are copied across if a contract requires it.

## 6. If a secret leaks

- **Database URL or password:** change the password at the host, then update
  `BACKUP_DATABASE_URL` and the server's `DATABASE_URL`.
- **Private key:** make a new key pair, update `BACKUP_AGE_RECIPIENT` and
  `BACKUP_AGE_IDENTITY`, take a backup now, and keep the old key until every
  backup made with it has expired.
- **Bucket login:** delete the access key at the provider and make another.
- **A files token:** roll it in R2 → Manage API tokens, then update where it
  lives: the server's `FILES_S3_*` for `waf-files-app`, GitHub's
  `BACKUP_FILES_S3_*` for `waf-files-backup-read`.
