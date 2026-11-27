---
status: accepted
date: 2026-08-24
areas: [ops]
---

# ADR-008 — Testing scaffolding lands in V1

## Context

Comprehensive coverage is not realistic for a solo build. But the *habit* and
the *harness* are what's expensive to retrofit, not individual tests.

## Decision

Set up the test database, factories, and one passing integration test as
part of the skeleton (step 1). From the first real feature onward, write one integration
test per feature as it's built.

## Consequence

Tenant isolation and permission guards — the two places where a bug is a
security incident — always have a regression test.

## Amendment (November 2026) — CI that can be trusted: no green from a label, a flaky test named (the Fix-ups' first batch)

The Fix-ups' first batch (the handoff's "Still to do, in code", 7.1) fixes
five flaky tests, #183, #232, #233, #248 and #290, with #334 and #342
beside them, so that a green run means the change passed. Two things let a
red result look green. A label's run (#334) skips every job and passes
"CI — all jobs". And Playwright retries a failed test twice on CI, so a
test that fails and then passes leaves the run green, seen only by someone
who reads the report's flaky rows, as #232 and #248 were. The maintainer
chose each decision below as recommended, 2 November 2026; the rounds #342
asks for are ADR-051's amendment of the same day.

**#334's test,** 2 November 2026, on a throwaway pull request (#408): a
commit whose unit test fails on purpose, then the `documentation` label
added. The label's run skipped every job and passed "CI — all jobs"
within a minute; the real run failed "Client — lint, types, unit" and
"CI — all jobs" later, once the server's job had finished. The pull
request's page said "All checks have passed" from the label's run on,
the real run's checks hidden while it ran, and once it had failed the
pull request read `UNSTABLE`: mergeable, the failures in checks the
ruleset does not require. So any label made a red pull request
mergeable.

Checked before drafting, as the working agreements ask, for the areas
production-orders, auth, invitations, mail, ops and ui
(`scripts/adr-check.mjs`; 64 open issues, 32 read whole):

- **Fired, and taken here:**
  - #233 is the second five-second timeout in a test that sets up its
    members by invitation, which the ADR-077 watch it quotes named as its
    trigger: what the fixture spends is measured before any timeout is
    raised.
  - #340 (`when-touched`, ops): the check against `main` fails on every
    new permission, nine lines accepted by hand each time; a false red in
    the same CI.
  - #271 (`when-touched`, ui): `text-size.spec.ts` opens every screen in
    one test of 90 seconds, the timeout risk this batch removes
    elsewhere; split per screen, as `accessibility.spec.ts` was (#231).
  - #253 (`when-touched`, ops): this batch's pull request is the next one
    with code, whose Claude Code Review run the issue waits to read; read
    once the pull request is open.
- **Not fired, and left:**
  - The Deferred lines of the six areas' ADRs: ADR-081's Playwright
    against the built files, ADR-051's load tool and ADR-067's TypeScript
    7 among them; none of their triggers is met.
  - ADR-051's Watch, "Home after ADR-085": its trigger is the median of
    three over budget, which only #342's rounds measure.
  - Open decisions, "A public or a private repository" and "Performance
    budgets": unchanged; ADR-051's three rounds cost no Actions minutes
    while the repository is public.
  - #280 (`later`, invitations): the batch adds no probe that times an
    invitation.
  - #226 (`when-touched`, ops): a plan-check rule with probes and an
    allow-list of its own, larger than this batch.
  - #255, #258 and #324 (auth, mail): the handoff's order puts them with
    #326, since all four change the security emails.
  - #296 and #261 (production-orders): screens this batch does not
    change; #261 has its own place in the handoff's order.
  - #304 and #323: each fixed in a cloud session of its own, merged as
    #406 and #407 on 2 November.
  - Fourteen ui issues, #33, #160, #170, #242, #273, #274, #275, #282,
    #293, #295, #302, #312, #355 and #358: the batch changes ui's tests,
    not its screens.
  - The six areas' other `fix-now` issues, each in its own batch.
- **Found while checking:**
  - #290 is a bug a person can meet, not only a test's race: Plan run
    sends no recipe when the item's recipes have not answered yet, and
    the same, silently, when their read fails, so the run is planned
    without one and release refuses it later.
  - `client/playwright.config.ts` retries twice on CI; the rule in
    `docs/conventions.md`, Tests, says a flaky test is never retried
    automatically to get a pull request green.
  - The API's output is dropped on CI (`stdout` and `stderr` ignored on
    its `webServer`), which #248 needed.
  - The ADR-077 watch item #233 quotes is no longer in `docs/`, so #233
    is its home.
  - `main`'s ruleset named the five jobs, not "Against main — API
    revision, migrations", so that check could fail and a pull request
    still merge; since 2 November it requires "CI — all jobs" alone, as
    ADR-085 planned, with "Commits — no placeholder identity".
  - #295 and #310's dialogs left after its Receive part are one family,
    Chrome's aria-hidden warning in a dialog, noted on #295.

### Decision — every browser by a run started by hand, and no run started by a label (#334)

- **CI no longer runs on `labeled`:** `ci.yml`'s pull request types
  lose it, and its concurrency group and the `changes` job lose their
  clauses for a label.
- **Every browser on a branch is a run by hand,** Actions → CI → Run
  workflow, or `gh workflow run ci.yml --ref <branch>`. It runs every job,
  each browser among them, on the branch's last commit, so its pass is a
  real one; a pull request's own runs are Chromium only.
- **The `full-e2e` label goes,** from `ci.yml` and the docs, and from
  GitHub once the change has merged.
- Proved on the batch's pull request: a label added starts no run, and a
  run by hand runs every browser.

