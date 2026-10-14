# Principles

What this application aims for, so a change can be judged against
something other than taste. The ADRs record what was decided and why;
these say what the decisions were for. Each names the ADRs that already
hold to it.

Draft, October 2026: proposed from the ADRs as they stand. Edit freely;
a principle nobody would defend should go, and one that keeps coming up
in reviews should be added.

## Every refusal says what to do next

When the app says no, it says why in the person's words and points to
where the fix is: a missing address links to the page that sets it, not
to a code. A refusal that leaves someone guessing is a bug.

Held by: ADR-061 (an invoice refused for a missing address links to
where it is set), the error codes in `server/src/common/error-codes.ts`.

## Numbers are exact

Money and quantities are decimal strings from the database to the
screen, never floating-point numbers, and totals come from the server so
every screen shows the same figure. A rounding a person can see is a
defect, however small.

Held by: ADR-025 (decimals), ADR-046 (tax per component, rounded once),
ADR-055 (totals from the server).

## Nothing is lost silently

Records are deactivated, voided or credited rather than deleted once
anything depends on them, and who did what stays in the history. A
mistake is corrected by a visible act, not by erasing the evidence.

Held by: ADR-012 (people anonymized, rows kept), ADR-018 (the audit log),
ADR-046 and ADR-047 (voids and credit notes).

## A newcomer finishes the common tasks without training

Screens use the words of the people who do the work, show the next step,
and do not hide what matters behind settings. If a task needs someone to
explain it, the screen is not finished.

Held by: Home's getting-started steps (ADR-058), the lookup (ADR-056).

## Every screen works in every language the app speaks

English, French and Simplified Chinese are equals: a screen, a message
or a printed document missing in one of them is incomplete. People
choose their own language; documents print in the customer's.

Held by: ADR-054.

## Everyone can use it

The interface meets WCAG 2.2 AA: every control has a label, everything
works from the keyboard, and colour never carries meaning alone.

Held by: ADR-055 (WCAG 2.2 AA as the floor), the axe checks in
`client/e2e/accessibility.spec.ts`.

## Each organization's data is its own

No query reads across organizations, and a response carries only what
its screen needs: never a whole row, never another organization's ids,
never more about a person than their role allows.

Held by: ADR-003 (every row carries its organization), ADR-063 (what
others see of a person), ADR-068 (a response carries exactly what it
declares).

## Fast enough to forget

Every endpoint has a response-time budget measured against a year of
data, and a query plan that scans a large table fails the build. Speed
is checked, not hoped for.

Held by: ADR-051.

## Decisions are written down

A choice that shapes the code becomes an ADR before the code lands, and
something deferred is recorded with the trigger that would bring it
back. The reasoning is never rediscovered from scratch.

Held by: `docs/decisions.md`, the working agreements in
`docs/handoff.md`.
