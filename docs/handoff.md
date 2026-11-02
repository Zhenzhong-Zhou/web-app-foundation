# web-app-foundation — handoff, 2 November 2026

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

On 2 November 2026:

- **ADR-089, a brief's steps in a row** ([#348]): its branch is being
  built, [ADR-089](adr/0089-a-briefs-steps-in-a-row.md) first, by the
  order in its Consequences. Its dependency step waits for Dependabot's
  open pull requests (Dates).
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
  upload (checked on 2 November).
- **The triage** is done (28 October;
  [engineering.md, Triaging the open issues](engineering.md#triaging-the-open-issues)):
  every open issue has its group and area labels, the `fix-now` ones are
  in the [Fix-ups milestone](https://github.com/Zhenzhong-Zhou/web-app-foundation/milestone/1),
  and [#178]'s hooks are [#293] of their own. [#225] was closed after
  [#186], then reopened on 29 October, when slower runners put the typo
  lookup at 333 to 363 ms; it and [#276] carry known misses until 30
  November. Since 1 November, timings on GitHub's runners are judged by
  the median of three runs, as they vary by about 30% run to run
  ([#342]).
- **The last merges:** [#366] (Dependabot's 7-day cooldown, 2
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
- **Migrations** through 0076 (the reorder points', in [#361]), 77 files
  in `server/src/database/migrations/`.
- **Render:** a free database (`foundation-db`, created 22 October 2026)
  and a free web service, with the static site. Deploy runs from the
  `production` environment, which allows `main` alone and holds both
  deploy hooks (ADR-081; [`render.md`, "Deploys"](runbooks/render.md#deploys-adr-081)).
  The uptime monitor is UptimeRobot's, since 25 October
  ([`services.md`, "In production"](runbooks/services.md#in-production)).
  Since 29 October each limit counts per person, or per the address
  Cloudflare saw, at 100 a minute
  ([`render.md`, "Rate limits and the client's address"](runbooks/render.md#rate-limits-and-the-clients-address-adr-011-amended-316)).
- **Claude Code Review** still rarely runs the plugin's full review
  ([#253]); [#361] lets it read a large diff a path at a time, first
  seen on the next code pull request.

## Dates

- **Since 29 October:** ask whether the corrections of the reviewer who
  reads only Chinese are back. The export was made at `b933b912` (22
  October 2026); once it is imported, the next round is only what
  changed, `node scripts/i18n-review.mjs export --since b933b912`, and the
  corrections go into a fix-up. The first note: 头像 for the profile
  picture everywhere, since Your account says 照片 while Home says 头像.
  With them, ADR-083's two questions: whether Panivo in a Chinese email
  reads out of place beside 品桥 in the app (ADR-082's trigger for the
  name by language in emails), and the invitation email's
  有效期到2026年11月3日结束, with no space where the page writes 到 2026年.
  And, on a phone: the close dialog (MC-2406), Roles and the role editor
  in 中文, 品牌, product photos, 同事, and 编号 (MC-2710).
- **Dependabot, from 2 November:** with its 7-day cooldown ([#366]), it
  opens a pull request only for releases already 7 days old, so each
  merges once green, one at a time; [#367] to [#370] replaced the four
  opened before it. Claude Code Review fails on them, since a run
  Dependabot starts gets none of the repository's secrets, until
  ADR-089's branch makes it skip them.
- **3 to 8 November:** what Dependabot has not opened comes of age; the
  next dependency step takes what is 7 days old that day. In Vancouver
  time: the Nest packages at 12.3.2 on 3 November, 05:03, when the multer
  override goes (ADR-019), in ADR-089's dependency step once [#367] to
  [#370] have merged; react-intl and react-router-dom by 3 November,
  14:14; `@types/node` and dotenv-cli by 4 November, 13:26; nodemailer on
  5 November; eslint and `@aws-sdk/client-s3` on 6 November; the formatjs
  packages on 7 November; globals on 8 November.
- **By 4 November:** the API credits end about 5 November, so the
  translation review (the French and Chinese catalogues against the
  glossary) runs before then: a script run once on the maintainer's Mac,
  kept in the ignored tmp/ folder, its findings filed as issues by area,
  labelled `needs-triage`. The cloud credit ends in early November
  too: cloud sessions take small issues in files no open branch
  changes, and their pull requests are squashed and merged, so each lands
  on `main` as one commit GitHub signs.
- **30 November:** the known misses for the typo lookup ([#225]) and Home
  ([#276]) end; fixed by then, or decided again.
- **Cloud sessions:** what they taught is in the working agreements,
  "Cloud sessions" under
  [How code is delivered](engineering.md#how-code-is-delivered). On 2
  November: Dependabot's cooldown ([#366]), [#359], and [#245]'s first
  part, its other places listed on the issue.
- **About 19 November:** replace Render's free database before it expires
  on 21 November, by
  [`render.md`, "Replacing the database"](runbooks/render.md#replacing-the-database),
  warning anyone besides the maintainer who uses the app; Render deletes it about 5
  December. Record the new dates here. A free Render database lasts 30
  days, so until a paid one this comes back monthly; Neon and Supabase
  are free candidates for the replacement.

## Still to do, by hand

- **After [#361]'s merge,** in this order:
  - MC-3424's third tab, where one was left on Home across the deploy:
    it shows one banner, and one Reload brings Home back;
  - `main`'s ruleset requires "CI — all jobs" alone, in place of the five
    jobs it names now; the next docs-only pull request then merges
    without the bypass;
  - MC-4201 on the live site with a test item: one notice in the bell
    within the hour while the service is awake; then remove the point;
  - `scripts/prune-branches.sh --yes`, then `scripts/clean-local.sh`, a
    dry run, then `--yes`, which removes `tmp/adr-085/` and
    `tmp/adr-085-low-stock/`.
- **After [#329]:** `evals.md` walked in a new chat, against the skill
  uploaded on 30 October.
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
- **The pinyin backfill** on the current database: `npm run
  backfill:pinyin` once in `server/`, against its External URL with
  `?sslmode=no-verify`, since Render runs the migrations but not that
  script (ADR-056).
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
6. **ADR-089 first** ([#348]): `/build-from-brief` runs a brief's steps
   in a row, each in a fresh subagent, stopping only when a person is
   needed, and the check before an ADR becomes a script. Its dependency
   step, with the multer override's removal, comes after Dependabot's
   open pull requests (Dates).
7. **The fix-ups,** the Fix-ups milestone, each batch writing its areas'
   rules files, in five batches first:
   1. CI that can be trusted: the flaky tests, [#183], [#232], [#233],
      [#248] and [#290], with [#342] and [#334];
   2. before their known misses end on 30 November: [#225] and [#276];
   3. expired lots: [#333] with [#331];
   4. the audit log: [#339] with [#133] and [#168];
   5. then TypeScript 7 ([#336]); the newcomer test; the design language
      ([#338], ADR-090); and Home for a newcomer ([#335], ADR-091),
      renumbered by ADR-089.

   Then [#261] with [#154] and [#150]; [#263]'s rest with [#198];
   [#264]; and [#255] with [#258], [#324] and [#326], since all four
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
   decisions; returns to suppliers ([#262]); a partner's history and when
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

[#133]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/133
[#150]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/150
[#154]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/154
[#168]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/168
[#178]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/178
[#183]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/183
[#186]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/186
[#198]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/198
[#225]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/225
[#226]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/226
[#232]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/232
[#233]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/233
[#244]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/244
[#245]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/245
[#247]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/247
[#248]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/248
[#251]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/251
[#252]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/252
[#253]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/253
[#254]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/254
[#255]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/255
[#257]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/257
[#258]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/258
[#259]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/259
[#260]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/260
[#261]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/261
[#262]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/262
[#263]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/263
[#264]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/264
[#266]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/266
[#268]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/268
[#269]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/269
[#276]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/276
[#287]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/287
[#288]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/288
[#290]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/290
[#291]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/291
[#293]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/293
[#294]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/294
[#298]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/298
[#300]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/300
[#316]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/316
[#317]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/317
[#318]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/318
[#319]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/319
[#320]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/320
[#321]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/321
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
[#342]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/342
[#343]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/343
[#344]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/344
[#345]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/345
[#346]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/346
[#348]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/348
[#349]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/349
[#350]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/350
[#351]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/351
[#359]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/359
[#361]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/361
[#366]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/366
[#367]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/367
[#370]: https://github.com/Zhenzhong-Zhou/web-app-foundation/pull/370
