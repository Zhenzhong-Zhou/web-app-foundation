---
status: accepted
date: 2026-08-24
---

# ADR-001 — NestJS as the server framework

**Context.** Candidates were Spring Boot, Express, Next.js API routes, and NestJS.
Express is too minimal for a foundation project — everything (structure, DI, validation,
auth) would be hand-assembled. Next.js couples the API to the frontend framework and has
no story for background work, which is wrong for a platform meant to serve multiple future
applications and possibly non-browser clients. Spring Boot is the most mature option,
but the developer has no Java experience.

**Decision.** NestJS.

**Consequence.** One language across frontend and backend; types can be shared with the
React client. Only one unknown to learn (the framework), not two (language + framework).
NestJS's module/DI/guard model mirrors Spring closely enough that the concepts transfer if
a move to Spring ever happens. Cost: authorization tooling is less mature than Spring
Security, so more of the auth surface is hand-built.
