---
status: accepted
date: 2026-10-22
areas: [api, database, ops]
amends: [ADR-013, ADR-051, ADR-052, ADR-054, ADR-055, ADR-068]
amended-by: [ADR-082]
---

# ADR-081 — Old tabs after a deploy: a newer build noticed, an outdated client told (amends ADR-013, ADR-051, ADR-052, ADR-054, ADR-055 and ADR-068)

> **Amended by [ADR-082](0082-the-products-brand.md).**
> Help's foot names the product before its version, and the © line follows under it.

## Context

A tab stays open for days, and the app deploys underneath it.
Issue #175, found on 21 October 2026, lists what then goes wrong. The pages
behind the layout load as chunks of their own (`client/src/pages.ts`),
and a tab asks for its own build's chunks. When one fails to load, the
error boundary calls it "A new version is available" from its message
alone, a dropped connection included, and nothing listens for
`vite:preloadError`. The API cannot tell one client build from another,
so a changed shape fails a write or is misread on a read: ADR-080 swapped
`roleId` for `roleIds`, and a tab open across that deploy was refused
with "property roleId should not exist" and showed Members' unknown-role
fallback. And switching to a language whose catalogue fails to load does
nothing and says nothing.

Checked before drafting, as the working agreements ask:

- **Fired, and taken here.** #175's five points. ADR-052 accepted, for
  one change, that an old bundle's writes are refused until the page
  reloads; this ADR makes that the general case, with ADR-052's lenient
  mode one of two ways through it. ADR-080's consequence "the access query
  timed on `seed:volume`", which its as-built amendment does not record
  and nothing in `perf/` measures. ADR-051's two follow-ups left over in
  the handoff, `perf/` never type-checked in CI and one manifest for both
  scales, since this ADR's volume step edits `perf/`. #175's "later, an
  Open decision": feature flags and staged rollouts, now an entry. The
  handoff's "before real users": the `/production-readiness` skill, added
  here and run first on its deploys section. From #172's reviews, the
  status tones MUI derives below contrast. The browser-compatibility lint
  rule the handoff left as a chore, since this ADR gives the browser floor
  a section of the skill.
- **Not fired, and kept in step.** ADR-013's `/v1` stays: the revision
  below lives inside it, for the app's own client, and a request without
  one is never refused. `error-codes.ts`'s rule that a code is never
  renamed holds, for the same reason. Playwright against `vite build`
  (the handoff's watch list) is not taken; see Tests. Monitoring (Open
  decisions, "The operator": an error tracker and an uptime check) and "A
  security review before real customers" are reported on by the skill and
  decided in the whole-app review that follows this ADR. #142, the
  client's Content-Security-Policy, keeps its own PR; it is set in the
  same Render panel as the cache headers below. ADR-070's unindexed
  foreign keys and `pg_stat_statements` go to the skill's performance
  section.
- **Found while checking.**
  - Three kinds of chunk, not one: 39 pages, 2 catalogues and 66 Help
    guides, and only Help says when one fails. With a stored language
    other than English, `LanguageProvider` renders nothing until its
    catalogue loads, so a catalogue that fails at start is a blank app.
  - The static site and the API deploy separately from every push, and
    the static site usually finishes first: for those minutes a new
    visitor runs the new client against the old API, the other way round
    from #175.
  - The API's build command runs `npm run migrate` while the previous
    release still serves, so for a minute or two old code runs on the new
    schema. Migration 0073 dropped `memberships.role_id`, which the
    previous release's access check read on every request.
  - PDF and export links are plain links (`apiUrl`), outside `api()`.
  - `/health` says which commit answers (`RENDER_GIT_COMMIT`); the static
    site says nothing.
- **Answered by hand.** Render keeps the previous build's files: on 21
  October 2026, the entry chunk of the build before #176 still came back
  as JavaScript (`docs/runbooks/render.md`). A tab open across a deploy
  keeps loading its own pages; what changes under it is the API.
