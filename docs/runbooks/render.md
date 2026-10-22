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
  arrive late or on the next visit, account deletions that have come due
  complete on the next visit (ADR-069), and released files are purged
  late (ADR-059). Nothing is lost; it is only late.
- Render may restart either at any time, and only one free database can be
  active per workspace.

For development and testing, all of that is acceptable.

## Old files after a deploy (ADR-081)

**Render keeps the previous build's files.** Checked on 21 October 2026,
after #176 deployed: the live `index.html` loaded `index-UEWwBcVJ.js`, the
entry chunk a local build of `main` at 983c1d8 makes, and
`/assets/index-CScCP7eR.js`, the entry chunk of the build before it
(3f54efe), still came back as JavaScript. So a tab left open across a
deploy keeps loading its own pages; what changes under it is the API,
which ADR-081's revision handles.

Render's static-site docs do not say how long it keeps them, and its
"Clear build cache & deploy" is described as refreshing stale static
assets: use it only when a build needs it. Check again after a change of
plan or host:

1. Build the commit before the last deploy in a git worktree, and the
   current one, each with `npm ci && npm run build` in `client/`; each
   `dist/index.html` names its entry chunk.
2. **The control:** the live page's source must name the entry chunk your
   build of the current commit made. If it does not, your build differs
   from Render's, and the test says nothing: check at the next deploy
   instead.
3. **The test:** open the old entry chunk at `/assets/<name>`. JavaScript
   means kept. The app's page means gone: the `/*` rewrite answers a
   missing file with `index.html` and a 200, so look at what comes back,
   not the status.

## Registration and organization invitations (ADR-078)

Production takes new organizations by invitation. Two settings on the web
service, under Environment; saving redeploys it:

- **`REGISTRATION=invitation`.** Unset means the same in production, but
  set it, so the dashboard says what production does. `open` turns the
  sign-up form on, as for a public demo.
- **`OPERATOR_EMAIL`**, optional: the inbox told by email whenever an
  organization invitation is accepted. Leave it unset to be told nothing,
  and use `--list` instead.

A mistyped value fails the deploy at boot, and Render keeps the previous
deploy running: check the deploy log after saving.

### Inviting an organization

From your laptop, since the free web service has no shell, once the
deploy that added migration 0069 is live; before then it says the
database's migrations stop before 0069, and writes nothing.

1. In `server/`, run `npm run org:invite`. It asks each question: the
   person's email, the organization's name, the language (1, 2 or 3;
   English when left empty), then the app's address and the database's,
   unless the shell sets `CLIENT_URL` or `DATABASE_URL`. A wrong answer
   is said and asked again; Ctrl-C or Ctrl-D at any question cancels, and
   nothing is written.
2. **The app's address** is the static site's, `CLIENT_URL` as the web
   service has it, such as `https://<your site>.onrender.com`.
3. **The database's address** is the database's External Database URL,
   from its Connect panel, with `?sslmode=no-verify` on the end, as the
   backup secret has it. Paste it at the prompt: it is not shown and not
   kept in the shell's history. The command never reads `.env`, so it
   cannot write to the development database by mistake; never put the
   production address there. If it times out, check that the database's
   Access Control lets your address in.
4. It refuses an address that already belongs to an organization.
   Otherwise it shows the database's host and name, the app, the address,
   the name and the language, and asks before writing: anything but y or
   yes writes nothing. It prints the link and its last day, then a
   message in the invitation's language with the link under it: paste
   that message whole into a chat or an email of your own. Nothing is
   emailed.

`npm run org:invite -- --email … --name "…"` does the same on one line,
English unless `--language` says otherwise (`fr-CA` or `zh-Hans`). Run it
again for the same address to replace a waiting invitation: it asks
first, the old link stops working, and the new one has seven days.
`--list` shows what is waiting, what ended unaccepted (run again to send
a new link) and what was accepted, the last two for 30 days;
`--revoke --email …` ends one, after asking. `--help` shows each way to
run it.

An organization invited onto the free database goes with it when the
database expires: a real customer waits for the paid one.

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
