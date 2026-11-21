# web-app-foundation — handoff, 21 November 2026

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

On 21 November 2026:

- **Movements, ADR-093's second branch,** `adr-093-movements`, from
  `main` at 0ebaac68, planned on 18 and 19 November (R24 to R35, 81a
  to 94a) and built on 19 and 20 November by its brief, v7, in the
  ignored `tmp/adr-093-movements/`: 90 commits and its as-built, draft
  pull request [#655], its CI and its Performance budgets green.
  Movements as a log in the address that reads as a stock card for one
  item, one find box for items, lots and orders, When one menu, the ways
  in with the history dialog gone, the item's latest movements, an
  order's Receipts and [#605]'s label, [#628]'s found stock, the count
  always with Back after Show more, the words (94a) and the riders. The
  reviews found 72; the branch fixed those chosen and the chat's later
  decisions in 60 commits, filed [#646] to [#654], and commented on the
  older issues. Every
  decision, 95a to 143a, each requirement marked, and what was built
  differently are in [ADR-093's as-built](adr/0093-inventory-and-movements.md),
  with ADR-090's amendment (the When menu, the find box, chips that
  wrap) and ADR-051's figures. **Left:** the merge and what follows it
  (Still to do, by hand). Next, [#629] (119a), its decisions in its
  comment.
- **[#632], one 1,600 px page frame and table headers that stay,**
  [ADR-090's amendment](adr/0090-the-design-language.md) of 18
  November, with its as-built: planned and built on 18 November on
  `fix-632-page-frame`, 39 commits with the as-built, merged the same
  night as [#644] (0ebaac68), a merge commit, closing #632 and [#516];
  `main`'s CI passed and it was deployed at 23:57. Every page in one
  1,600 px frame, Home, Your account and Organization at 1,200,
  centred; one shared list table on 22 lists, its header staying under
  the top bar; a table too wide for its box scrolling sideways with its
  name pinned and, while the two take no more than half the box, its
  row's Actions; one height for what stays under the bar. With it:
  #516's burn-in scaled to a run budget, and the planning skill packed
  as a `.skill` file. The reviews found 54 and fixed 18; their issues
  are [#639] to [#642]; filed with them, [#637] (Stock and Reorder at
  1366, columns under the row, `later`), [#638] (a list's count shown
  always, for Movements) and [#643] (Linux WebKit's one flaky test,
  `fix-now`). Its live checks are still owed (Still to do, by hand).
- **The triage after [#644]'s merge,** 18 November, applied: no close
  and no new issue; comments on [#159], [#507], [#561], [#565] and
  [#616], each done in part by #644; [#507]'s 41 ticked; [#530], the
  CI web server's Node abort, its fix still to choose (vite preview,
  Node 24, or a report to Node), and [#643] in the Fix-ups milestone,
  `fix-now`; nothing moved to Movements. 186 open: 23 `fix-now`, 109
  `when-touched` and 54 `later`.
- **The triage of 18 November,** after [#635]'s merge, applied as
  proposed (its choices M and 77a to 80a): [#550] and [#602] closed, 26
  comments, [#607] and [#608] in the Fix-ups milestone, [#604] given its
  kind and [#534] a new `Needs:` line; 180 issues open, 21 `fix-now`,
  103 `when-touched` and 56 `later`. [#636], filed from #635's CI, a
  list's address write starting from the address before the last one,
  is fixed for Stock alone (3db1aa29) and rides with Movements.
  Movements' choices from it are in the claude.ai Project's doc of
  Movements' brief, v6.
- **Inventory and Movements, ADR-093** ([#587]), with
  [its ADR](adr/0093-inventory-and-movements.md): planned on 14
  November in a chat of its own, its requirements confirmed before
  drafting and its decisions chosen as recommended, the canvas's rows
  "库存与库存变动 第一版 · Inventory and Movements v1" and "第二版 · v2". One
  ADR, built as two branches from `main`: `adr-093-inventory`, its
  brief in the ignored `tmp/adr-093-inventory/`; then
  `adr-093-movements`, its brief in `tmp/adr-093-movements/`, started
  after Inventory and [#632] merge. Inventory was built from 15 to 17
  November, 119 commits with its as-built, pull request [#635], merged
  on 18 November as a merge commit (749b2dfc) and deployed,
  `/api/health` saying `apiRevision: 5`:
  one rule for usable stock and one read for a code's figures; Stock as
  a row per code opening to its places and lots, and the Lot view;
  Reorder; the item's Where it stands; Items' stock from the same count
  ([#590]); the old stock routes removed with the API revision at 5;
  and the reviews' fixes, among them a row's Actions in words, receiving
  on its order and a place written as its path. JIT is off for the
  app's connections; every read is inside its budget at small, and the
  nearest at large are on the Watch
  ([ADR-051's as-built](adr/0051-performance.md)). The reviews found 86;
  their issues are [#606] to [#631], with [#605] from the chat. The
  as-built is in [ADR-093](adr/0093-inventory-and-movements.md), each
  requirement marked. Its step 24 was done on 18 November (Still to do,
  by hand).
- **[#531], an item's own name in the organization's language,**
  [ADR-054's amendment](adr/0054-languages.md) of 14 November, with its
  as-built: planned and built on 14 November on `fix-531-base-name`, 36
  commits with the as-built, merged on 15 November as [#595]
  (01df44e), a merge commit, and deployed, Dependabot alerts 11 and 12
  seen fixed. Each organization says which language its
  items are named in, so a required language is met by the items' own
  names, not typed twice; a name kept in that language and the same as
  its own goes, and one that differs is chosen by the Owner in a list,
  never for them. Migration 0081 and two routes, the API revision
  unchanged. With it: the security fix for Dependabot alerts 11 and 12
  ([#446]), ADR-019 amended for its override, the check written into
  the branch's folder ([#571]), and parts of [#282], [#306], [#487],
  [#505] and [#551]. Its reviews found 39 and fixed 24; their issues
  are [#588] to [#594], [#590] waiting for Inventory.
- **The translations,** [ADR-054's amendment](adr/0054-languages.md),
  with its as-built: planned on 12 November and built on 12 and 13
  November on `fix-ups-i18n`, merged on 14 November as [#577]
  (4bcc15c5), a merge commit. No person reads
  French or Chinese, so ChatGPT's wording leads and two checks stand in:
  `scripts/i18n-rules.mjs`, the glossary's words, punctuation, settled
  messages and Chinese spacing, in verify and CI; and a meaning check on
  the API credit, calibrated before it decides. Round 2 and an extra
  round, the guides whole among it, went in through `import`; round 1's
  glossary findings where they still held; a pseudo-language, `en-XA`,
  and a test for cut text at 390 and 320 px; tests read a message by its
  id. Both languages stay beta. The next round exports `--since
  29cf53a7`.
- **Flows and states,**
  [ADR-090's amendment](adr/0090-the-design-language.md), with short ones
  in ADR-087 and ADR-088: planned and built on 11 November on
  `flows-and-states`, 23 commits with the as-built, merged the same day
  as [#568] (cc0beaf8), a merge commit;
  its requirements confirmed before drafting, its decisions chosen as
  recommended, and the as-built marks each. The five
  states and each shared piece's own states drawn once, in the design
  language's States section and the canvas row "状态 第一版 · States
  v1"; the patterns Items' reviews and its as-built handed it, with
  [#170]'s dense rows and [#536]'s adding several in a row; each feature
  asked for a wireflow, an interaction table and its five states; the
  playback in the planning skill; one Settings page designed for
  [#513]; and a code rules file held to 3,000 characters ([#517]). No
  code, API or migration: each screen's build has its issue, [#561] to
  [#567] filed on the branch. With it, `/code-review` checks a branch's
  new clones and its simplicity, and the planning skill closes a session.
- **[#547], the list search's plans,**
  [ADR-051's amendment](adr/0051-performance.md): planned on 10
  November and built on 10 and 11 November on `fix-547-search-plans`,
  19 commits with the as-built, merged on 11 November as [#558]
  (06cff0b4), a merge commit, and deployed; its requirements
  were confirmed before drafting, the playback's first use, and the
  as-built marks each met. A search reads Items' matching variants once,
  for the match, the rank and the counts, where it read them five times:
  141 to 58 ms at large on the Mac, 174 to 111 ms at small on GitHub's
  runners, and the Watch's line closed. The category filter and one
  invoice's PDF join the timed reads, the PDF with a budget of its own,
  1,200 ms, since ten requests queue on the server's one thread, which
  the Watch now keeps. No API change and no migration: [#533], [#546]
  and [#551]'s neighbours do not ride along. With it, Linux WebKit's run
  keeps a failed test's trace ([#521]), and Postgres in Docker gets 256 MB
  of shared memory, on the Mac and on GitHub's runners. The full verify's
  one WebKit miss was the theme's: [#557], a main button's hover in dark
  mode at about 3.7 : 1, `fix-now`, through the fix runner, merged the
  same evening as [#559] and deployed; MC-R103 passed on the live site.
- **[#526]'s first half, a refused document's page,**
  [ADR-071's amendment](adr/0071-documents-as-pdf-drawn-on-the-server.md):
  planned and built on 10 November on `fix-526-refused-document-page`,
  16 commits, merged the same day as [#556] (749cf944), a merge commit;
  the as-built is in the amendment,
  each requirement marked. A PDF link a route refuses answers with a
  short page in the app's language, its status kept, the document's own
  page as the way back and, for a missing name, the item's page as the
  way out; MC-2513 was walked by hand and every browser's run passed.
  With it, [#551]'s item 91, every join of two reads naming the
  organization; and, from the 30-minute look at [#521], which found
  neither memory nor CPU behind Linux WebKit's rare miss, a failed Linux
  run that keeps what Playwright left, which caught its first Linux
  WebKit miss the same evening, a screen still on the boot screen. MC-2513
  found that signing in, from any page of the app, landed on Home, older
  than this branch; sign-in now returns to the page asked for, with a
  browser test. The reviews' tidy-ups are [#555].
- **[#529], each working folder's own databases,**
  [ADR-089's amendment](adr/0089-a-briefs-steps-in-a-row.md): planned and
  built on 10 November on `fix-529-folder-databases`, 14 commits, merged
  the same day as [#554] (3d4fcdb1), a merge commit; the as-built is in
  the amendment, its Linux WebKit line with the third run added on
  [#526]'s branch. Each second folder gets its own dev, test and e2e
  databases from `node scripts/folder-databases.mjs <folder>`, and
  `../waf-fix` has them; the lock is in Postgres's own database; a test
  database ahead of its folder is made again; a folder that shares is
  refused. `../waf-fix` is back on `main`, its runs meeting the main
  folder's at the lock again.
- **Items, ADR-092** ([#476]): planned on 8 and 9 November, its boards
  the canvas's rows "Items v1", "Items v2" and "Items v2: flows and
  states"; built on 9 November on `adr-092-items`, 73 commits, merged on
  10 November as [#532] (3d2eb4a) and deployed, `/api/health` saying
  `apiRevision: 4`; the as-built is in [ADR-092's amendment](adr/0092-items.md).
  It went in squashed, as one commit, by mistake: a feature branch's
  pull request is merged from the terminal with `--merge`. Items holds
  everything the company keeps, by type and category, with its stock
  read from Inventory and several items changed at once; the item's
  page shows each variant's names and what documents will refuse
  ([#526]'s second half, checked on the live site on 10 November: a
  variation's English name added, the order's Print opened the PDF).
  Its reviews found 105 and fixed 53; their issues are [#533] to
  [#551], [#539] and [#547] `fix-now`, and the design language's items
  wait in `tmp/flows-and-states/dl-items.md`.
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
- **Small fixes on the API credit:** the maintainer's API key carries a
  promotional US$100 a month, the current one ending on 9 December 2026
  (UTC), for the API and the Agent SDK but not Claude Code. A runner in
  the ignored `tmp/sdk-fix/` runs `/fix-issue <N>` through the Agent SDK
  in a second working folder: [#514] first, merged on 8 November as
  [#519], for about US$1.70, then [#483] as [#520], for US$1.23. It moved
  into the repository on `fix-runner`, merged on 9 November as [#523]
  (ad3680ac); the as-built is in
  [ADR-089's amendment](adr/0089-a-briefs-steps-in-a-row.md). From the
  main folder, `node scripts/fix-issue/run.mjs <N>`; one lock,
  `scripts/one-at-a-time.mjs`, lets a build and a fix verify at once,
  the second waiting at the parts they share.
- **The router for `/build-from-brief`,** [ADR-089's amendment](adr/0089-a-briefs-steps-in-a-row.md):
  planned on 7 November and built on 7 and 8 November on `build-router`,
  40 commits, merged on 8 November as [#518] (fc6f90d); the as-built is
  in the amendment. Each step runs on
  the model its brief names, from engineering.md's "Which model runs a
  step"; a Sonnet or Haiku step that fails on its own code runs again on
  Opus, once a run; a run shows its plan and checks the branch, the tree
  and Claude Code's version first; each stop prints a short summary with
  its model, minutes and tokens; the reviews run through `/review-step`.
  The loop runs on the session's model, kept on Opus by the Mac's own
  settings file, settings.local.json in `.claude/`, since a skill's
  model holds one turn.
  CI burns in the browser specs a pull request changes. With it:
  Customise Home's review findings 89, 90 and 91, one helper for a
  keyboard drag, Linux WebKit in the full verify, and [#516] and [#517]
  filed. The steps took about half the brief's guessed time.
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
- **The last merges:** on 18 November, [#635] (Inventory, ADR-093) as a
  merge commit (749b2dfc); on 17 November, [#634] ([#633]), the fix
  runner's, squashed (25d31add); on 16 November, [#603] ([#602]'s API
  half), the fix runner's, squashed (c0fa8432), and Dependabot's [#600],
  [#601] and [#599], each as a merge commit; on 15 November, [#597] ([#596]), the fix
  runner's, as a merge commit (ffe298d9), and [#595] ([#531]) as a merge
  commit (01df44e); on 14 November, [#577] (the translations) as a
  merge commit (4bcc15c5); on 13 November, [#572], Dependabot's raise of
  `@hono/node-server` in `scripts/fix-issue/`; on 11 November, [#568]
  (flows and states) as a merge commit (cc0beaf8); before it, [#558] ([#547]) as a merge
  commit, then [#559] ([#557]), the runner's, as a merge commit too
  (c1f7b6d0), by mistake: its branch took `main` in GitHub's conflict
  editor, and a runner's pull request is squashed, with the two lines it
  prints. On 10 November, [#532] (Items), squashed by
  mistake, then [#554] ([#529]) and [#556] ([#526]'s first half), each
  as a merge commit. On 9 November, as a
  merge commit, [#523] (the runner in the repository). On 8 November, as merge commits, [#518] (the
  router), [#519] ([#514]) and [#520] ([#483]), the last two from the
  runner; a runner's pull request is squashed from now on, with the two
  lines it prints. On 7 November, from
  the terminal as a merge commit, [#515] (Customise Home). On 6 November, from the terminal as merge commits,
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
- **Migrations** through 0081 (the items' own language, in [#595]), 82
  files in `server/src/database/migrations/`.
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

- **The translations, before 30 November:** merged on 14 November,
  [#577]. Round 2 was ChatGPT's and Claude's reviews of the export at
  `19e1b7aa` (6 November 2026); the extra round, ChatGPT's, of the export
  at `fe6c7e1d` (12 November); round 1's export was at `b933b912` (22
  October). Their workbooks stay in the ignored `review/`, round 1's data
  in the ignored `tmp/i18n-review/`. [#595]'s 47 messages were drafted in
  French and Chinese with no reviewer, for the next round, and so were
  [#635]'s. The phone checks set aside for the
  reviewer who reads only Chinese stay owed in MC-2406 and MC-2710.
- **Dependabot, from 2 November:** with its 7-day cooldown ([#366]), it
  opens a pull request only for releases already 7 days old, so each
  merges once green, one at a time. [#403] makes Claude Code Review skip
  them, since a run Dependabot starts is refused by the action and gets
  none of the repository's secrets.
- **Dependencies, from 9 November:** `fix-runner` took every update in
  range on 8 November, under the maintainer's one-time exception to the
  7-day rule, Sentry 11.11.0 first as a security fix; rimraf 6.1.4
  closes alert 9 in `server/`. From Items' branch on, the rule is as
  before: each branch takes, package by package, the newest version in
  range that is 7 days old that day. Dependabot alerts 11 and 12
  ([#446]) were taken at once on `fix-531-base-name`, as a security fix:
  eslint 10.15.0, the server's unused `@eslint/eslintrc` removed, and a
  scoped override taking typescript-estree's minimatch to ^11.0.5
  (ADR-019, amended), gone once a typescript-eslint release after
  8.72.2 depends on minimatch ^11: 8.73.0 does, and comes of age on 23
  November at 10:07; every copy is 11.0.5. Inventory's branch took
  `@vitejs/plugin-react` 6.3.0, `typescript-eslint` 8.72.2,
  `@aws-sdk/client-s3` 3.1165.0 and `user-event` 14.6.9, the last three
  on 16 November. [#632]'s branch took vite 8.3.8 and
  `@aws-sdk/client-s3` 3.1167.0, and, by the maintainer's choice on 18
  November, prettier 3.10.1, `@formatjs/cli` 6.19.0 and `user-event`
  14.6.10 hours short of their 7 days, the rule waived for those three
  alone (ADR-090's as-built). Movements' branch took
  `@aws-sdk/client-s3` 3.1168.0 and Nest 12.5.0 (73431f62), then
  `@nestjs/cli` 12.0.13 and `@nestjs/swagger` 12.1.2 (c31352ba), in
  `server/`. `@playwright/test` 1.65.1 was tried on 20 November and not
  taken: it carries 1.65.0's Firefox, and 19 of 159 tests crashed in
  the Linux image; Dependabot skips 1.65.0 and 1.65.1 ([#521]).
  typescript-eslint 8.73.0, of age on 23 November, comes in its own
  pull request, both minimatch overrides removed with it and ADR-019's
  line, once `npm ls minimatch` shows every copy 11.0.5 or later; the
  rest by their days, as Dependabot offers them. Held:
  `@playwright/test` at 1.64.1, pinned, its Firefox 159
  crashing in the Linux image ([#521]); `jsdom` at 30.1.3, pinned, 17
  unit tests failing on 31 ([#522]); TypeScript 7 ([#336]); fontkit 3,
  outside its range.
- **The translation review:** done on 2 November with the API credits,
  against the glossary: the catalogues' findings in [#371] to [#397],
  one area each, and the Help guides' in [#398]. A second pass, for how
  natural the Chinese and the French read, built on the first: its
  findings are comments on those issues, and on five new ones, [#419] to
  [#423], for areas the first pass had none in. All are `fix-now`, one
  batch of the Fix-ups milestone, before 30 November, with the style
  rules the second pass used going into the glossary's Writing
  conventions. Their data stays in the ignored
  `tmp/i18n-review/` on the maintainer's Mac. The cloud credit ended on 4
  November; the API key's credit is US$100 a month (Where things stand).
  Decided on 3 November: every suggestion applied, the natural pass's
  where both passes have one; [#148], [#149] and [#249] riding along.
  The guides' natural-wording pass ran the same evening, for
  US$4.77: 436 findings, in two comments on [#398]. The rest goes into
  ADR-054's amendment, `fix-ups-i18n`'s first commit. One exception to
  every suggestion applied, decided on 10 November: the glossary's words
  from ADR-092 win over a suggestion written before them, Item as
  article and 物品, Product as produit and 商品, and 产品 only in the
  licences' terms, as the comments on [#375], [#382], [#386], [#390],
  [#391], [#395] and [#398] say. On 12 November ADR-054's amendment
  replaced every suggestion applied: the later rounds lead, round 1's
  glossary findings go in only where no later round changed a message,
  and its natural-wording suggestions, the guides' 436 among them, are
  overtaken; the 10 November rule holds for every round.
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
  went in the same evening ([#468], [#469]); from 8 November, picks run on
  the API credit through the runner ([#519] first). Since
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

- **[#655]'s merge,** in this order: its as-built pushed; the pull
  request marked ready (`gh pr ready 655`), Claude Code Review read and
  each finding fixed or filed; MC-319 to MC-324 and MC-409 walked by
  hand; the merge as a merge commit (`gh pr merge 655 --merge`); the
  deploy's checks, `/api/health` saying `apiRevision: 5` and migration
  0082 applied, and `npm run migrate:all` locally with the volume
  databases'; the planning skill packed from `main` and uploaded, since
  the audit's hunks changed it, and its evals walked; the weekly
  Performance run after the merge read for Movements' figures (R35);
  `/triage`; the prune and the clean-up, nothing in
  `tmp/adr-093-movements/` read by a later ADR, since #629's decisions
  are in its comment; Project knowledge re-synced.
- **After [#644]'s merge** ([#632]), on the live site: MC-1565 to
  MC-1575 walked, and Stock scrolled until its header sticks, then
  narrowed until it scrolls sideways, on an Android phone in WeChat, in
  360 or QQ in 极速模式 on Windows and on an iPhone on iOS 16.4 or
  later; each finding a `fix-now` issue. Done on 18 November: every
  browser by hand, the pictures in the pull request's table, #644's
  burn-in summary read for #516, code scanning with none open, the
  merge as a merge commit, the deploy and its checks, the prune and the
  clean-up, Project knowledge re-synced, and `/triage` (Where things
  stand).
- **After [#635]'s merge,** done on 18 November, ADR-093's step 24:
  the every-browser run and the budgets at small on the branch, passing;
  MC-310, MC-316 and MC-317 by hand; the eight pictures in the pull
  request; code scanning, none open; the merge, as a merge commit; the
  deploy's checks, `/api/health` saying `apiRevision: 5` and the new
  Inventory on the live site (MC-3424); the planning skill packed from
  `main` and uploaded; `/triage` (Where things stand); the prune and the
  clean-up, which removed `tmp/adr-093/` before its board copies and
  ADR-091's panel reports were moved, so Movements reads those findings
  from the issues that hold them; Project knowledge re-synced. Still to
  do: the first weekly Performance run to time #635's reads on `main`,
  Monday 23 November, its result read here. Next: [#644]'s merge, then
  Movements' branch; for the fix runner, [#607] and
  [#608], `fix-now` from Inventory's reviews.
- **After [#595]'s merge,** done on 15 November: the merge, as a merge
  commit, from the terminal; Dependabot alerts 11 and 12 seen fixed; the
  deploy; [#596], the account test that read the page while Your access
  loaded, fixed in the test by [#597] (ffe298d9), the page's own fix
  held by [#598], `when-touched`; and `/triage`, 8 comments ([#282],
  [#306], [#487], [#505], [#507], [#551], [#590], [#594]) and [#589]
  into the Fix-ups milestone, [#590]'s handing [#534]'s first half and
  [#570] to ADR-093 with it. Still to do: the deploy's checks, `/api/health`, migration 0081 applied, the items' language
  chosen on the live organization and an invoice issued; the planning
  skill packed from `main` and uploaded, since [#571] changed it, and
  its evals walked; the prune and the clean-up; Project knowledge
  re-synced; and `/triage` over `products`, `invoices`, `documents`,
  `organizations`, `i18n`, `help`, `ui` and `docs`.
- **After [#577]'s merge,** done on 14 November: the merge, as a merge
  commit; round 1's 32 issues closed, each with its comment; the fix
  runner's `--probe`, passed; the prune and the clean-up; Project
  knowledge re-synced; and `/triage` over `i18n`, `help`, `files` and
  `ui`, its choices applied the same day: 11 comments and 6 label
  changes, [#446] made `fix-now` for `fix-531-base-name`, [#573],
  [#575] and [#576] made `later`, each with its `Needs:` line, [#574]
  put in the Fix-ups milestone and [#587] given its `Trigger:` line; no
  close and no new issue. Still to do: one invitation in 中文 and one in
  French to Gmail and to a QQ or 163.com address, each in the inbox with
  today's words (the review's finding 38).
- **After [#568]'s merge,** done on 11 and 12 November: the merge, as a
  merge commit; the prune and the clean-up, `tmp/flows-and-states/` with
  it; Project knowledge re-synced; the planning skill packed from `main`
  and uploaded, its prompt 8 walked by `fix-ups-i18n`'s planning and 9
  at that session's close;
  `/triage` over every open issue, 16 comments, and [#569] and [#570]
  filed; and the reading pass over the clones of 20 lines or more, 10
  extracts into 9 homes and 49 kept, in a comment on [#282].
- **After [#558]'s and [#559]'s merges,** done on 11 November: the
  merges; the prune and the clean-up; Project knowledge re-synced;
  MC-R103 on the live site; and `/triage` over every open issue, its
  choices applied the same day: comments on [#306], [#308] and [#521],
  and [#560] filed, a WebKit flake on `main`'s CI, its report kept in
  the ignored `tmp/flake-43062369884/`. The first weekly Performance
  run on `main` after them, run 199 on 16 November, held all 41
  budgets, the PDF's median 966 ms of its 1,200 (ADR-051's Watch).
- **After [#556]'s merge,** done on 10 November: the merge, as a merge
  commit; the prune and the clean-up; Project knowledge re-synced; and
  `/triage` over every open issue, its choices applied the same day: a
  kind label on each of the 142 that had none, so every open issue has
  one, one kind each for [#162], [#170] and [#310], [#551]'s list brought
  up to date, and comments on [#226] and [#547]. On 11 November, on the
  live site, an order whose item lacks a required name: its Print showed
  the page in the app's language, with the way to the item.
- **After [#554]'s merge,** done on 10 November: the merge, as a merge
  commit; the prune and the clean-up; `../waf-fix` back on `main`, with
  `npm ci` in its `server/` and `client/`; and Project knowledge
  re-synced. Still to do: the runner's next pick proves `../waf-fix`'s
  own databases in use.
- **After [#532]'s merge,** done on 10 November: `stash@{0}`, from
  `fix-ups-ci`, dropped, its one change already on `main`;
  `npm run migrate:all`, `apiRevision: 4` on `/api/health`,
  `tmp/adr-092/from-adr-091/` moved into `tmp/adr-093/` and
  `dl-items.md` into `tmp/flows-and-states/`, the prune and the
  clean-up, the issues posted ([#533] to [#551]), `/auto-mode-setup`
  kept in the maintainer's own settings, Project knowledge re-synced,
  the variation's PDF on the live site; `foundation_perf_large` seeded
  again and timed, all 38 budgets passing, the search at 141 ms on
  [#547] and the category filter 28 to 38 ms; a budgets run on GitHub
  after Items, passing; and `/triage` over every open issue, for this
  merge and [#523]'s: [#128] closed as a duplicate of [#526], 18
  comments, and [#526], [#529], [#531], [#539] and [#547] in the
  Fix-ups milestone.
- **After [#523]'s merge:** `scripts/prune-branches.sh --yes`;
  `scripts/clean-local.sh`, then `--yes`; `tmp/sdk-fix/logs/` moved into
  `tmp/fix-runs/logs/`, and `tmp/sdk-fix/` removed; the planning skill
  packed from `main` and uploaded; `/triage` on docs and ops, [#521] and
  [#522] among them, done in the run over every open issue after [#532];
  after the deploy, one invoice's PDF opened, since pdfmake 0.3.14
  changed a line of the renderer; at the first paid fix, the hook that
  refuses a merge or force-push seen at work, and at the first resume
  its cost checked against the Console. The 30-minute look at [#521] was
  done on 10 November, its figures in its comment and in ADR-071's
  as-built.
- **After [#518]'s merge,** done on 8 November: Claude Code restarted;
  the planning skill packed from `main` and uploaded; and `/triage` over
  all 155 open issues, with no closes and comments on [#446] and [#467].
  Still to do: `evals.md`'s prompt 6, walked when picking the runner's
  fixes; 7 was checked on Items' brief on 9 November. On any new
  machine: `"model": "opus"` in settings.local.json in `.claude/`, that
  file listed in the clone's own exclude file (`.git/info/exclude`), so
  the loop runs on Opus.
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
- **The planning skill's `evals.md`:** prompt 6 when picking the
  runner's fixes; 7 checked on Items' brief on 9 November; 4 still waits
  for a patch that is refused.
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
      router for `/build-from-brief`, ADR-089's amendment, [#518],
      merged on 8 November; then the runner for small fixes on the API
      credit, in the repository, ADR-089's amendment, [#523];
      then Items ([#476]),
      ADR-092: [#532], merged on 10 November; then [#529], each working
      folder's own databases, ADR-089 amended: [#554], merged on 10
      November; then [#526]'s first half, a small branch on the Mac,
      [ADR-071's amendment](adr/0071-documents-as-pdf-drawn-on-the-server.md):
      a refused document opened from a link answers with a readable page
      in the app's language, the links staying plain; with it, [#551]'s
      item 91 and what the 30-minute look at [#521] asked for: [#556];
      then the
      list search's plans ([#547]),
      [ADR-051's amendment](adr/0051-performance.md), merged on 11
      November as [#558]; then flows and states, a docs pull request,
      [ADR-090's amendment](adr/0090-the-design-language.md), planned on
      11 November on `flows-and-states`, with the README's roadmap
      since v0.7.0 (CSV import moved to [#552]), the code's names for
      Items ([#553]'s first part), the playback in the planning skill and
      [#517], merged on 11 November as [#568];
   5. the translations, built on 12 and 13 November on `fix-ups-i18n`,
      [ADR-054's amendment](adr/0054-languages.md) with its as-built,
      merged on 14 November as [#577]: closes [#148], [#149], [#150],
      [#249], [#501] and [#511], with parts of [#486], [#505], [#512]
      and [#548]. Then [#531], an item's own name in the organization's
      language, planned and built on 14 November on `fix-531-base-name`,
      ADR-054's amendment of that day with its as-built, with [#446] and
      [#571], as [#595];
   6. Inventory and Movements, [ADR-093](adr/0093-inventory-and-movements.md),
      the direction [#587]: designed together on 14 November in a chat of
      their own and two canvas rows, then built as two branches,
      Inventory first, each from `main` after the one before merged:
      Inventory as [#635], merged on 18 November; then [#632], one
      1,600 px page frame with table headers that stay, built on 18
      November as [#644], so Movements' boards are drawn in it; then
      Movements, its brief checked against Inventory's as-built and
      #632's at its first step, reading ADR-091's panel's findings from
      the issues that hold them, [#470], [#472], [#459] and [#481], and
      taking [#638] with [#473]'s Back after Show more, [#640], the
      dependencies its Dates name with [#521]'s check, and the
      Performance run of 23 November, built as [#655]; then [#629], a
      lot's code at receipt and lot tracking started for a code with
      stock (119a to 124a); each person choosing their main
      action and More's order, later; then [#310]'s
      nine dialogs with [#295], one shared hook, on the Mac; then Orders,
      built to the design language, its findings from ADR-091's panel,
      [#159] among them;
   7. expired lots: [#333] with [#331] and [#442], a new lot's expiry
      and its batch code; lot labels ([#441], `later`) after it. First
      instead, if real stock goes into the app sooner. Then, decided on
      10 November, demo data from an earlier inventory project through
      the app's own CSV import ([#552]), its own ADR: items, partners,
      locations, then opening stock by lot, the data anonymized and kept
      out of the repository;
   8. the audit log: [#133] with [#168] ([#339] was fixed on 2
      November);
   9. then TypeScript 7 ([#336]).

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
[#128]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/128
[#133]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/133
[#148]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/148
[#149]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/149
[#150]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/150
[#154]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/154
[#155]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/155
[#159]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/159
[#162]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/162
[#165]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/165
[#168]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/168
[#170]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/170
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
[#282]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/282
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
[#306]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/306
[#308]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/308
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
[#375]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/375
[#382]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/382
[#386]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/386
[#390]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/390
[#391]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/391
[#395]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/395
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
[#459]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/459
[#462]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/462
[#463]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/463
[#464]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/464
[#465]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/465
[#466]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/466
[#467]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/467
[#468]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/468
[#469]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/469
[#470]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/470
[#472]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/472
[#473]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/473
[#476]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/476
[#477]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/477
[#478]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/478
[#481]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/481
[#483]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/483
[#486]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/486
[#487]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/487
[#501]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/501
[#505]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/505
[#506]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/506
[#507]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/507
[#511]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/511
[#512]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/512
[#513]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/513
[#514]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/514
[#515]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/515
[#516]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/516
[#517]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/517
[#518]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/518
[#519]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/519
[#520]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/520
[#521]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/521
[#522]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/522
[#523]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/523
[#526]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/526
[#529]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/529
[#530]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/530
[#531]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/531
[#532]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/532
[#533]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/533
[#534]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/534
[#536]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/536
[#539]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/539
[#546]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/546
[#547]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/547
[#548]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/548
[#550]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/550
[#551]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/551
[#552]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/552
[#553]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/553
[#554]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/554
[#555]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/555
[#556]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/556
[#557]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/557
[#558]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/558
[#559]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/559
[#560]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/560
[#561]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/561
[#565]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/565
[#567]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/567
[#568]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/568
[#569]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/569
[#570]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/570
[#571]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/571
[#572]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/572
[#573]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/573
[#574]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/574
[#575]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/575
[#576]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/576
[#577]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/577
[#587]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/587
[#588]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/588
[#589]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/589
[#590]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/590
[#594]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/594
[#595]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/595
[#596]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/596
[#597]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/597
[#598]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/598
[#599]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/599
[#600]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/600
[#601]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/601
[#602]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/602
[#603]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/603
[#604]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/604
[#605]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/605
[#606]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/606
[#607]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/607
[#608]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/608
[#616]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/616
[#628]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/628
[#629]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/629
[#631]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/631
[#632]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/632
[#633]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/633
[#634]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/634
[#635]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/635
[#636]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/636
[#637]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/637
[#638]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/638
[#639]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/639
[#640]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/640
[#642]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/642
[#643]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/643
[#644]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/644
[#646]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/646
[#654]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/654
[#655]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/655
