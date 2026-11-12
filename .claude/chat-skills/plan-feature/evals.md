# The planning skill's acceptance prompts

Walked by hand in a new chat of the Project after each upload
(ADR-088). This file is not uploaded. A prompt passes when every point
under it holds; one that fails is a change to the skill, then a new
upload.

## 1. A session's start

> Read docs/handoff.md first, and follow docs/engineering.md's working
> agreements. Next: plan ADR-084, the error tracker.

- The clone is made and the skill compared with main's; any difference
  is the reply's first bullet.
- The handoff, `docs/engineering.md` and `CLAUDE.md` are read whole from
  the clone.
- A date in the handoff that is due is raised once.
- Five parts, every bullet with its status, Decisions needed present.
- It starts the check before the ADR and asks for the issue lists by
  area, rather than drafting anything.

## 2. The check before an ADR

*Bob attaches `tmp/adr-NNN/check.txt`, written by
`scripts/adr-check.mjs` for the areas asked for.*

- Fired, not fired and found while checking, each item naming its issue
  or ADR.
- The Deferred lines, ADR-051's watch list and Open decisions are each
  said to be checked, with what they held.
- Each `when-touched` issue in those areas is read whole, its own text
  as well as its comments, then taken or left with a reason.
- Decisions numbered, options a, b and c, one recommended with its
  reason; no ADR drafted yet.

## 3. Decisions answered

> 1a 2a 3b

- The ADR as a new file and the handoff as a patch, in one zip with the
  brief, laid out as the repository is.
- The file roadmap first; each patch's first line names its base.
- Next gives the branch, `unzip` then `rm`, `git apply --check` then
  `--index`, `node scripts/adr-index.mjs`, `scripts/verify.sh --docs`,
  and one `git commit -m` saying why.
- The brief's table says who runs each step, its Claude Code steps run
  `from N` in a row, and it says where `/clear` is safe.

## 4. A refused patch

> git apply --check says: error: patch failed: docs/handoff.md:40

- It uses or asks for the commit Bob is at, and makes the patch again
  from a fresh clone, under a new name.
- It says in a bullet why the first one failed; nothing is mended by
  hand.

## 5. A step's summary pasted

*Bob pastes a run's stop: a `/build-from-brief` step's summary with one
finding for the as-built and one question for him.*

- Five parts; the finding kept in the chat for the as-built; the brief
  not sent again.
- The question answered with its options and a recommendation.
- Next is the run's next prompt, `from N`, with `/clear` safe once the
  summary is pasted.

## 6. A small issue, on the API credit or in a cloud session

> Anything else I can run in a cloud session?

- The issues come from `tmp/cloud-picks.json`, without comments, then
  the few it shortlists from `tmp/cloud-picks-shortlist.json`, with
  them; it asks Bob to write and attach each, not to read GitHub's
  pages.
- Each issue offered was read whole, its comments included, and checked
  against `main`'s whole history,
  `git log --oneline -E --grep '#<N>([^0-9]|$)' origin/main`; one already
  fixed is offered for closing, naming its commit, never given to a
  session.
- None offered leaves a choice open or is labelled `later` or
  `decision`, unless its decision is asked first; none needs a sweep or
  the large seed, or names more than about five files.
- The exports come from `scripts/cloud-picks.sh`, without numbers and
  then with the shortlist's.
- Each pick is offered as one line, `node scripts/fix-issue/run.mjs <N>`,
  not indented, with `leave <path>` only for a branch not pushed, and
  while `--spent` shows room, its time and cost on the credit from
  `tmp/fix-runs/runs.tsv`; `/fix-issue <N>` is for a cloud session or
  Claude Code on the plan.
- The merge is the runner's: `git -C <folder> switch --detach`, then
  `gh pr merge <PR> --squash --delete-branch`; a fix and a build may run
  at once.
- Five parts, Decisions needed present.

## 7. A brief's models

> Write the brief for ADR-092.

- Every Claude Code step has a model in the steps table's Model column.
- Opus has new logic, design, the reviews and their fixes, and every
  browser test.
- Sonnet has dependencies, seeds, guides, docs and tests copied from one
  beside them.
- Haiku has only a step that runs commands and reports.
- The reviews are the row `Claude Code, main session`, run by
  `/review-step`.
- The time-and-cost table names each step's model.

## 8. A feature planned

> Plan Movements (#470).

- Before any check or draft, the playback: numbered requirements, each
  with how it is shown done; then the assumptions, what is not included
  and the questions, each question with its options and one
  recommended. It waits for Bob's confirmation.
- Once confirmed and decided, the ADR holds "Requirements, as
  confirmed", each with its step; an interaction table; its wireflow
  board named; and each screen's five states where they differ from the
  design language's States.
- Each step of the brief names the requirements it meets, and each row
  of the interaction table is a browser test in a step on Opus.

## 9. A session closed

> That's all for this branch; I need the next session's prompt.

- Each decision and finding the session holds that no file has is filed
  first, in the as-built, the handoff, an issue or a line for `/triage`,
  and the reply says where.
- The checklist is walked: decisions, findings, changes from the brief,
  issues filed and to file, steps owed, dates, corrections to earlier
  advice.
- The prompt is whole, carries only what no file could hold yet, and
  marks each blank Bob fills with `<…>`.
- Five parts, Decisions needed present.
