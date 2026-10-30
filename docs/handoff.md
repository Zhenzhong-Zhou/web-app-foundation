# web-app-foundation — handoff, 27 October 2026

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

On 30 October 2026:

- **ADR-084, an error tracker** ([#287]): built and reviewed on 30
  October in 47 commits, its as-built in
  [ADR-084](adr/0084-an-error-tracker.md); [#329] open, merging once CI
  is green. After the merge, by hand: the tracker set up as
  [`render.md`, "The error tracker"](runbooks/render.md#the-error-tracker-adr-084)
  says, with Sentry's spike protection on; MC-4101, MC-4102 and MC-4105
  on the live site; the web service's memory on Render's Metrics a day
  later; and the planning skill packed from `main` and uploaded.
- **The planning skill** ([ADR-088](adr/0088-planning-in-the-chat-as-a-skill.md))
  was uploaded on 30 October. The chat's container holds the copy at
  `/mnt/skills/plugins/plan-feature/`, read only and without `evals.md`;
  each session compares it with `main`'s first. ADR-084's session
  walked `evals.md`'s prompts 1, 2, 3 and 5; 4 waits for a patch that is
  refused. Prompt 2 found the issue command
  printing no issue's text, so the skill's fix rides with ADR-084. The
  fixed skill is packed from `main` and uploaded once ADR-084 merges;
  until then v1 stays (ADR-088's amendment).
- **The triage** is done (28 October;
  [engineering.md, Triaging the open issues](engineering.md#triaging-the-open-issues)):
  every open issue has its group and area labels, the `fix-now` ones are
  in the [Fix-ups milestone](https://github.com/Zhenzhong-Zhou/web-app-foundation/milestone/1),
  and [#178]'s hooks are [#293] of their own. [#225] was closed after
  [#186], then reopened on 29 October, when slower runners put the typo
  lookup at 333 to 363 ms; it and [#276] carry known misses until 30
  November.
- **The last merges:** [#327] ([#318], the chat-side planning skill,
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
- **Migrations** through 0075 (the square logo's), 76 files in
  `server/src/database/migrations/`.
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
  ([#253]).

## Dates

- **29 October:** ask whether Bob's mother's Chinese corrections are
  back. She has the export made at `b933b912` (22 October 2026); once it
  is imported, her next round is only what changed, `node
  scripts/i18n-review.mjs export --since b933b912`, and her corrections go
  into a fix-up. Her first note: 头像 for the profile picture everywhere,
  since Your account says 照片 while Home says 头像. With them, ADR-083's
  two questions: whether Panivo in a Chinese email reads out of place
  beside 品桥 in the app (ADR-082's trigger for the name by language in
  emails), and the invitation email's 有效期到2026年11月3日结束, with no
  space where the page writes 到 2026年. And, on a phone, to someone who
  reads only Chinese: the close dialog (MC-2406), Roles and the role
  editor in 中文, 品牌, product photos, 同事, and 编号 (MC-2710).
- **2 to 6 November:** the updates ADR-084 left come of age, for
  ADR-085's start (UTC): `typescript-eslint` 8.72.1 on 2 November, 17:10;
  the Nest packages at 12.3.x on 3 November, 12:04, so the multer
  override goes; the eight #260 left by 4 November, 20:27; the four
  `@sentry` packages to 11.10.0 on 4 November, 16:21; `nodemailer`
  10.3.1 and `@aws-sdk/client-s3` 3.1160.0 on 5 November, by 18:47; and
  `eslint` 10.14.0 on 6 November, 14:13.
- **30 November:** the known misses for the typo lookup ([#225]) and Home
  ([#276]) end; fixed by then, or decided again.
- **Early November:** Bob's cloud credit ends; [#245] suits a cloud session
  before then. What the cloud sessions taught is in the working
  agreements, "Cloud sessions" under
  [How code is delivered](engineering.md#how-code-is-delivered).
- **About 19 November:** replace Render's free database before it expires
  on 21 November, by
  [`render.md`, "Replacing the database"](runbooks/render.md#replacing-the-database),
  warning anyone besides Bob who uses the app; Render deletes it about 5
  December. Record the new dates here. A free Render database lasts 30
  days, so until a paid one this comes back monthly; Neon and Supabase
  are free candidates for the replacement.

## Still to do, by hand

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
- **Bob's general preferences** into claude.ai's Settings: what is his
  in any project, since this repository's routine is the planning
  skill's (ADR-088).
- **Project knowledge** slimmed to `docs/`, `README.md`, `CLAUDE.md` and
  `.claude/`, and re-synced after each docs PR.
- **A healthchecks.io check** as `BACKUP_HEALTHCHECK_URL`
  ([`services.md`](runbooks/services.md)).
- **The backup key's two copies** confirmed.
- **Backups to R2** (`BACKUP_DESTINATION=s3`) confirmed live: recorded as
  live since 7 October, so check the Backup runs before redoing anything.

## Still to do, in code

The order (Bob, 27 October 2026), each item a pull request or a set of
them:

1. **`docs-start-here`,** [#291]: merged 28 October.
2. **Triage:** done 28 October (above).
3. **[#260], product names and search** (ADR-056 amended): [#317],
   merged 29 October. Then [#316], the rate limit keyed on the person,
   with `/triage` riding along: [#325], merged 29 October. Then the
   chat-side planning skill ([#318], ADR-088), a docs PR, its source
   kept in this repository (Bob, 29 October 2026): [#327], merged 29
   October; the skill uploaded on 30 October (above).
4. **ADR-084, an error tracker** ([#287]): [#329], open; it closes
   [#244], [#266], [#268] and [#269] beside [#287]. After its merge, the
   by-hand list under "Where things stand".
5. **ADR-085, low stock** ([#288]), with [#222] and [#256], starting
   with the updates ADR-084 left (Dates) and the multer override's
   removal (ADR-019).
6. **The fix-ups:** the Fix-ups milestone in batches by area, each
   writing its areas' rules files. First the flaky tests, [#183], [#232],
   [#233], [#248] and [#290], so CI can be trusted for the rest; [#225]
   and [#276] before their known misses end on 30 November; then
   [#261] with [#154] and [#150]; then [#263]'s rest with [#198]; [#264];
   and [#255] with [#258], [#324] and [#326], since all four change the
   security emails' lines and their text parts
   (`npm run mail:text -- --update`).
7. **One docs PR for the remaining rules files,** then **the review of
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
     `docs/principles.md` edited until it reads as Bob's; ADR-082's on
     the live site, MC-3501 on an iPhone and an Android home screen,
     MC-3504 and MC-3505;
   - the manual checks due: MC-2601 to MC-2610, MC-R13 and MC-R14
     (ADR-072); MC-2501 to MC-2512 and MC-R12 (ADR-071); MC-1601 and
     MC-1602, MC-1701 to MC-1703, MC-1801, MC-1901, MC-2001, MC-2101,
     MC-2201, MC-1558 and MC-1559.

   Then one round for its findings.
8. **New features,** in this order unless a trigger brings one forward:
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

[#150]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/150
[#154]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/154
[#178]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/178
[#183]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/183
[#186]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/186
[#198]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/198
[#222]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/222
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
[#256]: https://github.com/Zhenzhong-Zhou/web-app-foundation/issues/256
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
