import { or, type SQL, sql, type SQLWrapper } from 'drizzle-orm';

import {
  bestRank,
  closeMatches,
  codeMatches,
  matchRank,
  nameMatches,
  pinyinMatches,
  pinyinRank,
  type SearchTerms,
} from '../../common/search';
import { partners } from '../../database/schema';

/**
 * Whether a partner matches a search (ADR-056): its name, accents ignored
 * and by pinyin, its code and its tax ID. For a query over partners; the
 * lookup and Partners both find a partner by it.
 */
export function partnerRecordMatches(terms: SearchTerms): SQL {
  return or(
    nameMatches(partners.name, terms),
    codeMatches(partners.code, terms),
    codeMatches(partners.taxId, terms),
    pinyinMatches(partners.namePinyin, terms),
  )!;
}

/**
 * How closely a partner matches, for ORDER BY, lowest first (ADR-056):
 * exact, then at the start, then anywhere, on what partnerRecordMatches
 * reads.
 */
export function partnerRank(terms: SearchTerms): SQL {
  return bestRank(
    matchRank(partners.name, terms, 'name'),
    matchRank(partners.code, terms),
    matchRank(partners.taxId, terms),
    pinyinRank(partners.namePinyin, terms),
  );
}

/**
 * A document found by its partner's name (ADR-056), as a subquery on the
 * document's own partner column rather than an OR across a join.
 *
 * `orders.reference ILIKE … OR partners.name ILIKE …` spans two tables, so
 * neither trigram index can serve it and the orders are read in full.
 * `orders.reference ILIKE … OR orders.partner_id IN (partners matching)`
 * keeps both halves on orders: the trigram index for the reference, the
 * partner index for the ids, combined by a bitmap OR. The partners are
 * found through their own trigram indexes.
 */
export function partnerMatches(
  partnerId: SQLWrapper,
  terms: SearchTerms,
  how: 'exact' | 'close' = 'exact',
): SQL {
  const match =
    how === 'close'
      ? closeMatches(partners.name, terms, 'name')
      : or(
          nameMatches(partners.name, terms),
          pinyinMatches(partners.namePinyin, terms),
        );
  return sql`${partnerId} in (select ${partners.id} from ${partners} where ${match})`;
}