- **Found by the skill's first run** (`/production-readiness deploys`, on
  22 October 2026, before anything else was built):
  - Migration 0067 broke the running release too, another way: it replaced
    `document_sequences`' primary key, which the release still serving
    named in its `ON CONFLICT`, and made two columns required with no
    default. Until #136 went live, nothing could take a number.
  - On #176's deploy the static site was live 44 seconds after the merge,
    before CI had finished and before the API.
  - Render's edge keeps every file for five minutes (`s-maxage=300`) and
    ignores a request's `no-cache`, though a new query string misses it.
    A missing `.json`, `.svg` or `.woff2`, or a path without an extension,
    comes back as `index.html` with a 200; a missing `.js`, `.css` or
    `.png` as a plain 404.
  - Hashed assets are sent `max-age=0`, so a browser asks again for every
    chunk on every load.
- **Found by the build's inventory** (step 3, 22 October 2026), and settled
  with Bob before any code: sign-out was refused to an outdated tab; for
  the minutes between the API's deploy and the client's, a tab is outdated
  while the version file still names its own build; a phone's top bar at
  320 px has no room for another button; seventy dialogs share no wrapper,
  though the theme's dialog defaults reach them all; a listener that
  prevented `vite:preloadError`'s default would make a failed import
  resolve to nothing; the request log writes a 409 at warn and a 503 at
  error with a stack; the product image upload is a write outside `api()`;
  and switching language saves the choice before its catalogue has loaded.

## Decision — a version file