### Decision — a flaky test fails the run, retries kept (Playwright on CI)

- **Two retries stay,** so the report tells a test that fails every time
  from one that passes on a retry.
- **`failOnFlakyTests` on CI** fails a run with a test that passed only
  on a retry, named as flaky; `conventions.md`'s rule then holds as
  written: re-run once by hand, filed as a "Flaky:" issue the same day.
- **Last in the batch,** once its five flakes are fixed, so it does not
  turn every pull request red at once. Locally nothing changes: no
  retries.

### Decision — setup does not wait for mail (#248, #233)

- **The browser suites' `seed()` confirms the owner's address in the
  database,** through the e2e support's `onDatabase`, not by reading the
  confirmation from Mailpit; the tests whose subject is an email still
  read it.
- **The server's `addMember` is measured first** (#233): what each part
  costs under the full suite. What is slow is made cheaper; a timeout is
  raised only where the numbers show the work is needed, with why.

### Decision — a new permission passes the check against main (#340)

- **`scripts/check-api-breaking.sh` lets through
  `response-property-enum-value-added` for a permission's value alone,**
  said once there with why: an open tab asks `useCan` only of the
  permissions it knows. A value added to any other response enum, an
  order's status among them, still fails.
- `Permission` stays a closed union in the client, which `GRANTS`
  relies on to fail the build for a permission without words.
- The `stock.reorder` lines in `server/openapi-breaking-accepted.txt` go,
  as `main` has them (the file's own rule).

### Decision — the batch's rules files: production orders' alone

The batch changes a rule in one area: Plan run waits for the item's
recipes (#290). So it writes `docs/rules/production-orders.md` and
`.claude/rules/production-orders.md`, from the area's code and tests.
Auth, invitations, mail, ops and ui change only in their tests and CI
here; their files come with the one docs pull request of the remaining
rules files, after the fix-ups.

### Considered and not done

- **A new ADR,** ADR-092, or ADR-090 with #338 and #335 renumbered
  again: the flaky fixes are bugs, and the batch's two rules belong to
  the ADRs that hold testing and performance.
- **For #334, the last job reporting the commit's latest run from a
  push:** a lookup through the API inside the one job that must stay
  simple. **A second required check that a label's run never reports:**
  two checks to keep in step where one does.
- **No retries on CI:** each flake would need a re-run to tell it from a
  real failure.
- **Longer timeouts for #233 and #248 before measuring:** each hides its
  cause.
- **#340 by `x-extensible-enum`:** the client's generated `Permission`
  could open up, which `GRANTS` relies on not doing.
- **#290 on the server,** taking the item's active recipe when none is
  sent: the dialog would still plan from a recipe it had not shown.

### Deferred — each with what brings it in

- **The API's output kept on CI,** written to a file and uploaded with
  the report when a job fails. Trigger: a browser test that fails for a
  reason on the server.
- **The `full-e2e` label back, as a switch each push reads:** trigger, a
  branch that needs every browser on every push, not once by hand.

### Consequences

- `ci.yml`, `client/playwright.config.ts`, `scripts/check-api-breaking.sh`
  with `server/openapi-breaking-accepted.txt`, the browser suites' seed,
  the server's member fixture as measured, `text-size.spec.ts`,
  `production.spec.ts`, Plan run's dialog, and `perf.yml` (ADR-051's
  amendment).
- The docs that name the label or the retries change with them:
  `docs/conventions.md`'s Tests, `docs/engineering.md`'s line on a pull
  request opened with the label, and the README's "Which tool, when".
- The build order, in the batch's brief: dependencies; #183; #232; #233;
  #248; #290 with production orders' rules files; #271; #340; #342; #334;
  #304's regression check, which its pull request left out;
  `failOnFlakyTests`; dependencies again; the reviews; the pull request;
  then, by hand, a run of every browser, Performance and the flake hunt
  on the branch; and the as-built.

### As built (#435, 3 November 2026)

Built step by step from a brief, then reviewed; where it differs from the
decisions above, this holds.

- **#183 was neither cause it guessed: a page reload.** With no reload
  the test never failed (0 in 960 runs, under every load tried); with a
  file under `client/src` saved every 2 s, 18 of 120 failed, the fill
  landing before Vite's hot reload and the click after it. The browser
  suite's own client server now runs without hot reload (`VITE_HMR: 'off'`
  in `client/playwright.config.ts`, read by `client/vite.config.ts`), and
  the screenshots suite's too: 0 of 120 with the same saves, and a cold
  start's full suite passing.
- **#232's two frames are proved on CI, not locally:** 0 failures in 240
  Linux WebKit runs before and after. On CI, WebKit's dark Inventory row
  had failed its first try on each of `main`'s last 10 pushes; the run of
  every browser by hand on #435 (41694728934) passed with
  `failOnFlakyTests` on, so no test passed only on a retry.
- **#233: nothing in `addMember` is slow** (36 ms alone, 42 to 47 ms under
  the full suite, its slowest 128 ms), so nothing changed. The likeliest
  cause is a new database connection waiting out the pool's 5-second
  connect limit, the test's own limit; it was not reproduced in 56,031
  connections. #233 stays open as a watch, `later`, with its trigger, and
  #435 refers to it rather than closing it.
- **#248:** with a stand-in Mailpit that lists no test's email, 189 of
  215 failed before and 0 after. `welcome.spec.ts`'s setup now invites by
  link too, the last setup that read an email. A link invitation does
  not confirm an address, so that newcomer's first week reads 0 of 4,
  against 0 of 3 after an emailed link, and its test says so.
