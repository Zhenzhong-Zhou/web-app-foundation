# web-app-foundation — handoff, 7 November 2026

Paste this into a new chat of the claude.ai project where features are
planned ([engineering.md, How code is delivered](engineering.md#how-code-is-delivered)).
Re-sync the project's knowledge, its copy of the repository, from `main`
first, so the new session reads current code.

Status only: where things stand, the dates, and what is still to do by
hand and in code. The history this file held until 27 October 2026 is in
git, `git show 504daab:docs/handoff.md`; what lasts of it is in the ADRs'
as-built amendments, [the working agreements](engineering.md),
[the conventions](conventions.md) and the open issues.

## Where things stand

On 7 November 2026:

- **Customise Home,** decided in ADR-091: planned on 6 November and
  built on 6 and 7 November on `customise-home`, 78 commits, merged on 7
  November as [#515] (807fa43) and deployed the same day; the as-built
  is in [ADR-091's amendment](adr/0091-home-redesigned.md). Tiles and Recently
  opened move and hide, by buttons and by dragging; each person's
  arrangement is kept on their membership; the default order follows
  what their role may do; Orders · Draft, hidden until shown, opens
  Orders oldest first. Its reviews found 92, fixed 53, and filed #507 to
  #514. Its boards are the canvas's row "Customise Home v2" and decisions
  64a's and 81's.
- **The router for `/build-from-brief`,** next, before Items: planned on
  7 November as [ADR-089's amendment](adr/0089-a-briefs-steps-in-a-row.md),
  built on `build-router`. Each step names its model, from a default
  table: Opus for new logic, design, reviews and fixes, browser tests
  among them; Sonnet for dependencies, seeds, guides and docs; Haiku only
  to run a command and report. The loop runs on Sonnet and the reviews
  on Opus, through a new `/review-step`; a Sonnet or Haiku step that
  fails on its code goes again on Opus by itself, once a run; a run shows
  its plan and checks the branch, the tree and Claude Code's version
  first; each stop prints a short summary with its model, minutes and
  tokens; and CI burns in the browser specs a pull request changes. With
  it: Customise Home's review findings 89, 90 and 91, one helper for a
  keyboard drag, Linux WebKit in the full verify, and a seventh prompt in
  the planning skill's `evals.md`.
- **[#506], the test of Home's More menu in Firefox:** merged on 6
  November as 965fdd76 and deployed with [#477] (Deploy run 42279308129),
  `/api/health` and `version.json` naming it with `apiRevision: 3`.
  `main`'s first every-browser run after #477 failed in Firefox on that
  test alone (run 42263826673), the test's fault and not the app's; the
  branch's run of every browser by hand passed, and so did `main`'s run
  after the merge (42277221713).

- **ADR-091, Home redesigned** ([#335]): planned on 4 November and built
  on 5 and 6 November in [#477], merged on 6 November at 7d9af388 with 76
  commits and deployed with [#506]; its as-built is in
  [ADR-091](adr/0091-home-redesigned.md). Home's
  three moments are built to the design language: Getting started and the
  welcome first, then what needs you now, a few large tiles that open
  their lists, and one main action by role, with More. `GET /home`'s
  median on GitHub's runners is 177 ms, so Home's known miss is gone
  ([#276]). The type scale and the corners reach every screen; the lists
  keep their filters and sorts in the address ([#302]); Help is a modal
  sheet on a narrow window ([#272]). The reviews' follow-ups are [#478]
  to [#505], [#505] holding the small ones; `/triage` read its areas
  after the merge and folded nine of them into #505. The reports moved
  into the ignored `tmp/adr-092/from-adr-091/`, which Items' and
  Movements' branches read.

- **ADR-090, the design language** ([#338]): [#465], planned and built on
  4 November, its own docs pull request, its as-built in
  [ADR-090](adr/0090-the-design-language.md): eight principles and
  their patterns, at five width classes, in a design language document
  of their own.
  With no newcomers to test with, a panel of personas walked two
  journeys instead (`/usability-walkthrough panel <journey>`): `home`,
  four personas, 45 findings, and `on-the-road`, a sales rep on a slow
  phone, 17. The reviews found 27 more, 13 fixed on the branch and the
  rest in [#467]. The type is drawn on the canvas in a row of its own, at
  each text size, and 16 px stays for text a person decides by. Home's
  redesign, ADR-091 ([#335]), is built to it.

- **The Fix-ups' first batch, CI that can be trusted:** [#435], merged
  on 3 November as 066f05a1 and deployed the same day (Deploy run
  41714355019), closing [#183], [#232], [#248], [#290], [#271], [#334],
  [#340] and [#342]; its decisions and as-builts in
  [ADR-008](adr/0008-testing-scaffolding-lands-in-v1.md)'s and
  [ADR-051](adr/0051-performance.md)'s amendments. On #435: a run of
  every browser by hand passed with `failOnFlakyTests` on, a label started
  no run, and the first timed run's medians passed (Home 237 ms of 300).
  After the merge, the flake hunt by hand on `main` passed: the client's
  unit tests 5 runs of 5, the server's end-to-end suite 3 of 3 (1,229
  tests). [#233] stays open as a watch. `main`'s ruleset requires "CI —
  all jobs" alone since 2 November, with "Commits — no placeholder
  identity", so "Against main" is required too.
- **The Fix-ups' second batch, the typo lookup** ([#225]): built on
  `fix-225-typo-lookup` in [#449], as
  [ADR-051](adr/0051-performance.md)'s amendment for #225 and #276 and its
  as-built say. Three changes: each pass one statement, the trigram
  indexes led by the organization (migration 0077, `btree_gin`), and the
  orders' partner arm as an array. The second timed run's median was 231
  ms against the 240 ms bar, so #225's known miss is gone; Home's ([#276])
  holds until 31 January 2027, for its redesign. Deployed on 4 November
  (Deploy #95): `btree_gin` 1.3 is on production, backups #72 and #73 ran
  after it, and restore drill #4 restored the first dump holding it.
- **ADR-089, a brief's steps in a row** ([#348]): [#403], merged on 2
  November, its as-built in
  [ADR-089](adr/0089-a-briefs-steps-in-a-row.md). Claude Code's steps of
  a brief now run in a row, each in a `brief-step` subagent, and the
  check before an ADR is `scripts/adr-check.mjs`. Its amendment of 2
  November, [#417], adds `/fix-issue <N>`: a cloud session's prompt is
  that one line. The planning skill was packed from `main` and uploaded
  again after #417.
- **ADR-085, low stock** ([#288]): [#361], merged on 2 November, its
  as-built in [ADR-085](adr/0085-low-stock.md). All its required checks
  passed, with Claude Code Review's expected failure (it skips a pull
  request that changes its own workflow, [#247]). Its merge raised the
  API revision to 2; what it still needs is under Still to do, by hand.
- **ADR-084, an error tracker** ([#287]): [#329] merged and deployed on
  30 October, its as-built in [ADR-084](adr/0084-an-error-tracker.md).
  Sentry was set up the same day, as
  [`render.md`, "The error tracker"](runbooks/render.md#the-error-tracker-adr-084)
  records, and MC-4101, MC-4102 and MC-4105 passed on the live site.
- **The planning skill** ([ADR-088](adr/0088-planning-in-the-chat-as-a-skill.md))
  was uploaded on 30 October. The chat's container holds the copy at
  `/mnt/skills/plugins/plan-feature/`, read only and without `evals.md`;
  each session compares it with `main`'s first. ADR-084's session
  walked `evals.md`'s prompts 1, 2, 3 and 5; 4 waits for a patch that is
  refused. Prompt 2 found the issue command
  printing no issue's text, so the skill's fix rode with ADR-084, and
  the fixed skill was packed from `main` and uploaded again on 30
  October, after [#329]. It differs from `main`'s copy only in the
  quotes claude.ai's upload puts around its description, which
  [#361] added to `main`'s, and since its merge the two match, with no
  upload (checked on 2 November). [#403] and [#417] changed it, so it
  was packed from `main` and uploaded again, last after #417; prompt 2
  passed on 2 November, and 3, 5 and 6 are still to walk.
- **The triage** is done (28 October;
  [engineering.md, Triaging the open issues](engineering.md#triaging-the-open-issues)):
  every open issue has its group and area labels, the `fix-now` ones are
  in the [Fix-ups milestone](https://github.com/Zhenzhong-Zhou/web-app-foundation/milestone/1),
  and [#178]'s hooks are [#293] of their own. [#225] was closed after
  [#186], then reopened on 29 October, when slower runners put the typo
  lookup at 333 to 363 ms. A commit whose message named it after a
  closing word closed it again when that commit reached `main` the same
  day, and it was reopened on 3 November. Since #435 a timed run is three
  rounds judged by their median ([#342]); on 3 November the typo lookup's
  was 248 ms and Home's 237, each under its 300 ms budget, with one round
  in three over it.
- **The last merges:** on 7 November, from the terminal as a merge
  commit, [#515] (Customise Home). On 6 November, from the terminal as merge commits,
  [#477] (ADR-091) and [#506]. On 4 November, from cloud sessions, [#468]
  ([#466]) and [#469] ([#462]), each as a merge commit, since the button
  offered the method used last; a cloud pull request is merged from the
  terminal from now on ([engineering.md](engineering.md#how-code-is-delivered)).
  Before them, after ADR-090's reviews, [#463]
  ([#155]'s last parts, its invoice's moved to [#462]) and [#464] ([#448],
  proved by the plan check in its cloud session); before them, [#450]
  ([#445], on the Mac), and
  from cloud sessions through `/fix-issue`, the cloud credit's last day:
  [#451] ([#312]), [#452] ([#267]), [#453] ([#447]), [#455] ([#214]),
  [#456] ([#432]) and [#457] ([#454], found by ADR-090's `home` panel);
  [#310]'s session stopped for its size, and its nine dialogs are a Mac
  branch of their own. From cloud sessions, 3 November, through
  `/fix-issue`: [#438] ([#355]), [#439] ([#273]), [#440] ([#353]), [#443]
  ([#430]) and [#444] ([#354]); from cloud sessions, 2 and 3 November: [#411]
  ([#212]), [#412] ([#357]), [#413] ([#286]), [#414] ([#311]), [#415]
  ([#279]), [#416] ([#356]'s first part), [#418] ([#358]), [#424]
  ([#315]), [#425] ([#242]), [#427] ([#179]), [#429] ([#428]), [#434]
  ([#125], ADR-035 amended), [#436] ([#165]) and [#437] ([#245], the whole
  app asking a browser not to translate it); [#417] (`/fix-issue`,
  ADR-089 amended, 2 November); [#222], [#256], [#265], [#301], [#309]
  and [#341] closed by hand as fixed by [#361]; [#405], [#406] and [#407]
  ([#310]'s Receive part, [#304] and [#323], from cloud sessions, 2
  November; [#313] closed as fixed by [#361]); [#404] ([#303], 2 November); [#403] (ADR-089, 2 November);
  [#399], [#400] and [#401] ([#359], and [#245]'s
  first two parts, from cloud sessions, 2 November); [#367] to [#370]
  (Dependabot, 2 November); [#366] (Dependabot's 7-day cooldown, 2
  November); [#361] (ADR-085, low stock, 2 November); [#344] (a time
  zone's city after a dash, for British Columbia's new Pacific Time,
  closing [#343], 1 November);
  [#349], [#350] and [#351] ([#294], [#345] and [#346], from cloud
  sessions, 1 November); [#329] (ADR-084, the error tracker, 30
  October), [#327] ([#318], the chat-side planning skill,
  ADR-088, 29 October, deployed; on 30 October its branches pruned and
  `scripts/clean-local.sh` run for the first time), [#325] ([#316], one
  rate limit per person, ADR-011 amended, 29 October), [#317] ([#260],
  product names and search, ADR-056 amended, 29 October), [#291]
  (`docs-start-here`, ADR-086's part 2 and ADR-087, 28 October), [#259]
  (`docs-moves`, ADR-086's part 1, 27 October), [#257] (the emails'
  design, ADR-083, 27 October), [#254] (CI's reliability, closing
  [#252], 26 October), [#251] (the organization's square logo, ADR-060
  amended, 26 October) and [#247] (the brand, ADR-082, 25 October).
- **The release:** v0.7.0, tagged on 16 October 2026; both packages'
  versions are 0.7.0.
- **Migrations** through 0079 (each person's arrangement of Home, in
  [#515]), 80 files in `server/src/database/migrations/`.
- **Render:** a free database (`foundation-db`, created 5 November 2026,
  replacing the first, whose rows all went with it)
  and a free web service, with the static site. Deploy runs from the
  `production` environment, which allows `main` alone and holds both
  deploy hooks (ADR-081; [`render.md`, "Deploys"](runbooks/render.md#deploys-adr-081)).
  The uptime monitor is UptimeRobot's, since 25 October
  ([`services.md`, "In production"](runbooks/services.md#in-production)).
  Since 29 October each limit counts per person, or per the address
  Cloudflare saw, at 100 a minute
  ([`render.md`, "Rate limits and the client's address"](runbooks/render.md#rate-limits-and-the-clients-address-adr-011-amended-316)).
- **Claude Code Review** still rarely runs the plugin's full review
  ([#253]): on #435 it finished in one run and posted, with nothing
  refused, but in 6 turns with Sonnet alone; the reading is on #253.

## Dates

- **The second translation review,** in ChatGPT, one chat per language:
  on the workbooks `node scripts/i18n-review.mjs export` wrote at
  `19e1b7aa` (6 November 2026, 08:38), the Chinese done on 7 November
  and saved beside the export as `zh-Hans.reviewed.xlsx`, the French in a
  chat of its own next. The reviewer who reads only Chinese checks
  the Chinese corrections before `import`; the next round is only what
  changed, `node scripts/i18n-review.mjs export --since 19e1b7aa`, and the
  corrections go into the translations' fix-up. The first round's export
  was at `b933b912` (22 October 2026). For the same reviewer: 头像 for the profile
  picture everywhere, since Your account says 照片 while Home says 头像.
  With them, ADR-083's two questions: whether Panivo in a Chinese email
  reads out of place beside 品桥 in the app (ADR-082's trigger for the
  name by language in emails), and the invitation email's
  有效期到2026年11月3日结束, with no space where the page writes 到 2026年.
  And, on a phone: the close dialog (MC-2406), Roles and the role editor
  in 中文, 品牌, product photos, 同事, and 编号 (MC-2710).
- **Dependabot, from 2 November:** with its 7-day cooldown ([#366]), it
  opens a pull request only for releases already 7 days old, so each
  merges once green, one at a time. [#403] makes Claude Code Review skip
  them, since a run Dependabot starts is refused by the action and gets
  none of the repository's secrets.
- **6 to 12 November:** what Dependabot has not opened comes of age; the
  next branch's dependency step takes, package by package, the newest
  version in range that is 7 days old that day (engineering.md, since 6
  November). Customise Home's branch took eslint 10.14.0, the Sentry
  packages at 11.10.0 and `@smithy/core` 3.38.1 on 6 November, and
  `@dnd-kit/react` 0.5.3 by the maintainer's exception. Of age and
  waiting, in Vancouver time: the formatjs packages on 7 November;
  globals on 8 November; `@nestjs/swagger`, vitest, `@vitejs/plugin-react`
  and argon2 0.45.2 on 9 November, argon2's `allowScripts` entry in
  `server/package.json` changed to 0.45.2 with it; rimraf on 10 November;
  the Nest packages at 12.3.3, `@nestjs/config` 12.1.0 and vite on 11
  November; the Sentry packages at 11.11.0, which close alert 9,
  `@playwright/test` 1.65.0, after which `npx playwright install`, and
  msw on 12 November. `@aws-sdk/client-s3` publishes almost daily, so only
  its newest version of age is ever taken. Dependabot's alerts 9, 11 and
  12 wait for their upstreams ([#446]).
- **The translation review:** done on 2 November with the API credits,
  against the glossary: the catalogues' findings in [#371] to [#397],
  one area each, and the Help guides' in [#398]. A second pass, for how
  natural the Chinese and the French read, built on the first: its
  findings are comments on those issues, and on five new ones, [#419] to
  [#423], for areas the first pass had none in. All are `fix-now`, one
  batch of the Fix-ups milestone, before 30 November, with the style
  rules the second pass used going into the glossary's Writing
  conventions; the reviewer who reads only Chinese checks only the first
  screens a newcomer sees. Their data stays in the ignored
  `tmp/i18n-review/` on the maintainer's Mac. The cloud credit ended on 4
  November; the API credits, about US$80 left, last until 9 November.
  Decided on 3 November: every suggestion applied, the natural pass's
  where both passes have one, with a workbook of the Chinese changes for
  the maintainer to clear any rejected; [#148], [#149] and [#249] riding
  along. The guides' natural-wording pass ran the same evening, for
  US$4.77: 436 findings, in two comments on [#398]. The rest goes into
  ADR-054's amendment, `fix-ups-i18n`'s first commit.
- **31 January 2027:** Home's known miss ([#276]) ends, moved from 30
  November for its redesign: ADR-091 ([#335]) must bring Home within its
  budget, with the same headroom, and remove it.
- **Cloud sessions:** what they taught is in the working agreements,
  "Cloud sessions" under
  [How code is delivered](engineering.md#how-code-is-delivered). On 2
  November: Dependabot's cooldown ([#366]); [#359]; [#245]'s first two
  parts; then [#303], widened to every item picker, [#339], [#310]'s
  Receive part, [#304] and [#323], each merged; [#310]'s other dialogs
  are listed on the issue. On 2 and 3 November, nineteen more, the last
  thirteen through `/fix-issue` (The last merges, above); on 4 November,
  eight more. The cloud credit ended on 4 November. [#466] and [#462]
  went in the same evening ([#468], [#469]); no pick is chosen yet. Since
  ADR-090 a pick
  comes from an export of the issues, and one that names more than about
  five files goes to the Mac.
- **About 3 December:** replace Render's free database before it expires
  on 5 December, by
  [`render.md`, "Replacing the database"](runbooks/render.md#replacing-the-database),
  warning anyone besides the maintainer who uses the app; Render deletes it about 19
  December. Record the new dates here. A free Render database lasts 30
  days, so until a paid one this comes back monthly; Neon and Supabase
  are free candidates for the replacement.

## Still to do, by hand

- **After Customise Home's merge** ([#515]), still to do: a tab left
  open across the deploy keeps working, and a reload shows Customise
  Home; a drag on an older iPhone, iOS 16.4 to 16.7, with no Popover API;
  Android WeChat in 中文, by touch; and a phone held sideways in
  Customise Home, Reset and Done reachable. Done on 7 November: the
  deploy's checks, `npm run migrate:all` on the Mac for migrations 0078
  and 0079, the clean-up, the planning skill packed from `main` and
  uploaded, and `/triage` over all 154 open issues, its choices applied
  the same day.
- **The small volume database's manifest,** ignored, was overwritten on
  7 November: seed it again, or rebuild the manifest, before the next
  small timed run on the Mac.
- **After [#477]'s merge,** still to do: Home on a phone held sideways,
  about 844 × 390, the main action, what is late and the first tiles
  reachable; Home in WeChat or 360 in 中文, two columns of tiles and the
  top bar's words; and ADR-091's test with whoever can be found, fifteen
  minutes on the live site. Done on 6 November: the deploy's checks, an
  old tab offering the reload, the planning skill packed from `main` and
  uploaded, and the panel's reports moved before
  `scripts/clean-local.sh --yes`.
- **After [#361]'s merge,** in this order:
  - MC-3424's third tab, where one was left on Home across the deploy:
    it shows one banner, and one Reload brings Home back;
  - MC-4201 on the live site with a test item, set up again on the
    database of 5 November: one notice in the bell within the hour while
    the service is awake; then remove the point.
- **The planning skill's `evals.md`:** prompt 6, now that the upload
  after Customise Home's merge is done; prompt 7 after the router's
  upload; 4 still waits for a patch that is refused.
- **[#245] in Safari and Edge, once deployed:** the page asked to translate
  into Chinese stays as written, a typed field included; WebKit and
  Firefox have known gaps with fields. What changes is filed.
- **Owed since 31 October:** the web service's memory on Render's
  Metrics, a day with the tracker on; the review measured about 326 MiB at rest, of the
  free plan's 512 MB.
- **MC-4001 across two networks,** owed from [#325]'s deploy: on 29
  October an office network without IPv6 reached Cloudflare as one
  address both times, so it could not show two counters. MC-4002 and
  MC-4003 passed, and `RATE_LIMIT_MAX` is 100
  ([`render.md`, "Rate limits and the client's address"](runbooks/render.md#rate-limits-and-the-clients-address-adr-011-amended-316)).
- **Confirm `RATE_LIMIT_AUTH_MAX` is gone** from the API's Environment
  page on Render. `render.md` records it deleted on 29 October; one left
  behind does nothing, since the settings check drops names it does not
  declare (ADR-011's as-built).
- **Lighthouse on the live site, and the site reached from China,**
  before the first paying customer (`/production-readiness`'s H5 and H6,
  #317's review).
- **`foundation_perf_large` kept migrated** for [#226]: `npm run
  migrate:all` does not reach it, so after each new migration run `npm run
  migrate` against it, as [`server/perf/README.md`](../server/perf/README.md)
  makes it.
- **The maintainer's general preferences** into claude.ai's Settings:
  what holds in any project, since this repository's routine is the planning
  skill's (ADR-088).
- **Project knowledge** slimmed to `docs/`, `README.md`, `CLAUDE.md` and
  `.claude/`, and re-synced after each docs PR.
- **A healthchecks.io check** as `BACKUP_HEALTHCHECK_URL`
  ([`services.md`](runbooks/services.md)).
- **The backup key's two copies** confirmed.
- **Backups to R2** (`BACKUP_DESTINATION=s3`) confirmed live: recorded as
  live since 7 October, so check the Backup runs before redoing anything.

## Still to do, in code

The order (27 October 2026, revised 1 November), each item a pull
request or a set of them:

1. **`docs-start-here`,** [#291]: merged 28 October.
2. **Triage:** done 28 October (above).
3. **[#260], product names and search** (ADR-056 amended): [#317],
   merged 29 October. Then [#316], the rate limit keyed on the person,
   with `/triage` riding along: [#325], merged 29 October. Then the
   chat-side planning skill ([#318], ADR-088), a docs PR, its source
   kept in this repository (29 October 2026): [#327], merged 29
   October; the skill uploaded on 30 October (above).
4. **ADR-084, an error tracker** ([#287]): [#329], merged 30 October,
   closing [#244], [#266], [#268] and [#269] beside [#287]; live and
   checked the same day.
5. **ADR-085, low stock** ([#288]): [#361], with its riders, as its
   as-built in [ADR-085](adr/0085-low-stock.md) says.
6. **ADR-089** ([#348]): [#403], merged 2 November, as its as-built
   says, and [#417], `/fix-issue`; the multer override went with
   `fix-ups-ci`'s dependency step.
7. **The fix-ups,** the Fix-ups milestone, each batch writing its areas'
   rules files, in this order (revised on 4 November 2026):
   1. CI that can be trusted: [#435], as ADR-008's and ADR-051's
      as-builts say;
   2. the typo lookup: [#449], as ADR-051's as-built says; Home's miss
      ([#276]) moved to 31 January 2027, for ADR-091;
   3. the design language ([#338], ADR-090): [#465], a docs pull
      request, as its as-built says;
   4. Home redesigned ([#335], ADR-091): [#477], merged on 6 November;
      then Customise Home, merged on 7 November ([#515]); then the
      router for `/build-from-brief`, ADR-089's amendment, on
      `build-router`;
      then Items ([#476]),
      ADR-092 with canvas boards first, the page and the menu named Items
      · Articles · 物品, Products · 商品 the goods tab; then Movements
      ([#470]), ADR-093, right after, with Inventory's findings from
      ADR-091's panel, the two branches back to back; each person
      choosing their main action and More's order, later; then [#310]'s
      nine dialogs with [#295], one shared hook, on the Mac;
   5. the translations, before 30 November: first a second review by
      ChatGPT on the website, one chat per language, on the workbooks
      `node scripts/i18n-review.mjs export` writes, the reviewer who reads
      only Chinese checking the Chinese before `import`; a pseudo-locale
      and a browser check for cut text in French and Chinese; then [#371]
      to [#398] and [#419] to [#423], each with the natural-wording pass's
      comment, the style
      rules into the glossary, the corrections of the reviewer who reads
      only Chinese, ADR-090's rule for Chinese beside Latin letters, and
      [#148], [#149] and [#249]; then Orders, built to the design
      language, its findings from ADR-091's panel, [#159] among them;
   6. expired lots: [#333] with [#331] and [#442], a new lot's expiry
      and its batch code; lot labels ([#441], `later`) after it. First
      instead, if real stock goes into the app sooner;
   7. the audit log: [#133] with [#168] ([#339] was fixed on 2
      November);
   8. then TypeScript 7 ([#336]).

   Then [#261] with [#154] and [#150]; [#263]'s rest with [#198];
   [#264]; [#426], production orders' rules file's findings; and [#255]
   with [#258], [#324] and [#326], since all four
   change the security emails' lines and their text parts
   (`npm run mail:text -- --update`).
8. **One docs PR for the remaining rules files,** then **the review of
   the whole app**, once, after the fix-ups, so it judges the app with the
   known issues fixed and finds what nobody has filed:
   `/production-readiness` with its device pass (deploys, backups and a
   restore tried, security, performance, email, support, browsers and
   China, tablets and foldables, the iPhone Duo closed and open, a phone
   held sideways); its email section reports DMARC's `p=none` as
   deferred, by decision, until the first paying customer. With it:
   - targeted reviews, report only, of `server/src/core/files`,
     `server/src/modules/invoices` and `server/src/core/auth`;
   - the walks owed: ADR-073's, MC-2701 to MC-2713; before v0.7.0's,
     sections 23 and 24 (MC-2301 to MC-2303, MC-2401 to MC-2405), the
     French and Chinese wording read by someone fluent (MC-1405), and
     `docs/principles.md` edited until it reads as the maintainer's; ADR-082's on
     the live site, MC-3501 on an iPhone and an Android home screen,
     MC-3504 and MC-3505;
   - the manual checks due: MC-2601 to MC-2610, MC-R13 and MC-R14
     (ADR-072); MC-2501 to MC-2512 and MC-R12 (ADR-071); MC-1601 and
     MC-1602, MC-1701 to MC-1703, MC-1801, MC-1901, MC-2001, MC-2101,
     MC-2201, MC-1558 and MC-1559.

   Then one round for its findings.
9. **New features,** in this order unless a trigger brings one forward:
   one person in two organizations, then a practice organization
   (ADR-077, *Deferred*); a public demo, plans and billing, and the
   operator's console and support access, each with its entry in Open
   decisions; returns to suppliers ([#262]); stock by site or warehouse,
   and a summary by location ([#409]); a partner's history and when
   a customer will order next ([#300]); and special prices with a
   quantity limit ([#298]).

Later: `/release` at the next tag ([#320]); `/file-issue`, or GitHub's
issue templates ([#319]); labels as code, a labels file in `.github/`
synced by a free Action, with a check that each area in `AREAS` has its
label; the support playbook with the operator's console; and last, the
starter kit ([#321]): the process kit and engineering defaults,
`/code-review` rewritten as a general skill, and the general skills in a
repository of their own, installed as a versioned plugin, never copied
into `~/.claude/skills/`.

## Waiting on a trigger

Not repeated here; each list has one home:

- **The ADRs' *Deferred* sections,** each item with what brings it in,
  found by area through [the index](adr/README.md#by-area); and
  [ADR-051's *Watch*](adr/0051-performance.md#watch-each-with-its-trigger).
- **[Open decisions](adr/open-decisions.md),** each raised and not yet
  decided.
- **The open issues:** `gh issue list --state open --limit 500`, and the
  three label queries in
  [engineering.md, Issues and labels](engineering.md#issues-and-labels).
- **Before any real customer's data:**
  [`render.md`, "Before real customers' data"](runbooks/render.md#before-real-customers-data),
  and [Open decisions, "A security review before real customers"](adr/open-decisions.md#a-security-review-before-real-customers).

[#125]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/125
[#133]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/133
[#148]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/148
[#149]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/149
[#150]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/150
[#154]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/154
[#155]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/155
[#159]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/159
[#165]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/165
[#168]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/168
[#178]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/178
[#179]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/179
[#183]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/183
[#186]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/186
[#198]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/198
[#212]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/212
[#214]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/214
[#222]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/222
[#225]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/225
[#226]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/226
[#232]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/232
[#233]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/233
[#242]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/242
[#244]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/244
[#245]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/245
[#247]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/247
[#248]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/248
[#249]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/249
[#251]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/251
[#252]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/252
[#253]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/253
[#254]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/254
[#255]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/255
[#256]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/256
[#257]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/257
[#258]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/258
[#259]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/259
[#260]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/260
[#261]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/261
[#262]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/262
[#263]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/263
[#264]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/264
[#265]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/265
[#266]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/266
[#267]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/267
[#268]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/268
[#269]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/269
[#271]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/271
[#272]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/272
[#273]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/273
[#276]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/276
[#279]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/279
[#286]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/286
[#287]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/287
[#288]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/288
[#290]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/290
[#291]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/291
[#293]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/293
[#294]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/294
[#295]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/295
[#298]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/298
[#300]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/300
[#301]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/301
[#302]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/302
[#303]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/303
[#304]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/304
[#309]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/309
[#310]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/310
[#311]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/311
[#312]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/312
[#313]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/313
[#315]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/315
[#316]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/316
[#317]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/317
[#318]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/318
[#319]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/319
[#320]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/320
[#321]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/321
[#323]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/323
[#324]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/324
[#325]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/325
[#326]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/326
[#327]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/327
[#329]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/329
[#331]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/331
[#333]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/333
[#334]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/334
[#335]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/335
[#336]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/336
[#338]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/338
[#339]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/339
[#340]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/340
[#341]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/341
[#342]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/342
[#343]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/343
[#344]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/344
[#345]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/345
[#346]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/346
[#348]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/348
[#349]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/349
[#350]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/350
[#351]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/351
[#353]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/353
[#354]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/354
[#355]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/355
[#356]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/356
[#357]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/357
[#358]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/358
[#359]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/359
[#361]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/361
[#366]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/366
[#367]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/367
[#370]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/370
[#371]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/371
[#397]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/397
[#398]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/398
[#399]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/399
[#400]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/400
[#401]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/401
[#403]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/403
[#404]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/404
[#405]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/405
[#406]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/406
[#407]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/407
[#409]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/409
[#411]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/411
[#412]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/412
[#413]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/413
[#414]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/414
[#415]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/415
[#416]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/416
[#417]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/417
[#418]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/418
[#419]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/419
[#423]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/423
[#424]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/424
[#425]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/425
[#426]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/426
[#427]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/427
[#428]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/428
[#429]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/429
[#430]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/430
[#432]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/432
[#434]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/434
[#435]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/435
[#436]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/436
[#437]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/437
[#438]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/438
[#439]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/439
[#440]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/440
[#441]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/441
[#442]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/442
[#443]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/443
[#444]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/444
[#445]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/445
[#446]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/446
[#447]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/447
[#448]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/448
[#449]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/449
[#450]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/450
[#451]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/451
[#452]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/452
[#453]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/453
[#454]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/454
[#455]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/455
[#456]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/456
[#457]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/457
[#462]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/462
[#463]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/463
[#464]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/464
[#465]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/465
[#466]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/466
[#467]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/467
[#468]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/468
[#469]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/469
[#470]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/470
[#476]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/476
[#477]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/477
[#478]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/478
[#505]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/505
[#506]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/506
[#515]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/515
