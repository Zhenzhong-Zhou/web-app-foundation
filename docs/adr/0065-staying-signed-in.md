---
status: accepted
date: 2026-10-09
---

# ADR-065 — Staying signed in: the person's choice, and the organization's policy

**Context.** A session lasts seven days idle and thirty in all (ADR-011),
which suits a person on their own laptop. On a computer several people
share, a warehouse PC say, whoever walks up next works as whoever signed
in last, and the history says they did it. ADR-063 left this as an open
decision. Two layers answer it, the way most products do: the person
says whether this computer should keep them, and the organization may
say how long anyone stays idle.

**Decision — layer one: "Keep me signed in", the person's, per sign-in.**

- A checkbox on the sign-in page, ticked by default: today's session,
  seven days idle and thirty in all, nothing changes.
- Unticked, for a shared computer: the cookie lasts until the browser
  closes, and the server holds the session to two hours idle and twelve
  hours in all, whatever the browser does, since a browser that restores
  its tabs may keep a session cookie too.
- The choice is the session's, recorded on it, and affects nobody else.
  Google, Microsoft, GitHub and most banks offer the same.
- The browser remembers it: unticked on a shared computer, the box
  starts unticked there next time, so nobody has to remember to untick
  it, and a person's own laptop stays ticked.

**Decision — layer two: an organization's policy, the owner's.**

- Organization → a new **Security** tab, for those who may update the
  organization: "Sign out after inactivity": Off, 15 minutes, 30
  minutes, 1 hour or 4 hours, Off by default.
- "Applies to": only sign-ins without "Keep me signed in" (the default,
  the least annoying), or everyone, for organizations whose rules ask
  for it.
- It only ever shortens: a session's idle limit is the shorter of its
  own and the policy's. Google Workspace, Microsoft 365, Okta and
  Salesforce give their admins the same lever.
- Someone in two organizations is held to the policy of the one their
  session is in. Changing the policy is audited, as every organization
  setting is.

**Decision — enforced by the server, warned by the page.**

- The server refuses a session past its limit on the next request and
  ends it, so a page that dodged its own timer protects nothing it
  should not. Only real activity counts: a background request, the
  bell's poll, moves no timer (ADR-063).
- Activity is a click, a key, a scroll or a tap, not the mouse moving on
  its own: a bumped mouse or a screen saver keeps nobody signed in. While
  someone is active the page tells the server at most once a minute, so
  the two timers agree.
- A minute before the limit, a dialog: "You'll be signed out in 60
  seconds", with Stay signed in, which makes a real request, and Sign
  out. Stay signed in has the focus, so Enter or Space keeps you in. A
  page with unsaved changes adds that they will be lost. The countdown
  also shows in the tab's title, "(0:54) Signing out…", for someone
  looking at another window. Every tab of the app counts as one:
  activity in any of them keeps them all, and signing out in one signs
  out all.
- Signed out by the limit, the sign-in page says why, and brings the
  person back to the page they were on.

**Consequences.**

- Migration: `sessions.keep_signed_in` (true for every existing session,
  which is what they were), and the organization's
  `idle_sign_out_minutes` (null for Off) and `idle_sign_out_scope`.
- `/v1/auth/me` carries the session's limit, so the page knows when to
  warn without guessing.
- Built in this order, one PR: the screens on the Claude Design canvas,
  reviewed first; the migration; the server; the client; manual checks.

**Considered and not done.**

- **An organization-wide idle sign-out alone.** It punishes everyone on
  their own laptop for a problem only shared computers have; the
  person's choice is the baseline, the policy the organization's
  addition.
- **A maximum session length in the policy.** The absolute limits cover
  it today; trigger below.

**Deferred — each with what brings it in.**

- **Lock instead of sign out:** after idle time the screen locks, and
  the password or a short PIN resumes on the same page. **Switch user
  with a PIN:** several people share one terminal and change hands in
  seconds without full sign-ins. Both are the patterns of retail tills,
  warehouse handhelds and hospital terminals, good at a device shared
  all day and not the common pattern for a web app. Trigger: a native
  app, or this app run on shared scanners, handhelds or kiosks.
- **A maximum session length an organization sets.** Trigger: a
  regulated customer whose rules name one.
