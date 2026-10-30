---
status: accepted
date: 2026-10-29
areas: [docs, ops]
---

# ADR-088 — Planning in the chat, as a skill: kept here, compared with main, tested by prompts

## Context

Since ADR-079 a feature is planned in the claude.ai chat and built in
Claude Code
([engineering.md, How code is delivered](../engineering.md#how-code-is-delivered)).
Claude Code's half has skills: `/build-from-brief` (ADR-083) holds the
rules every brief repeated, and `/triage` and `/rules-file` hold
theirs. The chat's half has none. Each session opens with the same
paste: read the handoff, follow the working agreements, then the reply
format, the patch rule, the author and the migration reminder. What a
paste leaves out is lost for that session: on 28 October a chat
answered for a day without the reply format, and #260's brief was sent
again after nearly every step.

claude.ai takes skills of its own: a folder with a `SKILL.md`, uploaded
as a ZIP under Settings → Capabilities, private to the account, and
read when a request matches its description. The upload is a copy: a
change in the repository reaches it only when someone uploads again.

The chat also needs the repository's exact text. Project knowledge's
search returns passages, so a patch built from them can miss a line,
and `git apply --check` then refuses it whole. On 29 October the chat
read `server/src/common/client-address.ts` from a shallow clone of
`main` to find why #316's first probe failed: Project knowledge holds
only `docs/`, `README.md`, `CLAUDE.md` and `.claude/`.

Checked before drafting, as the working agreements ask, with the open
issues in `area:docs` and `area:ops` on 29 October 2026:

- **Fired, and taken here.** #318, with the five lessons #316's
  planning left on it. #289, `when-touched` in docs: four tidy-ups of
  the docs scripts, its item 30 a git test helper already copied twice,
  which this ADR's script tests would copy again. #292, `when-touched`
  in docs: what a newcomer's read stumbled on, its wording fixes in
  `engineering.md`, which this branch edits, `.claude/rules/database.md`,
  ADR-009 and `docs/rules/README.md`. The handoff's "Bob's general
  preferences into claude.ai's Settings", in part: the skill takes this
  repository's routine, and what is Bob's in any project still goes to
  Settings.
- **Not fired, and left.** #319, #320 and #321, each waiting for its
  own trigger; the skill keeps its paths into this repository in one
  file, so #321 can make it general. Two of #292's points: manual-check
  ids as links, which need anchors and a docs-check change beside
  #283; and naming the part "partly tested" leaves out, which needs the
  invoice tests read, in the invoices fix-up batch. ADR-086's and
  ADR-087's Deferred items. In ops, #268 and #269 ride with ADR-084, and
  #142, #197, #226, #248, #253, #263 and #284 touch nothing here.
- **Found while checking.** MC-4001 assumed `curl -6` fails where there
  is no IPv6; on 29 October an office network let it through as IPv4,
  so both of its runs reached Cloudflare as one address. Fixed on this
  branch, with what #316's deploy found.

## Decision — a claude.ai skill, its source in `.claude/chat-skills/`

`.claude/chat-skills/plan-feature/`. Claude Code loads skills from
`.claude/skills/` only, so it never runs this one, and Project knowledge
syncs `.claude/`, so a chat can read the source. Named `plan-feature`,
as its folder is, which an upload requires.

- **A short `SKILL.md`:** a session in order. The reads at its start,
  the check before an ADR, the decisions, the ADR as the branch's first
  commit, the brief, while building, then the as-built and the pull
  request.
- **`reference/`,** read when a step needs it: the reply format, the
  delivery rules (the roadmap, patches, attachments, `mv`, the author),
  and a brief's shape.
- **One home per rule,** as `/build-from-brief` keeps it: the working
  agreements stay in `engineering.md`, and the skill copies only what it
  acts on in every reply.
- **Instructions only,** no scripts. Its description names this
  repository, since a skill belongs to the account, not to a Project.

## Decision — packed and checked by a script

`scripts/pack-chat-skill.mjs` checks the skill as claude.ai will: the
front matter's name equals the folder's, in lower-case letters, digits
and hyphens, at most 64 characters; a description of at most 1,024; and
every file `SKILL.md` names is there. Then it writes
`tmp/plan-feature.zip`, the folder at its root and `evals.md` left out,
with the system's `zip`. Its test runs the check on the skill itself,
so `scripts/verify.sh --docs` and CI fail a skill that would not upload.

## Decision — the uploaded copy compared with main

The skill's first step compares each of its files, as uploaded into the
chat's container, with `main`'s, byte for byte, and says to upload it
again, before anything else, when one differs. Nothing is bumped by
hand. The README's "Which tool, when" names the pack script and the
upload.

## Decision — main's text from a clone, read only

The chat makes each patch from a shallow clone of the public repository
in its own container, at the commit Bob names or `main`'s newest, and
writes that commit on the patch's first line, which `git apply` passes
over. Read only: nothing installed, no script run, nothing pushed; the
checks are `scripts/verify.sh`'s, on Bob's Mac. For files a branch has
changed, Bob pushes the branch first and names its commit. A patch that
`git apply --check` refuses is made again from a fresh clone, never
mended by hand. Project knowledge stays for searching.

## Decision — the chat writes the skill, and prompts test it

The skill instructs the chat's own tools (Project knowledge, memory,
attachments, its container), which Claude Code cannot see. So the chat
writes it, as new files, and Claude Code's reviews read it with the
rest. `evals.md` holds five prompts, each with what a pass looks like:
a session's start, the check before an ADR, a set of decisions, a
refused patch, and a step's summary pasted back. They are walked by
hand after each upload, as a manual check is after a change.

## Decision — `scripts/clean-local.sh` rides along

The Mac's working folders, cleaned: a dry run by default, `--yes` to
delete.

- **Removes** each `tmp/` folder whose branch is merged into `main`,
  named as the branch or as its `<word>-<number>` start (`tmp/fix-316`
  for `fix-316-rate-limit-per-person`), the branches read from `main`'s
  merge commits, since merged branches are pruned; and Playwright's
  output folders, as the client's Playwright configurations name them.
  `client/screenshots/out/` stays: a comparison may still need it.
- **Lists** leftover git worktrees and stashes, and deletes neither.
- **Docker:** shows its unused space; with `--docker`, removes dangling
  images and build cache older than a week, never a container or a
  volume, so the databases stay.
- **Warns** when the Mac's `SleepDisabled` is 1.
- **Never** `git clean -X`, `.env`, `server/storage/` or anything git
  tracks. It refuses a symlink and any path whose real path leaves the
  repository, and names every folder it touches.
- Runs on the Mac's bash 3.2 and on CI's. Its test builds a throwaway
  repository, with stand-ins for `docker` and `pmset` on the `PATH`. A
  row in the README's "Which tool, when".

## Decision — ShellCheck over every shell script

ShellCheck, a linter for shell scripts, runs in CI, and in
`scripts/verify.sh` where Docker is up, from a container image pinned by
digest, as oasdiff and squawk run: on every shell script in `scripts/`,
`scripts/hooks/` and `server/scripts/`. Its findings on the older
scripts are numbered with the reviews', for Bob to fix or file.

## Decision — the riders

- **`mv`, not `cp`,** in the chat's copy commands
  ([engineering.md](../engineering.md#how-code-is-delivered)): a file
  moves out of `~/Downloads`, a patch into `tmp/<branch>/` before it is
  applied. With `cp`, a newer download saved as "x (1).patch" leaves
  the older file under the name the command copies.
- **#289,** each item a commit of its own, 30 first.
- **#292's wording fixes,** as listed above.
- **#316's deploy, recorded:** MC-4001 first reads what Cloudflare saw,
  and runs across two networks where it saw one address; `render.md`
  gains the results and "confirm a setting took effect"; ADR-011's
  as-built names the app's own request log, not Render's.

## Considered and not done

- **An amendment to ADR-083,** whose `/build-from-brief` is the other
  half. The chat's half is a decision of its own, as ADR-087 was beside
  ADR-086.
- **`engineering.md` alone.** Where the source lives and how the copy is
  checked are what a later reader asks about.
- **One `SKILL.md`.** Longer than a session needs at once.
- **A version line, bumped by hand.** Forgotten once, it says nothing;
  a comparison of bytes cannot be forgotten.
- **The skill only in claude.ai's Settings,** with no history and no
  review; or in #321's repository, not yet made.
- **Patches from Project knowledge's passages,** or from files Bob
  attaches each time: a missed line refuses the patch, and attaching is
  a step on every patch.
- **Claude Code writing the skill.** It cannot see the tools the skill
  instructs.
- **`docker system prune`,** which also removes stopped containers, a
  stopped database's among them; and **`git clean -X`,** which removes
  every ignored file, `.env` and `server/storage/` with them.

## Deferred — each with what brings it in

- **The skill made general,** in the plugin repository: #321's trigger.
- **Uploading other than by hand.** claude.ai offering a way for a
  person's account.
- **The prompts run by a script against the API.** The skill changing
  often enough that five prompts by hand become a chore; the API costs
  money, which this project's free-only rule (Bob, 26 October 2026)
  would then have to allow.

## Consequences

- A session in this Project opens with one line naming what is next;
  the skill holds the rest.
- New: the skill's folder; `scripts/pack-chat-skill.mjs` and
  `scripts/clean-local.sh`, each with its test; #289's shared git
  helper; ShellCheck in CI and in `scripts/verify.sh`.
- Changed: `engineering.md` (the skill, the clone, `mv`, #292's four
  points); the README (both scripts in "Which tool, when", and the
  skill beside the project's skills); `CLAUDE.md` (the folder is the
  chat's, not Claude Code's); `docs/rules/README.md`, ADR-009 and
  `.claude/rules/database.md` (#292); MC-4001; `render.md`; ADR-011's
  as-built; the handoff.
- Nothing a person sees, no migration and no API change: no manual
  check of the app, no seeds and no rules file.
- After the merge, by hand: pack and upload the skill, then walk
  `evals.md`. ADR-084's planning is its first real use.
- Build order: this ADR; #316's deploy recorded; dependencies; #289;
  the skill, by the chat; the pack script; `scripts/clean-local.sh`;
  ShellCheck; the docs, by the chat; dependencies again; the reviews;
  the as-built last. Built from `tmp/adr-088/brief.md`, a step per
  prompt, by `/build-from-brief`.

## Amendment (October 2026) — as built (#327)

Built from `tmp/adr-088/brief.md`, a step per prompt, on 29 October
2026; where it differs from the decisions above, this holds.

- **The skill,** written by the chat as planned: `SKILL.md` in eight
  sections, `reference/` (the reply format, the delivery rules and a
  brief's shape) and `evals.md`. A session reads the handoff,
  `engineering.md` and `CLAUDE.md` whole, from the clone. The open
  issues by area come from Bob's `gh issue list`: GitHub's API without
  a token shares its 60 requests an hour with every container behind
  the same address, and was found used up. Its after-merge list names
  `scripts/clean-local.sh`. Where claude.ai puts the uploaded copy in
  the chat's container is confirmed at the first upload, after the
  merge.
- **One zip per reply** (Bob, 29 October 2026, after this ADR was
  committed): a reply with several files sends one zip the chat packs,
  laid out as the repository is and named for its step; one file still
  comes alone, moved by `mv`. In `engineering.md` and the skill's
  delivery rules.
- **The pack script** takes only the files git knows, so a `.DS_Store`
  never reaches the upload or the comparison; its archive holds folder
  entries, as Finder's Compress makes them. Its check also refuses
  "anthropic" or "claude" in a name and an XML tag in a name or a
  description, as the Claude API's skills guide lists (added after its
  step); a front matter field written over several lines (review 6);
  and a link to `evals.md`, which is not uploaded. It reads links with
  `check-docs.mjs`'s reader (review 4), and CI's Docs workflow runs its
  `--check` (review 5), so a change to the skill alone is checked in CI.
- **`scripts/clean-local.sh`** keeps a `tmp/` folder that a branch not
  yet merged also matches, local or on origin, and names that branch: a
  gap found by its own step, before any real run. Merged branches come
  from "Merge pull request" commits only (13 of `main`'s 158 merges are
  not), so a pull request squashed or rebased leaves its folder kept,
  the safe side. Playwright's folders are `client/e2e/.output/`,
  `client/screenshots/.output/`, `client/playwright-report/` and
  `client/test-results/`, which its tests check against both
  configurations. Its tests, in three files sharing one built checkout,
  brought the scripts' tests from 12.5 s to 3.1 s and `--docs` from
  16.5 s to 7.5 s (review 23).
- **ShellCheck** v0.11.0, one digest for arm64 and amd64, through
  `scripts/check-shell.sh`: exit 0 when clean, 1 when it finds
  something, 3 when it cannot run; ShellCheck's own 3, a bad flag,
  becomes 1, so it never passes as a skip. It checks every shell script
  git knows in the repository, 18 with `docker/init-test-db.sh`, not the
  three folders above (review 7). It runs in every `verify.sh` mode,
  `--docs` included (Bob, 29 October 2026). Its first run's five
  findings in older scripts were numbered in step 10's own notes rather
  than with the reviews', and each fixed in a commit. `verify.sh` asks
  Docker once, through each check, for ShellCheck, oasdiff and squawk
  alike (reviews 8 and 11).
- **#289:** item 30 made `scripts/git-fixture.mjs`, its `TREE` part
  already gone with finding 19, and the tests' README markers now come
  from `adr-index.mjs`'s exported `SECTIONS` (review 1). Item 28's index
  is byte for byte the same. Item 31 was compared old against new in 16
  cases. Item 32's bullet 5 writes the skip text once in `verify.sh`;
  the three lists of changed files stay apart, since each answers its
  own question; and its `git ls-files -t` became a second listing
  (review 2).
- **#292:** its wording fixes. Manual-check ids as links, and naming the
  part "partly tested" leaves out, stay in #292.
- **The reviews** found 28. Fixed: 1 to 8, 11 to 13, 17, 19, 21, 23 and
  25 to 27. Left, each with its reason in #327: 9, 14 to 16, 18, 20, 22,
  24 and 28. `/doctor prompt-audit` found two skills ending their report
  on what went well, against `CLAUDE.md`'s DONE or BLOCKED last line,
  and a lint-autofix rule naming a `src/` that does not exist, now one
  rule.
- **Dependencies:** none taken; nothing in range was 7 days old on 29
  October. `@aws-sdk/client-s3` moved to 3.1160.0, old enough on 5
  November at 18:46 UTC, the last of ADR-084's updates.
- **The stop rule:** step 14, fifteen fixes with the full verify and the
  pull request in one prompt, ran well past its 30 minutes; nothing
  outside the chosen findings was added.
