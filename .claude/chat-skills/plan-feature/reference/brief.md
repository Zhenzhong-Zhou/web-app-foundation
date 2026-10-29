# A build brief's shape

`tmp/adr-NNN/brief.md`, which git ignores, is run one step at a time by
`/build-from-brief` (`.claude/skills/build-from-brief/SKILL.md`). That
skill holds the rules every brief would repeat; a brief holds only its
decisions and its steps.

1. **The header:** the branch, its base commit, the ADR that holds the
   decisions, and how each step runs: `/build-from-brief
   tmp/adr-NNN/brief.md N` for Claude Code, the chat's steps here.
2. **Read first:** the ADR, the issues it takes (`gh issue view <N>
   --comments`), and the docs sections the steps touch.
3. **This brief's own rules:** what the change is not (no API change,
   no migration), the verify mode for each kind of commit, the seeds
   (what to add, or why nothing), the manual checks (which, in the same
   commit as what they check), the persona for `/usability-walkthrough`
   or why none, the stop rule when not 30 minutes, and anything every
   summary must say.
4. **The steps:** a table (#, Who, What), then a section per step: what
   it builds, its files, the test that proves it, one commit unless it
   says otherwise.
   - Dependencies first, and again before the reviews.
   - An inventory first for a change across many screens.
   - The seeds where a feature adds a table or a screen.
   - The reviews in two prompts: the findings, numbered, to
     `tmp/adr-NNN/review.md` with nothing fixed; then the fixes Bob
     chose, the full verify, the push and the pull request.
   - The as-built last, by the chat; then what is done by hand after
     the merge.
5. **Where `/clear` is safe:** after each Claude Code step, once its
   summary is pasted into the chat; never inside a step.

A chat step that patches files the branch has changed starts with Bob
pushing the branch and naming its commit.
