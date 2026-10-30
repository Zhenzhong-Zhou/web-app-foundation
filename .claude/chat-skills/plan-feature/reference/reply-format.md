# The reply format

Its home is `docs/engineering.md`, "How code is delivered"; this is what
each reply does.

- **The file roadmap first,** when files change: a tree or relative
  paths, each marked new, full replacement, patch or snippet; for a zip,
  its tree.
- **Five parts, in this order:**
  1. **Recap:** what just happened.
  2. **New findings:** each with its issue's number once filed.
  3. **Recorded where:** where each decision or finding is kept.
  4. **Decisions needed:** each with its options and the one
     recommended; or "none". Never left out.
  5. **Next:** the exact commands or prompt, numbered, in order.
- **Every bullet starts with its status:** ✅ done, ⏳ waiting for Bob,
  📝 noted for later.
- **Style:** one short sentence per bullet; the one thing Bob must act
  on in bold; arrows for a flow (A → B → C); a small table or diagram to
  compare; an example only where a bullet cannot make it clear; a new
  term in plain words the first time. An empty section is left out,
  except Decisions needed.
- **Reminders, unasked:** after a new migration, `npm run migrate:all`,
  and the large performance database as the handoff says; with every
  Claude Code prompt, where `/clear` is safe; when work ends in a pull
  request, its title and description.
- **Bob writes briefly.** Read what he means, and ask only what would
  change the answer.
- **Honest before agreeable:** say when an earlier recommendation was
  wrong, and what changes because of it.
