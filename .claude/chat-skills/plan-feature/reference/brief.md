# A build brief's shape

`tmp/adr-NNN/brief.md`, which git ignores, is run by `/build-from-brief`
(`.claude/skills/build-from-brief/SKILL.md`), its Claude Code steps in a
row, each in a fresh subagent (ADR-089). The subagent's file,
`.claude/agents/brief-step.md`, holds the rules every brief would
repeat; a brief holds only its decisions and its steps.

1. **The header:** the branch, its base commit, the ADR that holds the
   decisions, and how the steps run: `/build-from-brief
   tmp/adr-NNN/brief.md from N` for Claude Code's, the chat's here, and
   Bob's by hand.
2. **Read first:** the ADR, the issues it takes (`gh issue view <N>
   --comments`), and the docs sections the steps touch.
3. **This brief's own rules:** what the change is not (no API change,
   no migration), the verify mode for each kind of commit, the seeds
   (what to add, or why nothing), the manual checks (which, in the same
   commit as what they check), the journeys for the walkthrough panel,
   `/usability-walkthrough panel <journey>`, or why none, the stop rule
   when not 30 minutes, and anything every
   summary must say. The reviews have none: they wait for their
   helpers and for Bob.
4. **The steps:** a table (#, Who, What), then a section per step: what
   it builds, its files, the test that proves it, one commit unless it
   says otherwise. Who is `Claude Code`; `Claude Code, main session` for
   the reviews, which a run stops before and which run when named
   alone; `Chat`; or `Bob`. A run stops at every step not Claude Code's,
   so a restart or a pull by hand is a step of Bob's.
   - Dependencies first, and again before the reviews.
   - An inventory first for a change across many screens.
   - The seeds where a feature adds a table or a screen.
   - The reviews in two prompts: the findings, numbered, to
     `tmp/adr-NNN/review.md` with nothing fixed; then the fixes Bob
     chose, given after the step's number, the full verify, the push and
     the pull request.
   - The as-built last, by the chat; then what is done by hand after
     the merge.
5. **Where `/clear` is safe:** after a run stops, once its summary is
   pasted into the chat; never inside a step, nor while a run goes on.
   Every summary is also in `summaries.md` beside the brief, for the
   as-built.

A chat step that patches files the branch has changed starts with Bob
pushing the branch and naming its commit.
