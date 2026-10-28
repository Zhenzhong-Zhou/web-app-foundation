# web-app-foundation — handoff, 27 October 2026

Paste this into the new chat. Re-sync Project knowledge from `main` first, so
the new session reads current code.

Status only: where things stand, the dates, and what is still to do by
hand and in code. The history this file held until 27 October 2026 is in
git, `git show 504daab:docs/handoff.md`; what lasts of it is in the ADRs'
as-built amendments, [the working agreements](engineering.md),
[the conventions](conventions.md) and the open issues.

## Where things stand

On 27 October 2026:

- **`docs-start-here`,** ADR-086's part 2 and ADR-087, is on its branch:
  [Start here](README.md), the rules written down (`docs/rules/` and
  `.claude/rules/`), headings, `areas` and a template for the ADRs, and
  this file cut to status. ADR-084 comes next (the order, below).
- **The last merges:** #259 (`docs-moves`, ADR-086's part 1, 27
  October), #257 (the emails' design, ADR-083, 27 October), #254 (CI's
  reliability, closing #252, 26 October), #251 (the organization's square
  logo, ADR-060 amended, 26 October) and #247 (the brand, ADR-082, 25
  October).
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
- **Claude Code Review** still rarely runs the plugin's full review
  (#253).

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
- **2 November:** `typescript-eslint` 8.72.1 and `@aws-sdk/client-s3`
  3.1157.0 are old enough, for ADR-084's branch (#287).
- **Early November:** Bob's cloud credit ends; #245 suits a cloud session
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

- **The pinyin backfill** on the current database: `npm run
  backfill:pinyin` once in `server/`, against its External URL with
  `?sslmode=no-verify`, since Render runs the migrations but not that
  script (ADR-056).
- **`foundation_perf_large` kept migrated** for #225 and #226: `npm run
  migrate:all` does not reach it, so after each new migration run `npm run
  migrate` against it, as [`server/perf/README.md`](../server/perf/README.md)
  makes it.
- **Bob's general preferences** into claude.ai's Settings.
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

1. **`docs-start-here`,** this branch. After the merge: prune the branch
   (`scripts/prune-branches.sh`), delete `tmp/adr-087/`, and re-sync
   Project knowledge.
2. **Triage:** every open issue gets a group label and its area labels,
   and the `fix-now` issues go into a "Fix-ups" milestone
   ([engineering.md, Issues and labels](engineering.md#issues-and-labels)).
3. **#260, product names and search** (ADR-056 amended), with #250,
   #263's note wording, the esbuild override under drizzle-kit (#270),
   and a `/rules-file` skill writing the products, partners and search
   rules files.
4. **ADR-084, an error tracker** (#287), with `typescript-eslint` 8.72.1
   and `@aws-sdk/client-s3` 3.1157.0 (old enough from 2 November), and
   the Nest packages at 12.3.x (from 3 November), whose
   `@nestjs/platform-express` depends on multer 2.5.0 itself, so the
   multer override goes (ADR-019); an `npm audit` step in CI (#268), the database's size in the backup's
   summary (#269), and the per-area table diagrams.
5. **ADR-085, low stock** (#288), with #222 and #256.
6. **The fix-ups:** the Fix-ups milestone in batches by area, each
   writing its areas' rules files. First #261 with #154, #225 and #150;
   then #263's rest with #198; #264; and #255 with #258, since both change
   the emails' text parts (`npm run mail:text -- --update`).
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
8. **New features,** in this order unless a trigger brings one forward,
   each with its entry in Open decisions: one person in two
   organizations, then a practice organization (ADR-077, *Deferred*); a
   public demo; plans and billing; the operator's console and support
   access; and returns to suppliers (#262).

Later: `/release` at the next tag; the chat-side planning skill;
`/file-issue`, or GitHub's issue templates; labels as code, a labels file
in `.github/` synced by a free Action, with a check that each area in
`AREAS` has its label; the support playbook with the operator's console;
and last, the starter kit: the process kit and engineering defaults,
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
- **The open issues:** `gh issue list --state open --limit 200`, and the
  three label queries in
  [engineering.md, Issues and labels](engineering.md#issues-and-labels).
- **Before any real customer's data:**
  [`render.md`, "Before real customers' data"](runbooks/render.md#before-real-customers-data),
  and [Open decisions, "A security review before real customers"](adr/open-decisions.md#a-security-review-before-real-customers).