The client's build writes `version.json`
beside `index.html`: the build (the commit Render builds,
`RENDER_GIT_COMMIT`, else git's, else the time), when it was built, and
the API revision below. The build compiles its own id in. A tab reads the
file when it comes back to the front, every ten minutes while it is in
front, and after any load that fails or request refused as outdated, with
`cache: 'no-store'` and a query string of its own each time, since Render's
edge ignores the first but not the second. Anything but the version's
JSON, such as the `index.html` the host returns for a file it lacks, reads
as unreadable, never as a build. On the dev server the file names `dev`,
which never differs, so nothing fires.

## Decision — "New version", and a reload at the next page

One name
for it everywhere, "new version", in each language: in the top bar, the
banners, the status page, Help and the refusals, so nobody wonders whether
two words mean two things. Once the file names a newer build:

- **Signed in, in the top bar.** On a computer, "New version", a button
  with an icon beside Help, opening a short note: "A new version is ready.
  It loads by itself when you open another page", with Reload now. On a
  phone, whose top bar has no room for another button at 320 px, a dot on
  the account button, and the new version first in its menu: "A new
  version is ready · Reload now". The top bar's height never changes, so
  nothing on the page moves under someone's hand, as a banner appearing at
  the top would. Its arrival is announced once to screen readers.
- **Signed out, a banner.** Nobody is mid-task there, and those pages have
  no top bar: "A new version is ready. It loads when you open another
  page", with Reload.
- **Amber when saves would be refused.** When the new version's API
  revision is above the tab's, its saves will be refused (below), so a
  banner at the top of the page takes the button's place, and the same
  line shows at the very top of every dialog open or opened, above its
  title, since a dialog that fills a phone's screen covers the page: "A new
  version is ready, and this tab can no longer save changes. Copy anything
  you've typed, then reload." It is added once, through the theme's dialog
  defaults, not in each of the seventy; a dialog that only shows something
  (the image viewer) leaves it out. Rare and urgent, it may move the page.
- **The next page.** Opening another page means its path changing; a tab
  or a filter kept in the address does not count. Once that page has
  rendered, it loads in full from the new version. The unsaved-changes
  prompt runs first, so nothing typed is lost, and because the reload
  follows the move rather than racing it, the browser's own "Leave site?"
  never follows the app's.

## Decision — a load that fails says why

Any chunk that fails to load,
a page, a catalogue or a guide, is tried once more after a second. Then the
version file decides:

- **It cannot be read:** the offline status page, whose Try again reloads
  the page. It also tries again by itself when the browser says the
  connection is back, and says so: "This page tries again by itself when
  your connection comes back."
- **It names a newer build:** the page being opened loads in full from the
  new version, once. If it fails again within a minute, "A new version is
  ready" shows, "A new version came out while this tab was open. Reload to
  use it; nothing is lost", with Reload, so it can never loop.
- **It names this build:** the crash page with its reference, as now.

Help, which loads its guides beside the page, says "This guide has a new
version. Reload to read it" rather than reloading under someone reading.
All three kinds load through one loader, so a failed preload reaches it as
its import's rejection, and nothing listens for `vite:preloadError`: a
listener that prevented its default would turn the failure into an import
that quietly resolves to nothing.

## Decision — the API revision

One number in
`server/src/common/api-revision.ts`, starting at 1, is the API's revision
within `/v1` (amends ADR-013). The API document carries it as its
`info.version`, `1.<revision>`, and `npm run api` writes it into
`client/src/api/` with the types, so the contract check fails a client and
a server that disagree (amends ADR-068). `api()` sends it as
`X-Api-Revision`, as does the product image upload, a write outside
`api()`. The server compares it first, before the session is read or the
body validated (a body that is not JSON at all is refused by the parser
before it, as today):

- **Lower than the server's:** 409 `client_outdated`, "This tab is running
  an older version of the app, so nothing was saved. Copy anything you
  typed, then reload." A page whose read is refused shows the new version
  status page; a dialog keeps what was typed and offers Reload beside the
  refusal. A refused session read leaves the app as it is and makes the
  check urgent: it is never read as signed out, nor as "Could not reach
  the server". If the version file still names the tab's own build, the
  new version is still on its way, since the API deploys first: the tab
  says what the 503 says, a page tries again by itself, and the file is
  read every 30 seconds until the new build is out.
- **Higher than the server's,** the API not yet deployed or rolled back:
  503 `api_updating` with `Retry-After: 60`, "A new version is being
  installed. Try again in a minute; nothing was saved."
- **No header,** from a test, a script, a PDF or export link, or one day an
  integration: served as today.
- **Sign-out** is always served, whatever the revision: ending a session
  must never fail, on a shared computer least of all, and it sends nothing
  to misread.

Each refusal is logged once, at info and without a stack, with its route
and both revisions, so after a deploy the log says how many open tabs it
met; the request log and the exception filter, which would write a 409 at
warn and a 503 at error with its stack, leave these two codes to that
line. `/health` adds
the revision beside the commit.

## Decision — when the revision rises

An additive change keeps it: a
new route, a new optional field in a request, a new field in a response. A
breaking change raises it by one, in the commit that makes it: a field
removed or renamed, one newly required in a request, a type or a format
changed, a route removed, a value removed from a list a request takes.
Where old tabs matter more than the effort, the old shape is kept working
for a while instead, logged until nothing sends it, as ADR-052's lenient
mode did (amends ADR-052: one of two ways now, not the way). CI holds the
rule: its contract check compares `server/openapi.json` with `main`'s using
oasdiff, a pinned container image rather than a dependency, and fails a
breaking change that left `info.version` where it was. `/code-review`
checks it by reading too.

## Decision — the API first, then the client

The static site no longer
deploys itself. A workflow on each push to `main` waits until the API's
`/health` names the pushed commit, then calls the static site's deploy
hook, kept as a secret. If the API's deploy fails, the client stays where
it was, matching it. That ends the minutes in which a new client meets an
old API. The 503 above stays for a rollback, which takes both services
back together (`render.md`). Any host has a health URL and a deploy hook,
so nothing here ties the deploy to Render.

## Decision — migrations that work with the release still running

A
migration runs while the previous release still serves, so it leaves
working the schema that release reads: in one deploy, add, never take
away. Dropping or renaming a column or a table, changing a type, making a
column required without a default, or replacing or dropping a key or a
unique index that a released query's `ON CONFLICT` names waits for a later
migration, once no released code reads the old shape: expand, then
contract, which ADR-052 already asked of large tables. CI runs squawk, a
Postgres migration linter, on each new migration, pinned and run through
`npx` as the Markdown check is, and fails those statements unless an
ignore comment beside one says why the running release does not read what
it changes. Squawk cannot know which key a released query names, so
`/code-review` checks that one by reading, and the rest too. ADR-080's
0073 and ADR-073's 0067 would each have been two migrations, a deploy
apart.

## Decision — a language that fails to load says so

Switching tries
once more, then stays in the current language and says "Couldn't load
简体中文. Check your connection and try again", with Try again in the
message itself, which stays until it is closed. The catalogue loads first;
only once it has does the choice go to the account and the device, so a
failed load changes nothing saved. At start, a stored
language whose catalogue fails falls back to English, with a banner naming
the language and Try again, rather than a blank page. If the version file
names a newer build, the page reloads instead (amends ADR-054).

## Decision — Render's settings, by hand, in `docs/runbooks/render.md`

The old-files answer (above). Cache headers, set where Render's own
differ: `/assets/*` for a year and immutable, rather than asked for again
on every load; `index.html` and `version.json` never cached, the browser's
and Render's edge alike, checked with `curl -sI` and its
`cf-cache-status`. The web service's health check path, `/health/ready`,
so traffic moves to a new release only once it answers with its database
up. The web service deploying after CI's checks pass, where Render offers
it, so a `main` whose CI fails deploys neither the API nor, after it, the
client. The static site's auto-deploy off, with its deploy hook in
GitHub's secrets. A rollback always takes both services back together.

## Decision — `/production-readiness`, a review before real users

A
Claude Code project skill in `/code-review`'s shape: report only, on the
whole app or one section. Eight sections: deploys and old tabs; backups
and a restore tried; monitoring; security; performance; email; support;
browsers and China. Each finding carries its evidence (a `path:line`, a
workflow run from `gh run list`, a runbook line) and is grouped Before
real users, Before the first paying customer, or Worth considering, with
the ADR or trigger it ties to. What only Bob can see (the Render
dashboard, DNS records, a restore) is a By hand list with exact steps. It
runs first in this ADR's branch, on its deploys section, so what falls
inside #175 is built here; its whole-app run follows this ADR.

## Decision — the browser floor, held by ESLint

`eslint-plugin-compat`,
set to the build's own target (conventions.md, "Supported browsers"),
fails code that uses an API newer than the floor without a guard, as
`Intl.Segmenter` once was. The skill's browsers and China section checks
the rest: nothing loaded from another site, `index.html`'s engine tags,
reaching the app from mainland China, and the devices only a person can
try (Android WeChat, 360 and QQ on Windows in 极速模式).

## Decision — the volume seed catches up with ADR-080

Each organization
gets a team: 15 members at small scale and 150 at large, with 4 and 12
made roles from the templates and copies, each member holding one to
three, and a few invitations pending that name roles. `npm run perf:plans`
gains the access query, what one member of three made roles may do
(`memberPermissions`), and who holds a permission (`holdersOf`), both
timed at large; the numbers go in this ADR's as-built amendment. `perf/`
is type-checked in CI's server job, and `seed:volume` writes one manifest
per scale, `volume-<scale>.json`, which `npm run perf` reads by its
`--scale` (amends ADR-051).

## Decision — the seeds grow with every feature

From this ADR on, each
feature adds what it needs to both: to `seed:demo`, so its screens, manual
checks and walkthroughs start without setup; to `seed:volume`, realistic
rows for any new table or hot query, timed against ADR-051's budgets. A
feature with nothing to add says so. CLAUDE.md and conventions.md say it,
and every build brief has a step for it. This ADR adds nothing to the
demo: what it shows follows a deploy, not data.

## Decision — what rides along

- **The status tones' contrast.** MUI derives `light` and `dark` from each
  status colour, and two fall short. The crash page's icon disc reaches
  2.2:1 in both modes, against 3:1 for an icon; a Home card's empty line,
  `success.dark` on the dark surface, reaches 4.33:1, against 4.5:1 for
  text. Both take ADR-055's tones instead, whose background and text pairs
  pass, and the status page's other discs move to them too (amends
  ADR-055).
