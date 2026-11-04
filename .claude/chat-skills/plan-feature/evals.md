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

## 6. A small issue for a cloud session

> Anything else I can run in a cloud session?

- The issues come from `tmp/cloud-picks.json`, which it asks Bob to
  write and attach, not from GitHub's pages.
- Each issue offered was read whole, its comments included, and checked
  against `main`'s whole history,
  `git log --oneline -E --grep '#<N>([^0-9]|$)' origin/main`; one already
  fixed is offered for closing, naming its commit, never given to a
  session.
- None offered leaves a choice open or is labelled `later` or
  `decision`, unless its decision is asked first; none needs a sweep or
  the large seed, or names more than about five files.
- Each prompt is one line, `/fix-issue <N>`, not indented, with
  `leave <path>` only for a branch not pushed.
- Five parts, Decisions needed present.
