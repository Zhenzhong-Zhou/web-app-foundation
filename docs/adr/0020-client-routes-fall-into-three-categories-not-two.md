---
status: accepted
date: 2026-08-31
---

# ADR-020 — Client routes fall into three categories, not two

**Context.** The obvious split is authenticated and public. It is wrong here,
and wrong in a way that looks correct: wrapping every route in a session guard
is the safe-looking default, and it silently breaks both flows in ADR-017.

Verification and reset links are opened from an inbox. Verification is normally
clicked *while signed in* — registration signs the user in and then mails them.
Reset is opened *while signed out*, by definition; the user is there because
they lost access. A guard that redirects either one to `/login` breaks it, and
the breakage only appears when a real email arrives, not in any test that posts
a token directly.

**Decision.** Three categories.

| Category  | Rule                                                 | Routes                             |
|-----------|------------------------------------------------------|------------------------------------|
| Protected | No session → `/login`, remembering the attempted URL | everything else                    |
| Auth-only | Session → `/`                                        | `/login`, `/register`              |
| Public    | Renders regardless of session                        | `/verify-email`, `/reset-password` |

Auth-only exists because a signed-in user submitting the login form rotates
their session for nothing — login revokes the presented session and issues a
new one (ADR-015), leaving churn in the active-sessions screen that nobody
caused.

**Consequence.** The guard is only meaningful once the boot check has resolved.
`/v1/auth/me` is the sole request the app blocks on: before it answers there is
no correct thing to draw, because "no session" and "not yet known" are
indistinguishable and one of them redirects. Every other load renders its
layout and fills in.

Redirects use `replace`, or the back button bounces between the guard and the
login page. The attempted path is carried in router state so a deep link
survives sign-in.

Adding a route means choosing a category. The failure mode is a public route
added under the guard, which is invisible until someone clicks a link in an
email — so the token pages carry a comment saying they are public by necessity
rather than by oversight.