- **References kept whole.** A document's number (`SO-DEMO-1`,
  `PO-000009`) never breaks at its hyphen; a line breaks between a
  reference and its words instead.
- **Home's failure line in words.** Home showed a dropped connection as
  "Failed to fetch", skipping the words every other page gives it.
- **Home's tiles in even rows.** With eight tiles, Home showed seven and
  one alone. The tiles share their rows evenly: as many rows as the width
  needs, the tiles spread across them, so eight read as two rows of four,
  and a phone shows two to a row.

## Tests

The server's e2e suite: each refusal, a request without the
header served, sign-out served to an outdated tab, and the refusal made
before the body is validated. Component tests: the version check, the top
bar's button and the phone's dot, the banners, the amber line in a dialog,
a reload at the next page and not before, each way a load fails, the
offline page trying again by itself, a refusal in a dialog and on a page,
a tab outdated before its new version is out, a refused session read, and
a catalogue that fails with nothing saved by it. Playwright replaces
`version.json`, the static host's file and never the API's, to stand for
a deploy, and aborts a page's chunk to stand for a dropped connection: the
top bar's button appears, a move between pages reloads, a dropped
connection says so. Its rule that nothing is mocked is about the API, and
stays; conventions.md says so.

## Considered and not done

- **Reloading the moment a newer build appears.** It takes whatever
  someone is typing.
