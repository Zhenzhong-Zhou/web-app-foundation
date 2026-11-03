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
