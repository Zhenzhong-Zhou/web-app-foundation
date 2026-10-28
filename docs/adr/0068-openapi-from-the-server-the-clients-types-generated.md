---
status: accepted
date: 2026-10-13
areas: [api]
amended-by: [ADR-081]
---

# ADR-068 — OpenAPI from the server, the client's types generated (#19)

> **Amended by [ADR-081](0081-old-tabs-after-a-deploy.md).**
> The document's `info.version` carries the API revision, `npm run api` writes it into `client/src/api/`, and CI fails a breaking change that leaves it where it was.

## Context

The server and the client agree on the shape of every request
and response by hand. `client/src/lib/types.ts` holds 89 types in 1,164
lines that mirror what 34 controllers send, and nothing checks them: a
field renamed on the server still compiles on the client, and only a
Playwright test that happens to touch the screen notices. Four lists are
copied as well (permissions, languages, audit actions, error codes), each
kept honest by a script of its own in CI. The copies are a sound stopgap,
and they do not scale; the 89 types are the larger risk. The packages share
no files by design, and Render builds `server/` and `client/` as separate
roots, where files outside a service's root directory are unavailable at
build time and at runtime.

## Decision — the server describes its API in OpenAPI 3.1, generated from its code

`@nestjs/swagger` with its CLI plugin, which reads the existing
DTOs and their class-validator decorators, so request bodies need little
new annotation. OpenAPI is the vendor-neutral standard for REST APIs (the
OpenAPI Initiative, under the Linux Foundation), not a Nest invention, so
the same document serves the client, a partner's integration, and any tool
that reads it. The four lists appear in it as enums on the fields that
carry them: a role's permissions, a person's language, an audit entry's
action, an error body's `code`.

- **Written by a script, not served.** A script builds the document from
  the application's modules and writes `server/openapi.json`, committed,
  so a change to the API shows in review as a change to the contract.
  Production serves no documentation page; an interactive one in
  development only, if wanted.
- **One freshness check replaces four.** CI regenerates the document and
  the client's types and fails if either differs from what is committed,
  as the migration snapshots are checked today. The four `check-client-*`
  scripts go once their lists come from the spec.

## Decision — the client's types are generated from the document

`@hey-api/openapi-ts`, with its TypeScript plugin, types only and lists as
plain constants, writes one file into `client/src/api/`, committed, so the
static site's build on Render needs nothing outside `client/`. Pinned to an
exact version: it is pre-1.0, so a minor release may change its output,
and a regenerated file is then a reviewable diff, not a surprise.
`openapi-typescript`, the better-known generator, was the first choice;
its peer range stops at TypeScript 5, below this repository's 6, and
ADR-019 does not override a peer range. Hey API's range is open-ended, but
it writes its output through TypeScript's compiler API, which TypeScript
7's native compiler brings back only in 7.1, so it joins typescript-eslint
and the Nest CLI in what TypeScript 7 waits for (ADR-067). It runs only to
generate a file, never in production, so a break shows as a failed
freshness check; if it lags behind the rest, it can run on a pinned
TypeScript 6 of its own while the project moves on. The client's `api()` stays: its
errors, codes and request ids are this application's own, and a generated
fetch client would replace what works for no gain yet.

## Decision — built in two phases

1. **The contract and the lists.** The plugin, the script, the generated
   file, the four lists read from it, and the freshness check in place of
   the four scripts. One pull request.
2. **The responses, module by module.** Each controller's responses
   declared as classes the plugin describes, and that module's types in
   `types.ts` replaced by the generated ones, until the file is gone. A
   module per pull request or riding along with feature work, never a
   rewrite that blocks it.

## Performance

Nothing changes at runtime. The document is built in a
script and in CI, never per request. Types are erased when the client
compiles, and the lists that ship are the same few constants as today.
Response classes describe the response for the document and the
compiler; they do not validate it on the way out, so the Performance
budgets are untouched.

## Consequences

- One contract for every consumer: the client now, an integration or an
  AI model later.
- "The packages share no files" holds: each side commits what it
  generates, and only the generation reads across.
- `conventions.md` gains how to regenerate after an API change, and the
  pull request checklist the same line as "after a new migration".

## Considered and not done

- **Keeping the copies and their checks.** Cheap, and they work for four
  short lists; they leave the 89 response types unchecked.
