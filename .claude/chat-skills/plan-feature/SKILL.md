---
name: plan-feature
description: "The planning routine for Bob's web-app-foundation repository (Panivo, github.com/Zhenzhong-Zhou/web-app-foundation), in its claude.ai Project: for the claude.ai chat only, never Claude Code. Use at the start of every session there, and whenever Bob plans a feature, an ADR or a fix, answers decisions, pastes a Claude Code /build-from-brief summary or question, or asks for patches, files, the as-built or a pull request. Holds the session's order (main cloned and read whole, the check before an ADR, decisions answered in one line, the ADR as the first commit, the build brief, the as-built) with the reply format and the delivery rules. Not for any other repository."
---

# Plan a feature for web-app-foundation

Bob plans each feature in this chat and builds it in Claude Code, the
steps of a build brief run in a row until one needs him
(`docs/engineering.md`, "How code is delivered"). This skill is the chat's half: how a session starts, how a
feature is planned, and how what was built is recorded. The working
agreements keep their one home in `docs/engineering.md`; `reference/`
copies only what every reply acts on.

## 0. Every session, first

1. **The clone,** shallow and read only:

   ```bash
   git clone --quiet --depth 1 https://github.com/Zhenzhong-Zhou/web-app-foundation.git /tmp/waf
   ```

   For a branch Bob has pushed, add `--branch <branch>`; for a commit he
   names, `git -C /tmp/waf fetch --depth 1 origin <sha>`, then check it
   out. Nothing installed, no script of the repository run, nothing
   pushed: the checks are `scripts/verify.sh`'s, on Bob's Mac. One
   exception, before sending Markdown: `npx --yes
   markdownlint-cli2@0.23.3` from the clone's root, the version and the
   settings `scripts/verify.sh` and CI use; it adds nothing to the clone
   (ADR-084's as-built). With no network, say so, search Project
   knowledge, and ask Bob to attach any file a patch needs.
2. **This skill against main's:** `diff -r -x evals.md <this skill's
   folder> /tmp/waf/.claude/chat-skills/plan-feature`, the folder being
   where the skills list says this file is. Any difference: the reply's
   first bullet says to pack the skill from `main` and upload it again
   (the README's "Which tool, when"), and this session follows main's
   copy, read from the clone. A change to the skill on a branch is
   uploaded only after its merge (ADR-088's amendment).
3. **Read whole, from the clone:** `docs/handoff.md`, then
   `docs/engineering.md`, then `CLAUDE.md`. The handoff says where things
   stand and what is next; Bob's first message says which part he wants.
4. **The handoff's dates:** any due today or already past, raised once,
   in New findings.

## 1. The playback, then the check before an ADR

**The playback first** (ADR-088's amendment): before planning a feature
or a long request, restate it as numbered requirements, R1, R2 and on,
each with how it is shown done; then its assumptions (A), what is not
included (N) and its questions (Q), each question with its options and
one recommended. Nothing is drafted until Bob confirms. The list goes
into the ADR as "Requirements, as confirmed", a table of R, What, Done
when and Step.

**Then the check,** as `docs/engineering.md`, "Process", asks, before
anything is drafted. For each area the change touches, by its name in
`AREAS`
(`scripts/adr-index.mjs`):

- the Deferred lines of the area's ADRs, found through
  `docs/adr/README.md`'s "By area", and ADR-051's watch list;
- `docs/adr/open-decisions.md`;
- the area's open issues, and the text and comments of each
  `when-touched` one, which rides along with the next branch that
  touches its area. Bob runs `scripts/adr-check.mjs` (ADR-089) from the
  repository's root, the areas and the issues the feature names filled
  in, and attaches `tmp/adr-NNN/check.txt`, which it writes. It refuses
  an area not in `AREAS`, so a typo fails rather than printing nothing.

  ```bash
  node scripts/adr-check.mjs NNN --areas api,ops,ui --issues 287
  ```

  GitHub's API without a token shares its limit with every container
  behind the same address, so it is not relied on; an issue's page on
  github.com still reads from the clone's container when one is missing.

Write it as the ADRs' Context does, under "Checked before drafting":
**Fired, and taken here**; **Not fired, and left**; **Found while
checking**. Each item names its issue or ADR.

## 2. Decisions

- Numbered, each with options a, b and c, the recommended one marked,
  with its reason in a sentence; answerable in one line, "1a 2b".
- The recommendation is what production teams do, kept configurable
  where the foundation may serve another industry. Where no standard
  exists, say so.
- Nothing is drafted past a decision not yet answered.

## 3. The ADR, as the branch's first commit

- A new file from `docs/adr/template.md`: `docs/adr/NNNN-<slug>.md`, the
  slug from the title before its first colon. Front matter: `status`,
  `date`, `areas` (one to three, in `AREAS`' order) and `amends`; each
  amended ADR gains `amended-by` and a dated amendment at its end.
- Its Context ends with the requirements as confirmed and the check;
  then a Decision heading per decision, Considered and not done, Deferred with each trigger, and
  Consequences ending in the build order.
- **A feature's flows and states** (ADR-092; ADR-090's amendment): its
  ADR holds an interaction table (Where, You do, What happens, You land,
  Back), and names its wireflow board on the canvas and each screen's
  five states, each drawn only where it differs from the States section
  of `docs/design-language.md`.
- The same commit tidies the handoff, as a patch. Bob runs `node
  scripts/adr-index.mjs` and stages the index with the ADR.
- Outside the numbered ADRs, a path in backticks that starts with a
  tracked folder must exist (`scripts/check-docs.mjs`); a file still to
  be written is named in plain words.
- Designs go on the Claude Design canvas `docs/engineering.md` names,
  never as mockups in the chat. A changed design is a new row of boards,
  titled with its version, never drawn over the old one: every earlier
  version stays as the design's history.

## 4. The brief

`tmp/adr-NNN/brief.md`, in [the brief's shape](reference/brief.md): a
step per commit, each naming the requirements it meets, each row of the
interaction table a browser test, its table saying who runs each and, for a Claude Code
step, on which model. Claude Code's steps run in a row,
`/build-from-brief tmp/adr-NNN/brief.md from N`, each in a fresh
`brief-step` subagent on the model its row names, until one needs a
person (ADR-089). The Model column is set from the table in
`docs/engineering.md`'s "Which model runs a step", its one home, read
on the clone at the session's start (section 0). A step above its model
stops and runs again on Opus, so a doubtful step is given `opus`. The
reviews are the row `Claude Code, main session`, run by `/review-step`,
never by the loop. Sent once, whole. Changed only when an answer
changes a step not yet run; what building settles stays in the chat for
the as-built.

## 5. While building

Bob pastes only a run's stops: a step that ends BLOCKED or with a
decision, a step for the chat or for him, and the reviews. Each stop
gets:

- What the step did and found, and where each finding is kept: an
  issue's number, "kept in the chat, then the as-built", or "not kept"
  and why.
- The next prompt, usually `from N`, and that `/clear` is safe after a
  stop, once its summary is pasted; never while a run goes on.
- A question a step hands back: the options, one recommended, and the
  exact text to type.
- The reviews' choices, by number, after the step's number:
  `/review-step tmp/adr-NNN/brief.md N` followed by them.
- A chat step (the docs, a design, a fix the chat writes): its files as
  [the delivery rules](reference/delivery.md) say, from a clone of the
  branch Bob has pushed, at the commit he names.

## 6. The as-built and the pull request

- From the notes kept in the chat and `tmp/adr-NNN/summaries.md`, which
  Bob attaches: the ADR's amendment, "## Amendment (Month YYYY) — as
  built (#PR)", where building differed from the decisions, each
  requirement marked met, changed or deferred; the handoff; any manual check or runbook line still owed.
  As patches.
- When work ends in a pull request: its title, and its description as
  plain Markdown, unasked, with `Closes #N` for each issue the branch
  fixes, riders included, and `Part of #N` for one fixed in part. The
  issues its commits name are the list to check:
  `git log --format=%s origin/main..HEAD | grep -oE '#[0-9]+' | sort -u`.
- After the merge: `scripts/prune-branches.sh --yes`, then
  `scripts/clean-local.sh` (a dry run, then `--yes`), the checks the
  runbook names for the deploy, and Project knowledge re-synced. Before
  `--yes`, whatever a later ADR still reads in the merged branch's `tmp/`
  folder, a panel's reports among them, is moved into that ADR's own:
  `--yes` removes the folder whole (ADR-091). When
  the merge changed this skill: `node scripts/pack-chat-skill.mjs` on
  `main`, the upload, and `evals.md` walked.

## 7. Every reply

[The reply format](reference/reply-format.md) and
[the delivery rules](reference/delivery.md), every time.

## 8. A small issue, on the API credit or in a cloud session

Each pick is offered as one line, `node scripts/fix-issue/run.mjs <N>`,
which runs it on the API credit in the second working folder, a build
going on meanwhile (ADR-089's amendment); `leave <path>` follows it only
for a branch not pushed. Beside the line, the run's time and cost on the
credit, read from `tmp/fix-runs/runs.tsv`, while `node
scripts/fix-issue/run.mjs --spent` shows room. For a cloud session, or
Claude Code on the plan, the line is `/fix-issue <N>`, a new session
each. The runner prints the merge: `git -C <folder> switch --detach`,
and then `gh pr merge <PR> --squash --delete-branch`. The candidates
come from two exports Bob writes and attaches, not from GitHub's pages
(ADR-090), both written by `scripts/cloud-picks.sh`: first, without
numbers, the open `fix-now` and `when-touched` issues without their
comments, `tmp/cloud-picks.json`; then, with the numbers the chat
shortlists from it, those issues with their comments,
`tmp/cloud-picks-shortlist.json`:

```bash
scripts/cloud-picks.sh
scripts/cloud-picks.sh <N> <N> <N>
```

The chat picks only what the skill would not stop on: read whole,
comments included, from the second; no choice left open, no `later` or `decision` label;
small, an issue that names more than about five files going to a Mac
branch instead (#310 stopped for nine dialogs); and no commit on
`main` already fixing it,
`git log --oneline -E --grep '#<N>([^0-9]|$)' origin/main` on a clone with
its whole history. A session's DONE or BLOCKED comes back here as a
step's stop does.
