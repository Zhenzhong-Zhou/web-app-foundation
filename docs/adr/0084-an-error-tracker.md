---
status: accepted
date: 2026-10-30
areas: [api, ops, ui]
amends: [ADR-081, ADR-088]
---

# ADR-084 — An error tracker: real faults reported, through the app's own API, scrubbed of personal details (amends ADR-081 and ADR-088)

## Context

Nothing tells Bob when the app fails. A fault on the server is a line
in Render's log, read only when someone looks; a fault in a browser is
a line in that browser's console, which nobody reads. A crash page shows
a reference to quote, but only someone who writes in quotes it. Open
decisions, "The operator", split monitoring from the operator's console:
an uptime check, set up by hand on UptimeRobot since 25 October 2026,
and an error tracker, this ADR (#287).

Three rules were settled before it. No paid plan (Bob, 26 October
2026). The browser contacts no other site, so the app works from China
and the client's Content-Security-Policy (#142) can stay with its own
origin. Personal details are scrubbed before anything leaves, as PIPEDA
and PIPL ask; `docs/runbooks/services.md` has said both since 25
October.

What the code offers today:

- **The server.** `AllExceptionsFilter` answers every failed request and
  logs each 500 with its stack; the hourly jobs (`HourlyTimer`) log a
  failed run; and about twenty places catch a failure that must not fail
  the request, and only log it: an email not sent, an audit or
  notification write that failed, a step of a deletion.
- **The client.** One error boundary, inside the signed-in layout; the
  root's `onUncaughtError` for the rest, which empties the page; and
  ADR-081's chunk loader, which tells a dropped connection and a newer
  build from a page's code that is broken in this one. The boundary's
  comment already names itself as where a reporter goes, beside the
  reference the person sees.

Checked before drafting, as the working agreements ask, with the open
issues in `area:api`, `area:database`, `area:docs`, `area:ops` and
`area:ui` on 30 October 2026, and the full text of each `when-touched`
one:

- **Fired, and taken here.** ADR-081's *Deferred*, "Reporting failed
  loads and refusals to an error tracker", whose trigger is this
  decision: settled below and in ADR-081's amendment. #268, an `npm
  audit` step in CI, which also takes "dependency scanning on every PR"
  from Open decisions' security review; and #269, the database's size in
  the backup's summary: both planned for this branch (ADR-088). The
  per-area table diagrams (ADR-086, part 2 as planned). The multer
  override, which goes once `@nestjs/platform-express` depends on 2.5.0
  itself (ADR-019's amendment). #244, `when-touched` in ui: a render
  error before sign-in shows an empty page, since the only boundary is
  inside the signed-in layout, so a tracker would see those faults while
  the person sees nothing. #266, `when-touched` in database: two wrong
  migration numbers in `columns.ts`'s comment, in the schema the
  diagrams read.
- **Not fired, and left.** In api, #314 (a test listing the writes that
  take an id from their body), #309 (stock's 404 where 400 is due) and
  #177 (orders' priced fields): none is on the error path. In database,
  #226 (a plan-check rule) and #222, which goes with ADR-085 as planned.
  In docs, #292's two remaining points: manual-check ids as links, which
  need anchors beside #283, and naming what "partly tested" leaves out,
  for the invoices fix-up; its comment is already done on `main`. In
  ops, #253, Claude Code Review's permissions. In ui, #33, #160, #170,
  #242, #271, #273, #274, #275, #282, #293, #295, #302, #312, #313 and
  #323: screens and shared pieces this branch does not open. Of the
  `later` ones, #142 is unchanged, since reports go through the API;
  #197, #277, #283, #284, #319, #320 and #321 are unrelated. The
  `fix-now` ones stay in the Fix-ups milestone. Open decisions, "The
  operator": the console and Help's "Report a problem", whose trigger
  has not come. ADR-051's monitoring of response times, waiting for the
  first customer in production. ADR-067's Nest 12 `errorCode`, a tidy
  with no trigger that would widen this change. Open decisions, "Telling
  users what changed": a privacy policy naming the tracker comes with
  the first user outside Bob.
- **Found while checking.** The faults caught and only logged would be
  missed by a tracker hooked at the filter alone. `services.md` still
  said the tracker came before ADR-083, low stock's number until 26
  October. Piped or saved to a file, `gh issue view --comments` prints
  the comments without the issue's text, so the planning skill's check
  read the issues from their pages instead; its fix rides along. And
  the fixed skill, uploaded from this branch, would differ from `main`'s
  copy, which each session compares it with, until the merge: every
  session would ask for an upload and then follow `main`'s older copy.
  `@sentry/nestjs` and `@sentry/vite-plugin` 11.10.0, published on 28
  October, are old enough on 4 November, inside the wait for this
  branch's other updates.

## Decision — Sentry's free plan, behind one setting

Sentry's hosted Developer plan: free for one user, with 5,000 errors a
month (checked on 30 October 2026), grouped stack traces, readable
browser traces, releases and email alerts. The app speaks Sentry's own
SDKs, `@sentry/node` on the server and `@sentry/browser` on the client,
which GlitchTip and Bugsink also accept, so moving to either is one
setting, not code.

- **`ERROR_TRACKER_DSN`,** the project's address, on the server only.
  Unset, nothing starts and nothing leaves: the default on a developer's
  machine and in CI. **`ERROR_TRACKER_ENVIRONMENT`,** optional, names
  the deployment, `NODE_ENV` when unset.
- **One project for both sides,** each report tagged `side` (`server` or
  `browser`), so one setting serves both.
- **Started in `main.ts` only,** as the hourly timers are, so the tests,
  the seeds and the command-line scripts boot without it.
- **Said at startup:** the server's log says whether the tracker is on,
  with its environment and release, never its address, so a setting lost
  in a move to another host shows in the first lines.

## Decision — the browser reports through the app's own route

The browser posts each report to `/api/errors`, which the site's
rewrite brings to the server's `POST /errors`: a route of the app's
own, named for neither the tracker nor its protocol so blocklists pass
it. The server relays it to the project.

- **The browser holds no address of the tracker's.** It reports to the
  route with a stand-in project address; the server puts the real one
  on before relaying, and relays only to its own project, so the route
  can carry nothing anywhere else.
- **The route** is version-neutral, as `/health` is (ADR-013), so a tab
  older than the API still reports; public, so a fault before sign-in
  reaches it; and keeps ADR-014's `X-Requested-With`, which the SDK's
  transport sends. It is rate-limited as every route is (ADR-011,
  amended), refuses a body over 200 KB with 413, relays only error
  events (session counts and the rest are dropped), scrubs them again
  (below), and answers 204, the setting unset included.
- **A failure to relay** is logged as a warning and never reported,
  which would loop.
- **The SDK loads in a chunk of its own,** after the first page has
  drawn, so the first load does not grow; a fault before then is held
  and sent once it has loaded. A chunk that does not load leaves
  reporting off for that tab, and nothing else.

## Decision — real faults only

Reported:

- **On the server:** a 500 from the filter, a failed hourly run, an
  uncaught exception or unhandled rejection, and each failure the code
  catches and only logs, through one function, `reportFault`, that the
  catch sites call with the error itself. Not a hook on every error log
  line: a message that holds an id would split one fault into as many
  reports as ids.
- **In the browser:** a render error, caught by a boundary or by the
  root; a page's code that will not load in this build (ADR-081's
  "broken"); and an unhandled rejection or error from the app's own
  files.

Not reported:

- **Refusals:** a 4xx, ADR-081's `client_outdated` and `api_updating`
  among them, is the app working as designed, logged where it is
  refused (ADR-081's amendment).
- **A dropped connection or a newer build** (ADR-081's "offline" and
  "newer"), which a person fixes by waiting or reloading.
- **In the browser, an `ApiError`:** the server reported its own 500s,
  and the rest are refusals.
- **Code that is not the app's:** a browser extension's, or a page
  translator's, judged by the files in the stack.

At most ten reports from one page load, and the SDK's own
de-duplication on, so one fault in a loop cannot spend the month's
5,000.

## Decision — what a report carries, and what never

A report carries the error, its stack and the release, `<version>+<commit>`
on both sides; the environment; the reference the person sees, as a
tag the tracker can search (the request id, or the boundary's own); the
route's pattern, not its address; the language; the browser; and the
user and the organization, by id alone.

Never: a name, an email address, a postal address, an IP address, a
request's body, cookies, headers other than the browser's name, or a
query string, which can hold a search term (#193). Database errors lose
the values in their messages. The trail before a fault (breadcrumbs)
keeps page changes and requests by path; console lines and clicks are
off. No session replay, no performance tracing, no session counts.

The same rules run in three places: in the browser before sending, on
the server before relaying or sending, and in the project's own
settings (its data scrubbing on, IP addresses not stored), so one
missed field is caught by the next.

## Decision — readable browser traces, uploaded at the build

The client is built with hidden source maps (files that map the
minified code back to the source). When Render's static site has the
upload's settings, Sentry's Vite plugin uploads them with the release,
then deletes them from the published files; without the settings it
does nothing, and a failed upload never fails the build. The published
site serves no maps, which stays right if the repository goes private
before going commercial (Open decisions, "A public or a private
repository").

## Decision — the riders

- **#268, `npm audit` in CI,** for both packages: it fails on a high
  finding in what production runs (`--omit=dev`); the tooling's findings,
  fixable only by major versions (#268), are printed, not failing, and
  Dependabot keeps raising them. Beside it, `npm audit signatures`, which
  checks the registry's signatures on what is installed. In CI only, not
  in `scripts/verify.sh`: it judges the registry's state that day, not
  the change, and would fail every local verify offline.
- **#269:** the backup job's summary gives the database's size beside
  the dump's.
- **#244:** a boundary for the signed-out pages, showing the crash page
  inside the signed-out frame with Reload and a reference, and reporting
  as the signed-in one does.
- **#266:** `columns.ts`'s comment corrected.
- **The per-area table diagrams** (ADR-086): one Mermaid `erDiagram` per
  area, its tables and foreign keys, made from the Drizzle schema with
  `getTableConfig`, `organization_id` left out, written by a script and
  checked in `scripts/verify.sh` as the API document is. Each table
  belongs to one area, and a table with none fails the check.
- **The planning skill's issue command,** fixed. And
  `scripts/pack-chat-skill.mjs` packs only at `origin/main`'s commit,
  with the skill's folder unchanged, as production deploys only from
  `main` (ADR-081); its `--check` still runs anywhere. So the fixed skill
  is uploaded after this merges, packed from `main` (ADR-088's
  amendment).

## Considered and not done

- **GlitchTip's hosted free plan:** 1,000 events a month, a fifth of
  Sentry's.
- **A tracker run on Render's free plan:** the service sleeps after 15
  minutes and the free database expires every month.
- **A table of errors in the app's own database,** which fails when the
  database does, and has no grouping or alerts.
- **The browser sending straight to the tracker:** an outside address
  China may block, #142's policy widened, blocklists, and the project's
  address in the published code.
- **Sentry's React and Nest packages:** each wraps what the app already
  has, its boundary and its filter, and brings a peer range to keep in
  step (ADR-019).
- **Reporting refusals,** or every error log line: noise, and one
  fault split by the ids in its message.
- **Sentry's default personal data,** the IP address and the user's
  email.
- **Source maps published with the site.** Readable by anyone, and
  wrong once the repository is private.
- **The audit in `scripts/verify.sh`.** Above.
- **Uploading only from `main` as a line in the docs,** with no guard: it
  would be forgotten as it was here.

## Deferred — each with what brings it in

- **Performance tracing.** ADR-051's trigger: the first customer in
  production.
- **A way for a person to describe a fault,** Help's "Report a problem".
  Open decisions, "The operator".
- **A second person reading reports,** which the free plan does not
  allow. Trigger: a second developer or a support person; then
  GlitchTip's hosted plan, whose members are unlimited, or a paid plan.
- **Reports kept in Canada.** A customer who requires it; then a
  self-hosted GlitchTip or Bugsink there.
- **A project per side.** Trigger: one side's reports crowding out the
  other's in the month's 5,000.
- **Check-ins for the hourly jobs.** They do not run while the free web
  service sleeps (`render.md`); trigger: an always-on service.

## Consequences

- Server: the two settings in `env.ts` and `.env.example`; the tracker
  started in `main.ts`; `reportFault` and its scrubbing; the filter, the
  hourly timer and each catch site calling it; `POST /errors`, public,
  in the permission coverage's public list and in `NOT_AUDITED`, with the
  API document and the client's types regenerated; a command, `npm run
  error-tracker:test`, that sends one test report through a site's
  route.
- Client: the reporter, in its own chunk; the boundaries, the root and
  the chunk loader handing it their faults; #244's signed-out boundary;
  hidden source maps and the plugin.
- CI: the audit step. The backup job's summary. `columns.ts`. The pack
  script's guard, with its test. The diagrams' script, its output and
  its check.
- Tests: the scrubbing, with an email, a name, an address and a query
  string going in and none coming out; nothing leaving when the setting
  is unset; the relay's refusals and what it drops; one report for a
  render error and none for a refusal, an `ApiError`, a dropped
  connection or a newer build; #244's crash page in
  `client/e2e/accessibility.spec.ts`.
- No migration. No table or screen for the seeds: nothing to add, said
  in the pull request. No area here has a rules file in `docs/rules/`.
- A person sees one change, #244's crash page before sign-in: its manual
  check, before and after pictures, and the walkthrough. The tracker's
  own checks are the operator's, in a section of `docs/manual-checks.md`.
- Docs: `services.md` and `render.md` (the settings, and the tracker's
  setup by hand); `conventions.md` (faults go through `reportFault`); the
  production-readiness skill's Monitoring; Start here linking the
  diagrams; the handoff.
- After the merge, by hand: the Sentry project, its region and its
  settings; `ERROR_TRACKER_DSN` on the API and the upload's settings on
  the static site; the test report through the live site; a crash page's
  reference found in the tracker; the planning skill packed from `main`,
  uploaded, and `evals.md` walked.
- Build order: this ADR; the skill's fix; dependencies; the inventory;
  the server's reporter; the catch sites; the route; the client's
  reporter; #244; the source maps; #268; #269; #266; the pack script's
  guard; the diagrams; the docs, by the chat; dependencies again; the
  reviews; the as-built, by the chat. Built from `tmp/adr-084/brief.md`,
  a step per prompt, by `/build-from-brief`.

## Amendment (October 2026) — as built (#329)

Built on 30 October 2026 in 47 commits, from `tmp/adr-084/brief.md`.
Where the building differs from the decisions above, or adds to them:

- **No step waited for a date** (Bob, 30 October). Each dependency step
  took what was old enough that day, which was nothing, so the updates
  that come of age from 2 to 6 November move to ADR-085's start: the
  Nest packages at 12.3.x, whose `@nestjs/platform-express` 12.3.2 needs
  multer 2.5.0 itself, so the multer override goes then (ADR-019);
  `typescript-eslint` 8.72.1, `nodemailer` 10.3.1, `@aws-sdk/client-s3`
  3.1160.0, `eslint` 10.14.0, the eight #260 left, and the four
  `@sentry` packages to 11.10.0.
- **The packages.** `@sentry/node`, `@sentry/browser` and
  `@sentry/vite-plugin` at 11.8.0, since a new package waits 14 days
  (`conventions.md`, "Dependencies"); `@sentry/core` too, directly, for
  its address parser; and `raw-body` 3.0.2, already installed through
  Express. Sentry 11 has no `sendDefaultPii`: every `dataCollection`
  option is off, on both sides. Its default kept the process running
  after an uncaught exception, so it is set to strict, and a 0.6 s test
  proves Node still exits.
- **The setting.** A tracker address the SDK cannot read stops startup,
  naming `ERROR_TRACKER_DSN` and never its value, since the value may be
  another secret pasted into the wrong setting; the startup line says
  whether the tracker is on, never its address.
- **Who and where come from the session.** The relay names the user and
  the organization from the request's own session, and sets `side:
  browser`, dropping what the browser sends; the browser's own ids, built
  first, went in the review (finding 5). `reportFault` reads the tenant
  context for the server's own reports.
- **The relay.** One event per envelope; a body of fields of the wrong
  type, a JSON body, or one not the length it declares gets 400; ten
  reports a minute per person or address; nothing parsed while the
  tracker is off.
- **Scrubbing in time with its length.** The review found one anonymous
  report of 150 KB stalled the server for 16 seconds, through the email
  pattern and two database-message patterns, whose time grew with the
  square of the text's length. All three are linear now, and each text
  is cut to 8 KB after scrubbing, never before, so no half-address is
  left; the same report takes about 15 ms.
- **What else reports, and what does not.** A failure caught and only
  logged reports through `reportFault` at 18 places, the password rehash
  among them. A job that keeps failing reports once, then again only
  after a run succeeds. A body the parser refuses is a 4xx, never a
  reported 500, and malformed JSON's message no longer echoes the body.
  The filter's 500 line names the path without its query (#193). In the
  browser: a broken language catalogue or Help guide reports; a dropped
  connection's three messages and an `AbortError` do not, with the SDK's
  rewriting of "Failed to fetch" turned off; faults before the tracker's
  chunk loads are held by two listeners, then sent once.
- **#244 was worse than filed:** a crash before sign-in showed React
  Router's own page, in English with a stack, and reported nothing. The
  signed-out pages have a boundary, and the root route an error page, so
  a crash around any page shows the crash page alone, with Reload and
  "give the reference below to the person who invited you".
- **Source maps** are written only when the upload's token is set;
  Sentry's CLI sends no usage reports (`SENTRY_CLI_NO_TELEMETRY`); the
  release is named in one place for both the reports and the maps; and
  `NODE_ENV=development` on the static site would skip the upload.
- **The riders.** The audit runs after each CI job's tests, so their
  results always show; it found nothing on 30 October, #268's seven
  findings having gone with later updates. The backup's summary (#269)
  has its tests, and a size-change warning that broke the workflow's
  path output now goes to stderr, a bug on `main` before this branch; a
  missing `psql` no longer stops a backup. The diagrams cover 23 areas,
  and `docs/tables/` is treated as Help's guides are. The planning skill
  packs only from `main`, lints its Markdown before sending, and says it
  is for the chat alone.
- **Found and filed:** #328, the API document's enum order following the
  order TypeScript meets a union's values.
- **Measured:** memory at rest the same with the tracker on or off,
  about 326 MiB of the free plan's 512 MB, loading `@sentry/node` costing
  30 MiB; the main chunk 145.36 kB gzipped before, about 145.9 kB after,
  the tracker's own 31.34 kB loading after the first screen.
- **The reviews' 23 findings:** fixed but four. #14 is #328, #17 and #18
  are cosmetic or defensive, and #22 keeps Bob typing `/doctor
  prompt-audit`.
