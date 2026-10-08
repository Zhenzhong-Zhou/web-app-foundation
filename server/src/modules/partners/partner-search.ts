import { or, type SQL, sql, type SQLWrapper } from 'drizzle-orm';

import {
  closeMatches,
  nameMatches,
  pinyinMatches,
  type SearchTerms,
} from '../../common/search';
import { partners } from '../../database/schema';

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
