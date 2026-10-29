---
paths:
  - "server/src/modules/partners/**"
  - "server/src/database/schema/{partners,addresses,contacts}.ts"
  - "client/src/partners/**"
  - "client/src/components/partner-picker*.tsx"
  - "server/test/partners.e2e-spec.ts"
  - "client/e2e/{partners,partner-detail}.spec.ts"
---

# Partners: the code rules, for Claude

It loads when Claude reads, writes or edits a file its `paths` match.

What partners allow, refuse and work out is in
[`docs/rules/partners.md`](../../docs/rules/partners.md), for people; a
commit that changes one of those rules updates it (ADR-087).

- **A partner is matched through `partner-search.ts`:**
  `partnerRecordMatches` and `partnerRank` for a query over partners
  (Partners, the lookup), `partnerMatches` for a document found by its
  partner's name, a subquery that names the organization; the matching
  itself is `common/search.ts`'s (ADR-056, amended).
- **A saved name writes its pinyin:** `namePinyin` on insert, `pinyinOf`
  on update, so search never reads a stale one (ADR-056, "pinyin, written
  when a name is saved").
- **Retire, never delete:** a partner by `isActive`, with no delete
  permission; an address or a contact by its DELETE route, which sets
  `isActive: false` and clears `isDefault` or `isPrimary`, since the
  partial unique index counts a retired row (ADR-028, Consequence).
- **One default address and one primary contact per partner,** held by a
  partial unique index: a write that sets one demotes the other first, in
  the same transaction (`clearDefault`, `clearPrimary`; ADR-028).
- **A language pair is checked as it will stand,** a side left out read
  from the row, by `assertLanguagePair` before the check constraints see
  it (ADR-054); a price list named on a partner by `assertListAssignable`
  (ADR-049, "which list applies").
- **Responses through `partner-views.ts`:** `partnerOf`, `addressOf` and
  `contactOf`, never the row, which carries the organization and the
  pinyin (ADR-068).
- **Partners matches nothing itself:** its search is in the address
  through `useListSearch`, and it shows the server's answer in its order;
  every partner picker is `PartnerPicker`, searching through
  `usePickerSearch` within the `options` its form gives, so a form leaves
  retired partners out there (ADR-056, amended).
- **The export's columns are `PARTNER_COLUMNS`,** its rows through
  `withinLimit`, its route audited as `list.exported` (ADR-057).