- **#290, and Release's read beside it:** with the recipes 1.5 s late, 20
  of 20 runs planned without a recipe before, 0 after. The walkthrough
  found the failure's words gave no next step, so they carry Try again;
  and Release's read of the same recipes had the same fault. Both
  dialogs now read through one `useRecipes`, sharing
  `production.recipesFailed`, and a recipe's yield reads as a list does,
  1,000 rather than 1000.0000. Production orders' rules files say so
  (MC-R82, MC-R86, MC-R87); writing them found 25 findings, filed as #426.
- **#271:** one test per screen; the longest walk test fell from 15.3 s to
  2.4 s. On CI's two workers the spec takes about 4 s longer, since each
  test opens its own page: the split buys room under the timeout, not
  speed.
- **#340:** the check reads oasdiff's changes as JSON and lets through an
  added value of the `Permission` schema: 9 errors before, 0 after, and an
  order status added still fails. The value is read from oasdiff's
  wording, so a new image's wording would fail the check, never pass it;
  a sturdier way is #432. The five other accepted lines `main` already
  had went too.
- **#334, and the run by hand's name.** The review found a run by hand
  skips "Against main", whose job only a pull request runs, yet passed
  "CI — all jobs". So a run by hand's last job is named "CI — every
  browser, by hand": it shows every browser, and only the pull request's
  own run answers the required check. On #435 the run by hand passed and
  never appeared among the pull request's checks, and a label added
  started no run.
- **`failOnFlakyTests`:** a throwaway test failing once then passing
  exited 0 before and 1 after, on CI only. The server's suites retry
  nothing, so the setting is the browser suite's alone.
- **The dependencies:** both early runs fell before 3 November, 05:03, so
  took nothing; step 15 again that morning took Nest 12.3.2, the Nest CLI
  and react-intl, and the multer override went (ADR-019). Three packages
  Nest's update pulled in under 7 days old stayed at their locked
  versions, which every range accepted.
- **The flake hunt runs on `main` alone,** by its own rule, so it runs by
  hand after the merge, not on the branch.
- **Left from the reviews, filed:** #430 (Plan a run's wait gives no
  sign), #431 (a screen's code loading gives none), #432 (the API
  check's sturdier way) and #433 (less motion still starts transitions).
- **Built in a row from step 2, with these stops:** decisions for #183
  and #233; step 8 cut off by the editor closing and run again; `main`
  merged in three times, the branch's regression checks renumbered each
  time.

## Amendment (November 2026) — the browser tests against the built client (#530)

The browser suite has loaded the client from Vite's dev server, on the
Mac and on CI alike: `webServer` in `client/playwright.config.ts` runs
`npm run dev`. Two faults are that server's, not the application's:

