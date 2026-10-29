# The rules, by area

What the app allows, refuses and works out, one file per area, as the
code does it today ([ADR-087](../adr/0087-the-rules-written-down.md)).

## What a rules file is, and is not

A rules file is reference: every rule of one area in plain words, each
linked to what decided it and what proves it, so a question such as "can
a credit note give back more than is left of its invoice?" is answered
from one page rather than from the code.

It is not:

- **why** a rule is so, which is its ADR's, in [`docs/adr/`](../adr/README.md);
- **how to** do a task, which is the Help guides', in the app and in
  [`client/src/help/guides/`](../../client/src/help/guides/), invoices'
  in [`en/invoices.md`](../../client/src/help/guides/en/invoices.md);
- **how the code is organized,** which is
  [`conventions.md`](../conventions.md) and Claude's code rules for the
  area, in [`.claude/rules/`](../../.claude/rules/), invoices' in
  [`invoices.md`](../../.claude/rules/invoices.md);
- **history.** When a rule changes, its bullet changes; the amendment that
  changed it says why.

It is written for a support person answering a customer, a developer
about to change an area, and Bob six months on. English only, as the
ADRs are.

## The format

Rules are grouped under headings by what a person does: for invoices,
drafting, issuing, crediting part of an invoice, crediting goods that
came back, voiding, numbering, printing and downloading, making a pro
forma, what a sale shows of its invoices, and who may do what. One bullet per
rule: the rule first, in bold, in the words a person would use; then a
sentence or two where it needs them; then its links, separated by ` · `.

```markdown
- **Voiding frees the shipment,** to be invoiced again or voided itself.
  [ADR-046](../adr/0046-invoicing.md#decision--a-mistake-after-issue-is-reversed-by-a-credit-note) ·
  [test](../../server/test/invoices.e2e-spec.ts) "frees the shipment to be invoiced again" ·
  [Help](../../client/src/help/guides/en/invoices.md#void-an-invoice-void) ·
  MC-704
```

- **The ADR** that decided the rule, linked to its decision's heading, or
  to the amendment that changed it.
- **The test** that proves it: a link to the test's file, then its name
  in quotes, exactly as the file has it. A rule proved in several places,
  on the server, in the browser, cites each. A rule with no test says
  `no test`, and one its tests prove only in part says `partly tested`
  after them: each is a finding for the area's next fix-up, not a reason
  to leave the rule out.
- **The Help section** where a person meets the rule, if one does, in the
  English guide and by GitHub's anchor (`#void-an-invoice-void`), not the
  guide's own `{#void}`, so the link opens on GitHub and is checked.
- **The manual check** that walks the rule by hand, by its id in
  [`docs/manual-checks.md`](../manual-checks.md).

The rules carry no ids of their own: nothing cites a single rule yet.

## Kept true

**A commit that changes a rule updates its rules file in the same
commit,** as a commit that changes what a person sees updates
`docs/manual-checks.md`.

`scripts/check-docs.mjs` checks every rules file on each run of
`scripts/verify.sh` and in the Docs workflow: each is named for its
area, as the ADRs' areas name it; each link leads to a file and a
heading; each quoted test name is found in the file linked before
it, so renaming a test fails the check; each manual check's id exists.
It also prints a notice, never a failure, for a rules file whose tests or
area changed on the branch while it did not: most code changes change no
rule, so the review judges each notice.

## The files

- [Invoices](invoices.md): invoices, credit notes and the pro forma, the
  pilot, written from the code and the tests on 27 October 2026.
- [Partners](partners.md): customers and suppliers, with their addresses,
  contacts, price lists, document languages, search and export, written
  from the code and the tests on 28 October 2026.
- [Products](products.md): products and their variants, names in other
  languages and the name each reader sees, the Products search and the
  item pickers, images, the catalogue export, and who may change them,
  written from the code and the tests on 28 October 2026.
- [Search](search.md): the top bar's search, a list's search box and the
  item and partner pickers, how each matches, ranks and refuses, written
  from the code and the tests on 28 October 2026.

The other areas, stock, orders, return authorizations and the rest of
the ADRs' [areas](../adr/README.md#by-area), follow, each written by
[`/rules-file <area>`](../../.claude/skills/rules-file/SKILL.md) from
its code and tests: each fix-up batch writes the rules files of the
areas it touches, and one docs pull request writes the remaining ones
before the whole-app review.
