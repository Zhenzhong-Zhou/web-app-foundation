# Render: the free tier now, a paid plan before real data

What the deployment runs on, how to build it from nothing, what the free
tier costs it, how to replace the free database every month, and what
changes before real customers' data. Render's limits as checked on 13 October 2026 at render.com/docs/free;
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

## Building the services from nothing

If a service is lost, or the account moves, this makes all three again.
The database comes first, the static site last. Each setting is the one in
use; the reasons are in the sections named.

1. **The database:** "Replacing the database", step 2.
2. **The web service** (the API). Render → **New** → **Web Service** → the
   GitHub repository:
   - **Branch** `main`; **Root Directory** `server`; **Runtime** Node, whose
     version Render reads from `.node-version`;
   - **Build Command:** the README's, under Deployment (it migrates and
     seeds on every deploy);
   - **Start Command:** `node dist/main`;
   - **Region** Oregon (US West), the database's; **Instance Type** Free;
   - **Environment:** every variable `.env.example` names for production.
     The ones that point elsewhere: `DATABASE_URL` (the database's Internal
     URL), `CLIENT_URL` (the static site's address), the mail settings and
     `RESEND_API_KEY`, `FILE_STORAGE` with the `FILES_*` settings for R2
     ("What runs where"), `REGISTRATION=invitation` and, optionally,
     `OPERATOR_EMAIL` ("Registration and organization invitations").
     `MAIL_FROM` names the product, `Panivo <the address it has now>`: its
     name is the sender an inbox shows, and the one each invitation is
     signed with (ADR-077). The server refuses to boot on a wrong value,
     and the deploy log says which;
   - **Health Check Path** `/health/ready`; **Auto-Deploy** Off; its
     **Deploy Hook** into GitHub as `RENDER_API_DEPLOY_HOOK` ("Deploys").
3. **The static site** (the client). Render → **New** → **Static Site** →
   the same repository:
   - **Branch** `main`; **Root Directory** `client`; **Build Command**
     `npm ci && npm run build`; **Publish Directory** `dist`;
   - **Environment:** `VITE_APP_NAME=Panivo`, the product's name in the
     browser's tab and its bookmarks. It is read only when the site
     builds, so a change shows from the next deploy;
   - **Redirects/Rewrites:** the README's two rules, `/api/*` to the web
     service's own address first, then `/*` to `/index.html`;
   - **Headers:** the three rules ("Deploys", "Setting it up");
   - **Auto-Deploy** Off; its **Deploy Hook** into GitHub as
     `RENDER_CLIENT_DEPLOY_HOOK`.
4. **GitHub:** the variable `API_HEALTH_URL` ("Deploys") and the backup
   secrets (restore.md, section 1).
5. **The first deploy:** Manual Deploy on the web service, then, once
   `/api/health/ready` answers, on the static site. After that, a push to
   `main` that passes CI deploys both through `deploy.yml`.
6. **Yourself:** `npm run org:invite` ("Inviting an organization").

## What the free tier costs the app

- **The database expires 30 days after it was created.** It then stops
  answering, and Render deletes it after a 14-day grace period unless it is
  moved to a paid instance type. Note the creation date in the handoff.
  The current one, Free, was created on 22 October 2026, and its page
  says "Your database will expire on November 21, 2026": it stops
  answering then and is deleted about 5 December. Until the database is
  paid for, this comes back every 30 days.
- **The web service sleeps after 15 minutes without a request,** and the
  next request waits about a minute while it starts. The hourly jobs run
  inside it, so while it sleeps they do not: licence reminders (ADR-064)
  arrive late or on the next visit, account deletions that have come due
  complete on the next visit (ADR-069), and released files are purged
  late (ADR-059). Nothing is lost; it is only late.
- Render may restart either at any time, and only one free database can be
  active per workspace.

For development and testing, all of that is acceptable.

## Deploys (ADR-081)

Neither service deploys itself. Once CI passes on a push to `main`,
`.github/workflows/deploy.yml` deploys the API at that commit through its
deploy hook, waits until `/api/health` names the commit, and only then
deploys the static site at the same commit. A `main` whose CI fails
deploys neither, and if the API's deploy fails, the client stays where it
was, matching it.

**Deploying by hand:** Actions → Deploy → Run workflow deploys `main`'s
newest commit whose CI passed on a push, in the same order, and says in
its first step which commit and which CI run. A missed deploy (a run
cancelled, a hook unset, a wait that timed out) is put right there, not
in Render, so the API still goes first and nothing deploys that CI has not
passed. With the commit already live, the wait ends at once. A run by
hand and one after CI share the workflow's concurrency group, so they
never deploy at once: the newer cancels the older. Only from `main`:
started from another branch, the run would be that branch's own copy of
`deploy.yml`, so its job is skipped and nothing deploys. The job runs in
GitHub's `production` environment, limited to `main` and holding the
hooks (step 6 below), so a branch's copy that drops that check still
cannot reach them.

**The live site, checked:** the last step reads what a visitor gets, at
`API_HEALTH_URL` without `/api/health`, every 20 seconds for up to 10
minutes while the static site builds. `/version.json` must name the
commit, which it does at the first look once the static site's deploy is
live, since Render empties its edge then; the query string the step adds
does not get past the edge, which ignores it (As Render shows it, below).
`/api/health/ready` must say the database is `up`; and
`/favicon.svg` must come back as `image/svg+xml`, since a file the build
left out comes back as `index.html` with a 200 (the `/*` rewrite). It
only reads. After 10 minutes it fails, saying what each of the three
gave; both services have been deployed by then, and neither is rolled
back. With the commit already live, as on a run by hand, it passes before
the new build is out.

Why not Render's own auto-deploy, which both services had until ADR-081:

- **The order.** On #176's deploy the static site took 40.5 seconds and
  the API 1 minute 30, so for about 50 seconds the new client met the old
  API.
- **"After CI checks pass" cannot hold it.** Render then deploys only once
  every check on the commit has passed, and a workflow that waits for the
  API is one of those checks: each would wait for the other.
- **The root directory.** The web service builds from `server/`, and
  Render auto-deploys a service only when a push changes files under its
  root directory: after a push that changes only `client/`, the API would
  never name the commit.

Each deploy therefore redeploys the API, even when only the client changed:
about a minute and a half, with nothing for the migrations or the seed to
do. A push CI skips, docs only, deploys nothing; Help's guides, the one
Markdown that ships, run CI (`ci.yml`'s `paths`). A newer push's run
cancels an older one, waiting or deploying, so only the newest commit's
client goes live; and CI on `main` keeps one run waiting, so of several
merges in quick succession only the newest is checked and deployed.

### As Render shows it since 23 October 2026

| Setting            | Web service (the API)                     | Static site (the client)                         |
|--------------------|-------------------------------------------|--------------------------------------------------|
| Address            | `https://web-app-foundation.onrender.com` | `https://web-app-foundation-client.onrender.com` |
| Instance           | Free                                      | Free                                             |
| Auto-Deploy        | Off                                       | Off                                              |
| Deploy Hook        | in GitHub as `RENDER_API_DEPLOY_HOOK`     | in GitHub as `RENDER_CLIENT_DEPLOY_HOOK`         |
| Start Command      | `node dist/main`                          |                                                  |
| Pre-Deploy Command | empty                                     |                                                  |
| Health Check Path  | `/health/ready`, set on 22 October 2026   |                                                  |
| Headers            |                                           | the three rules below                            |

The database is Free too (above). With no Pre-Deploy Command, the
migrations run in the build command (README, "Deployment") while the
previous release still serves, which is why ADR-081's migrations add and
never take away in one deploy.

What the static site sent, from `curl -sI`, on 22 October 2026, before
the header rules:

| Path                        | `cache-control`                             | `cf-cache-status` |
|-----------------------------|---------------------------------------------|-------------------|
| `/`                         | `public, max-age=0, s-maxage=300`           | `EXPIRED`         |
| `/index.html`               | `public, max-age=0, s-maxage=300`           | `MISS`            |
| `/assets/index-UEWwBcVJ.js` | `public, max-age=0, s-maxage=300`           | `MISS`            |
| `/version.json`             | the same, as `index.html`: not yet built    | `MISS`            |
| `/api/health`               | none                                        | `BYPASS`          |

And on 23 October 2026, after ADR-081's merge, with the three rules (one
run):

| Path                        | `cache-control`                             | `cf-cache-status` |
|-----------------------------|---------------------------------------------|-------------------|
| `/`                         | `public, max-age=0, s-maxage=300`           | `HIT`             |
| `/index.html`               | `no-cache`                                  | `EXPIRED`         |
| `/version.json`             | `no-cache`                                  | `EXPIRED`         |
| `/orders`                   | `public, max-age=0, s-maxage=300`           | `EXPIRED`         |
| `/assets/index-Bl7LQjt0.js` | `public, max-age=31536000, immutable`       | `EXPIRED`         |

So the rules do what they say for the paths they name, to the browser: a
hashed asset is kept a year, and `index.html` and the version file are
asked for again every time. `/` and every deep link, such as `/orders`,
are `index.html` through the `/*` rewrite, and the `/index.html` rule does
not reach them: they keep Render's default, `s-maxage=300`, and `/` came
back `HIT`. Render's edge keeps `/index.html` and `/version.json` five
minutes too, whatever their `no-cache` says, and it keys every file by
its path alone, so a query string never seen before is answered from the
copy it holds (below). What brings a new build at once is that Render
empties its edge when a deploy goes live: on #219's deploy, `/`,
`/index.html` and `/version.json` turned over together. Were that ever to
miss an edge, someone opening `/` or a link into the app there could get
the old build's page for up to five minutes, and a tab could see a new
version up to five minutes late. The version check's own query string
gets past the browser, not the edge. A tab that loads the old page sees
the newer version file, loads in
full once per new version and then waits (manual checks, MC-3411), so it
never loops. A rule for `/*` would reach them, but it overlaps
`/assets/*`, and Render's docs do not say which wins: that is for the
whole-app review (handoff). `/api/health` goes through the `/api/*`
rewrite uncached, so the workflow never reads an old answer.

**The edge and the query string,** on 24 October 2026, for #196's review,
with `6ea3b6f8` live: `curl -sI` on each path, twice, five seconds apart,
each query string new.

| Path                             | 04:19:09 UTC             | 04:19:16 UTC               |
|----------------------------------|--------------------------|----------------------------|
| `/version.json`                  | `MISS`                   | `HIT`, `age: 5`            |
| `/version.json?<time>-<random>`  | `HIT`, `age: 0`          | `HIT`, `age: 5`            |
| `/version.json?r=<random>`       | `HIT`, `age: 0`          | `HIT`, `age: 5`            |
| `/index.html`                    | `MISS`                   | `HIT`, `age: 5`            |
| `/index.html?<time>-<random>`    | `HIT`, `age: 0`          | `HIT`, `age: 5`            |

The first run's query strings, `?1792815549-11291` and `?r=1801020105`,
had never been asked for, yet came back `HIT` from the copy the bare path
had fetched a moment before; the second run's, three more new ones, from
the same copy, the same age. Each named build `6ea3b6f8`, with or without
a query string. And across #219's deploy, polled every 16 seconds with a
new query string each time (#196's production-readiness review): the old
build's copy, `06a34f53`, was a `HIT` aged 75 seconds at 01:03:37 UTC; at
01:03:53 `/version.json`, `/index.html` and `/` were each a `MISS` naming
`f395b9c5`; then `HIT`, ageing to 297 seconds, `EXPIRED` at 01:09:07, and
`HIT` again. A copy 75 seconds old gave way on all three at the moment
the deploy went live: a purge, not an expiry.

### Setting it up, by hand, in this order

Before the pull request that adds `deploy.yml` merges, so that its merge
deploys this way. The first five were done on 22 October 2026; the header
rules took effect at once, without a deploy. The sixth waits for #196's
merge.

1. **The deploy hooks, as secrets.** Render → the web service → Settings →
   Deploy Hook: copy it. GitHub → the repository → Settings → Secrets and
   variables → Actions → Secrets → New repository secret:
   `RENDER_API_DEPLOY_HOOK`. Then the static site's, as
   `RENDER_CLIENT_DEPLOY_HOOK`. A hook deploys without signing in, so
   treat it as a key: never paste it anywhere else, and if it ever is,
   Regenerate it in Render and update the secret.
2. **The health URL, as a variable.** The same page → Variables → New
   repository variable: `API_HEALTH_URL` =
   `https://web-app-foundation-client.onrender.com/api/health`, the API
   as the client reaches it.
3. **Auto-Deploy off, on both.** Render → the web service → Settings →
   Auto-Deploy: Off. Then the static site the same. Not "After CI checks
   pass" on either (above). Until the merge, a push to `main` deploys
   nothing; after it, only through the workflow. Manual Deploy works
   throughout.
4. **The Health Check Path,** `/health/ready`: set on 22 October 2026.
   Render moves traffic to a new release only once it answers there with
   its database up, which is what makes `/health`'s commit mean the new
   release is serving.
5. **The cache headers.** Render → the static site → Headers, three rules
   that do not overlap, since Render's docs do not say which wins when two
   match one path (so not `/*`):

   | Path            | Name            | Value                                 |
   |-----------------|-----------------|---------------------------------------|
   | `/assets/*`     | `Cache-Control` | `public, max-age=31536000, immutable` |
   | `/index.html`   | `Cache-Control` | `no-cache`                            |
   | `/version.json` | `Cache-Control` | `no-cache`                            |

   A file in `/assets/` is named by its content, so a changed one gets a
   new name and the browser can keep the old for a year. `index.html`
   names the build's files and `version.json` says which build is out,
   so both are asked for again every time.
6. **The `production` environment, limited to `main`,** once #196 has
   merged, not before: until then `main`'s workflow names no
   environment, and would lose the hooks. Bob, in GitHub → the
   repository → Settings → Environments → `production` (the merge's
   Deploy run creates it): Deployment branches and tags → Selected
   branches and tags → add `main`. Then, under Environment secrets, add
   `RENDER_API_DEPLOY_HOOK` and `RENDER_CLIENT_DEPLOY_HOOK` with the same
   values, and delete the two repository secrets of those names. The
   limit alone stops only a job that names the environment; with the
   hooks in it, a run from any other branch, whatever its copy of
   `deploy.yml` says, has no hook to call. Done when Deployment branches
   lists `main` alone, the environment holds both hooks, the repository
   neither, and Deploy by hand still deploys (manual checks, MC-3425).

After the merge's deploy:

1. **The order.** Actions → Deploy, the run for the merge: Deploy the
   API, the wait ending "The API names …", then Deploy the static site.
   The two must name the same commit:

   ```bash
   site=https://web-app-foundation-client.onrender.com
   curl -s "$site/api/health"
   curl -s "$site/version.json?$(date +%s)"
   ```

2. **The headers,** each path twice, a few seconds apart:

   ```bash
   site=https://web-app-foundation-client.onrender.com
   asset=$(curl -s "$site/?$(date +%s)" | grep -o '/assets/index-[A-Za-z0-9_-]*\.js' | head -1)
   for p in / /index.html /version.json /orders "$asset"; do
     echo "== $p"
     curl -sI "$site$p" | grep -iE '^(cache-control|cf-cache-status):'
   done
   ```

   The loop's name is `p`, not `path`: in zsh, the Mac's shell, `path` is
   the list of folders programs are found in, so a loop over `path` loses
   `curl` and `grep` (and the rest of that window's commands; open a new
   one).

   `/` and `/orders` are `index.html` too, through the `/*` rewrite:
   whether the `/index.html` rule reaches them is part of what this
   shows. A second answer of `HIT` for `/`, `/index.html` or
   `/version.json` means Render's edge still holds it for five minutes
   whatever the header says. Record what came back here, with the date,
   either way.
3. **A tab kept open across the deploy:** manual checks, MC-3424.

On 23 October 2026, for #199's merge (1620e99): Deploy #1 deployed the
API by its hook; the wait saw 983c1d8 three times, then 1620e99 after 1
minute 43; then it deployed the static site. `/api/health` and
`/version.json` both named 1620e99, version 0.7.0, API revision 1. The
second run, Deploy #2, for CI's scheduled run at 7:01, was skipped, as
designed: it tests a commit already deployed. The free API took about 50 seconds to wake for
the first request. The headers are the second table above, from one run;
the second run, and MC-3424, wait for the next deploy.

### When the wait times out

The run fails after 20 minutes if the API never names the commit: its
deploy failed (Render → the web service → Events, and its log), it is
slow, or `API_HEALTH_URL` is wrong. The static site is left as it was.
Once the API is up at that commit, Actions → the failed run → Re-run
jobs, which deploys both again; or Actions → Deploy → Run workflow, which
deploys `main`'s newest commit whose CI passed on a push, the same one
unless a newer has passed since. Not Render's Manual Deploy, which can put
the static site first.

### A rollback

The API first, then the static site, both back to the same commit:
Render → the web service → Events → the deploy to go back to → Rollback;
once `/api/health` names its commit, the same on the static site. If the
change rolled back had raised `API_REVISION`, a tab running the newer
client is refused for the minutes between with 503 `api_updating`, "A
new version is being installed. Try again in a minute; nothing was
saved."; once the static site is back, its version file names another
build, and the tab loads it at its next page. A rollback takes no
migration back: the older release runs on the newer schema, which
ADR-081's rule for migrations (add, never take away, in one deploy) keeps
working. The next push to `main` that passes CI deploys both forward
again.

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
   means kept; a plain "Not Found" means gone. Render answers a missing
   `.js`, `.css` or `.png` with a 404, but a missing `.json`, `.svg` or
   `.woff2`, or a path without an extension, with `index.html` and a 200
   (the `/*` rewrite): for those, look at what comes back, not the status.

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
   from its Connect panel, with `?sslmode=no-verify` on the end. Node's
   Postgres client, which this command uses, reads that; `pg_dump` and
   `psql` refuse it, so nowhere else adds it. Paste it at the prompt: it is not shown and not
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

## Replacing the database

A free database stops answering 30 days after it was created, and Render
deletes it 14 days after that. Its page says the date ("Your database will
expire on …"), and Render emails before it. Until the database is paid
for, this comes back every month: replace it a day or two early, not
after, since the live app is down in between.

Start empty. Nothing on the free database is real data; restoring the last
backup instead is "The host is gone" in restore.md, if a test needs the old
rows. Do every step in one sitting: the live app is down from step 1 until
step 4.

1. **Delete the old database.** Render → the database (`foundation-db`) →
   Settings → at the bottom, **Delete Database**, typing its name to
   confirm. Only one free database may exist at a time, so this comes
   first.
2. **Create the new one.** Render → **New** → **Postgres**:
   - **Name:** `foundation-db` (the same name is fine);
   - **Database** and **User:** empty, so Render makes them;
   - **Region:** Oregon (US West), the web service's region, since an
     Internal URL resolves only within its region;
   - **PostgreSQL Version:** 18;
   - **Instance Type:** Free.

   **Create Database**, then wait until its status says Available.
3. **Point the API at it.** The new database → **Connect** → copy the
   **Internal Database URL**. The web service → **Environment** →
   `DATABASE_URL` → paste → **Save**. Then **Manual Deploy** → **Deploy
   latest commit**: Auto-Deploy is off since ADR-081 (if Save offers to
   rebuild and deploy, that does the same). The build runs every migration
   and the seed; the log ends with the service live. The static site needs
   nothing.
4. **Check it answers.** It may take a minute while the service wakes:

   ```bash
   curl -s https://web-app-foundation-client.onrender.com/api/health/ready
   ```

   Done when it says `{"status":"ready","database":"up"}`.
5. **Backups, the same day,** or that night's scheduled backup fails. The
   new database → **Connect** → copy the **External Database URL**, exactly
   as Render gives it: `backup.sh` asks for SSL itself
   (`PGSSLMODE=require`), and `pg_dump` refuses `sslmode=no-verify`.
   GitHub → the repository → Settings → Secrets and variables → Actions →
   `BACKUP_DATABASE_URL` → **Update** → paste. Then Actions → **Backup** →
   **Run workflow**. Done when the run is green.
6. **Count the migrations,** with that same External URL, pasted at the
   prompt so it stays out of the shell's history. One row per migration,
   so the count is the number of files in `server/src/database/migrations/`
   that end in `.sql` (75 at ADR-081):

   ```bash
   read -s "DB?Paste the External URL, then Enter: "; echo
   docker exec -it foundation-postgres psql "${DB}?sslmode=require" -c "select count(*) from drizzle.__drizzle_migrations;"
   unset DB
   ```

7. **Your organization again.** Everything on the old database went with
   it, accounts included: invite yourself with `npm run org:invite`
   ("Inviting an organization", above), the database's address being the
   External URL from step 5 with `?sslmode=no-verify` added, for Node's
   client.
8. **Files:** logos and photos uploaded against the old database are still
   in `waf-files`, and nothing points at them; the hourly purge only removes
   files the database knows of. If they were test uploads, empty the bucket
   in R2 (leave `waf-backups` alone).
9. **Record the dates** in the handoff's line about the database: created
   today, stops answering 30 days later, deleted 14 days after that.

Nothing else needs running: a fresh database has no older rows, so the
pinyin backfill is not needed, and new credentials retire the old ones.

### If a step fails

| What you see | What it usually is |
| --- | --- |
| The deploy fails at `npm run migrate` | `DATABASE_URL` is the External URL, or the database is in another region: use the Internal URL from the same region |
| `/api/health/ready` says the database is `down` | the deploy hasn't finished, or the URL was saved without a deploy: deploy by hand again |
| Backup says `invalid sslmode value: "no-verify"` | the secret ends in `?sslmode=no-verify`: paste the External URL as Render gives it |
| Backup fails to connect | the secret is the Internal URL: use the External one |
| `psql: invalid connection option "<postgresql…` | the `<` and `>` around the URL were kept: leave them out |
| `org:invite` or `psql` times out | the database's **Access Control** doesn't let your address in: add it there |
| Render won't create a free database | the old one still exists: step 1 first |

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
