---
paths:
  - "server/src/modules/search/**"
  - "server/src/common/{search,pinyin}*.ts"
  - "server/src/common/dto/search*.dto.ts"
  - "server/src/modules/products/item-search.ts"
  - "server/src/modules/partners/partner-search.ts"
  - "client/src/search/**"
  - "client/src/lib/use-{list,picker}-search.ts"
  - "client/src/components/{variant,partner}-picker*.tsx"
  - "server/test/{lookup,list-search,whole-list-search}.e2e-spec.ts"
  - "client/e2e/search.spec.ts"
---

# Search: the code rules, for Claude

It loads when Claude reads, writes or edits a file its `paths` match.

How the top bar's lookup, a list's search and the pickers match, rank
and refuse is in [`docs/rules/search.md`](../../docs/rules/search.md),
for people; a commit that changes one of those rules updates it
(ADR-087).

- **One matching, in `common/search.ts`.** A search starts from
  `searchTerms`; a code goes through `codeMatches`, a name through
  `nameMatches` (`search_text()`), its pinyin through `pinyinMatches`; an
  item through `itemMatches`, a partner through `partnerRecordMatches`, a
  document by its partner through `partnerMatches`. Never an `ILIKE` of
  its own, so what the lookup finds, its list finds too (ADR-056).
- **Ranked by the same helpers:** `itemRank`, `partnerRank`, or
  `matchRank` and `pinyinRank` under `bestRank`, in the lookup and the
  lists that load whole. A keyset-paged list is never ordered by match,
  which would break its cursor (ADR-056, amended; ADR-051).
- **`name_pinyin` is the full pinyin, a space, then the initials,** as
  `namePinyin` writes it and `pinyinRank` splits it; changing the form
  rewrites the stored rows (ADR-056).
- **The minimum is the lookup's, `lookupLongEnough`,** with its twin in
  `client/src/search/lookup-minimum.ts` kept the same; a list or a picker
  takes `search` through `SearchQueryDto` or `SearchableKeysetQueryDto`
  (ADR-056, amended).
- **Close matches are the lookup's alone,** only when it found fewer than
  `LOOKUP_LIMIT`, after `closeMatchSetting` (ADR-056).
- **A kind in the lookup** is a row in `KINDS` with its own view
  permission, and a case in `pathOf` and `listOf`; the route stays in
  `GATED_INSIDE` ([engineering.md, Server](../../docs/engineering.md#server);
  ADR-056).
- **The browser matches nothing.** A list reads its search through
  `useListSearch`, a picker through `usePickerSearch`; each shows the
  server's answer in its order, asks once typing stops, and drops a late
  answer (ADR-056, amended).