- **A blue banner on every page while signed in,** as first drawn. Appearing
  at the top while someone works, it moved the page under their hand; the
  top bar's button moves nothing.
- **Refusing every client built before the server.** Every deploy would
  refuse every open tab, the additive ones included.
- **Sending old tabs to the old release,** as Vercel's skew protection
  does. Render keeps the files, which covers the pages; the API would need
  old releases kept running.
- **A service worker.** It would cache the old build itself, the problem
  this ADR solves.
- **Telling tabs over a socket.** A small file read at the right moments is
  enough.

## Deferred — each with what brings it in

- **Keeping the last build's files ourselves.** Trigger: a host that drops
  them, Render included if a check (`render.md`) ever finds them gone.
- **Reporting failed loads and refusals to an error tracker.** Trigger:
  the monitoring decision (Open decisions, "The operator").
- **Playwright against the built files** (`vite build`, `vite preview`).
  Trigger: a fault the dev server hides.
- **Feature flags and staged rollouts** (Open decisions). Trigger: the
  first paying customers.

## Consequences

- No migration.
- Server: `common/api-revision.ts`; a middleware first in the chain,
  refusing with `client_outdated` and `api_updating` (in
  `error-codes.ts`) and logging each; `/health` with the revision; the
  document's `info.version`; `npm run api` writing the revision into
  `client/src/api/`. E2e tests as above.
- CI: oasdiff in the contract check, squawk on new migrations, `perf/`
  type-checked; `/code-review`'s rules for the revision and for keys a
  released `ON CONFLICT` names; `scripts/verify.sh` runs the first two
  where Docker is up.
  A workflow that deploys the static site once the API names the commit.
- Client: the version file and the build id from a Vite plugin; the
  version check; the top bar's button, the banner on the signed-out pages,
  the amber banner and the amber line in dialogs; one way every chunk
  loads and fails (pages, catalogues, guides); the offline page trying
  again by itself; `api()` and the image upload sending the revision, and
  the two refusals on pages and in dialogs; the language's failure paths;
  the tones, references kept whole, Home's failure line and its even rows;
  `eslint-plugin-compat`. Designed on the canvas first: the button and its
  note, the amber banner and the signed-out one, on a computer and a phone
  in English and 中文, and the amber line in a phone's full-screen dialog;
  the offline, new version and crash pages, and Help's guide; a dialog
  told before typing, a refusal after, the new version on its way, and a
  page refused; a language that fails; Home's tiles and references.
