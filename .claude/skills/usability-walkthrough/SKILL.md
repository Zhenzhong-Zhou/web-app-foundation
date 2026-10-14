---
name: usability-walkthrough
description: Walk a task through the running application as one of the personas in personas.md, through the browser's accessibility tree, and report what got in the way, judged against docs/principles.md, Nielsen's usability heuristics and WCAG 2.2 AA. Use when asked for a usability review, a walkthrough, or to try something as a user would.
---

# Usability walkthrough

Use the app as a particular person would, to find where a screen leaves
them stuck, unsure or wrong. It finds unclear labels, dead ends and
missing next steps; it cannot tell what real people value, so it comes
before sessions with real people, not instead of them.

## 1. Inputs

- **The task**, in the persona's words: "issue an invoice for last
  week's shipment", not "POST /invoices".
- **The persona**, from `personas.md` beside this file. Default: the
  novice bookkeeper.
- **The language** the persona reads, which the account is set to.

## 2. Set up

Follow the README's Setup: the database up, the server on
`npm run start:dev`, the client on `npm run dev`. For data to work with,
`npm run seed:demo` in `server/` prints a demo account's email; its
password is `demo-password-2026`. Sign in, and set the persona's
language on the Account page.

## 3. Walk the task

Drive the real interface through its accessibility tree, the roles and
names of what is on screen: a browser tool if one is available, or a
throwaway Playwright script using the client's `@playwright/test` and
`getByRole`. Screenshots are a last resort.

Stay in the persona:

- Use only what the persona knows. Do not read the source to find the
  way, or type an address the interface has not shown.
- At each step, note what you looked for, what you found, and where you
  hesitated or guessed.
- If the persona would give up, stop there; that is the finding.

## 4. Judge

Against:

- `docs/principles.md`, especially: does every refusal say what to do
  next, and does a newcomer finish without help?
- Nielsen's ten heuristics: visibility of system status; match with the
  real world; user control and freedom; consistency and standards;
  error prevention; recognition rather than recall; flexibility and
  efficiency; aesthetic and minimalist design; helping users recover
  from errors; help and documentation.
- WCAG 2.2 AA basics: every control labelled, the whole task possible
  from the keyboard, colour never the only signal.
- Language: text left untranslated, awkward or inconsistent in the
  persona's language.

## 5. Report

Start with whether the task was finished, and in how many steps. Then
each finding:

- **Severity**: blocker (could not finish), major (finished, but only by
  guessing), minor (slowed down), cosmetic.
- **Where**: the screen and the control.
- **What happened**, as the persona experienced it.
- **Why it matters**: the principle, heuristic or WCAG criterion.
- **Suggestion**: the smallest change that would help.

Close with what worked well. When asked, file each blocker or major
finding with `gh issue create`, one issue per finding.
