import { or, type SQL, type SQLWrapper } from 'drizzle-orm';

import {
  bestRank,
  codeMatches,
  matchRank,
  type SearchTerms,
} from '../../common/search';

/** A lot's two codes, as the query names them: `lots`, or an alias's columns. */
export interface LotCodes {
  code: SQLWrapper;
  supplierLot: SQLWrapper;
}

/**
 * Whether a lot matches a search (ADR-094, R6; ADR-044 and ADR-056,
 * amended): any part of its own code or of its supplier's lot, each a
 * code, matched as typed apart from capitals. Trace a lot, Stock's search,
 * the Lot view and the top bar's lookup, and so Movements' find box, all
 * read it, so a lot one of them finds, the others find too. Each column
 * has its trigram index led by the organization (lots_code_trgm_idx,
 * lots_supplier_lot_trgm_idx), which the planner reads as one bitmap OR.
 */
export function lotMatches(lot: LotCodes, terms: SearchTerms): SQL {
  return or(codeMatches(lot.code, terms), codeMatches(lot.supplierLot, terms))!;
}

/**
 * How closely a lot matches, for ORDER BY, lowest first (ADR-056): exact,
 * then at the start, then anywhere, the better of its two codes, so the
 * start of either comes first. For the same query as lotMatches.
 */
export function lotRank(lot: LotCodes, terms: SearchTerms): SQL {
  return bestRank(
    matchRank(lot.code, terms),
    matchRank(lot.supplierLot, terms),
  );
}
