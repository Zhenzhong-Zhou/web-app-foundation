import { or, type SQL, sql, type SQLWrapper } from 'drizzle-orm';

import {
  bestRank,
  codeMatches,
  matchRank,
  type SearchTerms,
} from '../../common/search';

/** A lot's id and two codes, as the query names them: `lots`, or an alias's columns. */
interface LotCodes {
  id: SQLWrapper;
  code: SQLWrapper;
  supplierLot: SQLWrapper;
}

/**
 * The organization's lots with a former code matching (ADR-094 amended,
 * R10), any part of it or, `whole`, all of it, case ignored: found once,
 * as an array, through lot_former_codes_code_trgm_idx, led by the
 * organization, so that inside an OR it joins the lot's own trigram
 * indexes in one bitmap OR (database.md: an `in` there is a hashed
 * subplan, which no index serves).
 */
function formerCodesMatching(
  terms: SearchTerms,
  organizationId: string,
  whole: boolean,
): SQL {
  return sql`array(
    select f.lot_id from lot_former_codes f
    where f.organization_id = ${organizationId}::uuid
      and ${codeMatches(sql`f.code`, terms)}
      ${whole ? sql`and lower(f.code) = lower(${terms.text})` : sql``}
  )`;
}

/**
 * Whether a lot matches a search (ADR-094, R6; ADR-044 and ADR-056,
 * amended): any part of its own code, of its supplier's lot or of a code
 * it had before Edit lot details corrected it (ADR-094 amended, R10),
 * each a code, matched as typed apart from capitals. Trace a lot, Stock's
 * search, the Lot view, Stock value's find and the top bar's lookup, and
 * so Movements' find box, all read it, so a lot one of them finds, the
 * others find too. Each column has its trigram index led by the
 * organization (lots_code_trgm_idx, lots_supplier_lot_trgm_idx,
 * lot_former_codes_code_trgm_idx), which the planner reads as one bitmap
 * OR.
 */
export function lotMatches(
  lot: LotCodes,
  terms: SearchTerms,
  organizationId: string,
): SQL {
  return or(
    codeMatches(lot.code, terms),
    codeMatches(lot.supplierLot, terms),
    sql`${lot.id} = any(${formerCodesMatching(terms, organizationId, false)})`,
  )!;
}

/**
 * How closely a lot matches, for ORDER BY, lowest first (ADR-056): exact,
 * then at the start, then anywhere, the better of its two codes, so the
 * start of either comes first. A former code typed whole ranks as exact,
 * after the lot whose code it is today (ADR-094 amended, R10, F8); any
 * other part of one, as anywhere. For the same query as lotMatches.
 */
export function lotRank(
  lot: LotCodes,
  terms: SearchTerms,
  organizationId: string,
): SQL {
  return bestRank(
    matchRank(lot.code, terms),
    matchRank(lot.supplierLot, terms),
    sql`case when ${lot.id} = any(${formerCodesMatching(terms, organizationId, true)}) then 0.5 end`,
  );
}

/**
 * The former code a search found a lot by (ADR-094 amended, R9), for a
 * hit to say "was {code}": the one typed whole first, then the latest;
 * null where its code today matches too, or no former code does. For a
 * statement's own rows, `lot` named in plain SQL, as a correlated
 * subquery's outer row is (database.md).
 */
export function formerCodeFound(
  lot: { id: SQL; code: SQL },
  terms: SearchTerms,
  organizationId: string,
): SQL<string | null> {
  return sql<string | null>`case when not ${codeMatches(lot.code, terms)} then (
    select f.code from lot_former_codes f
    where f.organization_id = ${organizationId}::uuid
      and f.lot_id = ${lot.id}
      and ${codeMatches(sql`f.code`, terms)}
    order by lower(f.code) = lower(${terms.text}) desc, f.changed_at desc
    limit 1
  ) end`;
}
