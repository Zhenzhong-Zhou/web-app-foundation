---
status: accepted
date: 2026-08-24
---

# ADR-005 — No background jobs in V1; email sends synchronously

## Context

A job queue means Redis, retry logic, dead-letter handling, and a second
process to run and deploy. In V1 the only async candidate is a handful of transactional
emails.

## Decision

Send email synchronously. Use Mailpit in development — no SMTP provider,
no API keys, no signup. Defer BullMQ until sending actually becomes slow.

## Consequence

Notably less infrastructure to run and learn while building. Slow SMTP
will block request threads; that is acceptable at V1 volume and is the signal to add the
queue. The change is purely additive — no schema or API impact.

## Amended after first deployment

Two things the local Mailpit setup could not
surface.

Managed hosts commonly block outbound port 587 to prevent spam — Render's free
tier does — so SMTP from a container fails with a connection timeout that reads
like bad credentials and is not. Mail therefore goes over the provider's HTTP
API in production, selected by the presence of `RESEND_API_KEY`; Mailpit keeps
the SMTP path in development, so local stays zero-config. This is not
provider-specific: every mail provider offers an HTTP API precisely because SMTP
is unavailable on so much hosting.

And the synchronous-send cost is larger than "slow SMTP blocks a request
thread". A *blocked* port blocks it until the OS gives up — fifteen seconds
against Render, long enough for the platform's proxy to return 502 before the
handler finished. Connection and greeting timeouts now bound it at five seconds.
That is the signal this ADR anticipated, though it arrived as a network
constraint rather than as volume.
