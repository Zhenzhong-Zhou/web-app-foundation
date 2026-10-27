---
status: accepted
date: 2026-10-13
---

# ADR-066 — Covers in the lookup

**Context.** ADR-062 put a product's cover beside its name in Products and
Inventory, and left the top bar's lookup (ADR-056) as text: its results
are one shape for eight kinds of record, and only items have a picture.
Typing "focus" lists Focus 60 and Focus 120 as two lines of words, when
the bottle would say which at a glance.

**Decision — an item's result shows its product's cover.**

- `LookupResult` gains `coverFileId`: the product's cover for an item,
  null for every other kind. The item query reads it as Products does,
  through `coverOf()` on the gallery's index (ADR-062), one subquery per
  result, at most the lookup's own limit of them.
- The client shows it at 32 px beside the item's title and SKU, the same
  tile as the lists when there is none, so items line up whether or not
  they have a photo. Other kinds keep their rows as they are.
- The image is the 400 px thumb the lists already cached (ADR-059), so
  an item seen in Products costs the lookup nothing more.

**Considered and not done.**

- **Covers for lots and order lines in the lookup.** A lot is found by
  its code and an order by its number; the picture is the item's, and
  the item's own result is one line away.
