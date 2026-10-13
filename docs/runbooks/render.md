# Render: the free tier now, a paid plan before real data

What the deployment runs on, what the free tier costs it, how to replace
the free database when it expires, and what changes before real customers'
data. Render's limits as checked on 13 October 2026 at render.com/docs/free;
check again before relying on a number.

**Never paste a database URL, a password or a key into a chat, an issue or
a commit** (restore.md, section 6).

## What runs where

| What                       | Render type  | Instance |
|----------------------------|--------------|----------|
| The API (`server/`)        | Web service  | Free     |
| The client (`client/`)     | Static site  | Free     |
| The database (Postgres 18) | Postgres     | Free     |

Files are not on Render: they are in R2's `waf-files` bucket (ADR-059), and
the backups in `waf-backups` (ADR-053). Replacing the database leaves both
where they are.

`FILES_S3_ENDPOINT` is the account's address alone,
`https://<account id>.r2.cloudflarestorage.com`, with the bucket in
`FILES_BUCKET`. An address ending in the bucket used to work and store
every file one folder down; the server now refuses it at boot. The same
goes for `BACKUP_S3_ENDPOINT` in GitHub's secrets, which nothing checks.

## What the free tier costs the app

- **The database expires 30 days after it was created.** It then stops
  answering, and Render deletes it after a 14-day grace period unless it is
  moved to a paid instance type. Note the creation date in the handoff.
- **The web service sleeps after 15 minutes without a request,** and the
  next request waits about a minute while it starts. The hourly jobs run
  inside it, so while it sleeps they do not: licence reminders (ADR-064)
  arrive late or on the next visit, and released files are purged late
  (ADR-059). Nothing is lost; it is only late.
- Render may restart either at any time, and only one free database can be
  active per workspace.

For development and testing, all of that is acceptable.

## When the free database expires

Start empty. Nothing on the free database is real data; restoring the last
backup instead is "The host is gone" in restore.md, if a test needs the old
rows.

1. **New database:** Render → New → Postgres, Free, version 18, the same
   region as the web service (private hostnames resolve only within a
   region). Only one free database may be active, so delete the expired one
   first if Render asks.
2. **The API:** web service → Environment → `DATABASE_URL` = the new
   database's **Internal** URL. Save, and let it redeploy. The deploy runs
   every migration and the seed.
3. **Backups:** GitHub → Settings → Secrets → Actions →
   `BACKUP_DATABASE_URL` = the new **External** URL with
   `?sslmode=no-verify`. Run Actions → **Backup** once by hand.
4. **Check the migrations:** one row per migration, so the count is the
   number of files in `server/src/database/migrations/` that end in `.sql`:

   ```bash
   docker exec -it foundation-postgres psql "<External URL>" -c "select count(*) from drizzle.__drizzle_migrations;"
   ```

5. **Files:** logos and photos uploaded against the old database are still
   in `waf-files`, and nothing points at them; the hourly purge only removes
   files the database knows of. If they were test uploads, empty the bucket
   in R2 (leave `waf-backups` alone).
6. **The handoff:** the new creation date, so the next expiry is known.

Nothing else needs running: a fresh database has no older rows, so the
pinyin backfill is not needed, and new credentials retire the old ones.

## Before real customers' data

Each of these is a setting or a plan, not code. Together they are the
difference between a test deployment and one that can hold someone's
business.

- **The database on a paid instance type.** Upgrading the free database in
  place keeps its data; a new paid one is filled by a restore. It no longer
  expires, and Render's point-in-time recovery becomes available, which is
  how "A bad deploy or a bad delete" in restore.md is answered (ADR-053,
  phase 2).
- **The web service on a paid instance type.** It stops sleeping, so the
  first request is not a minute's wait and the hourly jobs run on the hour.
  Paying for the database alone does not change this.
- **Backups to the Canadian bucket:** `BACKUP_DESTINATION` = `s3`, with
  object lock (restore.md, section 1). Actions artifacts are for testing
  only.
- **New secrets throughout:** the database password, both R2 tokens, the
  backup key pair and Resend's key. Every one used during development is
  replaced, so nothing ever pasted or shared while testing still opens
  anything.
- **The release checks walked once** on the paid deployment, against the
  real address, before the first customer signs in.
