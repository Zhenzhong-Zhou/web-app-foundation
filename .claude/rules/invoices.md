---
paths:
  - "server/src/modules/invoices/**"
  - "server/src/database/schema/{invoice,credit-note}*.ts"
  - "client/src/invoices/**"
  - "client/src/orders/pro-forma-dialog*.tsx"
  - "server/test/{invoices,credit-notes}.e2e-spec.ts"
  - "client/e2e/invoicing.spec.ts"
---

# Invoices: the code rules, for Claude

It loads when Claude reads, writes or edits a file its `paths` match.

What invoicing allows, refuses and works out is in
[`docs/rules/invoices.md`](../../docs/rules/invoices.md), for people; a
commit that changes one of those rules updates it (ADR-087).

- **Only a draft changes.** An edit or an issue goes through `lockDraft`
  (`lock-draft.ts`), which locks the row and refuses anything past draft;
  after issue, a credit note and a new invoice (ADR-046).
- **Amounts are written at issue, in SQL,** rounded once to the
  currency's minor units (`minorUnits`), tax per component on the lines
  that carry it, once per document; every later read sums what is stored
  (ADR-046). A credit note uses its invoice's rates, each component
  capped at what the invoice charged less earlier credits (ADR-047).
- **An issued document reads its own copies** of the seller, the
  bill-to, the lines and their taxes, never the partner, the organization
  or today's tax code; its foreign keys are for provenance (ADR-046).
- **Numbers come from `takeNumber`** inside the issuing transaction, so
  a failed issue hands its number back; never a Postgres sequence
  (ADR-046, ADR-073).
- **Money is a decimal string end to end,** summed in SQL; the client
  formats it and adds nothing up (ADR-025, ADR-055;
  [engineering.md, Server](../../docs/engineering.md#server)).
- **Each PDF is a `Printable`** sent by `documents.send` beside its read,
  under the same permission; the export's come through
  `invoice-documents-export.ts` (ADR-071; [conventions.md, A new printed document](../../docs/conventions.md#a-new-printed-document)).
- **A refusal the screen offers a way out of** carries its code, and a
  numbering one its details, through `withCode` ([conventions.md, Error codes](../../docs/conventions.md#error-codes)).
