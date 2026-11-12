# Delivering files and commits

Their home is `docs/engineering.md`, "How code is delivered" and
"Commits"; this is what each reply does.

## Which form

| What | How |
| --- | --- |
| A file already in the repository | a patch, never the whole file |
| A new file, or Bob's own working file in `tmp/` | the whole file |
| One small change | a snippet in the reply |
| Several files in one reply | one zip, below |

## Patches

- Made from the clone at the commit Bob's branch is at: `main`'s, or the
  branch's once he has pushed it and named the commit (`git rev-parse
  --short HEAD`).
- Made with `git diff` after editing the clone, never typed by hand.
- A patch to a script in `scripts/` reads and updates the script's test
  beside it, named for it with `.test.mjs`, in the same patch.
- The first line names the base, `base: <sha> (<branch>), <step>`; `git
  apply` passes over it.
- Checked before sending: on a fresh clone at that base, `git apply
  --check` passes, and so does each later patch on top; then, with every
  patch applied, `npx --yes markdownlint-cli2@0.23.3` finds no issue.
  It reads text between two dollar signs as maths, so a link reference
  between two amounts in US dollars on one line counts as unused: one
  amount to a line.
- Bob runs `git apply --check <patch> && git apply --index <patch>`,
  which stages what it changed.
- A patch Bob's copy refuses is made again from a fresh clone, under a
  new name ending `-v2`, never mended by hand.

## Downloads

- Downloads land in `~/Downloads` itself. Every file a reply tells Bob
  to copy is attached to that same reply.
- **One file:** moved, never copied: `mv ~/Downloads/<file> <path>`. A
  patch moves into `tmp/<branch>/` and is applied from there.
- **Several files:** one zip the chat packs itself, laid out as the
  repository is, its patches and the brief under `tmp/<branch>/`, named
  for its step (`adr-NNN-step-NN.zip`, ending `-v2` when corrected).
  Tested before sending: unpacked on a fresh clone, every patch in it
  applies. Bob, from the repository's root: `unzip ~/Downloads/<zip> &&
  rm ~/Downloads/<zip>`; `unzip` asks before overwriting a file.
- The repository is at `~/WebstormProjects/web-app-foundation`.

## Commits

- Authored as Bob, `Zhenzhong Zhou <bob0823.zhou@gmail.com>`, git's
  identity on his Mac; never a placeholder.
- `git status`, then each file staged by path; never `git add -A`.
- Commands run as pasted, each line even after one fails: a verify
  before a push is chained to it with `&&`, so a red verify stops the
  push; a dry run Bob reads first is a step of its own.
- One `git commit -m "…"`: a subject, a blank line, then wrapped
  paragraphs saying why. No backticks and no `!` inside the quotes,
  which zsh would read.
- Text for GitHub, an issue's or a comment's, comes as a file Bob passes
  with `--body-file`, never inside a script's `$( )`, which macOS's bash
  3.2 reads wrongly (ADR-090's as-built).
- Merging, from the terminal, never the button, which offers the method
  used last: a cloud session's or the runner's pull request with
  `gh pr merge <PR> --squash --delete-branch`, the runner's after the
  `git -C <folder> switch --detach` line it prints; a feature branch's with `gh pr merge <PR>
  --merge`, so its commits stay apart; `<PR>` is the pull request's
  number, not the issue's.
- A commit command, a Claude Code prompt or a slash command is never
  indented in the reply: a code block inside a list carries the list's
  indent, which git keeps in a commit's message and which makes Claude
  Code read a slash command as plain text (ADR-089's build).
- `scripts/verify.sh --docs` before a commit of only `scripts/` and
  Markdown outside `client/` and `docs/tables/`; `--quick` otherwise, a
  Help guide's Markdown included; in full before a push.
- An alert is "Dependabot alert 4" or "code scanning alert 9", never
  "#4", which GitHub links to an issue.