- `.claude/skills/production-readiness/SKILL.md`, and its first run.
- `seed:volume`, `perf:plans` and a manifest per scale.
- Docs: `docs/runbooks/render.md` (the settings above); manual checks
  section 34; conventions.md's status pages, error codes, API contract
  (the revision), migrations (expand, then contract) and tests
  (Playwright's rule); this ADR's as-built amendment; the handoff.
- Build order: this ADR; dependencies; the skill, run on deploys; an
  inventory of every chunk, every request outside `api()` and every place
  a failure is shown; the volume seed; the server; CI; the client, after
  the design; the riders; the deploy workflow and the runbook;
  dependencies again; the reviews; the docs last. Built by Claude Code, a
  prompt per commit (engineering.md, *How code is delivered*).

## Amendment (October 2026) — as built (#199)

What building settled:

- **The version file and the check.** `version.json` holds the build,
  when it was built, the release (`client/package.json`'s version) and the
  API revision. The tab reads it as it starts, not only on coming back to
  the front and every ten minutes, so an old `index.html` from Render's
  edge is caught; each read has a query string of its own and
  `cache: 'no-store'`, and gives up after 5 seconds. Anything but its JSON
  is unreadable and changes nothing; each read that succeeds sets the
  state, so a rollback to the tab's own build clears it. Urgent means the
  newer build's revision is above the tab's, or the API has refused the
  tab.
- **Where "New version" shows.** On a computer, the top bar's button and
  its note. Below 600 px, the width where Help becomes an icon, the
  account button's dot and the menu's first item, keeping the board's
  second line. Signed out, the banner sits under the language and text-size
  row, and turns amber too, since sign-in would be refused. The banners are
  MUI's standard info and warning alerts, like the app's others. The amber
  line reaches every dialog through the dialog paper's component setting
  (`VersionPaper`), not by replacing the paper; the image viewer, and Help
  and the lookup on a phone, opt out. An open dialog hides `#root` from
  screen readers, so the announcement is in every dialog too, and says the
  urgent words once urgent.
- **The next page** loads in full once per newer build, ever, recorded in
  `sessionStorage`: if it comes back on the old build, the button or the
  banner stays and nothing reloads by itself again. Without storage,
  nothing reloads by itself. The chunk loader's reload keeps a one-minute
  guard, and the two share one record.
- **A load that fails.** One loader, `loadChunkOrReload`
  (`client/src/version/load-chunk.ts`), for pages, catalogues and guides,
  throws a `ChunkLoadError` naming its case, and the error boundary reads
  that rather than the browser's words. Render answers a vanished chunk
  with a plain 404. The offline page, and `LoadFailure`'s too, tries again
  on the browser's `online` event. A known limit: in Safari, a connection
  dropped for under a second while a page's import loads shows the crash
  page, since Safari keeps the failed fetch until a reload; Reload fixes it.
- **The revision.** `API_REVISION` is 1, `info.version` 1.1, and
  `client/src/api/revision.gen.ts` is written by
  `client/scripts/write-api-revision.mjs` after openapi-ts. The middleware
  runs after pino-http has given the request its id and before
  `SessionContextMiddleware`; anything but digits above zero is no header.
  It records each refused request, so the request log (`requestLogLevel`)
  and the exception filter's 5xx log stay silent for it, leaving one info
  line, "Refused an outdated client" or "Refused a client newer than the
  API", with the method, the path, both revisions and the request id. The
  log counts refused requests, not open tabs, though the bell and the idle
  guard rest in an outdated tab. `/health` also names `version`, read from
  `server/package.json` once as the server starts, since Render runs it as
  `node dist/main`, where npm's variables are absent.
- **Outdated on screen.** `send()` waits for the version read before the
  caller hears of a refusal, so the first words are right. "On its way" is
  outdated with no newer build known, an unreadable file included: the
  503's words, a page that tries again every minute while in front, and a
  read every 30 seconds until the build is out. `useResource` and
  `useKeysetList` report a refusal, and `messageFor` words it as the page
  renders; Your account's sections, New order's pickers and panels inside
  pages show the server's words under the amber banner. `FormError` adds
  Reload by the tab's state, so a client-side line shown then gets it too.
  A refused first session read shows a full-page status, a later one leaves
  the app as it is, and sign-out's answer doesn't count as being served. The
  product image upload shares `api()`'s headers and its refusal. A refused
  dialog shows Reload twice, the refusal's and the amber line's, as this ADR
  asks for both.
- **Languages.** The catalogue loads first; the device keeps the choice once
  it has, and the account once `setLocale` says so. A language that fails
  says so in its own words, not in English (amending the decision above):
  those few messages ship in the main chunk, listed in
  `client/src/i18n/failure-ids.json` and written by
  `scripts/write-failure-words.mjs` at `i18n:compile`. The toast stays until
  closed, sits at the foot of the toast stack, below any confirmation, says
  so with Reload when a newer build is the cause, and shows that it is
  loading again while Try again works. The account's language applied at
  sign-in counts as a switch, except the one the start banner names.
- **CI.** A job of its own, "Against main", on pull requests, compared with
  the merge commit's first parent; `scripts/check-api-breaking.sh` (oasdiff
  v1.33.0, pinned by digest, no network) and `scripts/check-migrations.sh`
  (squawk-cli 2.68.0) are shared with `scripts/verify.sh`, which compares
  with the merge base and exits 3, saying why, when a check cannot run. A
  removed request property or parameter, and a removed optional response
  field, count as breaking; a change reviewed and accepted is listed with its
  reason in `server/openapi-breaking-accepted.txt` (swagger 12.0.3's
  `maxItems` were the first). `server/.squawk.toml` keeps this ADR's rules
  and turns off eleven that drizzle-kit's ordinary output trips, each with
  its reason, `ban-drop-constraint` among them: a key replaced under a
  released `ON CONFLICT`, as in 0067, is for `/code-review`'s new rule. This
  PR took `main` from `1` to `1.1`, so its own check could not bite.
- **Deploys.** Neither of Render's options gives the order. "After CI checks
  pass" waits for every check, the deploy workflow's own included, and a
  service with a root directory deploys only on changes under it. So both
  Auto-Deploys are off (replacing "the web service deploying after CI's
  checks pass"), and `.github/workflows/deploy.yml`, run when CI passes on a
  push to `main`, calls the API's deploy hook with `?ref=<commit>`, waits up
  to 20 minutes for `/api/health` to name it, then calls the static site's.
  That needs a second secret, `RENDER_API_DEPLOY_HOOK`; every deploy
  redeploys the API; a docs-only push, which CI skips, deploys nothing; and
  CI now runs for Help's guides. A newer run cancels an older one, waiting
  or deploying. On #176's deploy the client had met the old API for about
  50 seconds. The settings, the cache headers and a rollback are in
  `docs/runbooks/render.md`.
- **The volume seed and the access query.** Each organization's members
  count everyone, 15 and 150, so the team is 13 and 148: a second Owner and
  Admins, then members holding one to three made roles in exact shares, so
  one holding three always exists, and no Viewers; made roles at large are
  three times small. At large the access query takes 0.09 ms for a member of
  three made roles, and who holds a permission 0.73 ms; no access table
  reaches 10,000 rows, and with sequential scans off every table is read by
  an index, so no index changed. That pays ADR-080's owed timing. `perf/`
  was already type-checked by `npm run typecheck` (since 7 October);
  `--scale` defaults to small; the plan check warns on a manifest of one
  organization and fails on one with no three-role member.
- **The riders.**
  - **Tones.** The status page's discs take ADR-055's tones (offline
    neutral too), 8.1:1 and above; Home's empty line had never been green,
    since MUI 9's Typography ignores a dotted `color` (#196), and is drawn
    through `sx`.
  - **References.** `Reference` keeps one value whole inside a message;
    `ReferencesWhole` keeps every hyphenated word whole in the server's
    text (notifications, Home's detail, the audit log, activity, toasts,
    refusals). A code over 16 characters may break, and a page heading or
    a reference standing first is left alone. Browsers break at a hyphen
    only before a letter, so this ADR's `PO-000009` never broke.
  - **Tiles.** Equal columns in as few rows as fit, from container queries
    in rem; an odd count can still leave one alone (seven where three fit
    is 3 + 3 + 1; a phone, 2 + 2 + 2 + 1), and at 320 px, or 390 px with
    Larger text, it is one to a row.
  - **The browser floor.** `eslint-plugin-compat` 7.0.2 holds Web APIs and
    built-ins only up to about ES2022; newer built-ins, a method called on
    a variable and CSS are #197.
- **Left for issues.** #186 (the lookup reads every organization's rows),
  #187 (plans at large), #189 (the bell's "Nothing yet.", in an outdated tab
  too), #190 (Resend), #193 (request fields on every log line), #194
  (`npm run api`'s first run), #195 (a list's alert above its empty state),
  #196 (Typography's colours), #197 (the browser floor's gaps), #198
  (unsaved work on most pages).

### Correction (24 October 2026, #196's review)

Render's edge ignores a
request's query string as well as its `no-cache`: a query string never
seen before was answered from the edge at age 0. What brings a new build
is Render emptying its edge at each deploy, and `/` and deep links turned
over at once with the rest, so no page stays old for five minutes after a
deploy. The lines above that say a new query string misses the edge are
wrong in that. The version check keeps its query string and
`cache: 'no-store'`, which still get it past the browser's cache
(`render.md`, "The edge and the query string"). Deploy by hand
(`workflow_dispatch`, `main`'s newest commit whose CI passed) and a
read-only check of the live site after each deploy came with #196 (#224);
the deploy job runs in GitHub's `production` environment, limited to
`main` and holding the hooks.
