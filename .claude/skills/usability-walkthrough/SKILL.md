---
name: usability-walkthrough
description: Walk a task through the running application as one of the personas in personas.md, through the browser's accessibility tree, and report what got in the way, judged against docs/principles.md, Nielsen's usability heuristics and WCAG 2.2 AA. Use when asked for a usability review, a walkthrough, or to try something as a user would; `panel <journey>` walks a journey from journeys.md as several personas at once.
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
language on the Account page. Then follow the persona's **Set up:**
line, where it has one: a screen size, a text size, a slower network,
an account of its own, or each task walked twice. A Set up that slows
the network is walked on the client's production build
(`npm run build`, then `npm run preview` in `client/`), so the walk
times what a person loads, not the development build.

## 3. Walk the task

Drive the real interface through its accessibility tree, the roles and
names of what is on screen: a browser tool if one is available, or a
throwaway Playwright script using the client's `@playwright/test` and
`getByRole`. Screenshots are a last resort, unless the persona's Set up
asks for them.

Stay in the persona:

- Use only what the persona knows. Do not read the source to find the
  way, or type an address the interface has not shown.
- At each step, note what you looked for, what you found, and where you
  hesitated or guessed.
- At each step, answer the cognitive walkthrough's four questions too:
  would the persona try to do this; would they notice the control that
  does it; would they know it does what they want; and afterwards, would
  they see that it worked.
- If the persona would give up, stop there; that is the finding.

## 4. Judge

Against:

- `docs/principles.md`, especially: does every refusal say what to do
  next, and does a newcomer finish without help?
- Nielsen's ten usability heuristics.
- WCAG 2.2 AA basics: every control labelled, the whole task possible
  from the keyboard, colour never the only signal.
- The design language's
  [Text and targets](../../../docs/design-language.md#text-and-targets):
  text to decide by at 16 px, and on a phone or a tablet every target at
  least 44 × 44 px.
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

Then what worked well; the last line is `DONE: <why>` or
`BLOCKED: <what is needed>`, as `CLAUDE.md`'s "Report for a quick
read" says. When asked, file each blocker or major finding with
`gh issue create`: one issue per finding for a single walk; for a
panel, one issue per screen for the findings its screens own, and none
for those the design language settles (ADR-090).

## 6. A panel: several personas at once

`/usability-walkthrough panel <journey>` walks a journey from
[journeys.md](journeys.md) as each of its personas at the same time,
each in its own `walkthrough` subagent (`.claude/agents/walkthrough.md`),
then merges what they found. `as <personas>` walks only those; `into
<folder>` names where the reports go, `tmp/walkthroughs/` when none is
given, which git ignores.

1. **Set up once,** in this session: the app as section 2 says, its
   production build when any persona's Set up slows the network, kept
   running, its API started with `RATE_LIMIT_MAX=10000` and
   `THROTTLE_FACTOR=1000`, as the screenshots' API is, since the walkers
   share one address and the dev limit of 100 a minute showed one a 429;
   then `npm run seed:demo` in `server/` once per persona, one after
   another, keeping each account's email. A journey that starts on a new
   organization takes no seed: one account per persona and size it walks
   instead, since a second size would meet a Getting started the first
   had done, each made through `POST /v1/auth/register` as the sign-up
   form makes one, with an address new to this run, the demo's password
   and a company name of its own.
2. **Give out the sizes,** so every journey is walked at each of the
   design language's five
   [width classes](../../../docs/design-language.md#screen-sizes), the
   iPhone Duo's two sizes counted among them. These five, in this order,
   go to the journey's personas in turn, in the order the journey lists
   them, until each has a walker; a persona given more than one walks
   them one after another, and a sixth persona starts again at the first:
   1. a phone, 390 × 844 (`xs`);
   2. the iPhone Duo, closed, about 466 × 678 (`xs`), then open, about
      890 × 626 (`sm`);
   3. a tablet held sideways, 1180 × 820 (`md`);
   4. a laptop, 1366 × 768, where the rail first shows (`lg`);
   5. a desktop, 1920 × 1080 (`xl`).

   With `join`'s two personas, the outsider walks the first, third and
   fifth, the senior the second and fourth. A journey's own **Sizes:**
   line overrides them (ADR-091). Either way they replace the sizes in
   the persona's Set up, and the rest of it stays.
3. **Start the subagents together,** one per persona, each given its
   persona, its account, the journey's tasks as written for it, its
   screen sizes, and its report's path, `<folder>/<journey>-<persona>.md`,
   as in `home-senior-who-reads-only-chinese.md`.
4. **Wait for all of them.** One that ends BLOCKED is named in the
   merge, and the others still count.
5. **Merge** into `<folder>/<journey>.md`: each finding once, the
   personas who hit it, its worst severity, "every screen" or "this
   journey", and the principle of the design language it breaks
   (`docs/design-language.md`), or none; sorted by severity, then by how
   many personas hit it. A finding that two personas or more hit, or that
   is marked every screen, is the design language's to settle; the rest
   belong to the journey's screens.
6. **Stop the app if the panel started it;** one already running before
   it is left as it was. End as section 5 does, with the merge's path.

Why the walks can run at once, and what each may touch:
[`walkthrough.md`](../../agents/walkthrough.md).
