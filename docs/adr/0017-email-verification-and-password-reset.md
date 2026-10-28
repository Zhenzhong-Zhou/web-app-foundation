---
status: accepted
date: 2026-08-28
areas: [auth]
---

# ADR-017 — Email verification and password reset

## Context

Both flows hand a user a link they click later. The questions were
where the tokens live, what the links point at, and what happens when something
fails.

## Decision — one table, two purposes

`auth_tokens` carries a `purpose`
column rather than there being one table per flow. The columns, the SHA-256
storage, the expiry check, the single-use rule and the sweep are identical;
only the lifetime differs, and a lifetime is a value. Invitations (ADR-006) will
be the third purpose. `purpose` is part of the consume condition, so a
verification token cannot be presented to the reset endpoint.

Lifetimes: 24 hours for verification, because a link sits in an inbox; one hour
for reset, because that token is a live credential for taking over an account.

## Decision — consume in one statement

`consume()` validates and marks spent
in a single UPDATE. A SELECT then UPDATE lets two concurrent clicks both pass
the check, and a password reset that runs twice is a real problem. Postgres
serialises the row update, so exactly one caller sees a row.

## Decision — links point at the SPA, and the endpoints are POST

Corporate
mail scanners (Safe Links, Proofpoint, Mimecast) fetch every URL in an incoming
message. A GET that spends a token is consumed before the human clicks, and the
user reports that verification is broken. The link opens a static page; the
token is spent only when the page POSTs it. This is also the GET-must-not-mutate
rule that ADR-014 already relies on.

## Decision — asymmetric failure posture

A verification send failure is logged
and swallowed: the account exists, the user is signed in, and losing a
registration to a dead SMTP connection would be absurd — resend is the remedy. A
reset send failure propagates: reporting success while the mail never left
leaves someone waiting for a link that is not coming, and retrying produces the
same silence.

## Decision — `forgot-password` answers identically for an unknown address

Login goes to real trouble not to be an enumeration oracle. An endpoint
answering "no such address" hands back exactly what login refused. Same 202
either way, and no "we couldn't find that email" anywhere in the UI.

## Decision — reset revokes every session and issues none

The likely reason
someone is resetting is that an attacker holds their password; a reset that
leaves that session live is not a recovery (ADR-011). No session is issued in
exchange: the user signs in with the password they just chose, which is the
moment a password manager reliably captures it, and a link from an inbox is a
weaker credential than a password.

## Consequence

Every flow that mails a link needs `CLIENT_URL`, which is
separate from `APP_URL` — they coincide in a same-origin deployment and must not
be assumed to. Tests inject a recording mailer, because the flow is only
testable end to end if the token can be read back out of the message that
carried it.

## Known gap — timing on `forgot-password`

A known address costs a token issue
and an SMTP round trip; an unknown one returns immediately. The response is
identical, the timing is not. Login closed the equivalent with a decoy hash. Left
open because the SMTP round trip makes the real path's timing noisy enough that
the signal is weak — but it is a decision, not an oversight. The fix is a
comparable artificial delay on the miss path.
