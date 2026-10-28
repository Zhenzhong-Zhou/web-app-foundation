---
status: accepted # or deferred: decided, and waiting for its trigger
date: YYYY-MM-DD # the day it is written
areas: [area] # one to three of AREAS in scripts/adr-index.mjs, in that list's order
# amends: [ADR-NNN] # the ADRs it changes; each lists this one in its amended-by
# amended-by: [ADR-NNN] # left out until an ADR amends this one, and written by that ADR
---

<!--
The headings by MADR 4.0's names (ADR-086): Context is its Context and
Problem Statement; Decision, its Decision Outcome; Considered and not
done, its Considered Options; Consequences, its Consequences. Deferred,
with its triggers, has no counterpart, and stays.

An amendment comes later, at the end of the ADR it amends:
"## Amendment (Month YYYY) — what it settles", its labels as ### headings.

Copied to NNNN-<slug>.md, it loses every comment, these lines included,
and each line under a heading is replaced.
-->

# ADR-NNN — Its subject: what was decided (amends ADR-NNN)

## Context

The situation that asks for a decision, and what the check before
drafting found, as [engineering.md, Process](../engineering.md#process)
asks.

## Decision — what was chosen, in a few words

What was chosen and why; a heading of its own for each decision.

## Considered and not done

- **Each option not taken.** Why not, in a sentence or two.

## Deferred — each with what brings it in

- **Each thing left for later.** The trigger that brings it in.

## Consequences

- What this now commits us to: the code, the tests, the docs and the
  work it changes.
