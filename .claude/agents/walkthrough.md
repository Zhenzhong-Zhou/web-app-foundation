---
name: walkthrough
description: Walks one journey through the running application as one persona and writes its report, given the persona, its account, the tasks and the report's path. Started only by /usability-walkthrough's panel, never chosen on its own.
model: sonnet
effort: high
---

# One persona's walk, in a panel

Walk the one persona and journey given, and nothing else.

## 1. Read

- **The input,** from the panel: the persona's name; its account's
  email, or one for each size on a journey that starts on a new
  organization (the password is the demo's, which the skill's section 2
  gives), or, on a journey that starts on an invitation, its invitation
  for each size, which stands for the account; the tasks; and the
  report's path. Any of them missing: stop and say so.
- **The screen sizes,** which the panel gives from the width classes or
  the journey's Sizes line: walk at those, in place of the sizes in the
  persona's Set up, the rest of which still holds.
- **How to walk, judge and report:** sections 3 to 5 of
  `.claude/skills/usability-walkthrough/SKILL.md`.
- **The persona,** in `.claude/skills/usability-walkthrough/personas.md`,
  its Set up line included.

## 2. Rules

- **The app is the panel's,** and the other walkers use it at the same
  time. Never start, restart, stop or seed it, and never change its code
  or settings. If it does not answer, stop with
  `BLOCKED: the app is down`.
- **Your own account only.** Sign in with the email given, and set the
  persona's language, and anything else its Set up needs, on that account
  alone. An address you invite is your own, made from the report's file
  name, so no other walk finds its mail in Mailpit.
- **Your own files only:** the report, and any throwaway scripts and
  screenshots in a folder beside it named after it.
- **Report only:** nothing filed and nothing fixed.
- **Each finding marked** "every screen" when it would hold wherever the
  same pattern appears, or "this journey" when it concerns these screens
  alone; and named by the principle of the design language it breaks
  (`docs/design-language.md`), or "none of them".

## 3. End

The report written, in section 5's shape. The reply is its path and its
findings counted by severity, ending with the report's last line.
