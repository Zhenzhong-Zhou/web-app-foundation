---
status: accepted
date: 2026-09-21
---

# ADR-037 — Security events are emailed too; notifications expire

## Context

ADR-036 kept notifications in-app only and named the one case
that could not wait: an unfamiliar sign-in. The in-app notice lands where the
attacker is, and "Mark all read" makes it disappear in one click. Separately,
nothing removed a notification once written, so the table grew with every
emit for as long as the product ran.

## Decision — the three account notifications are also emailed

These are
`session.created` from an unfamiliar browser, `account.password_changed`, and
`account.password_reset`. The same rule decides both channels, in
`AccountEventService.notify()`, so the inbox cannot drift from the bell or
become noisier than it. The email states what happened, when, the browser,
and the IP. It links to `/forgot-password` and `/account/sessions`, both plain
pages the reader could type themselves. It carries no token and no one-click
"secure your account" action, because that is the shape phishing copies.
User-typed values are HTML-escaped.

## Decision — sent without awaiting, no delivery column

This runs inside
login, and a slow provider would otherwise hold up the sign-in button. The send
starts before `record()` returns and a failure is logged. A crash mid-send
loses the email, which is the same trade ADR-036 made for the notification row.
No `delivered_at` column and no retry: a security email that arrives an hour
late through a retry queue is worth less than the complexity, until there is a
job runner anyway.

## Decision — lazy retention on emit, per recipient

Read notifications go at
90 days, matching account_events (ADR-022). Unread ones go at 365 days:
deleting unseen rows is the only way this loses information, so they get
longer, but a year-old unread row only pins the badge at 99+. The sweep runs in
`emit()` for that emit's recipients, using the existing `(user_id, id)` index.
It runs on emit because emit is the only thing that grows the table. It does
not run on `list()`, a GET that fires every time the bell opens, where a
deleting read would take write locks on every click.

## Rejected: a delete / clear button

It lets whoever holds the session erase
exactly the rows an attacker wants gone. Mark-read hides without destroying.

## Revisit when

There is a job runner (move email to an outbox with retries,
and retention to a nightly batched delete), or the table is large enough that
monthly partitions dropped whole beat row deletes.
