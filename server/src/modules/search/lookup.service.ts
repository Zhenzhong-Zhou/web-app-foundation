import { Injectable } from '@nestjs/common';
import { and, desc, eq, notInArray, or, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import {
  closeMatches,
  closeMatchSetting,
  closeness,
  codeMatches,
  matchRank,
  nameMatches,
  pinyinMatches,
  type SearchTerms,
  searchTerms,
} from '../../common/search';
import type { Permission } from '../../core/authorization/permissions';
import {
  creditNotes,
  invoices,
  lots,
  orders,
  partners,
  productionOrders,
  products,
  productTranslations,
  productVariants,
  returnAuthorizations,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { partnerMatches } from '../partners/partner-search';
import { itemMatches } from '../products/item-search';

/** At most this many of each kind (ADR-056). */
export const LOOKUP_LIMIT = 5;

export type LookupKind =
  | 'order'
  | 'invoice'
  | 'creditNote'
  | 'lot'
  | 'item'
  | 'partner'
  | 'productionRun'
  | 'returnAuthorization';

/** One record found. The client builds its address from kind and id. */
export interface LookupResult {
  id: string;
  /** The number, reference, code or name the person would recognise. */
  title: string;
  /** A short second line: a partner, a SKU. */
  detail: string | null;
  status: string | null;
  /** A lot's, for its expiry chip. */
  expiresAt: string | null;
  /** An item's product, which is the page it opens. */
  productId: string | null;
  /** Found by similarity, after the exact matches (a typo). */
  close: boolean;
}

export interface LookupGroup {
  kind: LookupKind;
  results: LookupResult[];
}

/** Each kind, and the permission that lets a member see it at all. */
const KINDS: { kind: LookupKind; permission: Permission }[] = [
  { kind: 'order', permission: 'orders.view' },
  { kind: 'invoice', permission: 'invoices.view' },
  { kind: 'creditNote', permission: 'invoices.view' },
  { kind: 'lot', permission: 'stock.view' },
  { kind: 'item', permission: 'products.view' },
  { kind: 'partner', permission: 'partners.view' },
  { kind: 'productionRun', permission: 'production.view' },
  { kind: 'returnAuthorization', permission: 'return_authorizations.view' },
];

/** A query shaped like a known number puts its kind first. */
const SHAPED: { pattern: RegExp; kind: LookupKind }[] = [
  { pattern: /^inv-/i, kind: 'invoice' },
  { pattern: /^cn-/i, kind: 'creditNote' },
  { pattern: /^rma-/i, kind: 'returnAuthorization' },
];

type Row = Omit<LookupResult, 'close'>;
type Tx = Parameters<Parameters<TenantDb['transaction']>[0]>[0];

const NONE = {
  status: sql<string | null>`null`,
  expiresAt: sql<string | null>`null`,
  productId: sql<string | null>`null`,
};

/**
 * The top bar's lookup (ADR-056): every kind of record a member may see,
 * found by what they have in hand, in one request.
 *
 * For each kind, the exact matches first, ranked exact, then at the start,
 * then anywhere, most recent first among equals; then, while fewer than
 * LOOKUP_LIMIT were found, close matches for a typo, best first, marked as
 * such. A kind the member may not view is never queried, so nothing says
 * a record exists that its list would hide. Every query is scoped to the
 * organization in context.
 */
@Injectable()
export class LookupService {
  constructor(private readonly tenantDb: TenantDb) {}

  lookup(query: string, held: ReadonlySet<Permission>, locale: Locale) {
    const terms = searchTerms(query);
    const visible = KINDS.filter(({ permission }) => held.has(permission));

    return this.tenantDb.transaction(async (tx, organizationId) => {
      await tx.execute(closeMatchSetting);

      const groups: LookupGroup[] = [];
      for (const { kind } of visible) {
        const results = await this.find(
          tx,
          kind,
          terms,
          organizationId,
          locale,
        );
        if (results.length > 0) groups.push({ kind, results });
      }

      return { groups: ordered(groups, terms) };
    });
  }

  private find(
    tx: Tx,
    kind: LookupKind,
    terms: SearchTerms,
    organizationId: string,
    locale: Locale,
  ): Promise<LookupResult[]> {
    switch (kind) {
      case 'order':
        return twoPass((exclude, close, limit) =>
          tx
            .select({
              id: orders.id,
              title: sql<string>`coalesce(${orders.reference}, ${partners.name})`,
              detail: partners.name,
              status: orders.status,
              expiresAt: NONE.expiresAt,
              productId: NONE.productId,
            })
            .from(orders)
            .innerJoin(partners, eq(partners.id, orders.partnerId))
            .where(
              and(
                eq(orders.organizationId, organizationId),
                excluding(orders.id, exclude),
                // The partner through a subquery on orders.partner_id, so
                // both halves stay on orders and indexed (partner-search).
                close
                  ? or(
                      closeMatches(orders.reference, terms),
                      partnerMatches(orders.partnerId, terms, 'close'),
                    )
                  : or(
                      codeMatches(orders.reference, terms),
                      partnerMatches(orders.partnerId, terms),
                    ),
              ),
            )
            .orderBy(
              ...(close
                ? [
                    desc(
                      sql`greatest(${closeness(orders.reference, terms)}, ${closeness(partners.name, terms, 'name')})`,
                    ),
                  ]
                : [
                    sql`least(${matchRank(orders.reference, terms)}, ${matchRank(partners.name, terms, 'name')})`,
                  ]),
              desc(orders.id),
            )
            .limit(limit),
        );

      case 'invoice':
        return twoPass((exclude, close, limit) =>
          tx
            .select({
              id: invoices.id,
              title: sql<string>`${invoices.number}`,
              detail: partners.name,
              status: invoices.status,
              expiresAt: NONE.expiresAt,
              productId: NONE.productId,
            })
            .from(invoices)
            .innerJoin(partners, eq(partners.id, invoices.partnerId))
            .where(
              and(
                eq(invoices.organizationId, organizationId),
                excluding(invoices.id, exclude),
                // A draft has no number yet; the lookup finds by number.
                close
                  ? closeMatches(invoices.number, terms)
                  : codeMatches(invoices.number, terms),
              ),
            )
            .orderBy(
              close
                ? desc(closeness(invoices.number, terms))
                : matchRank(invoices.number, terms),
              desc(invoices.id),
            )
            .limit(limit),
        );

      case 'creditNote':
        return twoPass((exclude, close, limit) =>
          tx
            .select({
              id: creditNotes.id,
              title: creditNotes.number,
              detail: partners.name,
              status: NONE.status,
              expiresAt: NONE.expiresAt,
              productId: NONE.productId,
            })
            .from(creditNotes)
            .innerJoin(partners, eq(partners.id, creditNotes.partnerId))
            .where(
              and(
                eq(creditNotes.organizationId, organizationId),
                excluding(creditNotes.id, exclude),
                close
                  ? closeMatches(creditNotes.number, terms)
                  : codeMatches(creditNotes.number, terms),
              ),
            )
            .orderBy(
              close
                ? desc(closeness(creditNotes.number, terms))
                : matchRank(creditNotes.number, terms),
              desc(creditNotes.id),
            )
            .limit(limit),
        );

      case 'lot':
        return twoPass((exclude, close, limit) =>
          tx
            .select({
              id: lots.id,
              title: lots.code,
              detail: productVariants.sku,
              status: NONE.status,
              expiresAt: sql<string | null>`${lots.expiresAt}::text`,
              productId: NONE.productId,
            })
            .from(lots)
            .innerJoin(productVariants, eq(productVariants.id, lots.variantId))
            .where(
              and(
                eq(lots.organizationId, organizationId),
                excluding(lots.id, exclude),
                close
                  ? closeMatches(lots.code, terms)
                  : codeMatches(lots.code, terms),
              ),
            )
            .orderBy(
              close
                ? desc(closeness(lots.code, terms))
                : matchRank(lots.code, terms),
              desc(lots.id),
            )
            .limit(limit),
        );

      case 'item':
        return twoPass((exclude, close, limit) =>
          tx
            .select({
              id: productVariants.id,
              // In the reader's language where the product has one.
              title: sql<string>`coalesce((
                select ${productTranslations.name} from ${productTranslations}
                where ${productTranslations.productId} = ${products.id}
                  and ${productTranslations.locale} = ${locale}
              ), ${products.name})`,
              detail: productVariants.sku,
              status: NONE.status,
              expiresAt: NONE.expiresAt,
              productId: products.id,
            })
            .from(productVariants)
            .innerJoin(products, eq(products.id, productVariants.productId))
            .where(
              and(
                eq(productVariants.organizationId, organizationId),
                excluding(productVariants.id, exclude),
                close
                  ? or(
                      closeMatches(productVariants.sku, terms),
                      closeMatches(products.name, terms, 'name'),
                    )
                  : itemMatches(terms),
              ),
            )
            .orderBy(
              close
                ? desc(
                    sql`greatest(${closeness(productVariants.sku, terms)}, ${closeness(products.name, terms, 'name')})`,
                  )
                : sql`least(${matchRank(productVariants.sku, terms)}, ${matchRank(products.name, terms, 'name')})`,
              desc(productVariants.id),
            )
            .limit(limit),
        );

      case 'partner':
        return twoPass((exclude, close, limit) =>
          tx
            .select({
              id: partners.id,
              title: partners.name,
              detail: partners.code,
              status: NONE.status,
              expiresAt: NONE.expiresAt,
              productId: NONE.productId,
            })
            .from(partners)
            .where(
              and(
                eq(partners.organizationId, organizationId),
                excluding(partners.id, exclude),
                close
                  ? closeMatches(partners.name, terms, 'name')
                  : or(
                      nameMatches(partners.name, terms),
                      codeMatches(partners.code, terms),
                      codeMatches(partners.taxId, terms),
                      pinyinMatches(partners.namePinyin, terms),
                    ),
              ),
            )
            .orderBy(
              close
                ? desc(closeness(partners.name, terms, 'name'))
                : sql`least(${matchRank(partners.name, terms, 'name')}, ${matchRank(partners.code, terms)})`,
              desc(partners.id),
            )
            .limit(limit),
        );

      case 'productionRun':
        return twoPass((exclude, close, limit) =>
          tx
            .select({
              id: productionOrders.id,
              title: sql<string>`${productionOrders.reference}`,
              detail: productVariants.sku,
              status: productionOrders.status,
              expiresAt: NONE.expiresAt,
              productId: NONE.productId,
            })
            .from(productionOrders)
            .innerJoin(
              productVariants,
              eq(productVariants.id, productionOrders.outputVariantId),
            )
            .where(
              and(
                eq(productionOrders.organizationId, organizationId),
                excluding(productionOrders.id, exclude),
                close
                  ? closeMatches(productionOrders.reference, terms)
                  : codeMatches(productionOrders.reference, terms),
              ),
            )
            .orderBy(
              close
                ? desc(closeness(productionOrders.reference, terms))
                : matchRank(productionOrders.reference, terms),
              desc(productionOrders.id),
            )
            .limit(limit),
        );

      case 'returnAuthorization':
        return twoPass((exclude, close, limit) =>
          tx
            .select({
              id: returnAuthorizations.id,
              title: returnAuthorizations.number,
              detail: partners.name,
              status: returnAuthorizations.status,
              expiresAt: NONE.expiresAt,
              productId: NONE.productId,
            })
            .from(returnAuthorizations)
            .innerJoin(
              partners,
              eq(partners.id, returnAuthorizations.partnerId),
            )
            .where(
              and(
                eq(returnAuthorizations.organizationId, organizationId),
                excluding(returnAuthorizations.id, exclude),
                close
                  ? closeMatches(returnAuthorizations.number, terms)
                  : codeMatches(returnAuthorizations.number, terms),
              ),
            )
            .orderBy(
              close
                ? desc(closeness(returnAuthorizations.number, terms))
                : matchRank(returnAuthorizations.number, terms),
              desc(returnAuthorizations.id),
            )
            .limit(limit),
        );
    }
  }
}

/** Leaves out the rows the exact pass already found. */
function excluding(column: Parameters<typeof notInArray>[0], ids: string[]) {
  return ids.length > 0 ? notInArray(column, ids) : undefined;
}

/**
 * The exact matches, then close ones to fill up to LOOKUP_LIMIT: a typo's
 * results never push out a real match, and never repeat one.
 */
async function twoPass(
  query: (
    exclude: string[],
    close: boolean,
    limit: number,
  ) => PromiseLike<Row[]>,
): Promise<LookupResult[]> {
  const exact = await query([], false, LOOKUP_LIMIT);
  if (exact.length >= LOOKUP_LIMIT) {
    return exact.map((row) => ({ ...row, close: false }));
  }

  const near = await query(
    exact.map((row) => row.id),
    true,
    LOOKUP_LIMIT - exact.length,
  );
  return [
    ...exact.map((row) => ({ ...row, close: false })),
    ...near.map((row) => ({ ...row, close: true })),
  ];
}

/**
 * The fixed order of kinds, with one exception: a query shaped like a
 * known number (INV-, CN-, RMA-), or exactly a lot's code, puts that kind
 * first.
 */
function ordered(groups: LookupGroup[], terms: SearchTerms): LookupGroup[] {
  const first =
    SHAPED.find(({ pattern }) => pattern.test(terms.text))?.kind ??
    (groups
      .find((group) => group.kind === 'lot')
      ?.results.some(
        (result) =>
          !result.close &&
          result.title.toLowerCase() === terms.text.toLowerCase(),
      )
      ? 'lot'
      : undefined);

  if (!first) return groups;
  return [
    ...groups.filter((group) => group.kind === first),
    ...groups.filter((group) => group.kind !== first),
  ];
}