- **Node aborts under it (#530).** While Vite's transform middleware
  sends a module as one string of 350 KB to 3 MB, Node stops inside
  `Buffer.byteLength` with "Lazy deopt after a fast API call with return
  value is unsupported", and every test after it is refused its
  connection. By #530's own entries: five times on CI from 9 to 24
  November 2026, on Node 26.13.0 and 26.13.1, two of them on `main`, and
  once on the Mac on 26.12.0, the version #530 first meant to pin. No
  Node 26 has followed 26.13.1.
- **It leaves requests unanswered in Linux WebKit (#643).** In the full
  verify's Linux WebKit run, a page stops on the application's start
  screen: 30 module requests never answered on 20 November, and 19 on
  25 November, with 4 API reads sent through it failing after about
  44 ms. With six workers, four full runs of four failed on 24 and 25
  November; with CI's two (#715), one run of three still did.

So a red run could say nothing about the change, and a stalled Linux
WebKit run was run once more before it counted (`docs/engineering.md`).
ADR-081 had deferred "Playwright against the built files"; this takes
it. The maintainer confirmed the requirements on 25 November 2026 and
chose the decisions below on 25 and 26 November, as recommended.

### Requirements, as confirmed

The maintainer confirmed these on 25 November 2026, before drafting,
with the assumptions, what is not included and the questions' answers.
Each names its step in the brief, and the as-built marks each met,
changed or deferred.

| R | What | Done when | Step |
| --- | --- | --- | --- |
| R1 | Docs first: the handoff tidied with 25 November's facts, and that day's seven lessons in `docs/engineering.md` and the planning skill | The handoff says #717 merged and what is still owed; each lesson has its line; `scripts/verify.sh --docs` passes | 1, 2 |
| R2 | The suite's client is built once a Playwright run, then served by Vite's preview server on 5273, `/api` passed on as today, wherever a run starts: `npm run test:e2e`, a bare `npx playwright test`, CI's three shards and their burn-in, the full verify's suite and its three Linux runs, and the Firefox and Linux WebKit commands by hand | A test finds the application's entry in `/assets/`; a run asks for no `/src/` file | 4 |
| R3 | The tests' build is its own: a folder of its own that git ignores, never `dist/`; the tests' own settings, the © line's holder and the site's address; source maps on | A browser run leaves `dist/` as it was; a production build's files are as before this branch | 4 |
| R4 | An inventory before anything is mended: the suite run once against the built client, each failure listed by its cause | The list is in the step's summary; each item is fixed in a later step or filed | 6, 7 |
| R5 | `en-XA` stays in the browser tests: kept in the tests' build by a setting of its own, at each place `import.meta.env.DEV` guards it today; a production build still refuses it | `cut-text.spec.ts` and `languages.spec.ts` pass against the built client; a production build that carries `en-XA` still stops | 5 |
| R6 | A test that breaks one of the client's own files finds that file in a build: `status-pages.spec.ts`, `accessibility.spec.ts` and `index-html.spec.ts`; and a check keeps a `/src/` path from coming back | The three pass in every engine that runs them; the check fails on a spec that waits for, holds or answers a request by a `/src/` path | 8, 9 |
| R7 | A day's work on one spec keeps the dev server | The command `docs/conventions.md` gives runs one spec against the dev server, hot reload off | 4, 13 |
| R8 | The proof: five Linux WebKit runs of five on a Mac left alone, at six workers; then CI's every-browser run by hand, and the pull request's own run with its burn-in; the suite's minutes before and after | No test stops on the start screen, no request to the client's server goes unanswered and no API read through it fails; the figures are in the as-built | 12, 16 |
| R9 | When the proof holds: the rule to run a stalled Linux WebKit run once more goes; Linux WebKit's workers are measured again and chosen from the figures; `scripts/verify.sh`'s comment and its test, `docs/conventions.md`, `docs/engineering.md` and the README say what the suite runs on | No doc says the suite runs on the dev server; `scripts/check-docs.mjs` passes | 13 |
| R10 | The pull request closes #530 and #643 | Its `Closes` lines; both closed at the merge | 15, 17 |

- **Assumptions:**
  - A1: "once a run" is once a Playwright call, so a full verify builds
    four times and a pull request's shard twice. If step 4 times a build
    over 20 seconds on the Mac, the full verify builds once and its
    three Linux runs reuse it.
  - A2: the decision is this amendment. ADR-081 and ADR-054 each take a
    dated amendment whose heading names no ADR, so no front matter
    changes.
  - A3: no migration and no API change; the API revision stays 7, so no
    tab reloads at the deploy.
  - A4: nothing a person sees changes, so the review step has no
    walkthrough panel and no pictures, no manual check changes, and the
    seeds add nothing, said in the pull request.
  - A5: step 6 breaks a page on purpose and records what the kept trace
    names. If it names only the built file's lines, the as-built says a
    failure is read by running its spec on the dev server.
  - A6: the dependencies taken are those 7 days old on the day; the
    pins on Playwright 1.64.1 (#521) and jsdom 30.1.3 (#522) are kept.
  - A7: the proof's pass rule is written here, before its runs.
  - A8: after the merge, a test stopped on the start screen in any run
    reopens #643.
- **Not included:**
  - N1: the screenshots' server (5373) and the walkthrough panel's stay
    on the dev server.
  - N2: what the host adds, its headers, caching and rewrites, which
    the preview server does not serve; MC-3424 stays by hand.
  - N3: a Node pin, Node 24 for CI's web server, or a report to Node,
    unless the abort returns under the preview server.
  - N4: which specs each engine runs, the retries and the shards.
  - N5: #716, #714 and #693.
  - N6: the API as it ships, built and run by Node alone (Q6).
- **The questions' answers:** Q1a, the built client is the default on
  the Mac and on CI, and one setting, with `npm run test:e2e:ui`, keeps
  the dev server. Q2a, `en-XA` by a setting of its own. Q4a, #718 by its
  own text. Q5a, the proof at six workers. Q6a, the tests' API with no
  watcher, which replaces Q3a, the API left on `npm run start:dev`. Q7a,
  a check against `/src/` paths.

Checked before drafting, for the areas ops, i18n and ui, on 26 November
2026, from `scripts/adr-check.mjs` (100 open issues, 71 read whole):

- **Fired, and taken here:**
  - #530, whole, with the five points of its comment of 25 November.
  - #643: the stall this ends, and #715's two workers, measured again.
  - ADR-081's Deferred, "Playwright against the built files". Its
    trigger reads "a fault the dev server hides"; what fired is a fault
    the dev server makes.
  - `docs/engineering.md`'s rule of 25 November, a stalled Linux WebKit
    run run once more, which names this branch as its end; and its line
    that server files are not edited while Playwright runs against
    `start:dev`.
  - `docs/conventions.md`'s lines on the suite's server without hot
    reload (#183) and on Linux WebKit's two workers.
- **Not fired, and left:**
  - #718 (`fix-now`): by its own text a table measured after the test's
    read, at Larger text in Chromium on CI, not a stop on the start
    screen. The fix runner's, beside this branch (Q4a).
  - #585's 3 (`when-touched`), `cut-text.spec.ts` doing more than it
    needs: the spec is not changed, since `en-XA` stays where it looks.
  - #170's touch check and #565's keyboard test, each a new test:
    `accessibility.spec.ts` changes only in how it breaks a page.
  - #711's third point, `en-XA` met by a walker: the panel keeps the dev
    server (N1), where `en-XA` is meant to be.
  - #253, #226, #645, #656 and #659 (`when-touched`, ops): the review's
    run is read on this pull request, as on each; the plan check, the
    pictures' script, `perf.yml` and the fix runner are not changed.
  - #263 and the other `fix-now` issues of these areas: branches of
    their own.
  - #284, #521, #522, #197 and #142 (`later`): no engine gains a
    workflow (N4), the pins stay (A6) and no header is tested (N2).
  - The other `when-touched` issues of ui and i18n: each is a screen's,
    and no screen changes.
  - This ADR's Deferred, the API's output kept on CI and the `full-e2e`
    label: neither trigger is met. Open decisions: none bears on the
    tests' server.
- **Found while checking:**
  - #530's entries count its aborts two ways: two are headed "second",
    and the last calls 24 November "the first on `main`", where the
    first, on 9 November, was `main`'s too. The dates above are the
    entries' own.
  - The preview server does not take the road that aborts: it sends
    files from disk, with no transform. That is why #530 should end;
    the proof is what shows it.
  - What the proof cannot tell apart: in the full verify the Linux
    browser reaches the Mac through the container's connection, and the
    stall may be that connection under hundreds of small requests as
    well as the dev server. The built client cuts a page's requests to
    a handful either way. Should a stop on the start screen come back,
    the connection is where to look (A8).
  - Three specs name the client's source files, which only the dev
    server serves (R6), and two need `en-XA`, which every build refuses
    today (R5). Neither is among #530's five points.
  - The sign-in page is part of the application's entry in a build, not
    a file of its own (`client/src/App.tsx` imports it), so the test
    that makes it throw cannot swap its file. Its way is chosen after
    the inventory (step 7).
  - Point 3 of #530's plan says source maps let a trace name the
    source's lines. Whether Playwright's trace does so was not
    confirmed, so step 6 looks (A5).

### Decision — the suite's client is built, then served

- Each Playwright run builds the client in a mode of its own, into a
  folder of its own that git, ESLint and Prettier ignore, then serves it
  with `vite preview` on 5273, the port held as the dev server's was.
  `webServer` in `client/playwright.config.ts` starts both, so every
  way a run starts takes it (R2).
- The tests' build is the production build but for four things:
  `en-XA` (below); source maps, served; the build's manifest, its list
  of which file each source became, which the tests read from disk; and
  the tests' own © holder and site address, as the dev server had them.
  React's production code, the catalogues with the parser's stub and
  files named by their content are as they ship.
- The preview server passes `/api` on by the dev server's own proxy
  rule, Vite's default, so the session cookies stay on `localhost` and
  the Linux browsers reach 5273 and 3100 as before.
- A built client is never reused from an earlier run: a server found on
  5273 would serve yesterday's code. Each run builds and starts its own,
  and says so when the port is taken.
- A1's rule decides whether the full verify builds once.

### Decision — one spec at a time keeps the dev server

- One setting in the environment, named by step 4, makes a run start
  the dev server as before, hot reload off (#183): for writing or
  mending a spec, where an edit to the client shows at once.
  `npm run test:e2e:ui` sets it.
- CI and `scripts/verify.sh` never set it, so what passes there has
  loaded built files. A spec passes against the built client before its
  push, in the full verify.

### Decision — `en-XA` by a setting of its own

- `en-XA` is on in `npm run dev` and in the tests' build. One setting
  takes `import.meta.env.DEV`'s place where it guards the
  pseudo-language: `client/src/lib/locales.ts`,
  `client/src/i18n/catalogues.ts`,
  `client/src/i18n/language-provider.tsx`, `client/src/layout/bar.ts`
  and the build's own check in `client/vite.config.ts`.
- A production build neither has it nor offers it, and
  `withoutPseudoLanguage` still stops every build but the tests' whose
  chunks carry it. ADR-054's amendment of the same day says so there.

### Decision — a test that breaks the client's own file finds it in a build

- One helper in `client/e2e/support/` names a built file by its source,
  from the build's manifest: a page's chunk, or the application's entry.
  Under the dev-server setting it names the source's own path, so a
  spec reads the same both ways.
- `status-pages.spec.ts`, `accessibility.spec.ts` and
  `index-html.spec.ts` take it. `new-version.spec.ts` and
  `support/version.ts` say what the built client's `version.json`
  names, in their comments.
- The sign-in page made to throw waits for the inventory (Found while
  checking).
- A check, in the client's lint or its tests, fails when a spec waits
  for, holds or answers a request by a `/src/` path. Comments, and files
  a test reads from disk, are left alone.

### Decision — the tests' API runs with no watcher

- The suite's API starts with `npm run start`: compiled once, with
  nothing restarting it under a run. It replaces Q3a, which left
  `npm run start:dev`.
- Its own commit, after the suite passes on the built client and before
  the proof, so a failure names its cause.
- The screenshots' API keeps `npm run start:dev` (N1).

### Decision — the proof, its pass rule written first

- **On the Mac,** left alone as `docs/engineering.md` asks of a timed
  step: five Linux WebKit runs of the specs every browser runs, at
  Playwright's own six workers, the load under which four runs of four
  failed. Five passes at two workers would prove little: one run in
  three stalled there, so five in a row pass by luck about 13 times in
  100.
- **It passes** with five of five. One test stopped on the start screen
  fails it, with no rerun. Traces are kept for failed tests alone, as
  the full verify keeps them, so the load is the one that failed; any
  failure stops the step for the chat, with its trace.
- **Then the two tests that stalled before,** `document-refusals`' way
  back to the order and `page-frame`'s 1920 × 1080, are run once more
  with their traces kept: no request to the client's server unanswered,
  and no API read through it failed.
- **Then two runs at CI's two workers,** for their minutes beside
  #715's 6.0.
- **Then, on the pushed branch:** CI's every-browser run by hand, once,
  and the pull request's own run with its burn-in, each with no abort.
- **The minutes before and after:** the Chromium suite on the Mac, one
  of CI's shards, and the build's seconds.
- **The workers chosen:** the full verify's Linux WebKit keeps CI's two,
  so a local run and CI's differ in the machine alone, unless two fail
  where six pass; then the choice is the chat's.

### Decision — when the proof holds

- The rule to run a stalled Linux WebKit run once more leaves
  `docs/engineering.md`.
- `scripts/verify.sh`'s comment, which gives the dev server as the
  reason for two workers, and its test's name; `docs/conventions.md`'s
  Tests and Supported browsers; the README's lines on the suite; and
  `.github/workflows/ci.yml`'s comment on how the API starts: each says
  what the suite runs on.
- The pull request closes #530 and #643.

### Decision — what rides along

- The handoff, with 25 November's facts.
- That day's seven lessons, in `docs/engineering.md` and the planning
  skill, which is packed and uploaded again after the merge.
- The dependencies, at the branch's start and before the reviews.
- Not #718 (Q4a).

### Considered and not done

- **A Node pin, Node 24 for CI's web server, or waiting for a Node
  release.** 26.12.0 aborts too; an older Node for one job is a second
  runtime to keep; and none of them touches the stall.
- **The dev server kept as the Mac's default,** CI alone building
  (Q1c): a spec could pass on the Mac and fail on CI.
- **The `en-XA` tests on a dev server of their own** (Q2b): two servers
  a run, one of them the server this leaves. **`en-XA` out of the
  browser tests** (Q2c): `cut-text.spec.ts` would lose its fourth
  language.
- **The API built too, in this branch** (Q6c): neither fault was the
  API's, and two servers changed at once would share one proof.
- **The proof at two workers alone** (Q5b): see the proof.
- **A longer wait after a full page load:** no wait outlasts a request
  that is never answered, as #643's own decision said.
- **The tests' build left unminified,** for readable traces: one more
  way it would differ from what ships.
- **The sign-in page made a file of its own, for its test:** it would
  change what ships for a test's sake.

### Deferred — each with what brings it in

- **The API as it ships:** `nest build`, then Node on the built files.
  Trigger: a browser run that fails on the API's start, or on a
  difference between the two.
- **One build for CI's three shards,** handed over as an artifact.
  Trigger: a shard's build over a minute.
- **The screenshots' and the walkthrough panel's client built.**
  Trigger: an abort or a stall in either.
- **What the host adds, under test:** its headers, caching and
  rewrites. Trigger: a Content-Security-Policy (#142).
- **The very files that ship, tested:** built once and deployed as
  built. Trigger: a fault that comes from a difference between the
  tests' build and the host's.

### Consequences

- No migration and no API change: the revision stays 7. Nothing a
  person sees changes, so no manual check changes and the seeds add
  nothing.
- `client/playwright.config.ts`, `client/vite.config.ts` with its test,
  `client/package.json` and the client's ignore files; the five places
  of `en-XA`; `client/e2e/support/` and four specs; the check against
  `/src/` paths; `scripts/verify.sh` with its test, and
  `.github/workflows/ci.yml`, in their comments.
- `docs/engineering.md`, `docs/conventions.md` and the README change
  with them; ADR-081 and ADR-054 each gain a dated amendment.
- The planning skill changes with the lessons, so it is packed from
  `main` and uploaded after the merge.
- The build order, in the branch's brief: this amendment and the
  handoff; the lessons; dependencies; the tests' build and the preview
  server; `en-XA`'s setting; the inventory, read by the chat; the tests
  that break the client's own files; the check against `/src/` paths;
  the API with no watcher; the proof on the Mac; the docs; dependencies
  again; the reviews; the pull request; CI's every-browser run by hand;
  and the as-built.

## Amendment (November 2026) — as built (#721)

The branch, `fix-530-built-client`, built on 26 November 2026 by its
brief, versions 1 and 2, in the ignored `tmp/fix-530-built-client/`,
from `main` at 8b56ce82, with `main` at e195386e merged in before the
proof: 26 commits and that merge at its push (3f4ef330), then this
as-built, pull request #721. Where building settled or changed the
amendment above:

### The built client's requirements, each marked

| R | Now |
| --- | --- |
| R1 | Met (884dc113, 3198cba7): the handoff and the seven lessons, `scripts/verify.sh --docs` passing before each |
| R2 | Met (b4f79482): `webServer` runs `npm run build:e2e`, then `npm run preview:e2e` on 5273 with `--strictPort`, never reused, so every way a run starts takes it; a server already on 5273 stops the run, saying the port is used. `auth.spec.ts` in Chromium asked the client's server for 59 files, none under `/src/` and 46 under `/assets/`, where the dev server was asked for 554, 335 of them under `/src/` |
| R3 | Changed (b4f79482, 531afcf7): the mode is `e2e` and the folder `client/dist-e2e/`, with source maps and the build's manifest; the tests' build uploads nothing to the error tracker, a token set or not. It differs from a production build by five things, not four: the page that throws on purpose is the fifth (R6). It also sets `NODE_ENV` to `production` itself: the `development` of the repository's `.env`, or CI's `test`, reached the build through Playwright and made it a development build. A production build writes the same files as before the branch, byte for byte once the build's time and the hashes it feeds are set aside, checked at each step that changed the client and after the reviews' fixes |
| R4 | Met (step 6, no commit): on the dev server 800 of 800 passed; on the built client 784 passed and 16 failed, each trace showing no `/src/` request and none left unanswered. By cause: 11 a `/src/` path; 4 the sign-in page, part of the entry; 1 the Customise Home test of `home.spec.ts`, which looked for the dragging library by a file's name, where a build puts it inside Customise Home's own file. Two more passed without testing what they say: the loading mark's, in `index-html.spec.ts`, whose hold matched no request. Step 8 mended all 18; none was filed |
| R5 | Changed (07aa6337, c9f92f88, 1121ed79): the setting is `__DEV_AND_TESTS__`, compiled in by `client/vite.config.ts` and declared in `client/src/dev-and-tests.d.ts`: on in `npm run dev`, in the tests' build and in the component tests, off in every other build. It is not `en-XA`'s alone: the page that throws on purpose shares it (Decided while it was built). It guards `en-XA` at the four places named; `withoutDevAndTests` took `withoutPseudoLanguage`'s place as the build's check, naming each thing a build carries and where. The warning for a missing message keeps `import.meta.env.DEV`. On the built client `languages.spec.ts`' `en-XA` test failed before the setting, and the two specs passed 44 of 44 after; a production build forced to carry `en-XA` stopped, naming the chunks |
| R6 | Changed (531afcf7, f185d42b, 909c646b, 8c75ca6e, 8babfe97, 2f8d738d): four specs, not three, `home.spec.ts` with them. The fixture is `clientFiles`, in `client/e2e/support/client-files.ts`: it holds or refuses a file named by its source, and lists the sources a loaded file holds, from its map. A hold or a refusal that no request met fails its test, naming the file. The sign-in page is made to throw by a page of its own (Decided while it was built). The check is the client's lint, `SOURCE_PATHS` in `client/eslint.config.js`, on in every file of `client/e2e/`, with 16 cases in `client/src/e2e-lint.test.ts`; the two specs put back as they were failed it at their three paths. The changed specs passed five times of five in Chromium and the Mac's WebKit on the built client, and once on the dev server |
| R7 | Met (b4f79482, a96f0487): `E2E_DEV_SERVER=1` starts the dev server as before, hot reload off; `npm run test:e2e:ui` sets it and nothing else does. The command `docs/conventions.md` gives was run as written, 2 of 2 |
| R8 | Met, on a Mac not fully quiet (The proof's figures): five of five, no test stopped on the start screen, every request to the client's server answered in the two traces, and no API read failed but the test's own two refusals; CI's every-browser run by hand and the pull request's own run with its burn-in passed, with no abort. Of the minutes asked, the Chromium suite alone was timed on the built client only, 611 in 4.8 min; the whole suite stands for it, timed both ways |
| R9 | Met (a96f0487): the rule to run a stalled Linux WebKit run once more is gone; the workers stay at CI's two, both runs at two passing; the files named say what the suite runs on, and no doc says the dev server |
| R10 | Met so far: #721's description carries both `Closes` lines; the two issues close at its merge |

### Decided while it was built

- **The sign-in page is made to throw by a page of its own (step 7,
  S1b).** `/throws-on-purpose` draws
  `client/src/errors/throws-on-purpose-page.tsx`, which throws as it
  draws, inside the boundary of the screens before sign-in, in
  `npm run dev` and the tests' build alone. Not chosen: the built entry
  rewritten where its map places the sign-in page, which leans on a
  minified name; and the test kept to the dev server, which the suite
  then never runs. "Considered and not done" above refused a change to
  what ships for a test's sake, and this is none: a production build
  drops the page and its address, where a visitor meets Page not found,
  and the build's check stops one that carries either.
- **The page is drawn by a path check, not by a route (26 November).**
  A route behind the setting kept its slot in a production build's
  route list, 3 bytes, against R3. The reviews' finding 4 asked for the
  route all the same, the chat recommended it, and it was built
  (da40cdcc); the production build then differed, so it was taken back
  (3cbeb4f5), and a comment in the routes list says why (45a28a23).
  The recommendation was wrong: step 8's own summary had said it.
- **One setting for both (the reviews' finding 2).** The page first had
  a setting of its own, which always had `en-XA`'s value, with a second
  check and a second test; c9f92f88 made them one, and 1121ed79 one
  check. "A setting of its own" in the decision above and in ADR-054's
  amendment now reads "one setting, for what is in development and the
  tests alone".
- **`home.spec.ts` joined step 8 (S2a), and a hold that meets no request
  fails (S3a):** shown once with the loading mark's hold pointed at
  Home's chunk, which the sign-in page never loads.
- **Every run builds (A1).** The tests' build takes 1.0 to 1.3 s on the
  Mac through `npm run`, about half a second in Vite itself, so
  `scripts/verify.sh` builds nothing of its own and reuses nothing.
- **The workers stay at CI's two.** Both runs at two passed, so "unless
  two fail where six pass" did not apply.
- **`clientFiles` matches by a pattern, not a function (2f8d738d),** so
  Playwright passes every other request on itself, where a function
  sent each one through the test.

### The proof's figures

On the Mac on 26 November, every run on the built client, the five
under one hold of the suite's lock. Chrome stayed open and macOS's own
services ran, so the Mac was not left alone as the decision asked. More
load makes a stall likelier, so the passes hold; the minutes rest on
the two controls, 10 % apart.

| Run | Workers | Passed | WebKit's minutes |
| --- | --- | --- | --- |
| The Mac's WebKit, the control before | 6 | 181 of 181 | 2.3 |
| Linux WebKit, 1 to 5 | 6 | 181 of 181 each | 2.6, 2.5, 2.5, 2.5, 2.5 |
| The Mac's WebKit, the control after | 6 | 181 of 181 | 2.1 |
| The two tests that stalled before, traces kept | | 2 of 2 | 0.7 |
| Linux WebKit, 6 and 7 | 2 | 181 of 181 each | 4.7, 4.7 |

- **No failure, no flaky test and no retry** in the five; no rerun was
  needed.
- **The two traces:** `document-refusals`' way back to the order asked
  the client's server for 146 files and `page-frame`'s 1920 × 1080 for
  1,913, each one answered. Of 218 API reads through it, two were the
  first test's own refused PDFs (409), and one was cancelled by the
  second test's own next page load, 82 ms later. None failed.
- **On the pushed branch, at 3f4ef330:** CI's every-browser run by
  hand, 45912836889, passed in 12m3s; the pull request's own run,
  45912014404, with its burn-in, in 11m23s; all 15 of #721's checks
  passed. No abort in either.
- **The full verify,** at 3f4ef330: all passed in 25 minutes. Built,
  800 of 800 in 6.5 min; Linux Firefox 181 of 181; Linux WebKit 181 of
  181 at two workers in 4.8 min; Linux Chromium's cut-text 42 of 42.
  The client's unit tests are 1,789 in 220 files, 1,763 before.

The minutes before and after:

| What | The dev server | The built client |
| --- | --- | --- |
| The whole suite on the Mac, 800 tests, one after the other, the Mac busy | 11.1 min | 7.1; later 6.7 and 6.5 |
| Linux WebKit, 181 tests, two workers | 6.0 (#715) | 4.7 and 4.7 |
| Linux WebKit, six workers | about 5 (#715) | 2.5 to 2.6 |
| `auth.spec.ts`, files asked of the client's server | 554 | 59 |
| CI's every-browser run, one each | 16m35s, `main`'s scheduled run | 12m3s, by hand |
| A pull request's three shards on CI | 10m4s, 10m15s, 9m3s (#719) | 10m29s, 11m4s, 9m24s (#721) |

- **CI's shards are not shown faster.** The two pull requests are not
  like for like: each shard's burn-in repeats what its own pull request
  changed, one spec for #719 and, since #721 changes the fixtures every
  spec imports, the whole Chromium suite for #721. A shard also builds
  the client and compiles the API twice now, once for its run and once
  for its burn-in. The first like-for-like figures are `main`'s push
  run after the merge, beside 45868304881's.
- **The build's seconds:** 1.0 to 1.3 through `npm run`, the catalogues
  compiled first; the API's cold compile, 9.8.

### Seen on the dev server while the branch was built

- **#530, a sixth abort on CI, the third on `main`:** run 45868304881,
  on `main` at e195386e on 26 November, shard 3 of 3, 163 tests failed
  after it; the failed job, run again, passed.
- **#643, a second full run stalled at two workers:** on 26 November,
  in the fix runner's folder, two tests stopped on the start screen,
  their kept snapshots holding the application's mark and nothing else.
  With 25 November's, two runs of four at two workers.

### The built client, built differently in small

- The manifest names the application's entry by `index.html`; the
  fixture's `ENTRY` is `src/main.tsx`, and it reads the manifest when a
  test asks, since a built file's name changes with every build, the
  build's time being compiled in.
- The Customise Home test reads each loaded file's sources from its map:
  none holds the dragging library before the press, and one does after.
- The loading mark's built script has no map, so it is its own source.
- `npm run test:e2e:ui` sets the dev-server setting through `dotenv`'s
  `-v`.
- `client/vite.config.test.ts` runs in Node's environment and calls the
  real config, its setup written once (7be380ff).
- `docs/conventions.md` names `clientFiles` and lint's refusal of a
  `/src/` path in its Tests, a clause the brief's list did not have.
- `docs/engineering.md`'s Server says an API already on 3100 is reused
  as it is, so one started by hand with its watcher still restarts.
- Rode along, from the reviews' prompt audit, a commit each:
  `/code-review` checks `Closes #N` for the issues an ADR names too
  (f3414e5f); `/production-readiness` ends with DONE or BLOCKED
  (020b02ba) and reads 14 backup runs, a week of two a day (9f7acd6d);
  the planning skill reads a branch's issues from a clone with its
  history (d5fe0ee4); and a comment in `server/drizzle.config.ts`
  (3f4ef330).
- The dependencies, twice (ebc17eb9, 9a61170e), each package by its own
  publish time, the pins on Playwright and jsdom kept (A6).

### Found by the built client's branch, and left

- **A built trace names only the built file's position (A5),** with
  minified names, and holds no map. The maps in `client/dist-e2e/` give
  the source's line by hand until the next run builds again; CI keeps
  the report alone, so a CI trace cannot be mapped afterwards. A
  failure is read by running its spec on the dev server, as
  `docs/conventions.md` now says.
- **A production build made with `NODE_ENV` as `development` no longer
  stops by accident.** Before, such a build carried `en-XA`, and the
  check for it stopped the build as a side effect. The config still
  drops the `.env` file's `NODE_ENV`, and the tests' build sets its own.
  A check of its own would be a new rule: for the triage after the
  merge.
- **CI compiles the API twice a shard,** about 10 s each on the Mac,
  inside the entry's 120 s.
- **`page-frame.spec.ts`' 1920 × 1080 test is the longest in every
  run,** 25 to 31 s, a floor under the minutes at any number of workers.
- **The lint check misses a `/src/` path built from pieces,** which no
  spec has written.
- **What the proof cannot tell apart stays so:** the dev server and the
  container's connection under hundreds of small requests. A page now
  asks for a handful of files either way (A8).
- **The reviews found 22, none a must-fix.** Fixed: 1 to 3, 5 to 8, 13
  to 15, 18 and 22, a commit each; 4 built and taken back. Left: the
  manifest and each map read again at each call (9, 10), a millisecond
  and some tens of milliseconds a run; a test that already failed
  given the fixture's second line (11), kept, since on a stop at the
  start screen that line says which file never came; three low flags
  of the prompt audit (16, 17, 19); and two in files that are not the
  repository's (20, 21).
- **The steps took about three fifths of the brief's guesses,** step 8
  alone running past its 30-minute stop rule, at 37, with nothing left
  over.

### Deferred, added by the built client's as-built

- **The tests' maps kept with CI's report,** so a CI trace can be read
  to its source. Trigger: a failure on CI that its spec does not show
  on the dev server.
- **A check that a production build is React's production code.**
  Trigger: a second way `NODE_ENV` reaches a build, or the triage
  choosing it.
- **The manifest and the maps read once a run.** Trigger: the fixture's
  reads showing in a spec's time.