- **A shared workspace package** (`packages/shared`), common in TypeScript
  monorepos. On Render it would move both services to the repository root
  with workspace installs and build filters, and it shares only what is
  written into it: the response types would still be copied by hand.
- **A typed RPC contract** (tRPC, ts-rest). Excellent when only TypeScript
  calls the API, and a rewrite of 34 controllers that ties the contract to
  TypeScript, where a B2B product will want plain REST for integrations.
- **Standard Schema responses** (Nest 12's serializer with Zod). It would
  validate every response at runtime, which costs time on the paths the
  Performance budgets measure, for checks the compiler already makes.

## Deferred — each with what brings it in

- **A typed fetch client** generated from the spec. When `api()` itself
  needs replacing.
- **Published API documentation, or SDKs for partners.** The first
  integration a customer asks for.
- **An AI model calling the API, a small local one included.** OpenAPI
  3.1's schemas are JSON Schema, which is how model tool calling and MCP
  describe a tool's inputs, so an operation in the spec can become a tool
  almost directly, and its summary and field descriptions become what the
  model reads to choose it. Three things are decided when it comes, none
  of them here:
    1. **A curated handful of tools, not the whole API.** A small model
       chooses well among about 5 to 15 clearly described tools, and
       poorly among hundreds of endpoints: operations selected from the
       spec, such as finding a lot, stock on hand, or drafting an order.
    2. **Its own credential.** The API authenticates a browser, with a
       session cookie and a CSRF header. An agent needs a scoped API token
       tied to a person, so permissions and the audit log apply to
       whatever it does. An ADR of its own.
    3. **A person confirms every write.** Reading is safe to automate.
       Issuing an invoice or adjusting stock goes through a draft that a
       person approves.

  Reading the UI instead, through the browser's accessibility tree (a
  snapshot of each control's role and label, which the WCAG 2.2 AA
  markup makes readable to a small model), suits testing and
  exploration, not an integration: it is slower, breaks when a screen
  changes, and acts as whoever is signed in to that browser.
  Screenshots for a vision model are less reliable still.

  Trigger: the first AI integration built on this application.

## Amended, October 2026: a response carries exactly what it declares

Phase 2 found that most modules returned table rows, spread into the
response or read with `select()`: each organization's id, who created
and voided a document, the pinyin columns the lookup searches by, the
reminder bookkeeping on a licence. Nothing secret, and tenant isolation
held, but none of it was the client's to read, and a contract that
describes it promises it. The compiler could not catch it: TypeScript
rejects an extra property on an object literal, not on a spread row.

So a response is projected to its declared class, and the e2e suite
holds every JSON response to `server/openapi.json` with each object
schema closed (`test/utils/response-contract.ts`). A field the document
does not declare fails the test that made the request, naming the route
and the field; so does a declared field that is missing or of the wrong
type. Test-only: production loads none of it. A route the document does
not describe yet is skipped, so the check covers each module as phase 2
converts it, and every response once it is done.

Rejected: validating responses in production, which costs every request
and turns a contract slip into a 500 a customer sees rather than a test
a developer fixes; and class-transformer's `excludeExtraneousValues`,
which strips what is undeclared instead of reporting it, hiding the
mistake, and needs every field decorated a second time.

## Phase 2 done, October 2026

Every module's responses are declared,
projected to their classes and checked by the e2e suite, and
`client/src/lib/types.ts` is gone: the client imports the generated
types directly, and keeps in `client/src/lib/api-names.ts` only the
names its screens switch on, each read from a generated type. The
conversion found what the copies had hidden: a credit-note type declared
twice and merged into one neither response matched, an account history
the document called an object, columns typed as text that only ever
held a known list, and rows sent whole across most modules.

*Amended (#194):* `npm run api:spec` builds into `server/dist-openapi/`
(`tsconfig.openapi.json`), not `dist/`. Both builds clean their output
first, so with `npm run start:dev` running, each deleted what the other
had just written: the dev server stopped on Cannot find module until it
was restarted, and the script could lose its own file the same way. The
directory sits beside `dist/`, so every path read from `__dirname` (the
document written to `server/openapi.json`, `package.json`, the fonts)
lands where it does in the app; its incremental state is kept inside it,
and it emits no declarations, which `npm run typecheck` would read.
`api-spec-build.spec.ts` holds the configuration to that.
