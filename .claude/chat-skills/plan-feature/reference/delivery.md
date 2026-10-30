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
- The first line names the base, `base: <sha> (<branch>), <step>`; `git
  apply` passes over it.
- Checked before sending: on a fresh clone at that base, `git apply
  --check` passes, and so does each later patch on top.
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
- One `git commit -m "…"`: a subject, a blank line, then wrapped
  paragraphs saying why. No backticks and no `!` inside the quotes,
  which zsh would read.
- `scripts/verify.sh --docs` before a commit of only Markdown and
  `scripts/`; `--quick` otherwise; in full before a push.
- An alert is "Dependabot alert 4" or "code scanning alert 9", never
  "#4", which GitHub links to an issue.
